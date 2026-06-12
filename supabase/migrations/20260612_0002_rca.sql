-- Análisis de Causa Raíz (RCA · 5 porqués) para fallas crónicas.
-- Un RCA nace de una falla recurrente (detectada cruzando OTs correctivas),
-- documenta la cadena de porqués, concluye una causa raíz (codificada
-- ISO 14224 + texto) y registra acciones correctivas con responsable y
-- verificación de eficacia — cierra el ciclo Pareto → RCA → acción → verificación.
create table public.rca (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  embarcacion_id uuid references public.embarcaciones(id) on delete set null,
  equipo_id      uuid references public.equipos(id) on delete set null,
  ot_id          uuid references public.ordenes_trabajo(id) on delete set null,
  fecha          date not null default current_date,
  falla          text not null,                       -- el evento / problema recurrente
  porques        jsonb not null default '[]'::jsonb,  -- ["por qué 1", ... hasta 5]
  causa_codigo   text,                                -- causa raíz ISO 14224 (CAUSAS_FALLA_ISO)
  causa_raiz     text,                                -- conclusión en palabras propias
  acciones       jsonb not null default '[]'::jsonb,  -- [{descripcion, responsable, fecha_objetivo, done}]
  estado         text not null default 'abierto',     -- abierto | implementado | verificado
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index rca_empresa_idx on public.rca (empresa_id);
create index rca_equipo_idx  on public.rca (equipo_id);

alter table public.rca enable row level security;

create policy empresa_aislamiento on public.rca
  for all
  using (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));
