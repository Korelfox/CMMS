-- Stock atómico: elimina la race condition read-modify-write del cliente.
-- Antes: el cliente leía el stock, calculaba el nuevo valor y hacía upsert absoluto.
-- Ahora: RPCs con delta atómico + validación + movimiento + costo OT en una transacción.

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_ajustar_stock: delta puro (positivo = entrada, negativo = salida/consumo).
-- Rechaza si quedaría stock negativo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_ajustar_stock(
  p_empresa_id uuid,
  p_item_id    uuid,
  p_bodega_id  uuid,
  p_delta      numeric
)
RETURNS numeric          -- devuelve el nuevo stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_nuevo  numeric;
BEGIN
  -- Bloqueo a nivel de fila para evitar la carrera
  SELECT cantidad INTO v_actual
  FROM stock
  WHERE empresa_id = p_empresa_id
    AND item_id    = p_item_id
    AND bodega_id  = p_bodega_id
  FOR UPDATE;

  v_actual := COALESCE(v_actual, 0);
  v_nuevo  := v_actual + p_delta;

  IF v_nuevo < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible=%, solicitado=%', v_actual, ABS(p_delta)
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO stock (empresa_id, item_id, bodega_id, cantidad)
  VALUES (p_empresa_id, p_item_id, p_bodega_id, v_nuevo)
  ON CONFLICT (item_id, bodega_id) DO UPDATE
    SET cantidad   = EXCLUDED.cantidad,
        updated_at = now();

  RETURN v_nuevo;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_registrar_movimiento: entrada/salida/ajuste + movimiento + cargo OT opcional.
-- Para traslados usar fn_registrar_traslado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_registrar_movimiento(
  p_empresa_id  uuid,
  p_tipo        text,          -- 'entrada'|'salida'|'ajuste'
  p_item_id     uuid,
  p_bodega_from uuid DEFAULT NULL,
  p_bodega_to   uuid DEFAULT NULL,
  p_cantidad    numeric        DEFAULT 1,
  p_ot_id       uuid          DEFAULT NULL,
  p_responsable text          DEFAULT '',
  p_motivo      text          DEFAULT '',
  p_fecha       date          DEFAULT current_date,
  p_created_by  uuid          DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id uuid;
  v_precio numeric;
  v_costo  numeric;
  v_nuevo  numeric;
BEGIN
  -- Ajuste de stock según tipo
  IF p_tipo = 'entrada' THEN
    v_nuevo := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_to, p_cantidad);
  ELSIF p_tipo = 'salida' THEN
    v_nuevo := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_from, -p_cantidad);
  ELSIF p_tipo = 'ajuste' THEN
    -- Ajuste absoluto: fijar cantidad directamente (con bloqueo)
    INSERT INTO stock (empresa_id, item_id, bodega_id, cantidad)
    VALUES (p_empresa_id, p_item_id, p_bodega_to, p_cantidad)
    ON CONFLICT (item_id, bodega_id) DO UPDATE
      SET cantidad   = EXCLUDED.cantidad,
          updated_at = now();
    v_nuevo := p_cantidad;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no soportado: %', p_tipo;
  END IF;

  -- Insertar movimiento
  INSERT INTO movimientos (
    empresa_id, tipo, item_id, bodega_from, bodega_to, cantidad,
    ot_id, responsable, motivo, fecha, created_by
  ) VALUES (
    p_empresa_id, p_tipo, p_item_id, p_bodega_from, p_bodega_to, p_cantidad,
    p_ot_id, p_responsable, p_motivo, p_fecha, p_created_by
  ) RETURNING id INTO v_mov_id;

  -- Cargo de costo a OT (solo salidas con OT asociada)
  IF p_tipo = 'salida' AND p_ot_id IS NOT NULL THEN
    SELECT precio INTO v_precio FROM inventario_items WHERE id = p_item_id;
    v_costo := p_cantidad * COALESCE(v_precio, 0);
    IF v_costo > 0 THEN
      -- Delta atómico: no depende del costo_mat en memoria del cliente
      UPDATE ordenes_trabajo
      SET costo_mat    = COALESCE(costo_mat, 0) + v_costo,
          costos_por   = p_responsable,
          costos_fecha = now()
      WHERE id = p_ot_id AND empresa_id = p_empresa_id;
    END IF;
  END IF;

  RETURN json_build_object('mov_id', v_mov_id, 'stock_nuevo', v_nuevo);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_registrar_traslado: ambos lados + movimiento en una transacción.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_registrar_traslado(
  p_empresa_id   uuid,
  p_item_id      uuid,
  p_bodega_from  uuid,
  p_bodega_to    uuid,
  p_cantidad     numeric       DEFAULT 1,
  p_responsable  text         DEFAULT '',
  p_motivo       text         DEFAULT '',
  p_fecha        date         DEFAULT current_date,
  p_created_by   uuid         DEFAULT NULL,
  p_tipo         text         DEFAULT 'traslado',  -- 'traslado'|'despacho'|'retorno'
  p_lote_id      uuid         DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id    uuid;
  v_nuevo_from numeric;
  v_nuevo_to   numeric;
BEGIN
  -- Origen: descontar (puede fallar si stock insuficiente)
  v_nuevo_from := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_from, -p_cantidad);
  -- Destino: incrementar (no puede fallar)
  v_nuevo_to   := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_to,   p_cantidad);

  -- Movimiento único
  INSERT INTO movimientos (
    empresa_id, tipo, item_id, bodega_from, bodega_to, cantidad,
    responsable, motivo, fecha, created_by, lote_id
  ) VALUES (
    p_empresa_id, p_tipo, p_item_id, p_bodega_from, p_bodega_to, p_cantidad,
    p_responsable, p_motivo, p_fecha, p_created_by, p_lote_id
  ) RETURNING id INTO v_mov_id;

  RETURN json_build_object(
    'mov_id', v_mov_id,
    'stock_from', v_nuevo_from,
    'stock_to',   v_nuevo_to
  );
END;
$$;

-- Permisos: solo roles autenticados pueden llamar estas funciones
GRANT EXECUTE ON FUNCTION fn_ajustar_stock       TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_movimiento TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_traslado   TO authenticated;
