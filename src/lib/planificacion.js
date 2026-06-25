// ============================================================
//  Lógica pura: Planificación de Ventana de Puerto + Curva PM.
//  Proyecta vencimientos de planes PM y los cruza con la
//  disponibilidad de la nave en puerto para armar el plan de
//  mantenimiento de la recalada.
// ============================================================

const DIA_MS = 86_400_000;
export const HH_DEFAULT_POR_PM = 4; // h estimadas por PM si no hay dato

// Tasa de uso de un equipo en h/día, a partir de sus últimas dos lecturas.
// lecturas: array de { horas, fecha } ya filtrado al equipo, cualquier orden.
// → h/día o null si no hay ≥2 lecturas con delta positivo.
export function tasaHorasDia(lecturas = []) {
  if (!lecturas || lecturas.length < 2) return null;
  const sorted = [...lecturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const [last, prev] = sorted;
  const dias  = (new Date(last.fecha) - new Date(prev.fecha)) / DIA_MS;
  const delta = (Number(last.horas) || 0) - (Number(prev.horas) || 0);
  return dias > 0 && delta > 0 ? delta / dias : null;
}

// Días hasta que vence un PM (negativo = ya vencido).
// planEval: { elapsed, limite, esCalendario } — salida de evaluarPlanes().
// tasa: h/día del equipo (sólo relevante para PM por horas).
// → número de días o null si no se puede proyectar.
export function diasHastaPM(planEval, tasa = null) {
  if (!planEval || planEval.limite <= 0) return null;
  if (!Number.isFinite(planEval.elapsed)) return null; // sin historial → no proyectar
  const restante = planEval.limite - planEval.elapsed;
  if (planEval.esCalendario) return restante;          // ya está en días
  if (tasa == null || tasa <= 0) return null;          // no hay tasa → no se puede proyectar
  return restante / tasa;                               // h / (h/día) = días
}

// Proyecta todos los planes PM con fecha estimada de vencimiento.
// planesEval: salida de evaluarPlanes().
// tasasPorEquipo: Map<equipo_id, h/día>.
// hoy: "YYYY-MM-DD".
// → [{ ...planEval, diasHasta, fechaEstimada }] ordenado por diasHasta asc.
export function proyectarVencimientos(planesEval = [], tasasPorEquipo, hoy) {
  const base = new Date(hoy + "T00:00:00");
  return (planesEval || [])
    .map((pe) => {
      const tasa = tasasPorEquipo?.get(pe.equipo?.id) ?? null;
      const dias = diasHastaPM(pe, tasa);
      if (dias == null) return null;
      const fechaEstimada = new Date(base.getTime() + Math.round(dias) * DIA_MS)
        .toISOString().slice(0, 10);
      return { ...pe, diasHasta: Math.round(dias), fechaEstimada };
    })
    .filter(Boolean)
    .sort((a, b) => a.diasHasta - b.diasHasta);
}

// Curva de carga semanal: cuántos PMs caen en cada semana del horizonte.
// proyecciones: salida de proyectarVencimientos.
// semanas: número de semanas a proyectar (8-12 recomendado).
// hhPorPM: h estimadas por PM (default HH_DEFAULT_POR_PM).
// → [{ semana, inicioISO, finISO, pms, count, hhTotal, esPico }]
export function curvaCargaSemanal(proyecciones = [], hoy, semanas = 12, hhPorPM = HH_DEFAULT_POR_PM) {
  const base = new Date(hoy + "T00:00:00");
  const weeks = Array.from({ length: semanas }, (_, i) => {
    const ini = new Date(base.getTime() + i * 7 * DIA_MS);
    const fin = new Date(ini.getTime() + 7 * DIA_MS);
    const inicioISO = ini.toISOString().slice(0, 10);
    const finISO   = fin.toISOString().slice(0, 10);
    const pms = (proyecciones || []).filter(
      (p) => p.fechaEstimada >= inicioISO && p.fechaEstimada < finISO
    );
    return { semana: i + 1, inicioISO, finISO, pms, count: pms.length, hhTotal: pms.length * hhPorPM };
  });
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  return weeks.map((w) => ({ ...w, esPico: maxCount > 2 && w.count >= maxCount * 0.75 }));
}

// Estado de la ventana de puerto de una nave.
// Determina si está en puerto, cuántos días lleva, y la duración típica
// del turno en puerto a partir del historial de mareas.
// → { enPuerto, inicio, diasEnPuerto, duracionTipica, proximaRecalada? }
export function ventanaPuerto(mareas = [], embId, hoy) {
  const hoyD   = new Date(hoy + "T00:00:00");
  const embMs  = (mareas || [])
    .filter((m) => m.embarcacion_id === embId)
    .sort((a, b) => new Date(b.zarpe_at) - new Date(a.zarpe_at));

  // Duración típica en puerto: mediana del gap entre mareas consecutivas
  const gaps = [];
  for (let i = 0; i < embMs.length - 1; i++) {
    const next = embMs[i], prev = embMs[i + 1];
    if (next.zarpe_at && prev.recalada_at) {
      const g = (new Date(next.zarpe_at) - new Date(prev.recalada_at)) / DIA_MS;
      if (g > 0 && g <= 60) gaps.push(g);
    }
  }
  const duracionTipica = gaps.length
    ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    : 5;

  // Duración típica de marea (para estimar próxima recalada)
  const voyages = embMs
    .filter((m) => m.zarpe_at && m.recalada_at)
    .map((m) => (new Date(m.recalada_at) - new Date(m.zarpe_at)) / DIA_MS)
    .filter((d) => d > 0 && d < 45);
  const durVoyage = voyages.length
    ? voyages.reduce((s, d) => s + d, 0) / voyages.length
    : 10;

  const ultima = embMs[0];
  if (!ultima) return { enPuerto: true, inicio: null, diasEnPuerto: 0, duracionTipica, durVoyage };

  if (ultima.estado !== "navegando" && ultima.recalada_at) {
    const inicio      = ultima.recalada_at.slice(0, 10);
    const diasEnPuerto = Math.max(0, (hoyD - new Date(inicio + "T00:00:00")) / DIA_MS);
    return { enPuerto: true, inicio, diasEnPuerto, duracionTipica, durVoyage };
  }

  // En mar → estima próxima recalada
  const proximaRecalada = new Date(
    new Date(ultima.zarpe_at).getTime() + durVoyage * DIA_MS
  ).toISOString().slice(0, 10);
  return { enPuerto: false, inicio: null, diasEnPuerto: 0, duracionTipica, durVoyage, proximaRecalada };
}

// PMs y OTs recomendados para ejecutar en la próxima ventana de una nave.
// horizonDias: días hacia adelante que se consideran "dentro de la ventana".
// hhDisponibles: HH totales disponibles en la ventana (dias × HH/día).
// → { pms: [...proyecciones], ots: [...ots], hhPMs, hhOTs, hhTotal, sobreCarga }
export function trabajosEnVentana(proyecciones = [], ots = [], embId, horizonDias, hhDisponibles, hoy, hhPorPM = HH_DEFAULT_POR_PM) {
  const pms = (proyecciones || []).filter(
    (p) => p.equipo?.embarcacion_id === embId && p.diasHasta <= horizonDias
  );
  const otsNave = (ots || []).filter(
    (o) => o.embarcacion_id === embId && o.estado !== "cerrada"
  );
  const hhPMs  = pms.length * hhPorPM;
  const hhOTs  = otsNave.reduce((s, o) => s + (Number(o.horas_estimadas) || 0), 0);
  const hhTotal = hhPMs + hhOTs;
  return {
    pms,
    ots: otsNave,
    hhPMs,
    hhOTs,
    hhTotal,
    sobreCarga: hhDisponibles > 0 && hhTotal > hhDisponibles,
  };
}
