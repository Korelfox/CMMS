-- ============================================================
--  Ajuste fn_seed_demo_perfil: costos realistas para Chile 2024.
--
--  Contexto: motor propulsor marino ~18.000.000 CLP nuevo.
--  Antes una bomba SW podía acumular 15M+ en reparaciones (incorrecto).
--
--  Cambios:
--    3.5 Preventivos   — MO 35k-130k, Mat 20k-230k (sin cambio significativo)
--    3.6 Correctivos   — MO 60k-380k (antes 150k-1.05M), Mat 40k-600k (antes 80k-1.28M)
--    3.7 Falla mayor   — mttr 48h, MO 1.35M, Mat 1.9M  (antes 72h/1.8M/4.2M)
--    3.9 Carena critica— MO/Mat reducidos (arenado 2.4M/2.8M; ejes 1.4M/1.6M)
--    3.9 Varada mat    — ratio 30-80% del MO (antes 40-120%)
-- ============================================================

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
  v_factor  numeric;
  v_modos   text[] := array['Fuga externa','Vibración alta','Sobretemperatura','No arranca','Obstrucción','Desgaste prematuro'];
begin
  select empresa_id into v_emp from embarcaciones where id = p_emb;
  select id into v_bod from bodegas where embarcacion_id = p_emb limit 1;

  -- ── 3.1 Lecturas de horómetro (52 semanas) ──────────────────────────────
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

  -- Resync horas_actual
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

  -- ── 3.2 Violación deliberada en 'critica' ────────────────────────────────
  if p_perfil = 'critica' then
    update equipos e
    set horas_fuente_id = (select id from equipos where embarcacion_id = p_emb and id_visible like '%-PROP' and tipo_nodo = 'sistema' limit 1)
    where e.embarcacion_id = p_emb and e.id_visible like '%-PROP-EJE';
  end if;

  -- ── 3.3 PMs: disparador según perfil y horas disponibles ─────────────────
  update planes_pm p
  set tipo_disparador = 'calendario',
      intervalo_calendario = greatest(1, round(coalesce(p.intervalo_horas, 2000) / 2000.0)),
      unidad_calendario = 'anual',
      intervalo_horas = null
  from equipos e
  where p.equipo_id = e.id and e.embarcacion_id = p_emb and p.tipo_disparador = 'horas'
    and ((p_perfil = 'critica' and e.horometro = 'no') or (p_perfil <> 'critica' and e.horas_actual = 0));

  update planes_pm p
  set horas_ult_pm = greatest(0, e.horas_actual - p.intervalo_horas *
        case p_perfil
          when 'critica' then 1.0 + random() * 0.4
          when 'varada'  then 0.5 + random() * 0.3
          else case when random() < 0.18 then 0.93 else 0.3 + random() * 0.5 end
        end)
  from equipos e
  where p.equipo_id = e.id and e.embarcacion_id = p_emb
    and p.tipo_disparador = 'horas' and coalesce(p.intervalo_horas, 0) > 0
    and e.horas_actual > 0;

  update planes_pm p
  set fecha_ult_pm = v_hoy - (greatest(1, coalesce(p.intervalo_calendario,1)) * 365 *
        case p_perfil
          when 'critica' then 1.0 + random() * 0.5
          else 0.3 + random() * 0.5
        end)::int
  where p.equipo_id in (select id from equipos where embarcacion_id = p_emb)
    and p.tipo_disparador = 'calendario';

  -- ── 3.4 OTs auto PM vencidos (solo critica) ──────────────────────────────
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

  -- ── 3.5 Historia preventiva cerrada + historial_pm ───────────────────────
  -- Costo MO: $35k-$130k (2-5h × $22k-$28k mecánico).
  -- Costo Mat: $20k-$230k (aceite 80k-180k, filtros 30k-100k, correas 50k-120k).
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
        v_eq.descripcion, v_t,
        round((2 + random()*6)::numeric,1),
        round((35000 + random()*95000)::numeric, 0),   -- MO: $35k-$130k
        round((20000 + random()*210000)::numeric, 0),  -- Mat: $20k-$230k (aceite, filtros, consumibles)
        'Demo Seed', v_t::timestamptz, 'Demo Seed', v_t::timestamptz)
      returning id into v_major;

      insert into historial_pm (empresa_id, plan_pm_id, equipo_id, horas_realizacion, fecha_realizacion, realizado_por, ot_id)
      values (v_emp, v_eq.plan_id, v_eq.equipo_id,
        round(v_i * v_eq.intervalo_horas * (case p_perfil when 'critica' then 1.15 else 0.97 end))::numeric,
        v_t, 'Demo Seed', v_major);
    end loop;
  end loop;

  -- ── 3.6 Historia correctiva (Weibull / Pareto / MTBF) ───────────────────
  -- Componentes: bomba FW, bomba SW generador, bomba hidráulica, inyectores, filtro aceite.
  -- MO: $60k-$380k  (2-14h × $27k/h según complejidad de reparación)
  -- Mat: $40k-$600k (filtro simple $40k → bomba SW completa $600k)
  -- Con v_nfail=8 (critica), peor componente acumula máx ~7-8M total: proporcional
  -- al costo de un motor nuevo (18M CLP). Antes podía llegar a 15M+ por componente.
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
        round((60000  + random()*320000)::numeric, 0),  -- MO: $60k-$380k
        round((40000  + random()*560000)::numeric, 0),  -- Mat: $40k-$600k
        v_modo, 'Desgaste', 'Fin de vida útil', 'Demo Seed', v_t::timestamptz,
        'Demo Seed', v_t::timestamptz);
      v_i := v_i + 1;
    end loop;
  end loop;

  -- ── 3.7 Backlog + falla mayor + RCA (critica) ────────────────────────────
  if p_perfil = 'critica' then
    insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad, estado, descripcion, fecha)
    select v_emp, p_emb, e.id, e.sistema, 'correctivo', (array['alta','critica','media'])[1+floor(random()*3)::int]::app.prioridad,
      (array['solicitada','planificada','programada','en_ejecucion'])[1+floor(random()*4)::int]::app.estado_ot,
      'Pendiente: revisión por novedad operacional', v_hoy - (random()*25)::int
    from equipos e
    where e.embarcacion_id = p_emb and e.id_visible like '%-PROP-MTR%' and e.tipo_nodo = 'componente'
    order by random() limit 6;

    -- Falla mayor: sobretemperatura motor, pérdida de refrigeración.
    -- 48h real MTTR (diagnóstico + bombas + purgado + pruebas en puerto).
    -- MO: 48h × $28k/h = $1.35M.
    -- Mat: bomba SW nueva $900k + cañerías/acoples $400k + termostato $300k
    --       + anticongelante/fluidos $300k = $1.9M.
    -- Total falla: $3.25M — proporcional, no se acerca al costo de un motor nuevo.
    select id, sistema into v_eq from equipos where embarcacion_id = p_emb and id_visible like '%-PROP-MTR-FW-BMP' limit 1;
    if v_eq.id is not null then
      insert into ordenes_trabajo (empresa_id, embarcacion_id, equipo_id, sistema, tipo, prioridad,
        estado, descripcion, fecha, mttr_horas, costo_mo, costo_mat, modo_falla, mecanismo_falla, causa_falla,
        cerrada_por, cerrada_fecha, costos_por, costos_fecha)
      values (v_emp, p_emb, v_eq.id, v_eq.sistema, 'correctivo', 'critica', 'cerrada',
        'Sobretemperatura motor — pérdida de refrigeración en faena', v_hoy - 12,
        48, 1350000, 1900000,
        'Sobretemperatura', 'Falla de refrigeración', 'Bomba SW sin caudal',
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

  -- ── 3.8 Mediciones PdM ───────────────────────────────────────────────────
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

  -- ── 3.9 Varada / Carena ───────────────────────────────────────────────────
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

    -- MO: $25k/h tarifa astillero chileno (contratista especializado).
    -- Mat: 30-80% del MO (materiales menores que la mano de obra especializada).
    -- Ejemplo Casco: 120h × $25k = $3M MO; pintura epóxica + abrasivos = $0.9M-$2.4M.
    for v_eq in select id, sistema, descripcion, estado, horas_estimadas, critico_zarpe
                from varada_trabajos where varada_id = v_varada
    loop
      insert into ordenes_trabajo (empresa_id, embarcacion_id, sistema, tipo, prioridad, estado,
        descripcion, fecha, varada_id, costo_mo, costo_mat, cerrada_por, cerrada_fecha, costos_por, costos_fecha)
      values (v_emp, p_emb, v_eq.sistema, 'preventivo',
        (case when v_eq.critico_zarpe then 'alta' else 'media' end)::app.prioridad,
        (case v_eq.estado when 'completado' then 'cerrada' when 'en_progreso' then 'en_ejecucion' else 'planificada' end)::app.estado_ot,
        v_eq.descripcion, v_hoy - 18, v_varada,
        round((v_eq.horas_estimadas * 25000 * (case v_eq.estado when 'completado' then 1.0 when 'en_progreso' then 0.55 else 0 end))::numeric),
        round((v_eq.horas_estimadas * 25000 * (case v_eq.estado when 'completado' then 1.0 when 'en_progreso' then 0.55 else 0 end) * (0.3 + random()*0.5))::numeric),
        case when v_eq.estado = 'completado' then 'Astillero' end,
        case when v_eq.estado = 'completado' then (v_hoy - 6)::timestamptz end,
        case when v_eq.estado in ('completado','en_progreso') then 'Jefe Mantención' end,
        case when v_eq.estado in ('completado','en_progreso') then (v_hoy - 6)::timestamptz end)
      returning id into v_major;
      update varada_trabajos set ot_id = v_major where id = v_eq.id;
    end loop;

  elsif p_perfil = 'critica' then
    -- Carena anual cerrada: presupuesto 22M, costos reales 8.2M en OTs costeadas.
    -- Arenado y pintura: $2.4M MO (96 man-h × $25k) + $2.8M mat (pintura epóxica, arena).
    -- Inspección ejes: $1.4M MO (56 man-h × $25k) + $1.6M mat (bocina, sellos Simplex, ajuste hélice).
    insert into varadas (empresa_id, embarcacion_id, nombre, tipo, estado, fecha_inicio, fecha_fin_estimada, fecha_fin_real, presupuesto, descripcion)
    values (v_emp, p_emb, 'Carena anual', 'carena', 'cerrada', v_hoy - 300, v_hoy - 288, v_hoy - 285, 22000000,
      'Carena programada del año anterior')
    returning id into v_varada;

    insert into ordenes_trabajo (empresa_id, embarcacion_id, sistema, tipo, prioridad, estado, descripcion, fecha, varada_id, costo_mo, costo_mat, cerrada_por, cerrada_fecha, costos_por, costos_fecha) values
      (v_emp, p_emb, 'Casco',      'preventivo', 'alta',  'cerrada', 'Carena: arenado y pintura de obra viva',  v_hoy - 295, v_varada, 2400000, 2800000, 'Astillero', (v_hoy-286)::timestamptz, 'Jefe Mantención', (v_hoy-286)::timestamptz),
      (v_emp, p_emb, 'Propulsión', 'preventivo', 'media', 'cerrada', 'Carena: inspección de ejes y hélice',    v_hoy - 293, v_varada, 1400000, 1600000, 'Astillero', (v_hoy-286)::timestamptz, 'Jefe Mantención', (v_hoy-286)::timestamptz);
  end if;

  -- ── 3.10 Inventario: stock por bodega ────────────────────────────────────
  if v_bod is not null then
    insert into stock (empresa_id, item_id, bodega_id, cantidad, stock_min)
    select distinct v_emp, d.item_id, v_bod,
      case p_perfil
        when 'critica' then (array[0,0,1,2])[1+floor(random()*4)::int]
        else (2 + floor(random()*6))::numeric end,
      2
    from inventario_item_destinos d
    join equipos e on e.id = d.equipo_id
    where e.embarcacion_id = p_emb
    limit 35
    on conflict do nothing;

    insert into movimientos (empresa_id, fecha, tipo, item_id, bodega_from, cantidad, ot_id, responsable, motivo)
    select v_emp, o.fecha, 'salida'::app.tipo_movimiento, s.item_id, v_bod, 1, o.id, 'Demo Seed', 'Consumo en OT correctiva'
    from ordenes_trabajo o
    join lateral (select item_id from stock where bodega_id = v_bod order by random() limit 1) s on true
    where o.embarcacion_id = p_emb and o.tipo = 'correctivo' and o.estado = 'cerrada'
    limit 20;
  end if;

  -- ── 3.11 Económico: mareas + captura + economía ──────────────────────────
  -- Combustible: $750/L diesel (precio actual Chile 2024).
  -- Aceite marino: $3.200/L.
  -- Víveres 8-14 días, 6 tripulantes: $900k razonable.
  -- Hielo: $600k por marea (15-20 bolsas × $30k c/u).
  -- Carnada: $1.2M por marea para pesca con línea/curricán.
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

  -- ── 3.12 Presupuesto + Prezarpe + Solicitudes ────────────────────────────
  -- Presupuestos anuales de mantención (nave pesquera mediana ~20-25m, Chile):
  --   sana:   $28M — bien gestionada, ratio correctivo/preventivo bajo.
  --   critica: $45M — reactiva, sobrecosto por fallas no planificadas.
  --   varada:  $65M — incluye varada mayor en astillero.
  insert into presupuestos (empresa_id, embarcacion_id, anio, monto, notas)
  values (v_emp, p_emb, extract(year from v_hoy)::int,
    case p_perfil when 'critica' then 45000000 when 'varada' then 65000000 else 28000000 end,
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

-- Mantener mismo esquema de permisos: la función es interna, solo la invoca fn_seed_demo_flota.
revoke all on function public.fn_seed_demo_perfil(uuid,text) from public, anon, authenticated;
