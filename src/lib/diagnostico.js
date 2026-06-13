// ============================================================
//  Diagnóstico asistido de fallas.
//  Ensambla el contexto estructurado que alimenta el diagnóstico
//  redactado por IA: ficha del equipo, su historial de fallas
//  codificadas (ISO 14224), fallas similares en la flota y los
//  repuestos vinculados con su stock. Puro y testeable; la llamada
//  a Claude vive en la Edge Function.
// ============================================================

import { MODOS_FALLA_ISO, CAUSAS_FALLA_ISO, MECANISMOS_FALLA_ISO } from "./fallasISO";

const MODO_MAP = Object.fromEntries(MODOS_FALLA_ISO.map((m) => [m.value, m.label]));
const CAUSA_MAP = Object.fromEntries(CAUSAS_FALLA_ISO.map((m) => [m.value, m.label]));
const MEC_MAP = Object.fromEntries(MECANISMOS_FALLA_ISO.map((m) => [m.value, m.label]));

const lbl = (map, v) => (v ? (map[v] || v) : null);

export function nombreNave(embarcaciones = [], id) {
  const e = (embarcaciones || []).find((x) => x.id === id);
  return e?.nombre || e?.codigo || "—";
}

// Historial de correctivas cerradas de UN equipo, con códigos ISO resueltos.
// → [{ fecha, descripcion, modoFalla, causaFalla, mecanismo, mttrHoras }] desc.
export function historialFallasEquipo(ots = [], equipoId) {
  return (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.estado === "cerrada")
    .map((o) => ({
      fecha: o.fecha ? o.fecha.slice(0, 10) : null,
      descripcion: (o.descripcion || "").trim(),
      modoFalla: lbl(MODO_MAP, o.modo_falla),
      causaFalla: lbl(CAUSA_MAP, o.causa_falla),
      mecanismo: lbl(MEC_MAP, o.mecanismo_falla),
      mttrHoras: o.mttr_horas != null ? Number(o.mttr_horas) : null,
    }))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

// Fallas similares: correctivas cerradas de OTROS equipos del mismo sistema
// en toda la flota (patrón de falla del tipo de equipo).
export function fallasSimilares(ots = [], embarcaciones = [], sistema, equipoId, equiposById, n = 6) {
  if (!sistema) return [];
  const sysNorm = sistema.trim().toLowerCase();
  return (ots || [])
    .filter((o) => {
      if (o.tipo !== "correctivo" || o.estado !== "cerrada") return false;
      if (o.equipo_id === equipoId) return false;
      const sys = (o.sistema || equiposById?.get(o.equipo_id)?.sistema || "").trim().toLowerCase();
      return sys && sys === sysNorm;
    })
    .map((o) => ({
      nave: nombreNave(embarcaciones, o.embarcacion_id),
      fecha: o.fecha ? o.fecha.slice(0, 10) : null,
      descripcion: (o.descripcion || "").trim(),
      modoFalla: lbl(MODO_MAP, o.modo_falla),
      causaFalla: lbl(CAUSA_MAP, o.causa_falla),
    }))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .slice(0, n);
}

// Repuestos vinculados al equipo (inventario_item_destinos) con stock total.
export function repuestosDeEquipo(items = [], destinos = [], stock = [], equipoId) {
  const itemIds = new Set((destinos || []).filter((d) => d.equipo_id === equipoId).map((d) => d.item_id));
  if (itemIds.size === 0) return [];
  const stockPorItem = new Map();
  (stock || []).forEach((s) => {
    if (itemIds.has(s.item_id)) stockPorItem.set(s.item_id, (stockPorItem.get(s.item_id) || 0) + (Number(s.cantidad) || 0));
  });
  return (items || [])
    .filter((it) => itemIds.has(it.id))
    .map((it) => ({
      codigo: it.codigo || "—",
      descripcion: it.descripcion || "—",
      unidad: it.unidad || "Un",
      stock: stockPorItem.get(it.id) || 0,
    }));
}

// Resumen rápido del historial: total, MTTR promedio, modo más frecuente.
export function resumenFallas(historial = []) {
  const total = historial.length;
  const mttrs = historial.map((h) => h.mttrHoras).filter((v) => v != null && v > 0);
  const mttrPromedio = mttrs.length ? Math.round((mttrs.reduce((s, v) => s + v, 0) / mttrs.length) * 10) / 10 : null;
  const freq = new Map();
  historial.forEach((h) => { if (h.modoFalla) freq.set(h.modoFalla, (freq.get(h.modoFalla) || 0) + 1); });
  let modoMasFrecuente = null, max = 0;
  freq.forEach((c, modo) => { if (c > max) { max = c; modoMasFrecuente = modo; } });
  return { total, mttrPromedio, modoMasFrecuente };
}

// Ensambla el contexto completo del diagnóstico.
export function construirContextoDiagnostico({
  equipo,
  sintoma = "",
  ots = [],
  equipos = [],
  embarcaciones = [],
  items = [],
  destinos = [],
  stock = [],
} = {}) {
  if (!equipo) return null;
  const equiposById = new Map((equipos || []).map((e) => [e.id, e]));
  const historialEquipo = historialFallasEquipo(ots, equipo.id);

  return {
    equipo: {
      idVisible: equipo.id_visible || "—",
      sistema: equipo.sistema || "—",
      subsistema: equipo.subsistema || null,
      marca: equipo.marca || null,
      modelo: equipo.modelo || null,
      criticidad: equipo.criticidad || null,
      horasActual: equipo.horas_actual != null ? Number(equipo.horas_actual) : null,
      nave: nombreNave(embarcaciones, equipo.embarcacion_id),
    },
    sintoma: (sintoma || "").trim(),
    resumen: resumenFallas(historialEquipo),
    historialEquipo,
    fallasSimilares: fallasSimilares(ots, embarcaciones, equipo.sistema, equipo.id, equiposById, 6),
    repuestosVinculados: repuestosDeEquipo(items, destinos, stock, equipo.id),
  };
}
