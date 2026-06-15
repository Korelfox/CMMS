-- Supervisor de integridad del horómetro.
--
-- Detecta en tiempo real violaciones al flujo de horas que harían fallar
-- silenciosamente los planes PM, OT automáticas y KPIs de horómetro:
--
--   horas_desincronizadas  — nodo 'hereda' con horas_actual ≠ su fuente propio
--   pm_silenciado          — plan PM por horas en equipo con horas_actual=0
--                            cuando la nave tiene un propio con horas > 0
--   fuente_huerfana        — horas_fuente_id apunta a nodo inexistente o no-propio
--
-- Piezas:
--   1. Tabla  horometro_health_log   — histórico de chequeos diarios (cron)
--   2. Función fn_audit_horometro    — devuelve violaciones actuales (RPC + cron)
--   3. Función fn_guardar_audit      — persiste resultado en el log (llamada por cron)
--   4. pg_cron diario a las 03:00 UTC

-- ── 1. Tabla de log ───────────────────────────────────────────────────────
create table if not exists public.horometro_health_log (
  id            uuid        primary key default gen_random_uuid(),
  empresa_id    uuid        not null references public.empresas(id) on delete cascade,
  chequeado_en  timestamptz not null default now(),
  n_violaciones int         not null default 0,
  violaciones   jsonb,
  severidad     text generated always as (
    case
      when n_violaciones = 0 then 'ok'
      when n_violaciones <= 2 then 'aviso'
      else 'critico'
    end
  ) stored
);

create index if not exists idx_hhl_empresa_fecha
  on public.horometro_health_log (empresa_id, chequeado_en desc);

alter table public.horometro_health_log enable row level security;

create policy "hhl_empresa" on public.horometro_health_log
  for all
  using      (empresa_id = (select empresa_id from public.profiles where id = auth.uid()))
  with check (empresa_id = (select empresa_id from public.profiles where id = auth.uid()));

comment on table public.horometro_health_log is
  'Registro histórico de auditorías de integridad del horómetro. '
  'Generado diariamente por pg_cron y también en demanda desde la UI (Horómetros).';

-- ── 2. Función de auditoría ───────────────────────────────────────────────
-- Retorna todas las violaciones activas.  Filtra por empresa si se pasa el
-- parámetro; sin él recorre todas las empresas (útil para el cron como superuser).
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
  -- Todos los nodos con horómetro propio (punto de medición real).
  propios as (
    select id, id_visible, horas_actual, embarcacion_id, empresa_id
    from   public.equipos
    where  horometro = 'propio'
      and  (p_empresa_id is null or empresa_id = p_empresa_id)
  ),
  -- Árbol de descendientes 'hereda' vía parent_id (propagación estándar).
  arbol_parentid as (
    select p.id   as propio_id,
           p.id_visible as propio_visible,
           p.horas_actual as propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   propios p
    join   public.equipos e on e.parent_id = p.id and e.horometro = 'hereda'
    union all
    select a.propio_id, a.propio_visible, a.propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   arbol_parentid a
    join   public.equipos e on e.parent_id = a.id and e.horometro = 'hereda'
  ),
  -- Árbol de nodos con horas_fuente_id (hermanos del motor) + sus descendientes.
  arbol_fuente as (
    select p.id   as propio_id,
           p.id_visible as propio_visible,
           p.horas_actual as propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   propios p
    join   public.equipos e on e.horas_fuente_id = p.id
    union all
    select af.propio_id, af.propio_visible, af.propio_horas,
           e.id, e.id_visible, e.horas_actual, e.empresa_id
    from   arbol_fuente af
    join   public.equipos e on e.parent_id = af.id and e.horometro = 'hereda'
  ),
  -- Unión sin duplicados (un nodo puede aparecer en ambos árboles).
  todos_hereda as (
    select * from arbol_parentid
    union
    select * from arbol_fuente
  ),

  -- ── Violación 1: horas desincronizadas ──────────────────────────────────
  v_desync as (
    select empresa_id, id as equipo_id, id_visible,
           'horas_desincronizadas'::text as tipo_violacion,
           horas_actual,
           propio_horas as horas_esperadas,
           'Fuente propio: ' || propio_visible
             || ' (' || propio_horas::text || ' h registradas)' as detalle
    from   todos_hereda
    where  abs(horas_actual - propio_horas) > 0.5   -- tolerancia ½ h por redondeos
  ),

  -- ── Violación 2: plan PM silenciado (equipo con 0 h en nave con horas) ──
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
      and  e.horas_actual = 0
      and  (p_empresa_id is null or e.empresa_id = p_empresa_id)
      and  exists (
             select 1 from public.equipos pr
             where  pr.horometro        = 'propio'
               and  pr.embarcacion_id   = e.embarcacion_id
               and  pr.horas_actual     > 0
           )
  ),

  -- ── Violación 3: horas_fuente_id huérfana o no-propio ───────────────────
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
    left join public.equipos f on f.id = e.horas_fuente_id
    where  e.horas_fuente_id is not null
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

-- RPC accesible desde el frontend autenticado.
grant execute on function public.fn_audit_horometro(uuid) to authenticated;

-- ── 3. Función de guardado (llamada por cron) ─────────────────────────────
-- Itera sobre todas las empresas con equipos y persiste el resultado del
-- chequeo en horometro_health_log. Crea una fila por empresa siempre
-- (incluyendo empresas sin violaciones → severidad 'ok').
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

-- Solo el rol interno de cron/postgres lo ejecuta; no expuesto al frontend.
revoke execute on function public.fn_guardar_audit_horometro() from public, anon, authenticated;
grant  execute on function public.fn_guardar_audit_horometro() to service_role;

-- ── 4. Cron diario a las 03:00 UTC ───────────────────────────────────────
-- Reemplaza si ya existe (idempotente).
select cron.unschedule('horometro-health-check') where exists (
  select 1 from cron.job where jobname = 'horometro-health-check'
);

select cron.schedule(
  'horometro-health-check',
  '0 3 * * *',
  $cron$
  select public.fn_guardar_audit_horometro();
  $cron$
);
