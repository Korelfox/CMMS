// Embarcación activa de sesión — persistencia y filtros de flota (Capa 2).

export function storageKeyEmbarcacion(empresaId) {
  return `cmms-embarcacion-activa-${empresaId || "default"}`;
}

export function readStoredEmbarcacionId(empresaId) {
  try { return localStorage.getItem(storageKeyEmbarcacion(empresaId)); } catch { return null; }
}

export function writeStoredEmbarcacionId(empresaId, id) {
  try { localStorage.setItem(storageKeyEmbarcacion(empresaId), id); } catch { /* sin storage */ }
  window.dispatchEvent(new CustomEvent("cmms-embarcacion-change", { detail: { id } }));
}

export function resolveEmbarcacion(embarcaciones, id) {
  if (!id || !Array.isArray(embarcaciones)) return null;
  return embarcaciones.find((e) => e.id === id) || null;
}

export function filterByEmbarcacion(rows, embId, field = "embarcacion_id") {
  if (!embId || !Array.isArray(rows)) return rows || [];
  return rows.filter((r) => r[field] === embId);
}

/** Reduce datos de flota al contexto de una embarcación (header alertas, módulos Campo). */
export function filterFleetForEmbarcacion(raw, embId) {
  if (!embId || !raw) return raw;
  const equipos = filterByEmbarcacion(raw.equipos, embId);
  const eqIds = new Set(equipos.map((e) => e.id));
  const byEq = (rows) => (Array.isArray(rows) ? rows.filter((r) => eqIds.has(r.equipo_id)) : rows);
  return {
    ...raw,
    embarcaciones: (raw.embarcaciones || []).filter((e) => e.id === embId),
    equipos,
    ordenes_trabajo: filterByEmbarcacion(raw.ordenes_trabajo, embId),
    solicitudes: filterByEmbarcacion(raw.solicitudes, embId),
    varadas: filterByEmbarcacion(raw.varadas, embId),
    prezarpes: filterByEmbarcacion(raw.prezarpes, embId),
    documentos: filterByEmbarcacion(raw.documentos, embId),
    planes_pm: byEq(raw.planes_pm),
    mediciones_pdm: byEq(raw.mediciones_pdm),
    lecturas_horometro: byEq(raw.lecturas_horometro),
    fallas: byEq(raw.fallas),
  };
}

export const APP_MODE_KEY = "cmms-app-mode";

export function readAppMode(defaultMode = "oficina") {
  try {
    const v = localStorage.getItem(APP_MODE_KEY);
    return v === "campo" || v === "oficina" ? v : defaultMode;
  } catch {
    return defaultMode;
  }
}

export function writeAppMode(mode) {
  try { localStorage.setItem(APP_MODE_KEY, mode); } catch { /* sin storage */ }
}
