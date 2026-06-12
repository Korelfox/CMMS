-- Programación: reemplaza 'dia' (string estático) por fecha_programada (fecha real de calendario)
-- Permite vincular tareas a fechas exactas, navegación semanal y detección de atrasos.

ALTER TABLE programacion ADD COLUMN IF NOT EXISTS fecha_programada DATE;

-- Retroalimentar filas existentes: lunes de la semana de created_at + offset del día guardado
UPDATE programacion
SET fecha_programada = (
  date_trunc('week', created_at::date)::date +
  CASE dia
    WHEN 'Lun' THEN 0
    WHEN 'Mar' THEN 1
    WHEN 'Mié' THEN 2
    WHEN 'Jue' THEN 3
    WHEN 'Vie' THEN 4
    WHEN 'Sáb' THEN 5
    WHEN 'Dom' THEN 6
    ELSE 0
  END
)
WHERE fecha_programada IS NULL;

-- Índice para filtrar rápido por semana
CREATE INDEX IF NOT EXISTS idx_programacion_fecha ON programacion (empresa_id, fecha_programada);
