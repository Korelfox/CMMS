-- Horómetro: un único punto por cadena + resincronización del árbol.
--
-- Problema: la semilla (20260609_0006) marcó como 'propio' tanto los motores
-- (-PROP-MTR, -GEN-MTR, …) COMO cualquier equipo con horas_actual > 0. En la
-- propulsión eso dejó DOS puntos en la misma cadena: el sistema (DM-PROP) y el
-- motor (DM-PROP-MTR). El subárbol del motor — donde cuelga la mayoría de los
-- planes PM (filtros, inyectores, válvulas) — quedó como una ISLA: las lecturas
-- ingresadas en el sistema no lo alcanzaban, así que horas_actual y el PM nunca
-- reflejaban el uso real.
--
-- Regla correcta: un solo punto de horómetro por tren mecánico, en el nodo común
-- (el sistema). Motor, eje, hélice y reductor giran juntos → comparten horas.
--
-- (1) Todo 'propio' que tenga un ancestro 'propio' se degrada a 'hereda':
--     gana el punto más alto de la cadena, común a todos los componentes.
with recursive sube as (
  -- por cada 'propio' arrancamos en su padre y subimos la cadena
  select e.id as nodo, e.parent_id as cur
  from equipos e
  where e.horometro = 'propio'
  union all
  select s.nodo, c.parent_id
  from sube s
  join equipos c on c.id = s.cur
  where c.parent_id is not null
)
update equipos
set horometro = 'hereda'
where id in (
  select distinct s.nodo
  from sube s
  join equipos anc on anc.id = s.cur
  where anc.horometro = 'propio'   -- existe un ancestro propio → punto anidado
);

-- (2) Resincroniza horas_actual: cada equipo que hereda toma las horas de su
--     punto propio. Barre el subárbol de cada punto (igual que el trigger, pero
--     una sola vez para corregir el histórico). Los nodos 'no' quedan fuera.
with recursive arbol as (
  select id, id as raiz, horas_actual as horas_punto
  from equipos
  where horometro = 'propio'
  union all
  select e.id, a.raiz, a.horas_punto
  from equipos e
  join arbol a on e.parent_id = a.id
  where e.horometro = 'hereda'
)
update equipos t
set horas_actual = a.horas_punto
from arbol a
where t.id = a.id
  and t.horas_actual is distinct from a.horas_punto;
