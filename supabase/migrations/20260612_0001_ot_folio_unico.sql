-- OT: folio único y asignación atómica a nivel de base de datos.
-- El cliente calcula un folio tentativo (máximo + 1), pero dos usuarios
-- simultáneos podían chocar entre el cálculo y el INSERT. El trigger
-- serializa por empresa (advisory lock) y reasigna el correlativo cuando
-- el folio viene vacío o ya existe. Folios fuera del esquema OT-###
-- (OT-S/N offline, OT-RF de retorno por falla) se respetan si no chocan.

CREATE OR REPLACE FUNCTION asignar_folio_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Serializa la asignación de folios dentro de la empresa
  PERFORM pg_advisory_xact_lock(hashtext('folio_ot:' || NEW.empresa_id::text));
  IF NEW.folio IS NULL OR NEW.folio = '' OR EXISTS (
    SELECT 1 FROM ordenes_trabajo
    WHERE empresa_id = NEW.empresa_id AND folio = NEW.folio
  ) THEN
    SELECT 'OT-' || lpad((COALESCE(MAX((regexp_match(folio, '^OT-(\d+)$'))[1]::int), 0) + 1)::text, 3, '0')
    INTO NEW.folio
    FROM ordenes_trabajo
    WHERE empresa_id = NEW.empresa_id AND folio ~ '^OT-\d+$';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asignar_folio_ot ON ordenes_trabajo;
CREATE TRIGGER trg_asignar_folio_ot
  BEFORE INSERT ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION asignar_folio_ot();

-- Candado definitivo: imposible duplicar folio dentro de una empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_ot_empresa_folio
  ON ordenes_trabajo (empresa_id, folio);
