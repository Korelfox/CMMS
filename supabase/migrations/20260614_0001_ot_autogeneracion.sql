-- OTs auto-generadas por el motor de reglas (CMMS autónomo · Fase 1).
--
-- origen: marca cómo nació la OT. 'auto' = generada por el motor de reglas
--   (PM vencido por horómetro o calendario); null/'manual' = creación humana.
--   Permite separar trabajo propuesto por el sistema del ingresado a mano en
--   KPIs, auditoría y bitácora.
--
-- huella: clave determinística de idempotencia, p. ej. pm:{plan_id}:{horas_ult_pm}.
--   Mientras el PM siga pendiente el hito (horas_ult_pm / fecha_ult_pm) no cambia,
--   así la huella es estable y el motor NO regenera la misma OT en cada corrida.
--   Al ejecutarse el PM el hito avanza → la huella cambia → se habilita la OT del
--   ciclo siguiente. Es el mecanismo que evita el "spam de OTs" del lazo autónomo.
alter table public.ordenes_trabajo
  add column if not exists origen text,
  add column if not exists huella text;

-- Índice del chequeo de idempotencia: "¿ya existe una OT con esta huella?".
-- Compuesto con empresa_id para respetar el aislamiento multi-tenant (RLS).
create index if not exists idx_ot_huella
  on public.ordenes_trabajo (empresa_id, huella);
