-- ============================================================
--  planes_pm: soporte para disparadores de tipo CALENDARIO
--  (además del tipo HORAS que ya existía)
--
--  tipo_disparador: 'horas' | 'calendario' | 'condicion'
--  intervalo_calendario: número entero (p.ej. 1, 3, 6)
--  unidad_calendario:    'diario' | 'semanal' | 'mensual' |
--                        'trimestral' | 'semestral' | 'anual'
--
--  Retrocompatibilidad:
--   - tipo_disparador default 'horas' → filas existentes sin cambio.
--   - intervalo_horas pasa a nullable: los planes de calendario no
--     tienen intervalo_horas y lo almacenan como NULL.
-- ============================================================

alter table public.planes_pm
  add column if not exists tipo_disparador text not null default 'horas'
    check (tipo_disparador in ('horas', 'calendario', 'condicion')),
  add column if not exists intervalo_calendario integer
    check (intervalo_calendario is null or intervalo_calendario > 0),
  add column if not exists unidad_calendario text
    check (unidad_calendario in ('diario','semanal','mensual','trimestral','semestral','anual'));

-- intervalo_horas ya no es obligatorio para planes de tipo calendario
alter table public.planes_pm
  alter column intervalo_horas drop not null;

-- índice para consultas por tipo de disparador (KPI de vencimientos)
create index if not exists planes_pm_tipo_disparador_idx
  on public.planes_pm (empresa_id, tipo_disparador)
  where activo = true;
