-- Ficha técnica extendida por equipo/componente.
-- Columna JSONB flexible que guarda datos de placa, técnicos, comerciales,
-- documentación, notas y campos personalizados. No se muestra en la tabla de
-- Equipos; se llena y consulta desde un modal "Ficha técnica" bajo demanda.
-- JSONB permite agregar campos sin nuevas migraciones.
alter table public.equipos
  add column if not exists ficha jsonb not null default '{}'::jsonb;
