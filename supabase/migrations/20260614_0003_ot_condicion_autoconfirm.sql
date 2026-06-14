-- CMMS autónomo · Fase 2 (cont.) — Disparador por CONDICIÓN (PdM) + AUTO-CONFIRMACIÓN.
--
-- Extiende el motor server-side _gen_ots() con:
--  (b) Condición PdM: si la última medición de una serie (equipo·tipo·parámetro)
--      cruza su límite de alerta/crítico, propone una OT de inspección. Mismo
--      criterio que evaluarMedicion() del frontend (umbral ascendente).
--  (c) Auto-confirmación por criticidad C: el PM/condición rutinario de equipos
--      de baja criticidad nace como OT firme directamente, sin compuerta humana.
--      Criticidad A/B siempre espera revisión. (El predictivo Weibull se materializa
--      en el cliente — la regresión no va en SQL.)
--
-- CREATE OR REPLACE conserva los grants ya revocados de anon/authenticated.

create or replace function public._gen_ots(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $gen$
declare
  v_pm   integer := 0;
  v_pdm  integer := 0;
  v_ot   uuid;
  r      record;
begin
  -- (a) PM vencido (horómetro / calendario) ----------------------------------
  insert into public.ot_sugerencias (
    empresa_id, huella, plan_pm_id, equipo_id, embarcacion_id, sistema,
    tipo, prioridad, descripcion, motivo, criticidad, horas_actual, elapsed, limite,
    estado, origen
  )
  select
    v.empresa_id, v.huella, v.plan_pm_id, v.equipo_id, v.embarcacion_id, v.sistema,
    'preventivo', 'alta',
    case when v.es_cal then 'PM Cal · ' else 'PM ' || coalesce(v.intervalo_horas::text, '?') || 'h · ' end
      || coalesce(nullif(v.plan_desc, ''), 'Mantención preventiva'),
    case
      when v.es_cal and v.elapsed is null
        then 'Plan calendario nunca ejecutado — vencido'
      when v.es_cal
        then 'Calendario vencido hace ' || greatest(0, round(v.elapsed - v.limite))::text
             || ' día(s) (período ' || round(v.limite)::text || ' d)'
      else 'Horómetro ' || round(v.horas_actual)::text || ' h supera el PM de '
           || round(v.limite)::text || ' h (último a ' || round(v.horas_ult_pm)::text
           || ' h · +' || greatest(0, round(v.elapsed - v.limite))::text || ' h)'
    end,
    v.criticidad, v.horas_actual, v.elapsed, v.limite,
    'sugerida',
    case when p_empresa is null then 'cron' else 'manual' end
  from (
    select
      p.empresa_id, p.id as plan_pm_id, e.id as equipo_id, e.embarcacion_id, e.sistema,
      e.criticidad, e.horas_actual, p.intervalo_horas, p.horas_ult_pm, p.descripcion as plan_desc,
      (p.tipo_disparador = 'calendario') as es_cal,
      'pm:' || p.id::text || ':' ||
        case when p.tipo_disparador = 'calendario'
             then coalesce(p.fecha_ult_pm::text, 'inicio')
             else round(p.horas_ult_pm)::text end as huella,
      case when p.tipo_disparador = 'calendario'
           then coalesce(p.intervalo_calendario, 1) * case p.unidad_calendario
                  when 'diario' then 1 when 'semanal' then 7 when 'mensual' then 30
                  when 'trimestral' then 90 when 'semestral' then 182 when 'anual' then 365 else 30 end
           else p.intervalo_horas end as limite,
      case when p.tipo_disparador = 'calendario'
           then case when p.fecha_ult_pm is null then null else (current_date - p.fecha_ult_pm) end
           else (e.horas_actual - p.horas_ult_pm) end as elapsed
    from public.planes_pm p
    join public.equipos  e on e.id = p.equipo_id
    where p.activo = true and (p_empresa is null or p.empresa_id = p_empresa)
  ) v
  where (
      (not v.es_cal and v.intervalo_horas > 0 and v.elapsed >= v.limite)
      or (v.es_cal and v.elapsed is null)
      or (v.es_cal and v.elapsed is not null and v.elapsed >= v.limite)
    )
    and not exists (
      select 1 from public.ordenes_trabajo o
      where o.empresa_id = v.empresa_id and o.huella = v.huella
    )
  on conflict (empresa_id, huella) do nothing;
  get diagnostics v_pm = row_count;

  -- (b) Condición PdM: última medición de cada serie fuera de límite -----------
  insert into public.ot_sugerencias (
    empresa_id, huella, equipo_id, embarcacion_id, sistema,
    tipo, prioridad, descripcion, motivo, criticidad, estado, origen
  )
  select
    m.empresa_id,
    'pdm:' || m.equipo_id::text || ':' || m.tipo || ':' || m.parametro || ':' || m.fecha::text,
    m.equipo_id, e.embarcacion_id, e.sistema,
    'preventivo',
    case when m.limite_critico is not null and m.valor >= m.limite_critico then 'alta' else 'media' end,
    'Inspección por condición · ' || m.parametro,
    'PdM ' || m.parametro || ' = ' || round(m.valor, 1)::text || coalesce(' ' || m.unidad, '')
      || ' supera ' ||
      case when m.limite_critico is not null and m.valor >= m.limite_critico
           then 'el límite crítico (' || m.limite_critico::text || ')'
           else 'el límite de alerta (' || m.limite_alerta::text || ')' end
      || ' · medido ' || m.fecha::text,
    e.criticidad, 'sugerida', 'condicion'
  from (
    select distinct on (equipo_id, tipo, parametro) *
    from public.mediciones_pdm
    where (p_empresa is null or empresa_id = p_empresa)
    order by equipo_id, tipo, parametro, fecha desc, created_at desc
  ) m
  join public.equipos e on e.id = m.equipo_id
  where (
      (m.limite_critico is not null and m.valor >= m.limite_critico)
      or (m.limite_alerta is not null and m.valor >= m.limite_alerta)
    )
    and not exists (
      select 1 from public.ordenes_trabajo o
      where o.empresa_id = m.empresa_id
        and o.huella = 'pdm:' || m.equipo_id::text || ':' || m.tipo || ':' || m.parametro || ':' || m.fecha::text
    )
  on conflict (empresa_id, huella) do nothing;
  get diagnostics v_pdm = row_count;

  -- (c) Auto-confirmación por criticidad C: nace la OT firme sin compuerta -----
  for r in
    select s.* from public.ot_sugerencias s
    where s.estado = 'sugerida' and s.criticidad = 'C'
      and (p_empresa is null or s.empresa_id = p_empresa)
      and not exists (
        select 1 from public.ordenes_trabajo o
        where o.empresa_id = s.empresa_id and o.huella = s.huella
      )
  loop
    insert into public.ordenes_trabajo (
      empresa_id, embarcacion_id, equipo_id, sistema,
      tipo, prioridad, descripcion, fecha, estado, origen, huella
    ) values (
      r.empresa_id, r.embarcacion_id, r.equipo_id, r.sistema,
      'preventivo'::app.tipo_ot, r.prioridad::app.prioridad, r.descripcion,
      current_date, 'planificada'::app.estado_ot, 'auto', r.huella
    )
    returning id into v_ot;

    update public.ot_sugerencias
      set estado = 'confirmada', ot_id = v_ot, resolved_at = now()
      where id = r.id;
  end loop;

  return v_pm + v_pdm;
end;
$gen$;

revoke execute on function public._gen_ots(uuid) from public, anon, authenticated;
