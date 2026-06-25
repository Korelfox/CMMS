-- C2: Excluir equipos soft-deleted del trigger de propagación de horómetros.
-- C3: Excluir equipos soft-deleted del clon de estructura de flota.
--
-- Sin estos filtros, un equipo borrado podía seguir recibiendo propagación
-- de horas (C2) y volver a aparecer clonado en nuevas naves (C3).

-- ─────────────────────────────────────────────────────────────────────────────
-- C2: fn_propagar_horas_horometro con deleted_at IS NULL en ambos CTEs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_propagar_horas_horometro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tiene_posterior boolean;
BEGIN
  -- Lectura retroactiva: si ya existe una lectura posterior para este equipo
  -- no sobrescribimos horas_actual (permite correcciones sin retroceder).
  SELECT EXISTS(
    SELECT 1 FROM lecturas_horometro
    WHERE equipo_id = NEW.equipo_id
      AND id <> NEW.id
      AND fecha > NEW.fecha
  ) INTO tiene_posterior;

  IF tiene_posterior THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE
  -- (a) Árbol estándar: el nodo propio + todos sus descendientes 'hereda'
  arbol_propio AS (
    SELECT id, horometro, parent_id
    FROM equipos
    WHERE id = NEW.equipo_id
      AND deleted_at IS NULL
    UNION ALL
    SELECT e.id, e.horometro, e.parent_id
    FROM equipos e
    JOIN arbol_propio a ON e.parent_id = a.id
    WHERE e.horometro = 'hereda'
      AND e.deleted_at IS NULL
  ),
  -- (b) Nodos con referencia explícita (horas_fuente_id = propio) +
  --     sus propios descendientes 'hereda'.
  arbol_fuente AS (
    SELECT id, horometro, parent_id
    FROM equipos
    WHERE horas_fuente_id = NEW.equipo_id
      AND deleted_at IS NULL
    UNION ALL
    SELECT e.id, e.horometro, e.parent_id
    FROM equipos e
    JOIN arbol_fuente af ON e.parent_id = af.id
    WHERE e.horometro = 'hereda'
      AND e.deleted_at IS NULL
  )
  UPDATE equipos
  SET horas_actual = NEW.horas
  WHERE id IN (SELECT id FROM arbol_propio)
     OR id IN (SELECT id FROM arbol_fuente);

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C3: fn_clonar_estructura excluye equipos borrados en todas las consultas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_clonar_estructura(
  p_src_emb uuid, p_dst_emb uuid, p_src_prefix text, p_dst_prefix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emp uuid;
BEGIN
  SELECT empresa_id INTO v_emp FROM embarcaciones WHERE id = p_dst_emb;

  -- equipos: solo copia registros no borrados
  INSERT INTO equipos (
    id, empresa_id, embarcacion_id, id_visible, sistema, marca, modelo, serie, anio,
    estado, prezarpe, nivel_tipo, consume_aceite, parent_id, tipo_nodo, criticidad,
    mtbf_objetivo, orden, ficha, horometro, parametros_criticos, horas_fuente_id)
  SELECT
    md5(e.id::text || p_dst_emb::text)::uuid,
    v_emp, p_dst_emb,
    p_dst_prefix || substring(e.id_visible FROM length(p_src_prefix) + 1),
    e.sistema, e.marca, e.modelo, e.serie, e.anio,
    e.estado, e.prezarpe, e.nivel_tipo, e.consume_aceite,
    CASE WHEN e.parent_id IS NULL THEN NULL ELSE md5(e.parent_id::text || p_dst_emb::text)::uuid END,
    e.tipo_nodo, e.criticidad, e.mtbf_objetivo, e.orden, e.ficha, e.horometro,
    e.parametros_criticos,
    CASE WHEN e.horas_fuente_id IS NULL THEN NULL ELSE md5(e.horas_fuente_id::text || p_dst_emb::text)::uuid END
  FROM equipos e
  WHERE e.embarcacion_id = p_src_emb
    AND e.deleted_at IS NULL;   -- C3: excluir borrados

  -- planes_pm: solo de equipos no borrados
  INSERT INTO planes_pm (empresa_id, equipo_id, descripcion, tipo_disparador,
    intervalo_horas, intervalo_calendario, unidad_calendario, activo, horas_ult_pm, fecha_ult_pm)
  SELECT v_emp, md5(p.equipo_id::text || p_dst_emb::text)::uuid, p.descripcion, p.tipo_disparador,
    p.intervalo_horas, p.intervalo_calendario, p.unidad_calendario, p.activo, 0, NULL
  FROM planes_pm p
  JOIN equipos e ON e.id = p.equipo_id
  WHERE e.embarcacion_id = p_src_emb
    AND e.deleted_at IS NULL;   -- C3: excluir borrados

  -- enlaces repuesto→equipo: solo de equipos no borrados
  INSERT INTO inventario_item_destinos (empresa_id, item_id, equipo_id)
  SELECT v_emp, d.item_id, md5(d.equipo_id::text || p_dst_emb::text)::uuid
  FROM inventario_item_destinos d
  JOIN equipos e ON e.id = d.equipo_id
  WHERE e.embarcacion_id = p_src_emb
    AND e.deleted_at IS NULL;   -- C3: excluir borrados
END;
$fn$;
