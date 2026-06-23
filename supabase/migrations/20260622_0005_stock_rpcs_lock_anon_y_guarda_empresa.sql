-- Cierra la exposición de las RPCs de inventario (detectada por get_advisors:
-- anon_security_definer_function_executable).
--
-- Estas funciones SECURITY DEFINER eran ejecutables por PUBLIC/anon (la anon key
-- es pública, va en el bundle del frontend) y no validaban al llamante, así que
-- un no autenticado podía mutar el stock de cualquier empresa pasando su id.
--
-- Capa A: revoca EXECUTE de public y anon (los callers legítimos son el frontend
--   como `authenticated` y service_role; ninguno usa anon).
-- Capa B: guarda de aislamiento multi-tenant en los 3 mutadores — un usuario
--   autenticado solo puede operar SU empresa. service_role / cron (auth.uid()
--   null) pasan sin restricción, así no se rompe ningún flujo de backend.
--
-- Los cuerpos se reproducen idénticos a la definición viva; solo se antepone la
-- guarda. fn_audit_ot (solo lectura) se limita con la revocación de anon/public.

-- ── fn_ajustar_stock ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ajustar_stock(p_empresa_id uuid, p_item_id uuid, p_bodega_id uuid, p_delta numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actual numeric;
  v_nuevo  numeric;
BEGIN
  IF auth.uid() IS NOT NULL
     AND (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM p_empresa_id THEN
    RAISE EXCEPTION 'No autorizado para la empresa indicada' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- ── fn_registrar_movimiento ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_registrar_movimiento(p_empresa_id uuid, p_tipo text, p_item_id uuid, p_bodega_from uuid DEFAULT NULL::uuid, p_bodega_to uuid DEFAULT NULL::uuid, p_cantidad numeric DEFAULT 1, p_ot_id uuid DEFAULT NULL::uuid, p_responsable text DEFAULT ''::text, p_motivo text DEFAULT ''::text, p_fecha date DEFAULT CURRENT_DATE, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov_id uuid;
  v_precio numeric;
  v_costo  numeric;
  v_nuevo  numeric;
BEGIN
  IF auth.uid() IS NOT NULL
     AND (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM p_empresa_id THEN
    RAISE EXCEPTION 'No autorizado para la empresa indicada' USING ERRCODE = '42501';
  END IF;

  IF p_tipo = 'entrada' THEN
    v_nuevo := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_to, p_cantidad);
  ELSIF p_tipo = 'salida' THEN
    v_nuevo := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_from, -p_cantidad);
  ELSIF p_tipo = 'ajuste' THEN
    INSERT INTO stock (empresa_id, item_id, bodega_id, cantidad)
    VALUES (p_empresa_id, p_item_id, p_bodega_to, p_cantidad)
    ON CONFLICT (item_id, bodega_id) DO UPDATE
      SET cantidad   = EXCLUDED.cantidad,
          updated_at = now();
    v_nuevo := p_cantidad;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no soportado: %', p_tipo;
  END IF;

  INSERT INTO movimientos (
    empresa_id, tipo, item_id, bodega_from, bodega_to, cantidad,
    ot_id, responsable, motivo, fecha, created_by
  ) VALUES (
    p_empresa_id, p_tipo, p_item_id, p_bodega_from, p_bodega_to, p_cantidad,
    p_ot_id, p_responsable, p_motivo, p_fecha, p_created_by
  ) RETURNING id INTO v_mov_id;

  IF p_tipo = 'salida' AND p_ot_id IS NOT NULL THEN
    SELECT precio INTO v_precio FROM inventario_items WHERE id = p_item_id;
    v_costo := p_cantidad * COALESCE(v_precio, 0);
    IF v_costo > 0 THEN
      UPDATE ordenes_trabajo
      SET costo_mat    = COALESCE(costo_mat, 0) + v_costo,
          costos_por   = p_responsable,
          costos_fecha = now()
      WHERE id = p_ot_id AND empresa_id = p_empresa_id;
    END IF;
  END IF;

  RETURN json_build_object('mov_id', v_mov_id, 'stock_nuevo', v_nuevo);
END;
$function$;

-- ── fn_registrar_traslado ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_registrar_traslado(p_empresa_id uuid, p_item_id uuid, p_bodega_from uuid, p_bodega_to uuid, p_cantidad numeric DEFAULT 1, p_responsable text DEFAULT ''::text, p_motivo text DEFAULT ''::text, p_fecha date DEFAULT CURRENT_DATE, p_created_by uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'traslado'::text, p_lote_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov_id     uuid;
  v_nuevo_from numeric;
  v_nuevo_to   numeric;
BEGIN
  IF auth.uid() IS NOT NULL
     AND (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM p_empresa_id THEN
    RAISE EXCEPTION 'No autorizado para la empresa indicada' USING ERRCODE = '42501';
  END IF;

  v_nuevo_from := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_from, -p_cantidad);
  v_nuevo_to   := fn_ajustar_stock(p_empresa_id, p_item_id, p_bodega_to,    p_cantidad);

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
$function$;

-- ── Capa A: cerrar acceso anónimo/público en las 4 funciones ────────────────
REVOKE EXECUTE ON FUNCTION public.fn_ajustar_stock(uuid, uuid, uuid, numeric) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn_registrar_movimiento(uuid, text, uuid, uuid, uuid, numeric, uuid, text, text, date, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn_registrar_traslado(uuid, uuid, uuid, uuid, numeric, text, text, date, uuid, text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn_audit_ot(uuid) FROM public, anon;
