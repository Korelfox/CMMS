-- CMMS autónomo · Salto 3 — Token de telemetría por embarcación.
--
-- El emisor a bordo (gateway NMEA 2000 / ESP32 al tacógrafo) autentica sus
-- envíos al webhook ingest-horometro con este token, sin necesidad de una sesión
-- de usuario. Un token por nave: si se compromete, se rota solo esa embarcación.
-- El default volátil rellena las filas existentes con un uuid distinto cada una.
alter table public.embarcaciones
  add column if not exists telemetria_token uuid not null default gen_random_uuid();

create unique index if not exists embarcaciones_telemetria_token_idx
  on public.embarcaciones (telemetria_token);
