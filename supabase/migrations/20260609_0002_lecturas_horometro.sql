-- Historial de lecturas de horómetro por equipo: convierte horas_actual (campo
-- editable suelto) en un PROCESO con trazabilidad (quién/cuándo/cuánto),
-- validación y tendencia. Alimenta PM por intervalo, MTBF, Weibull y CGM.
create table public.lecturas_horometro (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  fecha          timestamptz not null default now(),
  horas          numeric not null check (horas >= 0),
  horas_anterior numeric,            -- snapshot para auditoría del salto
  fuente         text not null default 'manual',  -- manual | prezarpe | import
  usuario_id     uuid,
  usuario_nombre text,
  nota           text
);

create index lecturas_horometro_equipo_fecha_idx on public.lecturas_horometro (equipo_id, fecha desc);
create index lecturas_horometro_empresa_idx on public.lecturas_horometro (empresa_id);

alter table public.lecturas_horometro enable row level security;

create policy empresa_aislamiento on public.lecturas_horometro
  for all
  using (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));
