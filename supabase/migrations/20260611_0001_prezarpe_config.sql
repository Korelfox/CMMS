-- Configuración de checklist por embarcación
-- extra: ítems personalizados | excluidos: ítems ocultos
ALTER TABLE embarcaciones
  ADD COLUMN IF NOT EXISTS prezarpe_config JSONB DEFAULT '{"extra":[],"excluidos":[]}'::jsonb;
