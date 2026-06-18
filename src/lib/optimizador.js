// ============================================================
//  Optimizador de Ventana: Mantenimiento vs Pesca.
//  Dado el estado de mantenimiento de cada nave, calcula la
//  urgencia, prioriza las tareas para la recalada y recomienda
//  si la nave debe quedarse en puerto o zarpar.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

import { scoreBacklog } from "./operacional";
import { riesgoFlota } from "./riesgo";
import { HH_DEFAULT_POR_PM } from "./planificacion";

// ── Helpers internos ──────────────────────────────────────────
function hhTarea(tarea) {
  return Math.max(1, Number(tarea?.horas_estimadas || HH_DEFAULT_POR_PM) || HH_DEFAULT_POR_PM);
}

// Stock disponible de repuestos vinculados a un equipo.
// → { ok: true|false, faltantes: n }
function estadoRepuestos(equipoId, destinos, stock) {
  const linked = (destinos || []).filter((d) => d.equipo_id === equipoId).map((d) => d.item_id);
  if (linked.length === 0) return { ok: true, faltantes: 0 };
  let faltantes = 0;
  for (const itemId of linked) {
    const total = (stock || [])
      .filter((s) => s.item_id === itemId)
      .reduce((sum, s) => sum + (Number(s.cantidad) || 0), 0);
    if (total <= 0) faltantes++;
  }
  return { ok: faltantes === 0, faltantes };
}

// ── Urgencia de mantenimiento (0-100) ────────────────────────
// planesEvalEmb: planes de evaluarPlanes() filtrados a esta nave.
// riesgoEmb: items del ranking de riesgoFlota() filtrados a esta nave.
// otsEmb: OTs abiertas (no cerradas, no canceladas) de esta nave.
// → { score, nivel, motivos }
export function urgenciaMantenimiento({ planesEvalEmb = [], riesgoEmb = [], otsEmb = [] } = {}) {
  let pts = 0;
  const motivos = [];

  // 1. PMs vencidos por criticidad del equipo
  const pmRojosA = (planesEvalEmb || []).filter((p) => p.tone === "red" && p.equipo?.criticidad === "A");
  const pmRojosB = (planesEvalEmb || []).filter((p) => p.tone === "red" && p.equipo?.criticidad !== "A");
  if (pmRojosA.length > 0) {
    pts += Math.min(60, pmRojosA.length * 35);
    motivos.push(`${pmRojosA.length} PM${pmRojosA.length > 1 ? "s" : ""} vencido${pmRojosA.length > 1 ? "s" : ""} en equipo crítico A`);
  }
  if (pmRojosB.length > 0) {
    pts += Math.min(20, pmRojosB.length * 10);
    if (!pmRojosA.length) motivos.push(`${pmRojosB.length} PM${pmRojosB.length > 1 ? "s" : ""} vencido${pmRojosB.length > 1 ? "s" : ""}`);
  }

  // 2. Equipos en zona roja
  const enRojo = (riesgoEmb || []).filter((r) => r.zona === "roja");
  if (enRojo.length > 0) {
    pts += Math.min(40, enRojo.length * 20);
    motivos.push(`${enRojo.length} equipo${enRojo.length > 1 ? "s" : ""} en zona de riesgo roja`);
  }

  // 3. OTs abiertas por prioridad
  const otsCrit = (otsEmb || []).filter((o) => o.prioridad === "critica");
  const otsAlta = (otsEmb || []).filter((o) => o.prioridad === "alta");
  if (otsCrit.length > 0) {
    pts += Math.min(35, otsCrit.length * 25);
    motivos.push(`${otsCrit.length} OT${otsCrit.length > 1 ? "s" : ""} de prioridad crítica abierta${otsCrit.length > 1 ? "s" : ""}`);
  }
  if (otsAlta.length > 0) {
    pts += Math.min(15, otsAlta.length * 8);
    if (otsAlta.length >= 3) motivos.push(`${otsAlta.length} OTs de prioridad alta`);
  }

  const score = Math.min(100, pts);
  const nivel = score >= 60 ? "critico" : score >= 35 ? "urgente" : score >= 15 ? "moderado" : "bajo";
  return { score, nivel, motivos };
}

// ── Lista de tareas priorizada ────────────────────────────────
// Mezcla PMs pendientes (rojo/amarillo) + OTs abiertas, ordena por
// riesgo y añade estado de repuestos y HH acumuladas.
export function priorizarTareas({
  planesEvalEmb = [],
  otsEmb        = [],
  equipos       = [],
  stock         = [],
  destinos      = [],
  hoy,
} = {}) {
  const eqById = new Map((equipos || []).map((e) => [e.id, e]));
  const tareas = [];

  // OTs abiertas
  for (const ot of otsEmb || []) {
    const eq  = eqById.get(ot.equipo_id);
    const rep = estadoRepuestos(ot.equipo_id, destinos, stock);
    tareas.push({
      tipo:            "ot",
      id:              ot.id,
      descripcion:     ot.descripcion || ot.sistema || "OT",
      sistema:         eq?.sistema || ot.sistema,
      criticidadEquipo: eq?.criticidad,
      prioridadOt:     ot.prioridad,
      tipoOt:          ot.tipo,
      hhEstimado:      hhTarea(ot),
      partsOk:         rep.ok,
      partsFaltantes:  rep.faltantes,
      score:           scoreBacklog(ot, eq, hoy),
    });
  }

  // Planes PM vencidos o próximos
  for (const pe of planesEvalEmb || []) {
    if (pe.tone === "green") continue;
    const rep   = estadoRepuestos(pe.equipo?.id, destinos, stock);
    const base  = pe.tone === "red" ? 75 : 35;
    const crit  = pe.equipo?.criticidad === "A" ? 20 : pe.equipo?.criticidad === "B" ? 8 : 0;
    tareas.push({
      tipo:            "pm",
      id:              pe.plan?.id,
      descripcion:     pe.plan?.descripcion || "Plan PM",
      sistema:         pe.equipo?.sistema,
      criticidadEquipo: pe.equipo?.criticidad,
      tone:            pe.tone,
      hhEstimado:      hhTarea(pe.plan),
      partsOk:         rep.ok,
      partsFaltantes:  rep.faltantes,
      score:           base + crit,
    });
  }

  tareas.sort((a, b) => b.score - a.score);

  let hhAcum = 0;
  return tareas.map((t) => { hhAcum += t.hhEstimado; return { ...t, hhAcumulado: hhAcum }; });
}

// ── Ventana de tiempo requerida ───────────────────────────────
// hhDiariosEquipo: horas de trabajo disponibles por día (default 8h).
// → { hhTotal, diasMinimos, diasRecomendados }
export function calcularVentana(tareas = [], hhDiariosEquipo = 8) {
  const hhTotal       = (tareas || []).reduce((s, t) => s + t.hhEstimado, 0);
  const cap           = Math.max(1, hhDiariosEquipo);
  const diasMinimos   = Math.ceil(hhTotal / cap);
  const diasRecomendados = Math.ceil(diasMinimos * 1.25); // 25% buffer
  return { hhTotal, diasMinimos, diasRecomendados };
}

// ── Recomendación de ventana para una nave ───────────────────
// margenDiario: $/día de margen del armador (null si sin datos).
// → { embarcacion, recomendacion, urgencia, tareas, ventana,
//     margenDiario, costoVentana, riesgoZarpar }
export function optimizarVentana({
  embarcacion,
  planesEvalEmb    = [],
  riesgoEmb        = [],
  otsEmb           = [],
  equipos          = [],
  items            = [],
  stock            = [],
  destinos         = [],
  margenDiario     = null,
  hoy,
  hhDiariosEquipo  = 8,
} = {}) {
  const urgencia = urgenciaMantenimiento({ planesEvalEmb, riesgoEmb, otsEmb });
  const tareas   = priorizarTareas({ planesEvalEmb, otsEmb, equipos, items, stock, destinos, hoy });
  const ventana  = calcularVentana(tareas, hhDiariosEquipo);

  const recomendacion =
    urgencia.score >= 60 ? "mantener_puerto" :
    urgencia.score >= 35 ? "evaluar"         : "zarpar";

  const costoVentana =
    margenDiario != null && ventana.diasRecomendados > 0
      ? Math.round(margenDiario * ventana.diasRecomendados)
      : null;

  const riesgoZarpar =
    urgencia.motivos.length > 0
      ? urgencia.motivos.slice(0, 2).join("; ")
      : "Bajo riesgo operacional.";

  return {
    embarcacion,
    recomendacion,
    urgencia,
    tareas,
    ventana,
    margenDiario,
    costoVentana,
    riesgoZarpar,
  };
}

// ── Optimización de toda la flota ────────────────────────────
// margenDiarioPorEmb: Map<embId, number|null>  (opcional).
// Retorna array ordenado por urgencia.score desc.
export function optimizarFlota({
  embarcaciones        = [],
  equipos              = [],
  planesEval           = [],
  ots                  = [],
  items                = [],
  stock                = [],
  destinos             = [],
  margenDiarioPorEmb   = new Map(),
  hoy,
  hhDiariosEquipo      = 8,
} = {}) {
  const ranking = riesgoFlota({ planesEval, ots, equipos, hoy });

  const riesgoByEmb = {};
  for (const r of ranking) {
    const embId = r.equipo?.embarcacion_id;
    if (!riesgoByEmb[embId]) riesgoByEmb[embId] = [];
    riesgoByEmb[embId].push(r);
  }

  const eqByEmb = {};
  for (const e of equipos || []) {
    if (!eqByEmb[e.embarcacion_id]) eqByEmb[e.embarcacion_id] = [];
    eqByEmb[e.embarcacion_id].push(e);
  }

  return (embarcaciones || [])
    .map((emb) => {
      const eqsEmb      = eqByEmb[emb.id]             || [];
      const planesEvalEmb = (planesEval || []).filter((p) => p.equipo?.embarcacion_id === emb.id);
      const otsEmb      = (ots || []).filter((o) => o.embarcacion_id === emb.id && !["cerrada", "cancelada"].includes(o.estado));
      const riesgoEmb   = riesgoByEmb[emb.id]         || [];
      const margenDiario = margenDiarioPorEmb instanceof Map ? (margenDiarioPorEmb.get(emb.id) ?? null) : null;
      return optimizarVentana({
        embarcacion: emb, planesEvalEmb, riesgoEmb, otsEmb,
        equipos: eqsEmb, items, stock, destinos, margenDiario, hoy, hhDiariosEquipo,
      });
    })
    .sort((a, b) => b.urgencia.score - a.urgencia.score);
}
