# Migraciones de base de datos

Versionado de los cambios de esquema del CMMS (Supabase / Postgres).

- El **esquema base** (tablas iniciales, RLS por empresa, funciones `app.*`) vive
  en el proyecto Supabase y es anterior a esta carpeta.
- A partir de aquí, **todo cambio de esquema se registra como un archivo SQL** en
  esta carpeta, en orden cronológico (`YYYYMMDD_NNNN_descripcion.sql`), y se aplica
  con la CLI de Supabase o el panel. Así el repo es la fuente de verdad y los
  cambios son reproducibles y reversibles.

## Convención
- Prefijo de fecha + correlativo del día: `20260607_0001_...`.
- Idempotente cuando sea posible (`if not exists`, `drop ... if exists`).
- Un cambio lógico por archivo.

## Pendiente recomendado
- Crear un entorno **staging** (branch de base de datos) para validar migraciones
  antes de producción, en vez de aplicarlas directo a prod.
