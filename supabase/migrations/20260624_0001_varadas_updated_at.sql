-- Locking optimista para varadas: el frontend (Varada.jsx → updateRowLocked)
-- ya envía updated_at para detectar edición concurrente al cerrar una varada,
-- pero la columna no existía, así que el candado quedaba inerte (degradaba a
-- update normal). Aquí se agrega la columna + el trigger touch genérico,
-- igual que ordenes_trabajo (trg_touch_ordenes_trabajo → app.touch_updated_at).

ALTER TABLE public.varadas
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill de filas existentes (usa created_at si está disponible).
UPDATE public.varadas
   SET updated_at = COALESCE(updated_at, created_at, now())
 WHERE updated_at IS NULL;

-- Trigger BEFORE UPDATE que refresca updated_at en cada escritura.
DROP TRIGGER IF EXISTS trg_touch_varadas ON public.varadas;
CREATE TRIGGER trg_touch_varadas
  BEFORE UPDATE ON public.varadas
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();
