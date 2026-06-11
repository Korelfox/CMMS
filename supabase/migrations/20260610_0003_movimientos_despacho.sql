-- Movimientos: tipos de traslado a/desde embarcación y agrupación de lotes
-- Paso 1: agregar valores al enum (requiere commit separado antes de usarlos)
ALTER TYPE app.tipo_movimiento ADD VALUE IF NOT EXISTS 'despacho';
ALTER TYPE app.tipo_movimiento ADD VALUE IF NOT EXISTS 'retorno';

-- Paso 2 (migración separada): columna lote_id para agrupar despachos multi-ítem
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS lote_id UUID;
CREATE INDEX IF NOT EXISTS mov_lote_idx ON movimientos(lote_id) WHERE lote_id IS NOT NULL;
