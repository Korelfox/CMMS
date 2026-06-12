-- OT: firma de valorización de costos (quién y cuándo cerró los costos, post-cierre de la OT)
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS costos_por TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS costos_fecha TIMESTAMPTZ;
