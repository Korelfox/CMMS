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

export const LABEL_UNIDAD_PLURAL = {
  diario:      "días",
  semanal:     "semanas",
  mensual:     "meses",
  trimestral:  "trimestres",
  semestral:   "semestres",
  anual:       "años",
};

// "1 mes", "3 meses", "2 semanas", etc.
export function labelIntervaloCalendario(unidad, intervalo = 1) {
  const n = intervalo || 1;
  return `${n} ${n === 1 ? (LABEL_UNIDAD[unidad] || unidad) : (LABEL_UNIDAD_PLURAL[unidad] || unidad)}`;
}

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

// Schedule compliance para planes de tipo CALENDARIO.
// Evalúa si la brecha entre ejecuciones consecutivas (por fecha) estuvo
// dentro del intervalo + tolerancia, igual que scheduleCompliance para horas.
export function scheduleComplianceCalendario(historial = [], planes = [], tolerancia = TOLERANCIA_PM) {
  const planDe = new Map(
    (planes || []).filter((p) => p?.tipo_disparador === "calendario" && p?.unidad_calendario)
      .map((p) => [p.id, p])
  );

  const porPlanEjec = new Map();
  for (const h of historial || []) {
    if (!h?.fecha_realizacion || !h?.plan_pm_id) continue;
    if (!planDe.has(h.plan_pm_id)) continue;
    if (!porPlanEjec.has(h.plan_pm_id)) porPlanEjec.set(h.plan_pm_id, []);
    porPlanEjec.get(h.plan_pm_id).push(h.fecha_realizacion);
  }

  let evaluadas = 0, aTiempo = 0;
  const porPlan = new Map();
  for (const [planId, fechas] of porPlanEjec) {
    const plan = planDe.get(planId);
    const totalDias = totalDiasCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1);
    const limite = totalDias * (1 + tolerancia);
    const orden = fechas.slice().sort();
    let ev = 0, ok = 0;
    for (let i = 1; i < orden.length; i++) {
      const gap = Math.floor(
        (new Date(orden[i] + "T00:00:00") - new Date(orden[i - 1] + "T00:00:00")) / 86_400_000
      );
      ev++;
      if (gap <= limite) ok++;
    }
    if (ev > 0) porPlan.set(planId, { evaluadas: ev, aTiempo: ok });
    evaluadas += ev; aTiempo += ok;
  }

  return { evaluadas, aTiempo, pct: evaluadas > 0 ? (aTiempo / evaluadas) * 100 : null, porPlan };
}

// Combina compliance de horas y calendario en un único indicador.
export function scheduleComplianceCombinado(historial = [], planes = [], tolerancia = TOLERANCIA_PM) {
  const h = scheduleCompliance(historial, planes, tolerancia);
  const c = scheduleComplianceCalendario(historial, planes, tolerancia);
  const ev = h.evaluadas + c.evaluadas;
  const ok = h.aTiempo + c.aTiempo;
  return { evaluadas: ev, aTiempo: ok, pct: ev > 0 ? (ok / ev) * 100 : null };
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

// Semáforo para planes de tipo HORAS (compartido por PlanPM, Alertas y Tablero).
export function statusPlan(elapsed, intervalo) {
  if (elapsed >= intervalo)          return ["red",    "Vencido"];
  if (elapsed >= intervalo * 0.9)    return ["yellow", "Próximo"];
  return                                    ["green",  "OK"];
}

// ============================================================
//  Evaluación de TODOS los planes PM — única fuente de verdad
//  del semáforo para Alertas, Tablero y PlanPM. Respeta el
//  intervalo propio de cada plan, su hito (horas/fecha del
//  último PM) y los disparadores por calendario.
// ============================================================
// planes:  filas de planes_pm · equipos: filas de equipos
// → [{ plan, equipo, esCalendario, elapsed, limite, tone, label }]
//   horas:      elapsed/limite en horas (equipo.horas_actual ya viene
//               materializado con herencia desde Horómetros)
//   calendario: elapsed/limite en días (elapsed = Infinity si nunca se hizo)
// Outer key = planes reference, inner key = equipos reference.
// Stable references from fleetCache → result shared across all modules in the same session.
const _evalMemo = new WeakMap();

export function evaluarPlanes(planes = [], equipos = []) {
  const safePlanes  = planes  || [];
  const safeEquipos = equipos || [];
  if (!safePlanes.length) return [];
  let byEq = _evalMemo.get(safePlanes);
  if (!byEq) { byEq = new WeakMap(); _evalMemo.set(safePlanes, byEq); }
  if (!byEq.has(safeEquipos)) byEq.set(safeEquipos, _computeEvaluarPlanes(safePlanes, safeEquipos));
  return byEq.get(safeEquipos);
}

function _computeEvaluarPlanes(planes, equipos) {
  const eqById = new Map(equipos.map((e) => [e.id, e]));
  return planes
    .filter((p) => p && p.activo !== false)
    .map((p) => {
      const eq = eqById.get(p.equipo_id) || null;
      const esCalendario = p.tipo_disparador === "calendario";
      if (esCalendario) {
        // Sin historial: el operador aún no ingresó el último PM.
        // Mostrar gris para diferenciarlo de un plan genuinamente vencido.
        if (p.fecha_ult_pm == null) {
          const limite = totalDiasCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1);
          return { plan: p, equipo: eq, esCalendario, elapsed: Infinity, limite, tone: "slate", label: "Sin historial" };
        }
        const elapsed = diasDesde(p.fecha_ult_pm);
        const limite  = totalDiasCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1);
        const [tone, label] = statusPlanCalendario(elapsed, p.unidad_calendario, p.intervalo_calendario ?? 1);
        return { plan: p, equipo: eq, esCalendario, elapsed, limite, tone, label };
      }
      // Sin historial de horas: horas_ult_pm null = nunca configurado.
      if (p.horas_ult_pm == null) {
        const limite = Number(p.intervalo_horas) || 0;
        return { plan: p, equipo: eq, esCalendario, elapsed: 0, limite, tone: "slate", label: "Sin historial" };
      }
      const elapsed = (eq?.horas_actual || 0) - (p.horas_ult_pm || 0);
      const limite  = Number(p.intervalo_horas) || 0;
      const [tone, label] = limite > 0 ? statusPlan(elapsed, limite) : ["green", "OK"];
      return { plan: p, equipo: eq, esCalendario, elapsed, limite, tone, label };
    });
}
