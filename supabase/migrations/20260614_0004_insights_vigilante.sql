-- CMMS autónomo · Salto 1 — Vigilante nocturno de calidad de datos.
--
-- Los agentes IA-A..D vivían solo en el frontend (corrían cuando alguien abría
-- Alertas). Aquí pasan a correr SOLOS cada noche vía pg_cron y persisten su
-- veredicto en `insights`, así el sistema se vigila aunque nadie entre.
-- Son determinísticos (conteos/porcentajes) → no necesitan Claude. El Informe
-- Ejecutivo nocturno con IA queda pendiente de ANTHROPIC_API_KEY (GAP-3).

create table if not exists public.insights (
  id           uuid        primary key default gen_random_uuid(),
  empresa_id   uuid        not null references public.empresas(id) on delete cascade,
  agente       text        not null,            -- IA-A | IA-B | IA-C | IA-D
  severidad    text        not null,            -- ok | amber | red
  titulo       text        not null,
  detalle      text,
  valor        numeric,                          -- métrica (conteo o %)
  corrida      date        not null default current_date,
  generado_en  timestamptz not null default now(),
  unique (empresa_id, agente, corrida)
);

create index if not exists insights_empresa_corrida_idx on public.insights (empresa_id, corrida desc);

alter table public.insights enable row level security;

drop policy if exists insights_empresa_aislamiento on public.insights;
create policy insights_empresa_aislamiento on public.insights
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Núcleo: corre los 4 agentes por empresa y hace upsert por corrida ────────
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
    -- IA-A · equipos sin criticidad (degrada scoring de riesgo / IA)
    select count(*) into v_a from public.equipos
      where empresa_id = emp.id and criticidad is null and tipo_nodo <> 'sistema';
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
      from public.ordenes_trabajo where empresa_id = emp.id;
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

    -- IA-C · equipos críticos A con <4 correctivas cerradas (Weibull no ajusta)
    select count(*) into v_c from public.equipos e
      where e.empresa_id = emp.id and e.criticidad = 'A'
        and (select count(*) from public.ordenes_trabajo o
             where o.equipo_id = e.id and o.tipo = 'correctivo' and o.estado = 'cerrada') < 4;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-C',
      case when v_c > 0 then 'amber' else 'ok' end,
      'Historial de críticos A',
      v_c || ' equipos críticos A con <4 correctivas cerradas — ConfiabilidadML no puede ajustar Weibull',
      v_c)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-D · series PdM sin medición reciente (>30 días)
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

revoke execute on function public._gen_insights(uuid) from public, anon, authenticated;

-- Wrapper para usuarios (RPC "Evaluar ahora"): scoped a su empresa.
create or replace function public.generar_insights()
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
  return public._gen_insights(v_emp);
end;
$wrap$;

revoke execute on function public.generar_insights() from public, anon;
grant  execute on function public.generar_insights() to authenticated;

-- Programación nocturna: 07:30 UTC (antes de la generación de OTs de las 08:00).
create extension if not exists pg_cron;
select cron.schedule(
  'generar-insights',
  '30 7 * * *',
  $cron$select public._gen_insights(null)$cron$
);
