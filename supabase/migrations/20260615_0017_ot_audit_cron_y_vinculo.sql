-- ============================================================
--  Supervisor de conectores OT — cron + log histórico, y vínculo
--  de trabajos de varada a equipos reales (demo).
--
--  Parte 1: ot_health_log + fn_guardar_audit_ot + pg_cron diario.
--           Igual que el supervisor de horómetro: corre fn_audit_ot
--           por empresa y guarda el resultado para tendencia/alertas.
--
--  Parte 2: fn_demo_vincular_varada_equipos — mapea el sistema (texto)
--           de los trabajos/OT de varada a un equipo real de la nave,
--           para que el trabajo de propulsión/gobierno/eléctrico/
--           seguridad alimente confiabilidad. Se llama al final de
--           fn_seed_demo_flota (regeneración) y como backfill único.
-- ============================================================

-- ── Parte 1.1 · Tabla de log ────────────────────────────────────────────
create table if not exists public.ot_health_log (
  id            uuid        primary key default gen_random_uuid(),
  empresa_id    uuid        not null references public.empresas(id) on delete cascade,
  chequeado_en  timestamptz not null default now(),
  n_violaciones int         not null default 0,
  n_criticos    int         not null default 0,
  violaciones   jsonb,
  severidad     text generated always as (
    case when n_criticos > 0 then 'critico' when n_violaciones > 0 then 'aviso' else 'ok' end
  ) stored
);

create index if not exists idx_ohl_empresa_fecha
  on public.ot_health_log (empresa_id, chequeado_en desc);

alter table public.ot_health_log enable row level security;

create policy "ohl_empresa" on public.ot_health_log
  for all
  using      (empresa_id = (select empresa_id from public.profiles where id = auth.uid()))
  with check (empresa_id = (select empresa_id from public.profiles where id = auth.uid()));

comment on table public.ot_health_log is
  'Histórico de auditorías de conectores de OT (fn_audit_ot). Generado a diario '
  'por pg_cron y consultable desde Órdenes de Trabajo.';

-- ── Parte 1.2 · Persistidor (cron) ──────────────────────────────────────
create or replace function public.fn_guardar_audit_ot()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare emp record;
begin
  for emp in
    select distinct empresa_id from public.ordenes_trabajo where empresa_id is not null
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

revoke execute on function public.fn_guardar_audit_ot() from public, anon, authenticated;
grant  execute on function public.fn_guardar_audit_ot() to service_role;

-- ── Parte 1.3 · Cron diario (03:30 UTC; no choca con horómetro 03:00) ────
select cron.unschedule('ot-health-check') where exists (
  select 1 from cron.job where jobname = 'ot-health-check'
);
select cron.schedule('ot-health-check', '30 3 * * *', $cron$ select public.fn_guardar_audit_ot(); $cron$);

-- ── Parte 2.1 · Vínculo varada (texto sistema) → equipo real ────────────
-- Casco/estructura no tienen equipo: quedan sin vincular a propósito.
create or replace function public.fn_demo_vincular_varada_equipos(p_empresa uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with sysmap(sis, pat) as (values
    ('Propulsión','%-PROP-EJE%'), ('Gobierno','%-STEER%'),
    ('Eléctrico','%-ELEC%'),      ('Seguridad','%-SAF%'))
  update public.ordenes_trabajo o
  set equipo_id = (
    select e.id from public.equipos e
    where e.embarcacion_id = o.embarcacion_id and e.id_visible like sm.pat and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  from sysmap sm
  where o.varada_id is not null and o.equipo_id is null and o.sistema = sm.sis
    and (p_empresa is null or o.empresa_id = p_empresa);

  with sysmap(sis, pat) as (values
    ('Propulsión','%-PROP-EJE%'), ('Gobierno','%-STEER%'),
    ('Eléctrico','%-ELEC%'),      ('Seguridad','%-SAF%'))
  update public.varada_trabajos t
  set equipo_id = (
    select e.id from public.equipos e
    join public.varadas v on v.id = t.varada_id
    where e.embarcacion_id = v.embarcacion_id and e.id_visible like sm.pat and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  from sysmap sm
  where t.equipo_id is null and t.sistema = sm.sis
    and (p_empresa is null or t.empresa_id = p_empresa);
end;
$$;

revoke all on function public.fn_demo_vincular_varada_equipos(uuid) from public, anon, authenticated;
grant  execute on function public.fn_demo_vincular_varada_equipos(uuid) to service_role;

-- ── Parte 2.2 · La regeneración de flota demo deja todo conectado ───────
create or replace function public.fn_seed_demo_flota(p_empresa uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_rol  text; v_emp uuid; v_dm uuid; v_dr uuid; v_sp uuid; v_user uuid := auth.uid();
begin
  select rol into v_rol from profiles where id = v_user;
  if v_user is not null and v_rol is distinct from 'super_admin' then
    raise exception 'No autorizado: se requiere rol super_admin (rol actual: %)', coalesce(v_rol, 'sin sesión');
  end if;
  v_emp := coalesce(p_empresa,
    (select empresa_id from embarcaciones where codigo = 'DM' limit 1),
    (select empresa_id from profiles where id = v_user));
  if v_emp is null then raise exception 'No se pudo resolver la empresa'; end if;
  perform setseed(0.42);
  insert into especies (empresa_id, nombre, precio_kg_default)
  select v_emp, x.n, x.p from (values ('Merluza común',3500),('Jurel',900),('Reineta',2500),('Congrio',6000)) x(n,p)
  where not exists (select 1 from especies e where e.empresa_id = v_emp and e.nombre = x.n);
  select id into v_dm from embarcaciones where empresa_id = v_emp and codigo = 'DM' limit 1;
  if v_dm is null then raise exception 'No existe la nave DM con la plantilla cargada; precárgala primero en Equipos.'; end if;
  select id into v_dr from embarcaciones where empresa_id = v_emp and codigo = 'DR' limit 1;
  if v_dr is null then insert into embarcaciones (empresa_id, codigo, nombre, color, created_by)
    values (v_emp,'DR','Doña Rosa','#C0392B',v_user) returning id into v_dr; end if;
  select id into v_sp from embarcaciones where empresa_id = v_emp and codigo = 'SP' limit 1;
  if v_sp is null then insert into embarcaciones (empresa_id, codigo, nombre, color, created_by)
    values (v_emp,'SP','San Pedro','#E67E22',v_user) returning id into v_sp; end if;
  insert into bodegas (empresa_id, codigo, nombre, tipo, embarcacion_id)
  select v_emp, b.cod, b.nom, 'a_bordo'::app.tipo_bodega, b.emb from (values
    ('DM-BOD','Pañol Don Miguel', v_dm),('DR-BOD','Pañol Doña Rosa', v_dr),('SP-BOD','Pañol San Pedro', v_sp)
  ) b(cod,nom,emb) where not exists (select 1 from bodegas g where g.empresa_id = v_emp and g.codigo = b.cod);
  perform fn_demo_reset_estructura(v_dr);
  perform fn_clonar_estructura(v_dm, v_dr, 'DM', 'DR');
  perform fn_demo_reset_estructura(v_sp);
  perform fn_clonar_estructura(v_dm, v_sp, 'DM', 'SP');
  perform fn_demo_reset_operacional(v_dm);
  perform fn_seed_demo_perfil(v_dm, 'sana');
  perform fn_seed_demo_perfil(v_dr, 'critica');
  perform fn_seed_demo_perfil(v_sp, 'varada');
  perform fn_demo_vincular_varada_equipos(v_emp);   -- conecta trabajos de varada a equipos reales
  insert into bitacora (empresa_id, usuario_id, usuario_nombre, rol, accion, detalle)
  select v_emp, v_user, coalesce(pr.nombre,''), 'super_admin', 'Generar flota demo',
    'Don Miguel (sana) · Doña Rosa (critica) · San Pedro (varada)'
  from profiles pr where pr.id = v_user;
  return jsonb_build_object('empresa', v_emp, 'naves', jsonb_build_object('DM',v_dm,'DR',v_dr,'SP',v_sp), 'ok', true);
end;
$fn$;
revoke all on function public.fn_seed_demo_flota(uuid) from public, anon;
grant execute on function public.fn_seed_demo_flota(uuid) to authenticated;

-- ── Parte 2.3 · Backfill único de los datos demo actuales ───────────────
select public.fn_demo_vincular_varada_equipos(null);
