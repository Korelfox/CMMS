-- T1: los crons analíticos (sugerencias de OT, insights vigilante, supervisores
-- de horómetro y OT) NO excluían filas soft-deleted. El soft-delete (deleted_at)
-- se agregó después de estos crons; 20260620_0004 solo parchó el trigger de
-- horómetro y el clon. Aquí se alinean los crons restantes: no deben agregar,
-- contar ni auditar sobre equipos / planes / OTs eliminados (datos fantasma).
--
-- Solo se recrean los cuerpos de función con `deleted_at is null` añadido; el
-- resto de la lógica queda idéntica. Tablas sin soft-delete (mediciones_pdm,
-- varada_trabajos) no se filtran porque no tienen la columna.

-- ── 1. _gen_ots: no sugerir PM para equipos/planes borrados ──────────────────
create or replace function public._gen_ots(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $gen$
declare
  v_inserted integer;
begin
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
      p.empresa_id,
      p.id  as plan_pm_id,
      e.id  as equipo_id,
      e.embarcacion_id,
      e.sistema,
      e.criticidad,
      e.horas_actual,
      p.intervalo_horas,
      p.horas_ult_pm,
      p.descripcion as plan_desc,
      (p.tipo_disparador = 'calendario') as es_cal,
      'pm:' || p.id::text || ':' ||
        case when p.tipo_disparador = 'calendario'
             then coalesce(p.fecha_ult_pm::text, 'inicio')
             else round(p.horas_ult_pm)::text end as huella,
      case when p.tipo_disparador = 'calendario'
           then coalesce(p.intervalo_calendario, 1) * case p.unidad_calendario
                  when 'diario' then 1 when 'semanal' then 7 when 'mensual' then 30
                  when 'trimestral' then 90 when 'semestral' then 182 when 'anual' then 365
                  else 30 end
           else p.intervalo_horas end as limite,
      case when p.tipo_disparador = 'calendario'
           then case when p.fecha_ult_pm is null then null else (current_date - p.fecha_ult_pm) end
           else (e.horas_actual - p.horas_ult_pm) end as elapsed
    from public.planes_pm p
    join public.equipos  e on e.id = p.equipo_id
    where p.activo = true
      and p.deleted_at is null            -- T1: no planes borrados
      and e.deleted_at is null            -- T1: no equipos borrados
      and (p_empresa is null or p.empresa_id = p_empresa)
  ) v
  where
    (
      (not v.es_cal and v.intervalo_horas > 0 and v.elapsed >= v.limite)
      or
      (v.es_cal and v.elapsed is null)
      or
      (v.es_cal and v.elapsed is not null and v.elapsed >= v.limite)
    )
    and not exists (
      select 1 from public.ordenes_trabajo o
      where o.empresa_id = v.empresa_id and o.huella = v.huella
        and o.deleted_at is null          -- T1: una OT borrada no bloquea la sugerencia
    )
  on conflict (empresa_id, huella) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$gen$;

-- ── 2. _gen_insights: no contar equipos/OTs borrados ─────────────────────────
create or replace function public._gen_insights(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $vig$
declare
  emp        record;
  v_a        integer;
  v_corr     integer;
  v_sinmodo  integer;
  v_pct      integer;
  v_c        integer;
  v_d        integer;
  v_n        integer := 0;
begin
  for emp in select id from public.empresas where (p_empresa is null or id = p_empresa)
  loop
    -- IA-A · equipos sin criticidad
    select count(*) into v_a from public.equipos
      where empresa_id = emp.id and criticidad is null and tipo_nodo <> 'sistema'
        and deleted_at is null;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-A',
      case when v_a > 20 then 'red' when v_a > 5 then 'amber' else 'ok' end,
      'Datos de criticidad',
      v_a || ' equipos sin criticidad asignada — InformeEjecutivo y Copiloto no priorizan bien sin A/B/C',
      v_a)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-B · % OTs correctivas cerradas sin modo_falla ISO 14224
    select count(*) filter (where estado = 'cerrada' and tipo = 'correctivo'),
           count(*) filter (where estado = 'cerrada' and tipo = 'correctivo' and modo_falla is null)
      into v_corr, v_sinmodo
      from public.ordenes_trabajo where empresa_id = emp.id and deleted_at is null;
    v_pct := case when v_corr = 0 then 0 else round(v_sinmodo * 100.0 / v_corr) end;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-B',
      case when v_corr < 5 then 'ok' when v_pct > 60 then 'red' when v_pct > 30 then 'amber' else 'ok' end,
      'Codificación ISO de fallas',
      case when v_corr < 5 then 'Pocas correctivas cerradas para evaluar (' || v_corr || ')'
           else v_sinmodo || ' de ' || v_corr || ' correctivas cerradas sin modo_falla (' || v_pct || '%) — DiagnósticoFallas trabaja incompleto' end,
      v_pct)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-C · equipos críticos A con <4 correctivas cerradas
    select count(*) into v_c from public.equipos e
      where e.empresa_id = emp.id and e.criticidad = 'A' and e.deleted_at is null
        and (select count(*) from public.ordenes_trabajo o
             where o.equipo_id = e.id and o.tipo = 'correctivo' and o.estado = 'cerrada'
               and o.deleted_at is null) < 4;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-C',
      case when v_c > 0 then 'amber' else 'ok' end,
      'Historial de críticos A',
      v_c || ' equipos críticos A con <4 correctivas cerradas — ConfiabilidadML no puede ajustar Weibull',
      v_c)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-D · series PdM sin medición reciente (>30 días). mediciones_pdm no tiene soft-delete.
    select count(*) into v_d from (
      select distinct on (equipo_id, tipo, parametro) fecha
      from public.mediciones_pdm where empresa_id = emp.id
      order by equipo_id, tipo, parametro, fecha desc, created_at desc
    ) s where s.fecha < current_date - 30;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-D',
      case when v_d > 0 then 'amber' else 'ok' end,
      'Señales PdM activas',
      v_d || ' series PdM sin medición en >30 días — DiagnósticoFallas pierde contexto de condición',
      v_d)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    v_n := v_n + 4;
  end loop;
  return v_n;
end;
$vig$;

-- ── 3. fn_audit_horometro: no auditar equipos/planes borrados ────────────────
create or replace function public.fn_audit_horometro(p_empresa_id uuid default null)
returns table (
  empresa_id      uuid,
  equipo_id       uuid,
  id_visible      text,
  tipo_violacion  text,
  horas_actual    numeric,
  horas_esperadas numeric,
  detalle         text
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  propios as (
    select id, id_visible, horas_actual, embarcacion_id, empresa_id
    from   public.equipos
    where  horometro = 'propio'
      and  deleted_at is null
      and  (p_empresa_id is null or empresa_id = p_empresa_id)
  ),
  arbol_parentid as (
    select p.id   as propio_id,
           p.id_visible as propio_visible,
           p.horas_actual as propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   propios p
    join   public.equipos e on e.parent_id = p.id and e.horometro = 'hereda' and e.deleted_at is null
    union all
    select a.propio_id, a.propio_visible, a.propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   arbol_parentid a
    join   public.equipos e on e.parent_id = a.id and e.horometro = 'hereda' and e.deleted_at is null
  ),
  arbol_fuente as (
    select p.id   as propio_id,
           p.id_visible as propio_visible,
           p.horas_actual as propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   propios p
    join   public.equipos e on e.horas_fuente_id = p.id and e.deleted_at is null
    union all
    select af.propio_id, af.propio_visible, af.propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   arbol_fuente af
    join   public.equipos e on e.parent_id = af.id and e.horometro = 'hereda' and e.deleted_at is null
  ),
  todos_hereda as (
    select * from arbol_parentid
    union
    select * from arbol_fuente
  ),
  v_desync as (
    select empresa_id, id as equipo_id, id_visible,
           'horas_desincronizadas'::text as tipo_violacion,
           horas_actual,
           propio_horas as horas_esperadas,
           'Fuente propio: ' || propio_visible
             || ' (' || propio_horas::text || ' h registradas)' as detalle
    from   todos_hereda
    where  abs(horas_actual - propio_horas) > 0.5
  ),
  v_pm as (
    select distinct on (e.id, p.id)
           e.empresa_id, e.id as equipo_id, e.id_visible,
           'pm_silenciado'::text,
           e.horas_actual,
           null::numeric as horas_esperadas,
           'Plan activo "' || p.descripcion || '" · equipo tiene 0 h pero nave tiene motor en marcha' as detalle
    from   public.planes_pm p
    join   public.equipos   e on e.id = p.equipo_id
    where  p.tipo_disparador = 'horas'
      and  p.activo = true
      and  p.deleted_at is null
      and  e.deleted_at is null
      and  e.horas_actual = 0
      and  (p_empresa_id is null or e.empresa_id = p_empresa_id)
      and  exists (
             select 1 from public.equipos pr
             where  pr.horometro        = 'propio'
               and  pr.embarcacion_id   = e.embarcacion_id
               and  pr.horas_actual     > 0
               and  pr.deleted_at is null
           )
  ),
  v_fuente as (
    select e.empresa_id, e.id as equipo_id, e.id_visible,
           'fuente_huerfana'::text,
           e.horas_actual,
           null::numeric,
           case
             when f.id is null
               then 'horas_fuente_id = ' || e.horas_fuente_id::text || ' (nodo no existe)'
             else
               'horas_fuente_id apunta a ' || f.id_visible
               || ' (horometro = ''' || f.horometro || ''', debe ser ''propio'')'
           end as detalle
    from   public.equipos e
    left join public.equipos f on f.id = e.horas_fuente_id and f.deleted_at is null
    where  e.horas_fuente_id is not null
      and  e.deleted_at is null
      and  (f.id is null or f.horometro <> 'propio')
      and  (p_empresa_id is null or e.empresa_id = p_empresa_id)
  )
  select * from v_desync
  union all
  select * from v_pm
  union all
  select * from v_fuente
  order by tipo_violacion, id_visible;
$$;

-- ── 4. fn_guardar_audit_horometro: iterar solo empresas con equipos vivos ────
create or replace function public.fn_guardar_audit_horometro()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  emp record;
begin
  for emp in
    select distinct empresa_id
    from   public.equipos
    where  empresa_id is not null
      and  deleted_at is null
  loop
    insert into public.horometro_health_log (empresa_id, n_violaciones, violaciones)
    select
      emp.empresa_id,
      count(*)::int,
      case when count(*) > 0
        then jsonb_agg(jsonb_build_object(
          'tipo',            tipo_violacion,
          'equipo',          id_visible,
          'horas_actual',    horas_actual,
          'horas_esperadas', horas_esperadas,
          'detalle',         detalle
        ))
        else null
      end
    from public.fn_audit_horometro(emp.empresa_id);
  end loop;
end;
$$;

-- ── 5. fn_audit_ot: no auditar OTs borradas ──────────────────────────────────
create or replace function public.fn_audit_ot(p_empresa uuid default null)
returns table(ot_id uuid, folio text, embarcacion text, equipo text, tipo_violacion text, severidad text, detalle text)
language sql
stable security definer
set search_path = public
as $function$
  with base as (
    select o.*, em.nombre as nave, eq.id_visible as eq_vis, eq.embarcacion_id as eq_emb,
           v.nombre as varada_nom
    from ordenes_trabajo o
    left join embarcaciones em on em.id = o.embarcacion_id
    left join equipos eq       on eq.id = o.equipo_id
    left join varadas v        on v.id  = o.varada_id
    where (p_empresa is null or o.empresa_id = p_empresa)
      and o.deleted_at is null            -- T1: no auditar OTs borradas
  )
  select id, folio, nave, null::text, 'equipo_sin_vinculo', 'aviso',
    case when varada_id is not null
      then 'Planificada desde varada «' || coalesce(varada_nom, '?') || '» sin equipo — no alimenta confiabilidad/MTBF/Pareto por equipo'
      else 'OT sin equipo vinculado — no aparece en el análisis por equipo' end
  from base where equipo_id is null
  union all
  select id, folio, nave, null, 'equipo_huerfano', 'critico',
    'equipo_id apunta a un equipo inexistente (borrado)'
  from base where equipo_id is not null and eq_vis is null
  union all
  select id, folio, nave, eq_vis, 'nave_inconsistente', 'critico',
    'La OT (' || coalesce(nave, '?') || ') y su equipo pertenecen a naves distintas'
  from base
  where equipo_id is not null and eq_vis is not null
    and embarcacion_id is not null and eq_emb is distinct from embarcacion_id
  union all
  select id, folio, nave, eq_vis, 'varada_huerfana', 'critico',
    'varada_id apunta a una varada inexistente'
  from base where varada_id is not null and varada_nom is null
  union all
  select id, folio, nave, eq_vis, 'solicitud_huerfana', 'aviso',
    'origen_solicitud_id apunta a una solicitud inexistente'
  from base
  where origen_solicitud_id is not null
    and not exists (select 1 from solicitudes s where s.id = base.origen_solicitud_id and s.deleted_at is null)
  union all
  select id, folio, nave, eq_vis, 'correctiva_sin_mttr', 'aviso',
    'Correctiva cerrada sin MTTR — no alimenta MTBF/Weibull/lucro cesante'
  from base where tipo = 'correctivo' and estado = 'cerrada' and coalesce(mttr_horas, 0) = 0
  union all
  select id, folio, nave, eq_vis, 'auto_sin_huella', 'aviso',
    'OT automática sin huella de idempotencia — riesgo de duplicación'
  from base where origen = 'auto' and (huella is null or huella = '')
  union all
  select t.ot_id, null::text, em.nombre, null::text, 'trabajo_varada_huerfano', 'aviso',
    'Trabajo de varada «' || coalesce(t.descripcion, '?') || '» referencia una OT inexistente'
  from varada_trabajos t
  left join varadas v        on v.id  = t.varada_id
  left join embarcaciones em on em.id = v.embarcacion_id
  where t.ot_id is not null
    and not exists (select 1 from ordenes_trabajo o where o.id = t.ot_id and o.deleted_at is null)
    and (p_empresa is null or t.empresa_id = p_empresa);
$function$;

-- ── 6. fn_guardar_audit_ot: iterar solo empresas con OTs vivas ───────────────
create or replace function public.fn_guardar_audit_ot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare emp record;
begin
  for emp in
    select distinct empresa_id from public.ordenes_trabajo
    where empresa_id is not null and deleted_at is null
  loop
    insert into public.ot_health_log (empresa_id, n_violaciones, n_criticos, violaciones)
    select
      emp.empresa_id,
      count(*)::int,
      count(*) filter (where severidad = 'critico')::int,
      case when count(*) > 0
        then jsonb_agg(jsonb_build_object(
          'tipo', tipo_violacion, 'folio', folio, 'nave', embarcacion,
          'severidad', severidad, 'detalle', detalle))
        else null end
    from public.fn_audit_ot(emp.empresa_id);
  end loop;
end;
$$;
