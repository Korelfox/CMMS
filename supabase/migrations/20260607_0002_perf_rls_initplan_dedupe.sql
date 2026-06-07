-- Optimizar RLS (advisor: auth_rls_initplan): envolver auth.uid() en (select ...)
-- para que se evalúe una sola vez por consulta y no por fila. Expresión equivalente.
do $$
declare t text;
begin
  foreach t in array array['especies','historial_pm','inventario_item_destinos','marea_captura','marea_economia','planes_pm']
  loop
    execute format('drop policy if exists empresa_aislamiento on public.%I', t);
    execute format('create policy empresa_aislamiento on public.%I for all to public using (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid()))) with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))', t);
  end loop;
end $$;

-- Eliminar políticas permisivas duplicadas en planes_pm (advisor:
-- multiple_permissive_policies). empresa_aislamiento (ALL, mismo tenant) ya rige;
-- las granulares quedaban anuladas por el OR. El rol se valida en la app, igual
-- que en el resto de las tablas.
drop policy if exists planes_pm_sel on public.planes_pm;
drop policy if exists planes_pm_ins on public.planes_pm;
drop policy if exists planes_pm_upd on public.planes_pm;
drop policy if exists planes_pm_del on public.planes_pm;
