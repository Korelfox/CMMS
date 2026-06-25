-- ============================================================
--  Optimistic locking + incremento atómico de costos para OTs
--  (auditoría CMMS · hallazgo C5)
--
--  1) Garantiza ordenes_trabajo.updated_at + trigger que lo refresca en cada
--     UPDATE. Sin esto, el bloqueo optimista (online en updateRowLocked y
--     offline en flushOutbox vía .eq("updated_at", ...)) quedaba inerte y dos
--     usuarios (Campo + Oficina) se pisaban en silencio.
--  2) fn_ot_add_costo_mat: suma costo de repuestos de forma atómica server-side,
--     evitando la lectura obsoleta de ot.costo_mat en el wizard de Campo.
-- ============================================================

-- 1) Columna updated_at (idempotente)
alter table public.ordenes_trabajo
  add column if not exists updated_at timestamptz not null default now();

-- Backfill de filas existentes sin marca (usa created_at si existe).
update public.ordenes_trabajo
   set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

-- Trigger genérico que refresca updated_at en cada UPDATE.
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ot_touch_updated_at on public.ordenes_trabajo;
create trigger trg_ot_touch_updated_at
  before update on public.ordenes_trabajo
  for each row
  execute function public.fn_touch_updated_at();

-- 2) Incremento atómico de costo de materiales (consumo de repuestos en Campo).
--    Security invoker (default) → respeta RLS: solo afecta OTs de la empresa
--    del usuario autenticado. El trigger anterior refresca updated_at.
create or replace function public.fn_ot_add_costo_mat(
  p_ot uuid,
  p_delta numeric,
  p_por text
)
returns void
language sql
as $$
  update public.ordenes_trabajo
     set costo_mat    = coalesce(costo_mat, 0) + p_delta,
         costos_por   = p_por,
         costos_fecha = now()
   where id = p_ot;
$$;

-- 3) Unicidad de huella (hallazgo M5): evita la OT preventiva duplicada por la
--    carrera cron/usuario. La tabla no usa deleted_at (soft-delete no aplica aquí).
--    Primero deduplica filas existentes con la misma huella (conserva la más antigua)
--    para que el índice pueda crearse sin violar restricciones.
with dups as (
  select id,
         row_number() over (
           partition by empresa_id, huella
           order by created_at asc, id asc
         ) as rn
    from public.ordenes_trabajo
   where huella is not null
)
delete from public.ordenes_trabajo
 where id in (select id from dups where rn > 1);

create unique index if not exists ux_ot_empresa_huella
  on public.ordenes_trabajo (empresa_id, huella)
  where huella is not null;
