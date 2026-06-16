-- ============================================================
--  Gap 4 — modo_falla codificado ISO 14224 (3 niveles).
--
--  El value local (granular) ya se guarda en ordenes_trabajo.modo_falla;
--  agregamos modo_falla_codigo = código ISO estandarizado (VIB, ELP, FTS…)
--  para análisis estadístico válido y benchmarking de industria a nivel SQL.
--  clase/grupo se derivan del código en la app (fallasISO.js).
--
--  fn_normalizar_modos_falla:
--    1) texto libre heredado (demo) → value canónico de la taxonomía;
--    2) value → código ISO.
--  Se corre como backfill y dentro de fn_seed_demo_flota (regeneración).
-- ============================================================

alter table public.ordenes_trabajo
  add column if not exists modo_falla_codigo text;

comment on column public.ordenes_trabajo.modo_falla_codigo is
  'Código de modo de falla ISO 14224 (B.6): VIB, ELP, FTS, OHE, PDE, … '
  'Derivado de modo_falla; habilita benchmarking estándar y roll-up a grupo/clase.';

create index if not exists idx_ot_modo_codigo on public.ordenes_trabajo (empresa_id, modo_falla_codigo);

create or replace function public.fn_normalizar_modos_falla(p_empresa uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 1) Texto libre heredado → value canónico de la taxonomía.
  with txt(t, v) as (values
    ('Fuga externa','fuga_externa_proceso'), ('Vibración alta','vibracion'),
    ('Sobretemperatura','sobrecalentamiento'), ('No arranca','no_arranca'),
    ('Obstrucción','atasco'), ('Desgaste prematuro','desgaste'))
  update public.ordenes_trabajo o set modo_falla = txt.v
  from txt where o.modo_falla = txt.t and (p_empresa is null or o.empresa_id = p_empresa);

  -- 2) value → código ISO 14224.
  with cod(v, c) as (values
    ('no_arranca','FTS'),('parada_espuria','UST'),('baja_potencia','LOO'),
    ('sobrecalentamiento','OHE'),('baja_presion','PDE'),('alta_presion','PDE'),
    ('consumo_excesivo','PDE'),('fuga_externa_proceso','ELP'),('fuga_externa_refrig','ELU'),
    ('fuga_interna','INL'),('vibracion','VIB'),('ruido','NOI'),('rotura','BRD'),
    ('deformacion','STD'),('desgaste','STD'),('corrosion_modo','STD'),('atasco','PLU'),
    ('falla_electrica','ELF'),('lectura_anormal','AIR'),('sin_senal','FTF'),('otro','OTH'))
  update public.ordenes_trabajo o set modo_falla_codigo = cod.c
  from cod where o.modo_falla = cod.v and (p_empresa is null or o.empresa_id = p_empresa);
end;
$$;
revoke all on function public.fn_normalizar_modos_falla(uuid) from public, anon, authenticated;
grant  execute on function public.fn_normalizar_modos_falla(uuid) to service_role;

-- La regeneración de la flota demo deja los modos codificados.
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
  perform fn_demo_vincular_varada_equipos(v_emp);
  perform fn_normalizar_modos_falla(v_emp);
  insert into bitacora (empresa_id, usuario_id, usuario_nombre, rol, accion, detalle)
  select v_emp, v_user, coalesce(pr.nombre,''), 'super_admin', 'Generar flota demo',
    'Don Miguel (sana) · Doña Rosa (critica) · San Pedro (varada)'
  from profiles pr where pr.id = v_user;
  return jsonb_build_object('empresa', v_emp, 'naves', jsonb_build_object('DM',v_dm,'DR',v_dr,'SP',v_sp), 'ok', true);
end;
$fn$;
revoke all on function public.fn_seed_demo_flota(uuid) from public, anon;
grant execute on function public.fn_seed_demo_flota(uuid) to authenticated;

-- Backfill de los datos demo actuales.
select public.fn_normalizar_modos_falla(null);
