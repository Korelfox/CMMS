// ============================================================
//  Análisis de desgaste y vida remanente de equipos.
//  Cruza las lecturas de horómetro con los planes PM de horas
//  para proyectar cuándo vencerá cada plan según el ritmo de
//  uso real (h/día). Alimenta el contexto de la IA.
//  Puro y testeble: sin llamadas a BD ni efectos secundarios.
// ============================================================

import { puntoHorometro, tendenciaHorasDia, diasHasta } from "./horometro.js";

// Agrupa lecturas_horometro por el id del punto propio al que pertenecen.
// lecturas: [{equipo_id, fecha, horas}]
// byId: Map<id, equipo>
export function agruparLecturasPorPunto(lecturas, equipos, byId) {
  const grupo = new Map();
  for (const l of lecturas || []) {
    const eq = byId.get(l.equipo_id);
    if (!eq) continue;
    const puntoId = puntoHorometro(eq, byId);
    if (!puntoId) continue;
    if (!grupo.has(puntoId)) grupo.set(puntoId, []);
    grupo.get(puntoId).push({ fecha: l.fecha, horas: Number(l.horas) });
  }
  return grupo;
}

// Analiza el desgaste de la flota combinando planesEval (evaluarPlanes)
// con el historial de lecturas de horómetro.
//
// Devuelve un objeto compacto apto para inyectar en el contexto IA:
//   estadisticas, puntosTendencia, topDesgaste, venceranProximo, altaIntensidad
export function analizarDesgasteFlota({
  planesEval    = [],
  lecturas      = [],
  equipos       = [],
  embarcaciones = [],
} = {}) {
  const byId     = new Map((equipos || []).map((e) => [e.id, e]));
  const embsById = new Map((embarcaciones || []).map((e) => [e.id, e]));

  // Tendencia por punto propio (h/día)
  const lectPorPunto = agruparLecturasPorPunto(lecturas, equipos, byId);
  const tendPorPunto = new Map();
  for (const [puntoId, lects] of lectPorPunto) {
    tendPorPunto.set(puntoId, tendenciaHorasDia(lects));
  }

  // Proyección de vida por plan (solo planes de horas con intervalo > 0)
  const proyecciones = (planesEval || [])
    .filter((p) => !p.esCalendario && p.limite > 0 && p.equipo)
    .map((p) => {
      const eq = p.equipo;
      const puntoId = puntoHorometro(eq, byId);
      const trend   = puntoId != null ? (tendPorPunto.get(puntoId) ?? null) : null;
      const vidaPct = p.elapsed != null
        ? Math.min(Math.round((p.elapsed / p.limite) * 100), 999)
        : null;
      const horasRest = p.limite - (p.elapsed || 0);
      const diasRest  = horasRest > 0 && trend != null
        ? Math.round(diasHasta(0, horasRest, trend) ?? 0)
        : horasRest <= 0 ? 0 : null;
      const emb = embsById.get(eq.embarcacion_id);
      return {
        planNombre:    p.plan?.nombre || p.plan?.descripcion || "—",
        equipo:        eq.sistema || eq.id_visible || "—",
        nave:          emb?.nombre || emb?.codigo || "—",
        criticidad:    eq.criticidad || "—",
        horasActual:   eq.horas_actual || 0,
        tendenciaHDia: trend != null ? Math.round(trend * 10) / 10 : null,
        vidaPct,
        diasHastaVence: diasRest,
        tone:          p.tone,
      };
    });

  // Estadísticas generales
  const conTend = proyecciones.filter((p) => p.tendenciaHDia != null);
  const avgTend = conTend.length > 0
    ? Math.round(conTend.reduce((s, p) => s + p.tendenciaHDia, 0) / conTend.length * 10) / 10
    : null;

  const criticos    = proyecciones.filter((p) => p.vidaPct != null && p.vidaPct >= 90);
  const proximos    = proyecciones.filter((p) => p.vidaPct != null && p.vidaPct >= 75 && p.vidaPct < 90);
  const vence30     = proyecciones.filter((p) => p.diasHastaVence != null && p.diasHastaVence > 0 && p.diasHastaVence <= 30);
  const altaIntens  = proyecciones.filter((p) => p.tendenciaHDia != null && p.tendenciaHDia > 18);

  // Resumen de puntos propios (los motores / máquinas que tienen horómetro)
  const puntosTendencia = (equipos || [])
    .filter((e) => e.horometro === "propio" && (e.horas_actual > 0 || lectPorPunto.has(e.id)))
    .map((e) => {
      const trend = tendPorPunto.get(e.id) ?? null;
      const lects = lectPorPunto.get(e.id) || [];
      const emb   = embsById.get(e.embarcacion_id);
      const sorted = lects.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return {
        equipo:        e.sistema || e.id_visible || "—",
        nave:          emb?.nombre || emb?.codigo || "—",
        horasActual:   e.horas_actual || 0,
        tendenciaHDia: trend != null ? Math.round(trend * 10) / 10 : null,
        lecturasN:     lects.length,
        ultimaLectura: sorted[0]?.fecha?.slice(0, 10) ?? null,
      };
    })
    .sort((a, b) => (b.horasActual || 0) - (a.horasActual || 0))
    .slice(0, 10);

  return {
    estadisticas: {
      planesConDatos:     proyecciones.length,
      planesConTendencia: conTend.length,
      avgTendenciaHDia:   avgTend,
      enDesgasteCritico:  criticos.length,
      enDesgasteProximo:  proximos.length,
      venceranEn30d:      vence30.length,
      altaIntensidadN:    altaIntens.length,
    },
    puntosTendencia,
    topDesgaste: proyecciones
      .filter((p) => p.vidaPct != null)
      .sort((a, b) => (b.vidaPct || 0) - (a.vidaPct || 0))
      .slice(0, 8),
    venceranProximo: vence30
      .sort((a, b) => (a.diasHastaVence || 9999) - (b.diasHastaVence || 9999))
      .slice(0, 8),
    altaIntensidad: altaIntens
      .sort((a, b) => (b.tendenciaHDia || 0) - (a.tendenciaHDia || 0))
      .slice(0, 5),
  };
}
