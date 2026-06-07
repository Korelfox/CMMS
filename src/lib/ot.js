// ============================================================
//  Lógica pura de Órdenes de Trabajo (sin UI ni dependencias de
//  red). Centralizada para poder probarla de forma unitaria.
// ============================================================

// Formulario en blanco de una OT nueva.
export const blankOT = (hoy) => ({
  embarcacion_id: "", equipo_id: "", sistema: "", tipo: "preventivo",
  prioridad: "media", estado: "solicitada", fecha: hoy, descripcion: "",
  mttr_horas: 0, hrs_oper_desde: 0, costo_mo: 0, costo_mat: 0,
});

// Folio de la OT: correlativo cuando hay conexión; provisional (S/N) offline.
export function folioOT(count, online, nowIso = new Date().toISOString()) {
  if (online) return `OT-${String(count + 1).padStart(3, "0")}`;
  return `OT-S/N-${nowIso.slice(5, 16).replace("T", "-").replace(":", "")}`;
}

// Costo total de una OT (mano de obra + materiales).
export const costoOT = (o) => (Number(o?.costo_mo) || 0) + (Number(o?.costo_mat) || 0);

// KPIs de un conjunto de OTs.
export function kpisOT(ots = []) {
  const abiertas = ots.filter((o) => o.estado !== "cerrada").length;
  const costoTotal = ots.reduce((s, o) => s + costoOT(o), 0);
  const preventivas = ots.filter((o) => o.tipo === "preventivo").length;
  const propProactivo = ots.length ? Math.round((preventivas / ots.length) * 100) : 0;
  return { total: ots.length, abiertas, costoTotal, preventivas, propProactivo };
}

// Estados que se usan como filtro (los demás valores de filtro son embarcacion_id).
export const ESTADOS_FILTRABLES = ["solicitada", "planificada", "programada", "en_ejecucion", "cerrada"];

// Aplica el filtro de la lista de OTs (por estado o por embarcación).
export function filtrarOTs(ots = [], filtro = "all") {
  if (filtro === "all") return ots;
  if (ESTADOS_FILTRABLES.includes(filtro)) return ots.filter((o) => o.estado === filtro);
  return ots.filter((o) => o.embarcacion_id === filtro);
}

// Validación de una OT nueva. Devuelve mensaje de error o null si es válida.
export function validarNuevaOT(form) {
  if (!form?.descripcion?.trim() || !form?.embarcacion_id) {
    return "Indica al menos la embarcación y una descripción.";
  }
  return null;
}
