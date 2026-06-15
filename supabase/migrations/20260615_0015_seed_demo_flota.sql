-- ============================================================
--  Flota de DEMOSTRACIÓN — para testear el CMMS de punta a punta.
--
--  Genera 3 naves con perfiles narrativos contrastantes que ejercitan
--  todos los módulos (horómetros, PM, OT, PdM, confiabilidad, varada,
--  RCA, inventario, económico, cumplimiento):
--
--    DM (Don Miguel)  · perfil 'sana'   — bien gestionada, supervisor verde
--    DR (Doña Rosa)   · perfil 'critica'— reactiva, PMs vencidos, fallas crónicas
--    SP (San Pedro)   · perfil 'varada' — en dique, prezarpe bloqueado
--
--  Arquitectura: la estructura (árbol de equipos) se CLONA desde DM por SQL
--  (DM ya tiene la plantilla pesquera cargada), evitando depender del loader JS.
--  Encima, fn_seed_demo_perfil siembra la historia operacional según perfil.
--
--  Reproducible (setseed). Solo super_admin la dispara desde la UI.
--  Idempotente: borra y regenera los datos demo de las 3 naves.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Clonado de estructura DM → nave destino (ids deterministas).
--    new_id = md5(old_id || dst_emb)::uuid  → permite remapear
--    parent_id y horas_fuente_id sin tabla de mapeo.
-- ────────────────────────────────────────────────────────────
create or replace function public.fn_clonar_estructura(
  p_src_emb uuid, p_dst_emb uuid, p_src_prefix text, p_dst_prefix text
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid;
begin
  select empresa_id into v_emp from embarcaciones where id = p_dst_emb;

  -- equipos (id, parent_id y horas_fuente_id remapeados deterministamente)
  insert into equipos (
    id, empresa_id, embarcacion_id, id_visible, sistema, marca, modelo, serie, anio,
    estado, prezarpe, nivel_tipo, consume_aceite, parent_id, tipo_nodo, criticidad,
    mtbf_objetivo, orden, ficha, horometro, parametros_criticos, horas_fuente_id)
  select
    md5(e.id::text || p_dst_emb::text)::uuid,
    v_emp, p_dst_emb,
    p_dst_prefix || substring(e.id_visible from length(p_src_prefix) + 1),
    e.sistema, e.marca, e.modelo, e.serie, e.anio,
    e.estado, e.prezarpe, e.nivel_tipo, e.consume_aceite,
    case when e.parent_id is null then null else md5(e.parent_id::text || p_dst_emb::text)::uuid end,
    e.tipo_nodo, e.criticidad, e.mtbf_objetivo, e.orden, e.ficha, e.horometro,
    e.parametros_criticos,
    case when e.horas_fuente_id is null then null else md5(e.horas_fuente_id::text || p_dst_emb::text)::uuid end
  from equipos e
  where e.embarcacion_id = p_src_emb;

  -- planes_pm (hitos reseteados; el overlay los fijará por perfil)
  insert into planes_pm (empresa_id, equipo_id, descripcion, tipo_disparador,
    intervalo_horas, intervalo_calendario, unidad_calendario, activo, horas_ult_pm, fecha_ult_pm)
  select v_emp, md5(p.equipo_id::text || p_dst_emb::text)::uuid, p.descripcion, p.tipo_disparador,
    p.intervalo_horas, p.intervalo_calendario, p.unidad_calendario, p.activo, 0, null
  from planes_pm p
  join equipos e on e.id = p.equipo_id
  where e.embarcacion_id = p_src_emb;

  -- enlaces repuesto→equipo (mismos SKU, equipo remapeado)
  insert into inventario_item_destinos (empresa_id, item_id, equipo_id)
  select v_emp, d.item_id, md5(d.equipo_id::text || p_dst_emb::text)::uuid
  from inventario_item_destinos d
  join equipos e on e.id = d.equipo_id
  where e.embarcacion_id = p_src_emb;
end;
$fn$;

-- ────────────────────────────────────────────────────────────
-- 2) Reset: borra los datos OPERACIONALES de una nave (orden FK-safe).
--    Conserva estructura (equipos/planes/destinos).
-- ────────────────────────────────────────────────────────────
create or replace function public.fn_demo_reset_operacional(p_emb uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  delete from marea_captura  where marea_id in (select id from mareas where embarcacion_id = p_emb);
  delete from marea_economia where marea_id in (select id from mareas where embarcacion_id = p_emb);
  delete from prezarpes      where embarcacion_id = p_emb;
  delete from rca            where embarcacion_id = p_emb
                                or equipo_id in (select id from equipos where embarcacion_id = p_emb);
  delete from movimientos    where ot_id in (select id from ordenes_trabajo where embarcacion_id = p_emb)
                                or bodega_to   in (select id from bodegas where embarcacion_id = p_emb)
                                or bodega_from in (select id from bodegas where embarcacion_id = p_emb);
  delete from varada_trabajos where varada_id in (select id from varadas where embarcacion_id = p_emb);
  delete from mediciones_pdm where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  delete from lecturas_horometro where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  delete from historial_pm   where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  delete from ordenes_trabajo where embarcacion_id = p_emb;
  delete from solicitudes    where embarcacion_id = p_emb;
  delete from varadas        where embarcacion_id = p_emb;
  delete from mareas         where embarcacion_id = p_emb;
  delete from stock          where bodega_id in (select id from bodegas where embarcacion_id = p_emb);
  delete from presupuestos   where embarcacion_id = p_emb;

  update planes_pm set horas_ult_pm = 0, fecha_ult_pm = null
    where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  update equipos set horas_actual = 0
    where embarcacion_id = p_emb;
end;
$fn$;

-- Reset total (operacional + estructura) — para naves clonadas DR/SP.
create or replace function public.fn_demo_reset_estructura(p_emb uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  perform fn_demo_reset_operacional(p_emb);
  delete from inventario_item_destinos where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  delete from planes_pm where equipo_id in (select id from equipos where embarcacion_id = p_emb);
  update equipos set parent_id = null, horas_fuente_id = null where embarcacion_id = p_emb;
  delete from equipos where embarcacion_id = p_emb;
end;
$fn$;

-- ────────────────────────────────────────────────────────────
-- 3) Overlay operacional por PERFIL (la pieza grande).
-- ────────────────────────────────────────────────────────────
create or replace function public.fn_seed_demo_perfil(p_emb uuid, p_perfil text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_emp     uuid;
  v_hoy     date := current_date;
  v_bod     uuid;
  v_eq      record;
  v_modo    text;
  v_t       date;
  v_i       int;
  v_gap     int;
  v_nfail   int;
  v_mtbf    numeric;
  v_beta    numeric;
  v_major   uuid;
  v_varada  uuid;
  v_marea   uuid;
  v_esp     record;
  v_kg      numeric;
  v_dias    int;
  v_zarpe   timestamptz;
  v_factor  numeric;   -- mediciones: múltiplo del umbral según perfil
  v_modos   text[] := array['Fuga externa','Vibración alta','Sobretemperatura','No arranca','Obstrucción','Desgaste prematuro'];
begin
  select empresa_id into v_emp from embarcaciones where id = p_emb;
  select id into v_bod from bodegas where embarcacion_id = p_emb limit 1;

  -- ── 3.1 Lecturas de horómetro (52 semanas) en los 6 puntos propio ──
  -- offset = días atrás de la ÚLTIMA lectura (perfil); critica salta GEN-MTR.
  insert into lecturas_horometro (empresa_id, equipo_id, fecha, horas, horas_anterior, fuente, usuario_nombre)
  select v_emp, e.id,
    (v_hoy - ((52 - n) * 7 + cfg.off))::timestamp + time '14:00',
    round((cfg.base + cfg.rate * 7 * n + random() * 8)::numeric, 0),
    round((cfg.base + cfg.rate * 7 * (n - 1) + random() * 8)::numeric, 0),
    'manual', 'Demo Seed'
  from equipos e
  join (values
      ('%-PROP-MTR', 10.0, 8000.0),
      ('%-GEN-MTR',  14.0, 9500.0),
      ('%-HPU-MTR',   4.0, 3200.0),
      ('%-GEN-EMG',   0.4,  300.0),
      ('%-STEER-01',  9.0, 7000.0),
      ('%-STEER-EMG', 0.2,  150.0)
    ) cfg(suf, rate, base) on e.id_visible like cfg.suf
  cross join lateral (
    select case
      when p_perfil = 'varada' then 22
      when p_perfil = 'critica' and e.id_visible like '%-PROP-MTR' then 45
      when p_perfil = 'critica' then 7
      else 3 end as off
  ) o(off)
  cross join generate_series(1, 52) n
  where e.embarcacion_id = p_emb
    and e.horometro = 'propio'
    and not (p_perfil = 'critica' and e.id_visible like '%-GEN-MTR');

  -- Resync determinista de horas_actual (propio = máx lectura; hereda hereda).
  update equipos e set horas_actual = sub.mx
  from (select equipo_id, max(horas) mx from lecturas_horometro group by equipo_id) sub
  where e.id = sub.equipo_id and e.embarcacion_id = p_emb and e.horometro = 'propio';

  with recursive chain as (
    select id, horas_actual from equipos where embarcacion_id = p_emb and horometro = 'propio'
    union all
    select e.id, c.horas_actual
    from equipos e join chain c on (e.parent_id = c.id or e.horas_fuente_id = c.id)
    where e.horometro = 'hereda' and e.embarcacion_id = p_emb
  )
  update equipos e set horas_actual = c.horas_actual
  from chain c where e.id = c.id and e.horometro = 'hereda';

  -- ── 3.2 Violación deliberada en 'critica': fuente huérfana ──
  if p_perfil = 'critica' then
    update equipos e
    set horas_fuente_id = (select id from equipos where embarcacion_id = p_emb and id_visible like '%-PROP' and tipo_nodo = 'sistema' limit 1)
    where e.embarcacion_id = p_emb and e.id_visible like '%-PROP-EJE';
  end if;

  -- ── 3.3 PMs: PM-horas sobre equipo SIN horas no puede dispararse → a calendario.
  -- En naves limpias (sana/varada) se convierte todo equipo con 0 h (incluye
  -- sistemas sin motor: pesca, eléctrico, seguridad). En 'critica' se deja
  -- como PM-horas a propósito → el supervisor lo marca como pm_silenciado.
  update planes_pm p
  set tipo_disparador = 'calendario',
      intervalo_calendario = greatest(1, round(coalesce(p.intervalo_horas, 2000) / 2000.0)),
      unidad_calendario = 'anual',
      intervalo_horas = null
  from equipos e
  where p.equipo_id = e.id and e.embarcacion_id = p_emb and p.tipo_disparador = 'horas'
    and ((p_perfil = 'critica' and e.horometro = 'no') or (p_perfil <> 'critica' and e.horas_actual = 0));

  -- Hitos PM por HORAS (consumo según perfil → al día / por vencer / vencido).
  update planes_pm p
  set horas_ult_pm = greatest(0, e.horas_actual - p.intervalo_horas *
        case p_perfil
          when 'critica' then 1.0 + random() * 0.4          -- vencido
          when 'varada'  then 0.5 + random() * 0.3
          else case when random() < 0.18 then 0.93 else 0.3 + random() * 0.5 end  -- sana: algunos por vencer
        end)
  from equipos e
  where p.equipo_id = e.id and e.embarcacion_id = p_emb
    and p.tipo_disparador = 'horas' and coalesce(p.intervalo_horas, 0) > 0
    and e.horas_actual > 0;

  -- Hitos PM por CALENDARIO (fecha_ult_pm).
  update planes_pm p
  set fecha_ult_pm = v_hoy - (greatest(1, coalesce(p.intervalo_calendario,1)) * 365 *
        case p_perfil
          when 'critica' then 1.0 + random() * 0.5
          else 0.3 + random() * 0.5
        end)::int
  where p.equipo_id in (select id from equipos where embarcacion_id = p_emb)
    and p.tipo_disparador = 'calendario';

  -- ── 3.4 OT auto desde PMs vencidos (solo critica) → OTAutónomas ──
  if p_perfil = 'critica' then
    insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad,
      estado, descripcion, fecha, origen, huella)
    select v_emp, p_emb, e.id, e.sistema, 'preventivo', 'alta', 'solicitada',
      'PM vencido (auto): ' || p.descripcion, v_hoy, 'auto',
      'pm:' || p.id::text || ':' || round(p.horas_ult_pm)::text
    from planes_pm p join equipos e on e.id = p.equipo_id
    where e.embarcacion_id = p_emb and p.tipo_disparador = 'horas' and p.activo
      and (e.horas_actual - p.horas_ult_pm) >= p.intervalo_horas
    limit 8;
  end if;

  -- ── 3.5 Historia PREVENTIVA cerrada + historial_pm (Cumplimiento, ratio proactivo) ──
  for v_eq in
    select p.id plan_id, p.equipo_id, p.intervalo_horas, p.descripcion, e.sistema, e.horas_actual
    from planes_pm p join equipos e on e.id = p.equipo_id
    where e.embarcacion_id = p_emb and p.tipo_disparador = 'horas'
      and coalesce(p.intervalo_horas,0) > 0 and e.horas_actual > 0
    order by random() limit 18
  loop
    for v_i in 1..4 loop
      v_t := v_hoy - ((4 - v_i) * 70 + (random() * 20)::int);
      insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad,
        estado, descripcion, fecha, mttr_horas, costo_mo, costo_mat, cerrada_por, cerrada_fecha,
        costos_por, costos_fecha)
      values (v_emp, p_emb, v_eq.equipo_id, v_eq.sistema, 'preventivo', 'media', 'cerrada',
        v_eq.descripcion, v_t, round((2 + random()*6)::numeric,1),
        round((40000+random()*120000)::numeric,0), round((20000+random()*200000)::numeric,0),
        'Demo Seed', v_t::timestamptz, 'Demo Seed', v_t::timestamptz)
      returning id into v_major;

      insert into historial_pm (empresa_id, plan_pm_id, equipo_id, horas_realizacion, fecha_realizacion, realizado_por, ot_id)
      values (v_emp, v_eq.plan_id, v_eq.equipo_id,
        round(v_i * v_eq.intervalo_horas * (case p_perfil when 'critica' then 1.15 else 0.97 end))::numeric,
        v_t, 'Demo Seed', v_major);
    end loop;
  end loop;

  -- ── 3.6 Historia CORRECTIVA (confiabilidad: Weibull / Pareto / MTBF / CGM / lucro) ──
  v_nfail := case p_perfil when 'critica' then 8 when 'varada' then 4 else 3 end;
  v_mtbf  := case p_perfil when 'critica' then 90 when 'varada' then 160 else 260 end;
  v_beta  := case p_perfil when 'critica' then 1.7 else 2.2 end;

  for v_eq in
    select id, sistema, id_visible from equipos
    where embarcacion_id = p_emb
      and (id_visible like '%-PROP-MTR-FW-BMP' or id_visible like '%-GEN-MTR-SW-BMP'
        or id_visible like '%-HPU-BMB-ACO' or id_visible like '%-PROP-MTR-FUEL-INY'
        or id_visible like '%-PROP-MTR-LUB-FLT')
  loop
    v_t := v_hoy - 800; v_i := 0;
    while v_i < v_nfail loop
      v_gap := round(v_mtbf * power(-ln(greatest(random(), 1e-6)), 1.0 / v_beta))::int;
      v_t := v_t + v_gap;
      exit when v_t >= v_hoy;
      v_modo := v_modos[1 + floor(random() * array_length(v_modos,1))::int];
      insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad,
        estado, descripcion, fecha, mttr_horas, costo_mo, costo_mat, modo_falla, mecanismo_falla,
        causa_falla, cerrada_por, cerrada_fecha, costos_por, costos_fecha)
      values (v_emp, p_emb, v_eq.id, v_eq.sistema, 'correctivo', 'alta', 'cerrada',
        'Falla: ' || v_modo || ' en ' || v_eq.sistema, v_t,
        round((6 + random()*42)::numeric,1),
        round((150000+random()*900000)::numeric,0), round((80000+random()*1200000)::numeric,0),
        v_modo, 'Desgaste', 'Fin de vida útil', 'Demo Seed', v_t::timestamptz,
        'Demo Seed', v_t::timestamptz);
      v_i := v_i + 1;
    end loop;
  end loop;

  -- ── 3.7 Backlog abierto + falla mayor + RCA (critica) ──
  if p_perfil = 'critica' then
    -- backlog en distintos estados
    insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad, estado, descripcion, fecha)
    select v_emp, p_emb, e.id, e.sistema, 'correctivo', (array['alta','critica','media'])[1+floor(random()*3)::int]::app.prioridad,
      (array['solicitada','planificada','programada','en_ejecucion'])[1+floor(random()*4)::int]::app.estado_ot,
      'Pendiente: revisión por novedad operacional', v_hoy - (random()*25)::int
    from equipos e
    where e.embarcacion_id = p_emb and e.id_visible like '%-PROP-MTR%' and e.tipo_nodo = 'componente'
    order by random() limit 6;

    -- falla mayor reciente (motor)
    select id, sistema into v_eq from equipos where embarcacion_id = p_emb and id_visible like '%-PROP-MTR-FW-BMP' limit 1;
    if v_eq.id is not null then
      insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad,
        estado, descripcion, fecha, mttr_horas, costo_mo, costo_mat, modo_falla, mecanismo_falla, causa_falla,
        cerrada_por, cerrada_fecha, costos_por, costos_fecha)
      values (v_emp, p_emb, v_eq.id, v_eq.sistema, 'correctivo', 'critica', 'cerrada',
        'Sobretemperatura motor — pérdida de refrigeración en faena', v_hoy - 12,
        72, 1800000, 4200000, 'Sobretemperatura', 'Falla de refrigeración', 'Bomba SW sin caudal',
        'Demo Seed', (v_hoy - 9)::timestamptz, 'Demo Seed', (v_hoy - 9)::timestamptz)
      returning id into v_major;

      insert into rca (empresa_id, embarcacion_id, equipo_id, ot_id, fecha, falla, porques, causa_codigo, causa_raiz, acciones, estado)
      values (v_emp, p_emb, v_eq.id, v_major, v_hoy - 8,
        'Sobretemperatura del motor principal con retorno anticipado a puerto',
        '["¿Por qué se sobrecalentó el motor? Falta de caudal de agua de mar.","¿Por qué faltó caudal? Impeller de la bomba SW destruido.","¿Por qué se destruyó el impeller? Operó desgastado más allá de su vida útil.","¿Por qué operó desgastado? No se reemplazó en el intervalo preventivo.","¿Por qué no se reemplazó? No había impeller en stock y el PM no estaba activo."]'::jsonb,
        'Mantenimiento latente',
        'Ausencia de PM por horas del impeller + quiebre de stock del repuesto crítico',
        '[{"accion":"Reponer impeller SW a stock mínimo 2 un","responsable":"Bodega","done":false},{"accion":"Activar PM por horas del impeller cada 1000 h","responsable":"Planificación","done":true},{"accion":"Auditar repuestos críticos sin stock mínimo","responsable":"Jefe Mantención","done":false}]'::jsonb,
        'abierto');
    end if;
  end if;

  -- ── 3.8 Mediciones PdM contra los umbrales ISO sembrados (0012) ──
  -- Valor según perfil: sana en verde; critica sobre alerta/crítico.
  v_factor := case p_perfil when 'critica' then 1.2 else 0.65 end;
  insert into mediciones_pdm (empresa_id, equipo_id, tipo, parametro, valor, unidad, limite_alerta, limite_critico, fecha, usuario_nombre)
  select v_emp, e.id, pc->>'tipo', pc->>'parametro',
    round((
      case
        when (pc->>'max_alerta') is not null
          then (pc->>'max_alerta')::numeric * v_factor * (0.97 + random()*0.06) * (1 - g*0.04)
        when (pc->>'min_alerta') is not null
          then (pc->>'min_alerta')::numeric * (case p_perfil when 'critica' then 0.82 else 1.25 end) * (0.98 + random()*0.04)
        else 1 end
    )::numeric, 2),
    pc->>'unidad',
    coalesce((pc->>'max_alerta')::numeric, (pc->>'min_alerta')::numeric),
    coalesce((pc->>'max_critico')::numeric, (pc->>'min_critico')::numeric),
    v_hoy - (g * 15), 'Demo Seed'
  from equipos e
  cross join lateral jsonb_array_elements(e.parametros_criticos) pc
  cross join generate_series(0, 2) g
  where e.embarcacion_id = p_emb and e.parametros_criticos is not null
    and not (p_perfil = 'varada');

  -- ── 3.9 Varada (perfil 'varada' = en ejecución; 'critica' = histórica cerrada) ──
  if p_perfil = 'varada' then
    insert into varadas (empresa_id, embarcacion_id, nombre, tipo, estado, fecha_inicio, fecha_fin_estimada, presupuesto, descripcion)
    values (v_emp, p_emb, 'Varada mayor — astillero', 'varada', 'ejecucion', v_hoy - 22, v_hoy + 12, 48000000,
      'Mantención mayor de casco, ejes y revisión clase')
    returning id into v_varada;

    insert into varada_trabajos (varada_id, empresa_id, sistema, descripcion, estado, horas_estimadas, responsable, orden, critico_zarpe)
    values
      (v_varada, v_emp, 'Casco',      'Arenado y pintura de obra viva',           'completado',  120, 'Astillero', 1, false),
      (v_varada, v_emp, 'Propulsión', 'Desmontaje y calibración de eje de cola',  'completado',   80, 'Astillero', 2, true),
      (v_varada, v_emp, 'Propulsión', 'Cambio de bocina y sellos',                'en_progreso',  40, 'Astillero', 3, true),
      (v_varada, v_emp, 'Gobierno',   'Revisión de servotimón',                   'en_progreso',  24, 'Taller',    4, false),
      (v_varada, v_emp, 'Seguridad',  'Certificación de balsas y extintores',     'pendiente',    16, 'Externo',   5, true),
      (v_varada, v_emp, 'Eléctrico',  'Megado de cuadro y alternadores',          'pendiente',    20, 'Taller',    6, false),
      (v_varada, v_emp, 'Propulsión', 'Alineación de línea de ejes',              'pendiente',    32, 'Astillero', 7, true);

    -- OTs programadas asociadas a la varada
    insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad, estado, descripcion, fecha, varada_id)
    select v_emp, p_emb, e.id, e.sistema, 'preventivo', 'alta', 'programada',
      'Trabajo de varada: ' || e.sistema, v_hoy - 5, v_varada
    from equipos e where e.embarcacion_id = p_emb and e.id_visible like '%-PROP-EJE%' and e.tipo_nodo='componente'
    limit 3;

  elsif p_perfil = 'critica' then
    insert into varadas (empresa_id, embarcacion_id, nombre, tipo, estado, fecha_inicio, fecha_fin_estimada, fecha_fin_real, presupuesto, descripcion)
    values (v_emp, p_emb, 'Carena anual', 'carena', 'cerrada', v_hoy - 300, v_hoy - 288, v_hoy - 285, 22000000,
      'Carena programada del año anterior');
  end if;

  -- ── 3.10 Inventario: stock por bodega de la nave + consumos ──
  if v_bod is not null then
    insert into stock (empresa_id, item_id, bodega_id, cantidad, stock_min)
    select distinct v_emp, d.item_id, v_bod,
      case p_perfil
        when 'critica' then (array[0,0,1,2])[1+floor(random()*4)::int]   -- varios en quiebre
        else (2 + floor(random()*6))::numeric end,
      2
    from inventario_item_destinos d
    join equipos e on e.id = d.equipo_id
    where e.embarcacion_id = p_emb
    limit 35
    on conflict do nothing;

    -- consumos (salidas) ligados a OTs correctivas cerradas
    insert into movimientos (empresa_id, fecha, tipo, item_id, bodega_from, cantidad, ot_id, responsable, motivo)
    select v_emp, o.fecha, 'salida'::app.tipo_movimiento, s.item_id, v_bod, 1, o.id, 'Demo Seed', 'Consumo en OT correctiva'
    from ordenes_trabajo o
    join lateral (select item_id from stock where bodega_id = v_bod order by random() limit 1) s on true
    where o.embarcacion_id = p_emb and o.tipo = 'correctivo' and o.estado = 'cerrada'
    limit 20;
  end if;

  -- ── 3.11 Económico: mareas + captura + economía (sana y critica) → Rentabilidad / LucroCesante ──
  if p_perfil in ('sana','critica') then
    for v_i in 1..8 loop
      v_dias  := 8 + floor(random()*6)::int;
      v_zarpe := (v_hoy - (v_i*24 + (random()*5)::int))::timestamp + time '06:00';
      insert into mareas (empresa_id, embarcacion_id, estado, zarpe_at, recalada_at, responsable,
        comb_ini, comb_fin, retorno_falla, falla_descripcion)
      values (v_emp, p_emb, 'cerrada', v_zarpe, v_zarpe + (v_dias || ' days')::interval, 'Patrón Demo',
        12000, 12000 - (v_dias*900), (p_perfil='critica' and v_i=1),
        case when p_perfil='critica' and v_i=1 then 'Retorno anticipado por sobretemperatura de motor' else null end)
      returning id into v_marea;

      for v_esp in select id, nombre, precio_kg_default from especies where empresa_id = v_emp limit 3 loop
        v_kg := (case p_perfil when 'critica' then 4000 else 9000 end) * (0.6 + random()*0.8);
        insert into marea_captura (empresa_id, marea_id, especie_id, especie_nombre, kg, precio_kg)
        values (v_emp, v_marea, v_esp.id, v_esp.nombre, round(v_kg), v_esp.precio_kg_default);
      end loop;

      insert into marea_economia (empresa_id, marea_id, precio_combustible_l, precio_aceite_l,
        costo_viveres, costo_hielo, costo_carnada, costo_otros, parte_tripulacion_pct, num_tripulantes)
      values (v_emp, v_marea, 750, 3200, 900000, 600000, 1200000, 400000, 50, 6);
    end loop;
  end if;

  -- ── 3.12 Presupuesto anual + Prezarpe + Solicitudes ──
  insert into presupuestos (empresa_id, embarcacion_id, anio, monto, notas)
  values (v_emp, p_emb, extract(year from v_hoy)::int,
    case p_perfil when 'critica' then 55000000 when 'varada' then 70000000 else 38000000 end,
    'Presupuesto demo de mantención')
  on conflict do nothing;

  insert into prezarpes (empresa_id, embarcacion_id, fecha, responsable, apto, observaciones)
  values (v_emp, p_emb, v_hoy - 2, 'Patrón Demo',
    case p_perfil when 'varada' then false else true end,
    case p_perfil when 'varada' then 'NO APTO: trabajos críticos de varada pendientes (ejes, balsas)'
                  when 'critica' then 'Apto con observaciones: PMs vencidos por regularizar' else 'Apto para zarpe' end);

  if p_perfil = 'critica' then
    insert into solicitudes (empresa_id, embarcacion_id, solicitante, sistema, descripcion, prioridad, estado, fecha)
    values
      (v_emp, p_emb, 'Jefe de Máquinas', 'Propulsión', 'Ruido anormal en reductora a alta carga', 'alta', 'pendiente', v_hoy - 4),
      (v_emp, p_emb, 'Patrón',           'Hidráulico', 'Fuga de aceite en manguera de winche',    'media','pendiente', v_hoy - 2),
      (v_emp, p_emb, 'Tripulante',       'Eléctrico',  'Luminaria de cubierta intermitente',      'baja', 'pendiente', v_hoy - 1);
  end if;
end;
$fn$;

-- ────────────────────────────────────────────────────────────
-- 4) Orquestador — crea las naves, clona y aplica perfiles.
--    Solo super_admin. Idempotente. Reproducible (setseed).
-- ────────────────────────────────────────────────────────────
create or replace function public.fn_seed_demo_flota(p_empresa uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_rol  text;
  v_emp  uuid;
  v_dm   uuid;
  v_dr   uuid;
  v_sp   uuid;
  v_user uuid := auth.uid();
begin
  -- Autorización: un usuario autenticado debe ser super_admin. Un contexto sin
  -- sesión (service_role / migración) se considera confiable y pasa.
  select rol into v_rol from profiles where id = v_user;
  if v_user is not null and v_rol is distinct from 'super_admin' then
    raise exception 'No autorizado: se requiere rol super_admin (rol actual: %)', coalesce(v_rol, 'sin sesión');
  end if;

  -- Empresa: la indicada o la de la nave DM existente o la del usuario.
  v_emp := coalesce(
    p_empresa,
    (select empresa_id from embarcaciones where codigo = 'DM' limit 1),
    (select empresa_id from profiles where id = v_user)
  );
  if v_emp is null then raise exception 'No se pudo resolver la empresa'; end if;

  perform setseed(0.42);

  -- Catálogos base (idempotentes)
  insert into especies (empresa_id, nombre, precio_kg_default)
  select v_emp, x.n, x.p from (values
    ('Merluza común', 3500), ('Jurel', 900), ('Reineta', 2500), ('Congrio', 6000)
  ) x(n,p)
  where not exists (select 1 from especies e where e.empresa_id = v_emp and e.nombre = x.n);

  -- Nave DM (debe existir, cargada con la plantilla)
  select id into v_dm from embarcaciones where empresa_id = v_emp and codigo = 'DM' limit 1;
  if v_dm is null then
    raise exception 'No existe la nave DM con la plantilla cargada; precárgala primero en Equipos.';
  end if;

  -- Naves DR y SP (crear si faltan)
  select id into v_dr from embarcaciones where empresa_id = v_emp and codigo = 'DR' limit 1;
  if v_dr is null then
    insert into embarcaciones (empresa_id, codigo, nombre, color, created_by)
    values (v_emp, 'DR', 'Doña Rosa', '#C0392B', v_user) returning id into v_dr;
  end if;
  select id into v_sp from embarcaciones where empresa_id = v_emp and codigo = 'SP' limit 1;
  if v_sp is null then
    insert into embarcaciones (empresa_id, codigo, nombre, color, created_by)
    values (v_emp, 'SP', 'San Pedro', '#E67E22', v_user) returning id into v_sp;
  end if;

  -- Bodegas por nave (idempotente)
  insert into bodegas (empresa_id, codigo, nombre, tipo, embarcacion_id)
  select v_emp, b.cod, b.nom, 'a_bordo'::app.tipo_bodega, b.emb from (values
    ('DM-BOD','Pañol Don Miguel', v_dm),
    ('DR-BOD','Pañol Doña Rosa',  v_dr),
    ('SP-BOD','Pañol San Pedro',  v_sp)
  ) b(cod,nom,emb)
  where not exists (select 1 from bodegas g where g.empresa_id = v_emp and g.codigo = b.cod);

  -- Estructura de DR y SP: reset total + clon desde DM
  perform fn_demo_reset_estructura(v_dr);
  perform fn_clonar_estructura(v_dm, v_dr, 'DM', 'DR');
  perform fn_demo_reset_estructura(v_sp);
  perform fn_clonar_estructura(v_dm, v_sp, 'DM', 'SP');

  -- Overlay operacional por perfil (DM solo reset operacional, conserva estructura)
  perform fn_demo_reset_operacional(v_dm);
  perform fn_seed_demo_perfil(v_dm, 'sana');
  perform fn_seed_demo_perfil(v_dr, 'critica');
  perform fn_seed_demo_perfil(v_sp, 'varada');

  -- Traza
  insert into bitacora (empresa_id, usuario_id, usuario_nombre, rol, accion, detalle)
  select v_emp, v_user, coalesce(pr.nombre,''), 'super_admin', 'Generar flota demo',
    'Don Miguel (sana) · Doña Rosa (critica) · San Pedro (varada)'
  from profiles pr where pr.id = v_user;

  return jsonb_build_object(
    'empresa', v_emp,
    'naves', jsonb_build_object('DM', v_dm, 'DR', v_dr, 'SP', v_sp),
    'ok', true
  );
end;
$fn$;

revoke all on function public.fn_seed_demo_flota(uuid) from public, anon;
grant execute on function public.fn_seed_demo_flota(uuid) to authenticated;
-- helpers internos: no exponer al rol autenticado
revoke all on function public.fn_clonar_estructura(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.fn_demo_reset_operacional(uuid)         from public, anon, authenticated;
revoke all on function public.fn_demo_reset_estructura(uuid)          from public, anon, authenticated;
revoke all on function public.fn_seed_demo_perfil(uuid,text)          from public, anon, authenticated;
