-- Plantillas de varada / parada mayor.
-- Dos capas: plantillas globales (empresa_id IS NULL, solo lectura para todos)
-- y plantillas propias de cada empresa (CRUD completo).
-- Al crear una varada desde plantilla, los items se clonan como varada_trabajos
-- y varadas.plantilla_id registra el origen para trazabilidad.

-- ── Tabla de plantillas ───────────────────────────────────────────────────────
create table public.varada_plantillas (
  id              uuid        primary key default gen_random_uuid(),
  empresa_id      uuid        references public.empresas(id) on delete cascade,
  -- NULL → plantilla global (visible a todos, no editable desde la app)
  nombre          text        not null,
  tipo            text        not null default 'varada',
    -- varada | carena | parada_puerto
  tipo_nave       text,          -- NULL = universal; 'arrastrero' | 'cerquero' | etc.
  intervalo_meses int,           -- NULL = sin periodicidad fija
  descripcion     text,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now()
);

create index varada_plantillas_empresa_idx on public.varada_plantillas (empresa_id);

alter table public.varada_plantillas enable row level security;

-- Globales: lectura para todos los autenticados
create policy varada_plantillas_global_read on public.varada_plantillas
  for select
  using (empresa_id is null);

-- Propias: CRUD completo con aislamiento por empresa
create policy varada_plantillas_empresa_crud on public.varada_plantillas
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Items de la plantilla ─────────────────────────────────────────────────────
create table public.varada_plantilla_items (
  id               uuid        primary key default gen_random_uuid(),
  plantilla_id     uuid        not null references public.varada_plantillas(id) on delete cascade,
  empresa_id       uuid        references public.empresas(id) on delete cascade,
  sistema          text,
  descripcion      text        not null,
  horas_estimadas  numeric(8,2),
  responsable_tipo text        default 'propio',
    -- propio | astillero | tercero | inspeccion
  critico_zarpe    boolean     not null default false,
  orden            int         not null default 0,
  created_at       timestamptz not null default now()
);

create index varada_plantilla_items_plantilla_idx on public.varada_plantilla_items (plantilla_id);

alter table public.varada_plantilla_items enable row level security;

create policy varada_plantilla_items_global_read on public.varada_plantilla_items
  for select
  using (empresa_id is null);

create policy varada_plantilla_items_empresa_crud on public.varada_plantilla_items
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Extensiones de tablas existentes ─────────────────────────────────────────
-- plantilla_id en varadas: permite trazar el origen de cada varada
alter table public.varadas
  add column if not exists plantilla_id uuid references public.varada_plantillas(id) on delete set null;

-- responsable_tipo en varada_trabajos: diferencia astillero / tercero / inspeccion / propio
alter table public.varada_trabajos
  add column if not exists responsable_tipo text default 'propio';

create index varadas_plantilla_idx on public.varadas (plantilla_id);
