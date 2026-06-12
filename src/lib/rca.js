// ============================================================
//  Lógica pura de Análisis de Causa Raíz (RCA · 5 porqués).
//  Detección de fallas crónicas: el disparador de un RCA es un
//  equipo con N o más OTs correctivas en una ventana de tiempo
//  (el mismo dato que alimenta Pareto, cerrando el ciclo
//  Pareto → RCA → acción correctiva → verificación de eficacia).
// ============================================================

const DIA_MS = 86_400_000;

export const ESTADOS_RCA = [
  { value: "abierto",      label: "Abierto",                tone: "yellow" },
  { value: "implementado", label: "Acciones implementadas", tone: "steel" },
  { value: "verificado",   label: "Verificado eficaz",      tone: "green" },
];

// Acciones correctivas pendientes de un RCA.
export const accionesPendientes = (rca) =>
  (Array.isArray(rca?.acciones) ? rca.acciones : []).filter((a) => !a?.done).length;

// ── Detección de fallas crónicas (candidatos a RCA) ─────────
// Agrupa las OTs correctivas de la ventana por equipo (o por
// embarcación+sistema cuando la OT no tiene equipo vinculado).
// Un grupo con >= minEventos fallas y sin RCA vigente es candidato.
// RCA "vigente" = en trabajo (no verificado) o levantado dentro de
// la misma ventana — un RCA verificado antiguo no bloquea
// re-detectar si la falla volvió.
// → [{ key, n, equipoId, embarcacionId, sistema, modoTop, ultimaOT, ots }]
export function candidatosRCA(ots = [], rcas = [], { dias = 180, minEventos = 3, hoy } = {}) {
  const hoyD = new Date((hoy || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const desde = new Date(hoyD.getTime() - dias * DIA_MS);
  const enVentana = (fecha) => fecha && new Date(fecha.slice(0, 10) + "T00:00:00") >= desde;

  const grupos = new Map();
  for (const o of ots) {
    if (o?.tipo !== "correctivo" || !enVentana(o?.fecha)) continue;
    const key = o.equipo_id
      ? `eq:${o.equipo_id}`
      : `sx:${o.embarcacion_id || ""}|${(o.sistema || "").toLowerCase().trim()}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(o);
  }

  const cubiertos = new Set();
  for (const r of rcas || []) {
    if (!r?.equipo_id) continue;
    if (r.estado !== "verificado" || enVentana(r.fecha)) cubiertos.add(`eq:${r.equipo_id}`);
  }

  const out = [];
  for (const [key, evs] of grupos) {
    if (evs.length < minEventos || cubiertos.has(key)) continue;
    const orden = evs.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    const conteo = {};
    for (const e of evs) if (e.modo_falla) conteo[e.modo_falla] = (conteo[e.modo_falla] || 0) + 1;
    const modoTop = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    out.push({
      key, n: evs.length,
      equipoId: orden[0].equipo_id || null,
      embarcacionId: orden[0].embarcacion_id || null,
      sistema: orden[0].sistema || "",
      modoTop, ultimaOT: orden[0], ots: orden,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}
