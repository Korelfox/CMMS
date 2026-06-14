-- CMMS autónomo · Fase 2 — Generación server-side de OTs preventivas.
--
-- El motor de reglas (PM vencido por horómetro o calendario) corre cada noche
-- vía pg_cron, SIN que nadie abra la app, y deja sus propuestas en una tabla
-- staging aislada (ot_sugerencias). Aislada a propósito: una sugerencia NO es
-- trabajo firme, así que no debe contaminar KPIs, backlog, alertas ni el
-- gate de zarpe — igual que `solicitudes` es la antesala de `ordenes_trabajo`.
-- El humano confirma una sugerencia → recién ahí nace la OT real.

-- ── Tabla staging ────────────────────────────────────────────────────────────
create table if not exists public.ot_sugerencias (
  id              uuid        primary key default gen_random_uuid(),
  empresa_id      uuid        not null references public.empresas(id) on delete cascade,
  huella          text        not null,                       -- pm:{plan_id}:{hito}
  plan_pm_id      uuid        references public.planes_pm(id) on delete cascade,
  equipo_id       uuid        references public.equipos(id) on delete cascade,
  embarcacion_id  uuid        references public.embarcaciones(id) on delete set null,
  sistema         text,
  tipo            text        not null default 'preventivo',
  prioridad       text        not null default 'alta',
  descripcion     text        not null default '',
  motivo          text,                                        -- explicabilidad
  criticidad      text,                                        -- A | B | C (snapshot)
  horas_actual    numeric,
  elapsed         numeric,
  limite          numeric,
  estado          text        not null default 'sugerida',     -- sugerida | confirmada | rechazada
  origen          text        not null default 'cron',         -- cron | manual
  ot_id           uuid        references public.ordenes_trabajo(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid,
  -- Idempotencia dura: una sola fila por (empresa, ciclo de PM). El motor puede
  -- correr cada noche; ON CONFLICT DO NOTHING evita el "spam de sugerencias".
  unique (empresa_id, huella)
);

create index if not exists ot_sug_empresa_estado_idx on public.ot_sugerencias (empresa_id, estado);
create index if not exists ot_sug_plan_idx            on public.ot_sugerencias (plan_pm_id);

alter table public.ot_sugerencias enable row level security;

drop policy if exists ot_sug_empresa_aislamiento on public.ot_sugerencias;
create policy ot_sug_empresa_aislamiento on public.ot_sugerencias
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Núcleo del motor — replica en SQL la lógica de src/lib/autoOT.js ─────────
-- p_empresa NULL → todas las empresas (lo usa el cron). p_empresa = X → solo X
-- (lo usa el wrapper para usuarios, que fuerza el aislamiento por tenant).
-- Vencido = mismo criterio que evaluarPlanes(): horas → elapsed ≥ intervalo;
-- calendario → días desde el último PM ≥ período (o nunca ejecutado).
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
      and (p_empresa is null or p.empresa_id = p_empresa)
  ) v
  where
    (
      (not v.es_cal and v.intervalo_horas > 0 and v.elapsed >= v.limite)
      or
      (v.es_cal and v.elapsed is null)                                   -- nunca ejecutado
      or
      (v.es_cal and v.elapsed is not null and v.elapsed >= v.limite)
    )
    -- No duplicar una OT firme ya creada manualmente para este mismo ciclo.
    and not exists (
      select 1 from public.ordenes_trabajo o
      where o.empresa_id = v.empresa_id and o.huella = v.huella
    )
  on conflict (empresa_id, huella) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$gen$;

-- _gen_ots(null) cruza tenants: jamás exponerla a usuarios. Solo cron/postgres.
-- Supabase concede EXECUTE a anon/authenticated por default privileges, así que
-- hay que revocar de esos roles explícitamente (revoke from public no basta).
revoke execute on function public._gen_ots(uuid) from public, anon, authenticated;

-- ── Wrapper para usuarios (RPC) — fuerza el aislamiento por empresa ──────────
-- La UI llama supabase.rpc('generar_ots_preventivas') para materializar "ahora"
-- las sugerencias de SU empresa, sin esperar a la corrida nocturna.
create or replace function public.generar_ots_preventivas()
returns integer
language plpgsql
security definer
set search_path = public
as $wrap$
declare
  v_emp uuid;
begin
  select empresa_id into v_emp from public.profiles where id = auth.uid();
  if v_emp is null then return 0; end if;
  return public._gen_ots(v_emp);
end;
$wrap$;

revoke execute on function public.generar_ots_preventivas() from public, anon;
grant  execute on function public.generar_ots_preventivas() to authenticated;

-- ── Programación nocturna (pg_cron) ──────────────────────────────────────────
-- 08:00 UTC ≈ 04:00-05:00 en Chile: las sugerencias del día están listas antes
-- de la jornada. El nombre hace que re-aplicar la migración actualice el job.
create extension if not exists pg_cron;

select cron.schedule(
  'generar-ots-preventivas',
  '0 8 * * *',
  $cron$select public._gen_ots(null)$cron$
);
