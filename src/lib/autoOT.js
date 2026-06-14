// ============================================================
//  Motor de generación automática de OTs (CMMS autónomo · Fase 1)
//
//  Disparador: PLAN PREVENTIVO VENCIDO. Cuando un plan PM por horómetro
//  supera su intervalo (o un plan calendario su período), el motor propone
//  una OT preventiva. Es el tramo de mayor confianza del lazo autónomo:
//  determinístico, sin estadística, con los datos que ya fluyen al sistema.
//
//  Idempotencia por HUELLA — pm:{plan_id}:{hito}. Mientras el PM siga
//  pendiente el hito (horas_ult_pm / fecha_ult_pm) no cambia → la huella es
//  estable → el motor NO regenera la misma OT en cada corrida. Al registrarse
//  el PM el hito avanza → huella nueva → se habilita la OT del próximo ciclo.
//  Esto es lo que evita el "spam de OTs" que mata a estos sistemas.
//
//  Explicabilidad — cada sugerencia carga su `motivo` y los números que la
//  dispararon (horas actuales vs intervalo, o días vencidos). Sin esto el
//  operador no confía en la OT y la ignora.
//
//  Pura: sin red ni UI. La persistencia (confirmar → OT firme) vive en la
//  capa de componentes; aquí solo se decide QUÉ debería generarse.
// ============================================================

import { evaluarPlanes } from "./pm.js";

// Centinela de exceso para vencidos sin métrica finita (calendario nunca
// ejecutado → elapsed Infinity). Ordena primero sin contaminar con Infinity.
const EXCESO_MAX = Number.MAX_SAFE_INTEGER;

// Huella determinística de la OT preventiva pendiente de un plan.
// Estable mientras el PM no se ejecute; cambia cuando el hito avanza.
export function huellaPM(plan) {
  if (!plan?.id) return null;
  const base = plan.tipo_disparador === "calendario"
    ? (plan.fecha_ult_pm || "inicio")
    : (plan.horas_ult_pm ?? 0);
  return `pm:${plan.id}:${base}`;
}

// Prioridad sugerida según el semáforo (mismo criterio que PlanPM).
function prioridadDe(tone) {
  return tone === "red" ? "alta" : tone === "yellow" ? "media" : "baja";
}

// Descripción normalizada de la OT (mismo formato que PlanPM.registrarPM).
function descripcionDe(plan) {
  const d = plan.descripcion || "Mantención preventiva";
  return plan.tipo_disparador === "calendario"
    ? `PM Cal · ${d}`
    : `PM ${plan.intervalo_horas || "?"}h · ${d}`;
}

// Motivo legible: por qué se dispara esta OT (explicabilidad).
function motivoDe(plan, equipo, elapsed, limite) {
  if (plan.tipo_disparador === "calendario") {
    if (!Number.isFinite(elapsed)) return "Plan calendario nunca ejecutado — vencido";
    return `Calendario vencido hace ${Math.max(0, Math.round(elapsed - limite))} día(s) (período ${limite} d)`;
  }
  const horas = Math.round(equipo?.horas_actual || 0);
  const exceso = Math.max(0, Math.round(elapsed - limite));
  return `Horómetro ${horas} h supera el PM de ${limite} h (último a ${plan.horas_ult_pm ?? 0} h · +${exceso} h)`;
}

// Motor: dado el estado actual de planes/equipos/OTs, devuelve las OTs que
// deberían generarse, ya deduplicadas por huella contra las OTs existentes.
//
// opts.incluirProximos: si true, también propone los planes 'amarillos'
//   (≥90% del intervalo) como preventivo anticipado. Por defecto solo
//   vencidos (rojos) → máxima precisión, mínima fatiga de alertas.
//
// → { sugerencias, yaCubiertas, total }
//    sugerencias: [{ huella, plan_id, equipo_id, embarcacion_id, sistema,
//                    tipo, prioridad, descripcion, motivo, tone,
//                    horas_actual, elapsed, limite, exceso }]
//    yaCubiertas: vencidos cuya huella YA existe en una OT (transparencia:
//                 "3 vencidos ya tienen OT, no se duplican")
export function generarOTsPreventivas({ planes = [], equipos = [], ots = [] } = {}, opts = {}) {
  const { incluirProximos = false } = opts;
  const huellasExistentes = new Set((ots || []).map((o) => o?.huella).filter(Boolean));

  const sugerencias = [];
  const yaCubiertas = [];

  for (const ev of evaluarPlanes(planes, equipos)) {
    const { plan, equipo, tone, elapsed, limite } = ev;
    const disparar = tone === "red" || (incluirProximos && tone === "yellow");
    if (!disparar) continue;
    if (!equipo) continue;                 // sin equipo no hay dónde colgar la OT

    const huella = huellaPM(plan);
    if (huella && huellasExistentes.has(huella)) {
      yaCubiertas.push({ huella, plan_id: plan.id, equipo_id: equipo.id, sistema: equipo.sistema || "", tone });
      continue;
    }

    const exceso = Number.isFinite(elapsed) ? elapsed - limite : EXCESO_MAX;
    sugerencias.push({
      huella,
      plan_id: plan.id,
      equipo_id: equipo.id,
      embarcacion_id: equipo.embarcacion_id || null,
      sistema: equipo.sistema || "",
      tipo: "preventivo",
      prioridad: prioridadDe(tone),
      descripcion: descripcionDe(plan),
      motivo: motivoDe(plan, equipo, elapsed, limite),
      tone,
      horas_actual: equipo.horas_actual || 0,
      elapsed,
      limite,
      exceso,
    });
  }

  // Más vencidos primero (mayor exceso sobre el límite).
  sugerencias.sort((a, b) => b.exceso - a.exceso);
  return { sugerencias, yaCubiertas, total: sugerencias.length };
}
