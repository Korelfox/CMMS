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

// Folio de la OT: correlativo robusto cuando hay conexión (máximo folio
// existente + 1 — count+1 colisionaba tras eliminar OTs); provisional (S/N)
// offline. Ignora folios fuera del esquema OT-### (S/N, OT-RF-, legacy PM-).
export function folioOT(ots, online, nowIso = new Date().toISOString()) {
  if (!online) return `OT-S/N-${nowIso.slice(5, 16).replace("T", "-").replace(":", "")}`;
  const maxN = (Array.isArray(ots) ? ots : []).reduce((mx, o) => {
    const m = /^OT-(\d+)$/.exec(o?.folio || "");
    return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
  }, 0);
  return `OT-${String(maxN + 1).padStart(3, "0")}`;
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

// OT cerrada que aún no tiene costos cargados (pendiente de cierre de costos del armador).
export function sinValorizar(ot) {
  return ot.estado === "cerrada" && !(ot.costo_mo || 0) && !(ot.costo_mat || 0);
}

const PRIORIDAD_RANK = { critica: 0, alta: 1, media: 2, baja: 3 };

function cmpAbiertas(a, b) {
  const pa = PRIORIDAD_RANK[a.prioridad] ?? 9;
  const pb = PRIORIDAD_RANK[b.prioridad] ?? 9;
  if (pa !== pb) return pa - pb;
  return String(b.fecha || "").localeCompare(String(a.fecha || ""));
}

function cmpCerradas(a, b) {
  const da = a.cerrada_fecha || a.fecha || "";
  const db = b.cerrada_fecha || b.fecha || "";
  return String(db).localeCompare(String(da));
}

/** Abiertas primero, cerradas al final — sin mezclar grupos. */
export function ordenarOTs(ots = []) {
  const abiertas = [];
  const cerradas = [];
  for (const o of ots) {
    (o.estado === "cerrada" ? cerradas : abiertas).push(o);
  }
  abiertas.sort(cmpAbiertas);
  cerradas.sort(cmpCerradas);
  return [...abiertas, ...cerradas];
}

// Aplica el filtro de la lista de OTs (por estado, valorización o embarcación).
export function filtrarOTs(ots = [], filtro = "all") {
  if (filtro === "all") return ots;
  if (filtro === "sin_valorizar") return ots.filter(sinValorizar);
  if (ESTADOS_FILTRABLES.includes(filtro)) return ots.filter((o) => o.estado === filtro);
  return ots.filter((o) => o.embarcacion_id === filtro);
}

/** Búsqueda por folio, sistema, descripción o nombre de nave. */
export function buscarOTs(ots = [], query = "", embNameFn) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return ots;
  return ots.filter((o) =>
    o.folio?.toLowerCase().includes(q)
    || o.descripcion?.toLowerCase().includes(q)
    || o.sistema?.toLowerCase().includes(q)
    || embNameFn?.(o.embarcacion_id)?.toLowerCase().includes(q),
  );
}

// Validación de una OT nueva. Devuelve mensaje de error o null si es válida.
export function validarNuevaOT(form) {
  if (!form?.descripcion?.trim() || !form?.embarcacion_id) {
    return "Indica al menos la embarcación y una descripción.";
  }
  return null;
}
