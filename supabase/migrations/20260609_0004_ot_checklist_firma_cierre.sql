-- Checklist de tareas dentro de la OT (ejecutable en terreno) + firma de cierre.
-- checklist: [{ t: texto, ok: bool, por: nombre|null, fecha: iso|null }, ...]
alter table public.ordenes_trabajo
  add column if not exists checklist     jsonb not null default '[]'::jsonb,
  add column if not exists cerrada_por   text,
  add column if not exists cerrada_fecha timestamptz;
