-- Soft-delete: agrega columna deleted_at a las tablas principales.
-- Los registros "eliminados" se ocultan por defecto pero son recuperables.

-- Nota: la tabla de inventario se llama 'inventario_items' (no 'inventario').
ALTER TABLE ordenes_trabajo  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE equipos          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE solicitudes      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE adjuntos         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE inventario_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE embarcaciones    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE planes_pm        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE varadas          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE compras          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE movimientos      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE bitacora         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

