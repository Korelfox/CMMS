-- Eficiencia: índices de cobertura para foreign keys sin indexar
-- (lint 0001_unindexed_foreign_keys). Sin índice, cada join por estas columnas
-- y cada chequeo de integridad referencial al borrar el padre hace seq scan.
-- Aditivo, no cambia lógica. Lista verificada directo contra pg_constraint.

create index if not exists idx_ot_sugerencias_embarcacion on public.ot_sugerencias (embarcacion_id);
create index if not exists idx_ot_sugerencias_equipo      on public.ot_sugerencias (equipo_id);
create index if not exists idx_ot_sugerencias_ot          on public.ot_sugerencias (ot_id);
create index if not exists idx_rca_embarcacion            on public.rca (embarcacion_id);
create index if not exists idx_rca_ot                     on public.rca (ot_id);
create index if not exists idx_varada_plantilla_items_emp on public.varada_plantilla_items (empresa_id);
create index if not exists idx_varada_trabajos_equipo     on public.varada_trabajos (equipo_id);
