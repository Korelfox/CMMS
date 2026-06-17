-- ============================================================
--  Gap 4 (cruce) — normalizar causa y mecanismo + coherencia modo↔mecanismo.
--
--  Extiende fn_normalizar_modos_falla para que, además de codificar el modo:
--   3) derive un MECANISMO coherente con el modo (cruce ISO 14224 B.2/B.6),
--      sólo donde el mecanismo es texto libre / no canónico (no pisa datos
--      reales ya codificados);
--   4) normalice la CAUSA de texto libre heredado (demo) a value canónico.
--
--  Así Pareto puede agrupar por causa y mecanismo con etiquetas canónicas y
--  el cruce modo↔mecanismo queda consistente. fn_seed_demo_flota ya invoca
--  esta función, por lo que la regeneración hereda el comportamiento.
-- ============================================================

create or replace function public.fn_normalizar_modos_falla(p_empresa uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 1) Modo: texto libre heredado → value canónico de la taxonomía.
  with txt(t, v) as (values
    ('Fuga externa','fuga_externa_proceso'), ('Vibración alta','vibracion'),
    ('Sobretemperatura','sobrecalentamiento'), ('No arranca','no_arranca'),
    ('Obstrucción','atasco'), ('Desgaste prematuro','desgaste'))
  update public.ordenes_trabajo o set modo_falla = txt.v
  from txt where o.modo_falla = txt.t and (p_empresa is null or o.empresa_id = p_empresa);

  -- 2) Modo: value → código ISO 14224.
  with cod(v, c) as (values
    ('no_arranca','FTS'),('parada_espuria','UST'),('baja_potencia','LOO'),
    ('sobrecalentamiento','OHE'),('baja_presion','PDE'),('alta_presion','PDE'),
    ('consumo_excesivo','PDE'),('fuga_externa_proceso','ELP'),('fuga_externa_refrig','ELU'),
    ('fuga_interna','INL'),('vibracion','VIB'),('ruido','NOI'),('rotura','BRD'),
    ('deformacion','STD'),('desgaste','STD'),('corrosion_modo','STD'),('atasco','PLU'),
    ('falla_electrica','ELF'),('lectura_anormal','AIR'),('sin_senal','FTF'),('otro','OTH'))
  update public.ordenes_trabajo o set modo_falla_codigo = cod.c
  from cod where o.modo_falla = cod.v and (p_empresa is null or o.empresa_id = p_empresa);

  -- 3) Mecanismo coherente con el modo (primario plausible), sólo si el actual
  --    no es un value canónico (texto libre / vacío). No pisa codificación real.
  with mec(v, m) as (values
    ('no_arranca','mecanico'),('parada_espuria','mecanico'),('baja_potencia','mecanico'),
    ('sobrecalentamiento','mecanico'),('baja_presion','mecanico'),('alta_presion','mecanico'),
    ('consumo_excesivo','material'),('fuga_externa_proceso','mecanico'),('fuga_externa_refrig','mecanico'),
    ('fuga_interna','mecanico'),('vibracion','mecanico'),('ruido','mecanico'),('rotura','material'),
    ('deformacion','mecanico'),('desgaste','material'),('corrosion_modo','material'),('atasco','mecanico'),
    ('falla_electrica','electrico'),('lectura_anormal','instrumentacion'),('sin_senal','instrumentacion'),
    ('otro','misc'))
  update public.ordenes_trabajo o set mecanismo_falla = mec.m
  from mec
  where o.modo_falla = mec.v
    and (o.mecanismo_falla is null or o.mecanismo_falla not in
         ('mecanico','material','instrumentacion','electrico','influencia_externa','misc'))
    and (p_empresa is null or o.empresa_id = p_empresa);

  -- 4) Causa: texto libre heredado (demo) → value canónico.
  with ca(t, v) as (values
    ('Fin de vida útil','desgaste_normal'), ('Bomba SW sin caudal','desgaste_normal'))
  update public.ordenes_trabajo o set causa_falla = ca.v
  from ca where o.causa_falla = ca.t and (p_empresa is null or o.empresa_id = p_empresa);
end;
$$;
revoke all on function public.fn_normalizar_modos_falla(uuid) from public, anon, authenticated;
grant  execute on function public.fn_normalizar_modos_falla(uuid) to service_role;

-- Backfill de los datos demo actuales.
select public.fn_normalizar_modos_falla(null);
