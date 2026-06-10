-- Mantenimiento predictivo (PdM): registro de RESULTADOS de mediciones
-- (análisis de aceite, vibración, termografía) con límites de alerta/crítico.
-- Cada fila es una medición de un parámetro de un equipo → series con
-- tendencia y semáforo por condición.
create table public.mediciones_pdm (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  tipo           text not null default 'aceite',   -- aceite | vibracion | termografia | otro
  parametro      text not null,                    -- ej: "Hierro (Fe)", "Velocidad RMS"
  valor          numeric not null,
  unidad         text,
  limite_alerta  numeric,
  limite_critico numeric,
  fecha          date not null default current_date,
  usuario_nombre text,
  nota           text,
  created_at     timestamptz not null default now()
);

create index mediciones_pdm_serie_idx on public.mediciones_pdm (equipo_id, tipo, parametro, fecha desc);
create index mediciones_pdm_empresa_idx on public.mediciones_pdm (empresa_id);

alter table public.mediciones_pdm enable row level security;

create policy empresa_aislamiento on public.mediciones_pdm
  for all
  using (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));
