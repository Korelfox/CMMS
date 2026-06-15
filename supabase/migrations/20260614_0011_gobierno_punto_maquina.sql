-- Gobierno / Servotimón: mismo criterio que propulsión (máquina = punto, el
-- sistema solo agrupa), con el matiz de que el GOBIERNO DE EMERGENCIA es un
-- sistema deliberadamente independiente (potencia y actuador propios) → no
-- comparte las horas del gobierno principal.
--
--   DM-STEER (sistema)            → solo agrupa (hereda, sin horas)
--     DM-STEER-01 Gobierno Principal   → punto de horómetro (propio)
--       DM-STEER-CIL Cilindros         → cuelga del principal (hereda)
--       DM-STEER-FBK Telemotor/Feedback→ cuelga del principal (hereda)
--     DM-STEER-EMG Gobierno Emergencia → punto INDEPENDIENTE (propio aparte)
--
-- Ambos puntos (principal y emergencia) cuelgan del mismo sistema agrupador,
-- pero son hermanos: ninguno es ancestro del otro, así que no hay anidamiento.

-- 1) Cilindros y feedback cuelgan del Gobierno Principal (para heredar sus horas).
update equipos
set parent_id = (select id from equipos where id_visible = 'DM-STEER-01')
where id_visible in ('DM-STEER-CIL', 'DM-STEER-FBK');

-- 2) Gobierno Principal es el punto de horómetro.
update equipos set horometro = 'propio' where id_visible = 'DM-STEER-01';

-- 3) Gobierno de Emergencia: punto independiente (su propio contador de horas).
update equipos set horometro = 'propio' where id_visible = 'DM-STEER-EMG';

-- 4) El sistema solo agrupa: mismo patrón que DM-PROP / DM-GEN (hereda, sin horas).
update equipos set horometro = 'hereda', horas_actual = 0 where id_visible = 'DM-STEER';

-- 5) Resincroniza horas_actual desde cada punto a su subárbol (idempotente).
with recursive arbol as (
  select id, id as raiz, horas_actual as horas_punto
  from equipos where horometro = 'propio'
  union all
  select e.id, a.raiz, a.horas_punto
  from equipos e join arbol a on e.parent_id = a.id
  where e.horometro = 'hereda'
)
update equipos t
set horas_actual = a.horas_punto
from arbol a
where t.id = a.id
  and t.horas_actual is distinct from a.horas_punto;
