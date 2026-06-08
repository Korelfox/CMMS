-- ============================================================
--  Limpieza de la taxonomía ANTIGUA de motores diésel
--  Deja solo la nueva taxonomía marina ISO 14224 (10 subsistemas).
--
--  Contexto: la plantilla de motores (Motor Principal y Generador)
--  se reestructuró de 7 a 10 subsistemas marinos (bloque/tren
--  alternativo, agua dulce + agua de mar, admisión/aftercooler,
--  escape húmedo, etc.) con IDs nuevos. Las naves precargadas con la
--  versión anterior conservaban los nodos viejos. Esta migración los
--  purga para dejar el árbol limpio.
--
--  Qué hace:
--   1. Respalda (REVERSIBLE) en el esquema cmms_backup los sub-nodos
--      de motor y sus dependientes.
--   2. Borra el subárbol viejo bajo cada motor (PROP-MTR / GEN-MTR),
--      CONSERVANDO los nodos raíz (que llevan los planes PM del usuario).
--
--  Después de aplicar: en la app, Equipos → seleccionar la nave →
--  "Precargar completa". El loader (idempotente) reconstruye Motor
--  Principal, Motor Generador y la Central Hidráulica (HPU) con la
--  nueva estructura, repuestos OEM/Alt./Genérico y planes PM.
--
--  Nota FK: equipos.parent_id es ON DELETE SET NULL (no cascada), por
--  eso el borrado es por patrón de id_visible y cubre todos los niveles.
--  inventario_item_destinos / planes_pm / cgm / criticidad / weibull /
--  historial_pm son ON DELETE CASCADE; ordenes_trabajo y mareas son
--  SET NULL (las OTs históricas sobreviven, solo pierden el enlace).
-- ============================================================

create schema if not exists cmms_backup;

-- 1. Backup de los sub-nodos de motor y sus dependientes (reversible)
create table if not exists cmms_backup.equipos_motor_legacy_20260608 as
  select * from equipos
  where id_visible ~ '-(PROP-MTR|GEN-MTR)-';

create table if not exists cmms_backup.planes_pm_motor_legacy_20260608 as
  select p.* from planes_pm p
  join equipos e on e.id = p.equipo_id
  where e.id_visible ~ '-(PROP-MTR|GEN-MTR)-';

create table if not exists cmms_backup.inv_destinos_motor_legacy_20260608 as
  select d.* from inventario_item_destinos d
  join equipos e on e.id = d.equipo_id
  where e.id_visible ~ '-(PROP-MTR|GEN-MTR)-';

-- 2. Borrar el subárbol viejo (subsistemas, componentes e instrumentos).
--    Las raíces "-PROP-MTR" / "-GEN-MTR" NO coinciden con el patrón y se
--    conservan junto con sus planes PM.
delete from equipos
where id_visible ~ '-(PROP-MTR|GEN-MTR)-';

-- ============================================================
--  ROLLBACK (manual, si se necesitara revertir antes de re-precargar):
--    insert into equipos
--      select * from cmms_backup.equipos_motor_legacy_20260608;
--    insert into planes_pm
--      select * from cmms_backup.planes_pm_motor_legacy_20260608;
--    insert into inventario_item_destinos
--      select * from cmms_backup.inv_destinos_motor_legacy_20260608;
--  (Restaurar primero subsistemas y luego componentes si el orden de
--   parent_id lo exige; o deshabilitar triggers temporalmente.)
--
--  Limpieza del backup una vez validada la nueva precarga:
--    drop schema cmms_backup cascade;
-- ============================================================
