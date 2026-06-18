// Vistas guardadas en localStorage (Fase 4 — Oficina refinada).

export function loadSavedViews(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(storageKey, views) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(views));
  } catch { /* sin storage */ }
}

export function addSavedView(storageKey, { name, filters }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const views = loadSavedViews(storageKey);
  const entry = {
    id: `sv-${Date.now()}`,
    name: trimmed,
    filters: filters || {},
    createdAt: new Date().toISOString(),
  };
  persistSavedViews(storageKey, [entry, ...views].slice(0, 12));
  return entry;
}

export function removeSavedView(storageKey, id) {
  const views = loadSavedViews(storageKey).filter((v) => v.id !== id);
  persistSavedViews(storageKey, views);
  return views;
}

/** Vistas rápidas integradas — OT. */
export const OT_BUILTIN_VIEWS = [
  { id: "__abiertas", name: "OT abiertas", builtin: true, filters: { filtro: "abiertas", embFiltro: "all" } },
  { id: "__ejecucion", name: "En ejecución", builtin: true, filters: { filtro: "en_ejecucion", embFiltro: "all" } },
  { id: "__sin_valorizar", name: "Sin valorizar", builtin: true, filters: { filtro: "sin_valorizar", embFiltro: "all", vista: "valorizar" } },
];

/** Vistas rápidas integradas — Plan PM (filtro por nave). */
export const PM_BUILTIN_VIEWS = [
  { id: "__flota", name: "Toda la flota", builtin: true, filters: { filtro: "all" } },
];

export function mergeViews(builtin = [], saved = []) {
  return [...builtin, ...saved];
}
