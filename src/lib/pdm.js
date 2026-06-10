// ============================================================
//  Lógica pura de mantenimiento predictivo (PdM)
//  Tipos de inspección, parámetros sugeridos con unidad y límites
//  típicos (referenciales, editables al medir), y evaluación de
//  una medición contra sus límites (semáforo por condición).
//  Convención v1: umbral ascendente — a mayor valor, peor condición.
// ============================================================

export const TIPOS_PDM = [
  { value: "aceite",      label: "Análisis de aceite" },
  { value: "vibracion",   label: "Vibración" },
  { value: "termografia", label: "Termografía" },
  { value: "otro",        label: "Otro / por condición" },
];

// Parámetros sugeridos por tipo: [nombre, unidad, alertaTípica, críticoTípico]
// Límites referenciales para motor diésel marino mediano (ajustables al registrar).
export const PARAMETROS_PDM = {
  aceite: [
    ["Hierro (Fe)", "ppm", 80, 150],
    ["Cobre (Cu)", "ppm", 40, 80],
    ["Silicio (Si)", "ppm", 15, 25],
    ["Cromo (Cr)", "ppm", 10, 20],
    ["Agua", "%", 0.2, 0.5],
    ["Hollín", "%", 1.5, 3],
    ["Viscosidad 100°C", "cSt", 16, 18],
    ["Dilución por combustible", "%", 2.5, 5],
  ],
  vibracion: [
    ["Velocidad RMS", "mm/s", 7.1, 11],     // ISO 10816 clase III orientativo
    ["Aceleración", "g", 2, 4],
    ["Desplazamiento", "µm", 60, 100],
  ],
  termografia: [
    ["Temperatura", "°C", 75, 90],
    ["ΔT vs ambiente", "°C", 30, 50],
    ["ΔT entre fases (eléctrico)", "°C", 10, 25],
  ],
  otro: [],
};

// Evalúa una medición contra sus límites (ascendentes).
// → { key: "critico"|"alerta"|"ok"|"sin_limites", tone, label }
export function evaluarMedicion(valor, limiteAlerta, limiteCritico) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return { key: "sin_limites", tone: "slate", label: "Sin valor" };
  const a = limiteAlerta == null ? null : Number(limiteAlerta);
  const c = limiteCritico == null ? null : Number(limiteCritico);
  if (c != null && v >= c) return { key: "critico", tone: "red", label: "Crítico" };
  if (a != null && v >= a) return { key: "alerta", tone: "yellow", label: "Alerta" };
  if (a == null && c == null) return { key: "sin_limites", tone: "slate", label: "Sin límites" };
  return { key: "ok", tone: "green", label: "Normal" };
}

// Agrupa mediciones en series por (equipo, tipo, parámetro), cada serie
// ordenada por fecha descendente (la [0] es la última medición).
export function seriesPdM(mediciones = []) {
  const mapa = new Map();
  for (const m of mediciones) {
    if (!m?.equipo_id || !m?.parametro) continue;
    const key = `${m.equipo_id}|${m.tipo}|${m.parametro}`;
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key).push(m);
  }
  for (const arr of mapa.values()) {
    arr.sort((x, y) => new Date(y.fecha) - new Date(x.fecha) || new Date(y.created_at || 0) - new Date(x.created_at || 0));
  }
  return mapa;
}
