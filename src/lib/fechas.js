// Utilidades de fecha del CMMS.
//
// "Hoy" debe calcularse en hora LOCAL, no UTC. new Date().toISOString() da la
// fecha en UTC y al oeste de Greenwich (Chile, UTC-4) por la tarde adelanta el
// día, marcando como atrasadas/vencidas las tareas, planes y alertas de hoy.
//
// Para TIMESTAMPS que se guardan en BD (created_at, cerrada_fecha, etc.) sí se
// usa new Date().toISOString() completo: ahí el instante UTC es lo correcto.

/** Fecha local en formato YYYY-MM-DD (hoy por defecto, o la fecha dada). */
export function fechaLocal(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Fecha local de hoy (YYYY-MM-DD), sin desfase de zona horaria. */
export const hoyLocal = () => fechaLocal();
