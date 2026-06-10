// ============================================================
//  Lógica pura de cumplimiento del plan preventivo
//  Schedule Compliance (SMRP): % de PMs ejecutados ANTES de vencer
//  su intervalo (con tolerancia, por defecto +10% del intervalo).
//
//  Reconstrucción del vencimiento desde el historial:
//   vencimiento de la ejecución n = horas de la ejecución (n-1) + intervalo.
//  La PRIMERA ejecución de cada plan no se evalúa (no hay línea base
//  confiable de cuándo "vencía" antes del primer registro).
// ============================================================

export const TOLERANCIA_PM = 0.10; // ventana de gracia: +10% del intervalo

// historial: filas de historial_pm [{ plan_pm_id, horas_realizacion, ... }]
// planes:    filas de planes_pm   [{ id, intervalo_horas, ... }]
// → { evaluadas, aTiempo, pct|null, porPlan: Map(planId → {evaluadas, aTiempo}) }
export function scheduleCompliance(historial = [], planes = [], tolerancia = TOLERANCIA_PM) {
  const intervaloDe = new Map(
    (planes || []).filter((p) => Number(p?.intervalo_horas) > 0)
      .map((p) => [p.id, Number(p.intervalo_horas)]));

  // Agrupa ejecuciones válidas por plan
  const porPlanEjec = new Map();
  for (const h of historial || []) {
    if (h?.horas_realizacion == null) continue;   // sin horas: no evaluable (null ≠ 0 h)
    const horas = Number(h.horas_realizacion);
    if (!h?.plan_pm_id || !Number.isFinite(horas)) continue;
    if (!intervaloDe.has(h.plan_pm_id)) continue;
    if (!porPlanEjec.has(h.plan_pm_id)) porPlanEjec.set(h.plan_pm_id, []);
    porPlanEjec.get(h.plan_pm_id).push(horas);
  }

  let evaluadas = 0, aTiempo = 0;
  const porPlan = new Map();
  for (const [planId, ejecuciones] of porPlanEjec) {
    const intervalo = intervaloDe.get(planId);
    const orden = ejecuciones.slice().sort((a, b) => a - b);
    let ev = 0, ok = 0;
    for (let i = 1; i < orden.length; i++) {   // la 1ª no se evalúa
      const limite = orden[i - 1] + intervalo * (1 + tolerancia);
      ev++;
      if (orden[i] <= limite) ok++;
    }
    if (ev > 0) porPlan.set(planId, { evaluadas: ev, aTiempo: ok });
    evaluadas += ev; aTiempo += ok;
  }

  return { evaluadas, aTiempo, pct: evaluadas > 0 ? (aTiempo / evaluadas) * 100 : null, porPlan };
}

// ============================================================
//  Disparadores de tipo CALENDARIO
// ============================================================

// Días naturales por unidad de calendario
export const DIAS_POR_UNIDAD = {
  diario:      1,
  semanal:     7,
  mensual:     30,
  trimestral:  90,
  semestral:   182,
  anual:       365,
};

export const LABEL_UNIDAD = {
  diario:      "día",
  semanal:     "semana",
  mensual:     "mes",
  trimestral:  "trimestre",
  semestral:   "semestre",
  anual:       "año",
};

// Días transcurridos desde una fecha ISO "YYYY-MM-DD" hasta hoy.
// Si no hay fecha base devuelve Infinity (nunca realizado → siempre vencido).
export function diasDesde(fechaISO) {
  if (!fechaISO) return Infinity;
  const base = new Date(fechaISO + "T00:00:00").getTime();
  return Math.floor((Date.now() - base) / 86_400_000);
}

// Retorna el total de días que representa un intervalo calendario.
export function totalDiasCalendario(unidad, intervalo = 1) {
  return (intervalo || 1) * (DIAS_POR_UNIDAD[unidad] || 1);
}

// Semáforo para planes de tipo calendario.
// diasElapsed: días desde el último PM. unidad: clave de DIAS_POR_UNIDAD.
// → ["red"|"yellow"|"green", "Vencido"|"Próximo"|"OK"]
export function statusPlanCalendario(diasElapsed, unidad, intervalo = 1) {
  const total = totalDiasCalendario(unidad, intervalo);
  if (diasElapsed >= total)         return ["red",    "Vencido"];
  if (diasElapsed >= total * 0.9)   return ["yellow", "Próximo"];
  return                                   ["green",  "OK"];
}
