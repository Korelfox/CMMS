-- Módulo Varada / Parada Mayor
-- Representa períodos planificados de mantenimiento intensivo: varada en dique,
-- carena, parada de puerto extendida. Cada varada agrupa trabajos (scope) y se
-- liga a OTs existentes para trazabilidad de costos real (ISO 55000 / SMRP).
--
-- Flujo: Planificación → Ejecución → Cierre
--   • En Planificación: se construye el alcance, se estiman HH y presupuesto.
--   • En Ejecución: los trabajos se marcan al avance, las OTs registran costos.
--   • Al Cierre: el presupuesto vs. costo real queda documentado.

-- ── Tabla principal ──────────────────────────────────────────────────────────
create table public.varadas (
  id                 uuid        primary key default gen_random_uuid(),
  empresa_id         uuid        not null references public.empresas(id) on delete cascade,
  embarcacion_id     uuid        references public.embarcaciones(id) on delete set null,
  nombre             text        not null,
  tipo               text        not null default 'varada',
    -- varada | parada_puerto | carena
  estado             text        not null default 'planificacion',
    -- planificacion | ejecucion | cerrada | cancelada
  fecha_inicio       date,
  fecha_fin_estimada date,
  fecha_fin_real     date,
  presupuesto        numeric(14,2),
  descripcion        text,
  notas              text,
  created_by         uuid,
  created_at         timestamptz not null default now()
);

create index varadas_empresa_idx    on public.varadas (empresa_id);
create index varadas_emb_idx        on public.varadas (embarcacion_id);

alter table public.varadas enable row level security;

create policy varadas_empresa_aislamiento on public.varadas
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Trabajos / alcance de la varada ─────────────────────────────────────────
create table public.varada_trabajos (
  id               uuid        primary key default gen_random_uuid(),
  varada_id        uuid        not null references public.varadas(id) on delete cascade,
  empresa_id       uuid        not null references public.empresas(id) on delete cascade,
  ot_id            uuid        references public.ordenes_trabajo(id) on delete set null,
  sistema          text,
  descripcion      text        not null,
  estado           text        not null default 'pendiente',
    -- pendiente | en_progreso | completado | cancelado
  horas_estimadas  numeric(8,2),
  responsable      text,
  orden            integer     not null default 0,
  created_at       timestamptz not null default now()
);

create index varada_trab_varada_idx on public.varada_trabajos (varada_id);
create index varada_trab_empresa_idx on public.varada_trabajos (empresa_id);
create index varada_trab_ot_idx     on public.varada_trabajos (ot_id);

alter table public.varada_trabajos enable row level security;

create policy varada_trab_empresa_aislamiento on public.varada_trabajos
  for all
  using      (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from profiles where profiles.id = (select auth.uid())));

-- ── Ligar OTs a varada (FK opcional en OT) ───────────────────────────────────
alter table public.ordenes_trabajo
  add column if not exists varada_id uuid references public.varadas(id) on delete set null;

create index ot_varada_idx on public.ordenes_trabajo (varada_id);
