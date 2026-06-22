-- Rendimiento RLS: evita re-evaluar auth.uid() por fila (lint 0003_auth_rls_initplan).
--
-- Estas 4 políticas filtran por empresa con `auth.uid()` directo dentro del
-- subselect, lo que Postgres re-ejecuta para CADA fila. Envolviéndolo en
-- `(select auth.uid())` se evalúa una sola vez (initplan), igual que ya hace la
-- política de `insights`. Misma semántica exacta (for all, role public,
-- aislamiento por empresa), solo cambia el plan de ejecución.

-- presupuestos
drop policy if exists presupuestos_empresa_rls on public.presupuestos;
create policy presupuestos_empresa_rls on public.presupuestos
  for all
  using      (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())));

-- horometro_health_log
drop policy if exists hhl_empresa on public.horometro_health_log;
create policy hhl_empresa on public.horometro_health_log
  for all
  using      (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())));

-- informes_ejecutivos
drop policy if exists empresa_informes_rls on public.informes_ejecutivos;
create policy empresa_informes_rls on public.informes_ejecutivos
  for all
  using      (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())));

-- ot_health_log
drop policy if exists ohl_empresa on public.ot_health_log;
create policy ohl_empresa on public.ot_health_log
  for all
  using      (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())));
