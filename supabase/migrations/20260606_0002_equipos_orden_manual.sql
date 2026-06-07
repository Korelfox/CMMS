-- Orden manual de equipos/subsistemas dentro de sus hermanos (prioridad jefe de Mantención)
alter table public.equipos
  add column if not exists orden numeric;
comment on column public.equipos.orden is 'Orden manual entre hermanos (mismo parent_id). Menor = primero. NULL = orden por defecto (sistema canonico / criticidad / codigo).';
