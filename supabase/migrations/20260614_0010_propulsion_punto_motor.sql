-- Propulsión: el punto de horómetro pasa del sistema agrupador (DM-PROP,
-- "Propulsión Principal") a la máquina real (DM-PROP-MTR, "Motor Principal"),
-- igual que ya funcionan generadores (DM-GEN-MTR) y central hidráulica
-- (DM-HPU-MTR): la máquina es el punto y el sistema solo agrupa.
--
-- El eje, la hélice y la reductora son HERMANOS del motor y tienen planes PM
-- por horas (eje 2, reductora 1) → pasan a colgar del motor para seguir
-- heredando sus horas. Tras esto, en Horómetros se ingresa la lectura en
-- "Motor Principal" (que queda como nodo raíz del árbol, porque su padre — el
-- sistema — ya no es punto de horómetro), evitando la confusión de ingresarla
-- en el agrupador. Gobierno/Servotimón se deja igual (a revisar aparte).

-- 1) Eje, hélice y reductora cuelgan del Motor (para heredar sus horas).
update equipos
set parent_id = (select id from equipos where id_visible = 'DM-PROP-MTR')
where id_visible in ('DM-PROP-EJE', 'DM-PROP-HEL', 'DM-PROP-RED');

-- 2) El Motor es el punto de horómetro.
update equipos set horometro = 'propio' where id_visible = 'DM-PROP-MTR';

-- 3) El sistema solo agrupa: mismo patrón que DM-GEN / DM-HPU (hereda, sin horas).
update equipos set horometro = 'hereda', horas_actual = 0 where id_visible = 'DM-PROP';

-- 4) La lectura histórica (ingresada en el sistema) se traslada al Motor para
--    conservar el historial sobre el nuevo punto.
update lecturas_horometro
set equipo_id = (select id from equipos where id_visible = 'DM-PROP-MTR')
where equipo_id = (select id from equipos where id_visible = 'DM-PROP');

-- 5) Resincroniza horas_actual: cada punto propio propaga a su subárbol que
--    hereda (ahora el Motor alcanza eje/hélice/reductora). Igual al trigger,
--    aplicado una vez para corregir el histórico.
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
