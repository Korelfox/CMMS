-- Agrega columna `unidad` a la tabla weibull para declarar si β/η están
-- expresados en horas ('h') o días ('d'). DEFAULT 'h' preserva el
-- comportamiento previo donde todo se asumía en horas.
ALTER TABLE weibull ADD COLUMN IF NOT EXISTS unidad text NOT NULL DEFAULT 'h';
