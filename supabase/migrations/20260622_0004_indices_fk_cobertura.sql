-- Índices de cobertura para FKs sin índice (lint 0001_unindexed_foreign_keys).
--
-- Solo las FKs en tablas ESTABLES (fuera del WIP de inventario/varada). El
-- índice en informes_ejecutivos.empresa_id además acompaña la política RLS por
-- empresa optimizada en 20260622_0003. No se tocan las FKs de varada_*/
-- ot_sugerencias/rca (zona con WIP) ni los índices "sin uso" (prematuro: el
-- contador de uso no es significativo sin tráfico productivo real).
--
-- CREATE INDEX (no CONCURRENTLY) porque la migración corre en transacción; el
-- volumen actual hace el lock instantáneo.

create index if not exists idx_informes_ejecutivos_empresa on public.informes_ejecutivos (empresa_id);
create index if not exists idx_informes_ejecutivos_created_by on public.informes_ejecutivos (created_by);
create index if not exists idx_equipos_horas_fuente on public.equipos (horas_fuente_id);
