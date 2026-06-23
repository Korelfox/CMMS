-- Habilita realtime en ordenes_trabajo para que los equipos en terreno reciban
-- las OTs nuevas al instante (sin recargar la página). La RLS por empresa ya
-- existe (4 políticas), así que cada cliente solo recibe los INSERT de su empresa;
-- el frontend además filtra el canal por empresa_id.
alter publication supabase_realtime add table public.ordenes_trabajo;
