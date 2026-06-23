-- created_at en lecturas_horometro para el rate-limit de ingest-horometro.
--
-- La función ingest-horometro limita a 1 lectura de telemetría cada 60 s por
-- equipo, filtrando por hora de inserción. La tabla solo tenía `fecha` (la fecha
-- de la lectura, que el sensor puede mandar backdated), así que el rate-limit
-- necesita un timestamp de inserción real e inmutable por el cliente.

alter table public.lecturas_horometro
  add column if not exists created_at timestamptz not null default now();

-- Índice que sirve la consulta del rate-limit: equipo + fuente + ventana temporal.
create index if not exists lecturas_horometro_ratelimit_idx
  on public.lecturas_horometro (equipo_id, fuente, created_at desc);
