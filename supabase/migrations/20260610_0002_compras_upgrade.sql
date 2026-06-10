-- Órdenes de Compra: campos adicionales para módulo clase mundial
-- Todos con DEFAULT → registros existentes siguen funcionando sin cambios.

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS urgencia               TEXT    NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS condicion_pago         TEXT             DEFAULT '30 días',
  ADD COLUMN IF NOT EXISTS moneda                 TEXT    NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS iva_pct                NUMERIC NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS proveedor_contacto     TEXT,
  ADD COLUMN IF NOT EXISTS proveedor_email        TEXT,
  ADD COLUMN IF NOT EXISTS numero_factura         TEXT,
  ADD COLUMN IF NOT EXISTS fecha_entrega_esperada DATE,
  ADD COLUMN IF NOT EXISTS aprobado_por           TEXT;

-- Descuento por línea de ítem (en porcentaje, ej: 10 = 10 %)
ALTER TABLE compras_items
  ADD COLUMN IF NOT EXISTS descuento_pct NUMERIC NOT NULL DEFAULT 0;

-- Índice para filtros por urgencia (frecuente en panel de alertas)
CREATE INDEX IF NOT EXISTS compras_urgencia_idx
  ON compras (empresa_id, urgencia)
  WHERE estado NOT IN ('recibida', 'cancelada');
