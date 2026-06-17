// ============================================================
//  Ensambla el "contexto estructurado" que alimenta el informe
//  ejecutivo redactado por IA. Toma las salidas ya calculadas de
//  las libs analíticas (evaluarPlanes, riesgoFlota, presupuestoFlota,
//  coberturaCriticos…) y produce un objeto compacto y de alta señal,
//  más algunos agregados simples. Puro y testeable: la llamada a la
//  API de Claude vive en la Edge Function, no aquí.
// ============================================================

import { scoreBacklog, diasAbierta } from "./operacional";
import { estadoPresupuesto } from "./presupuesto";
import { analizarDesgasteFlota } from "./desgaste";

const DIA_MS = 86_400_000;

export function nombreNave(embarcaciones = [], id) {
  const e = (embarcaciones || []).find((x) => x.id === id);
  return e?.nombre || e?.codigo || "—";
}

// Cuenta PMs por estado a partir de evaluarPlanes().
export function contarPMs(planesEval = []) {
  let vencidos = 0, proximos = 0;
  for (const p of planesEval || []) {
    if (p.tone === "red") vencidos++;
    else if (p.tone === "yellow") proximos++;
  }
  return { vencidos, proximos, total: (planesEval || []).length };
}

// % de OTs cerradas en el período que fueron preventivas (proactividad).
// desdeISO: "YYYY-MM-DD" inicio del período. → number 0-100 | null
export function pctPreventivoPeriodo(ots = [], desdeISO = "") {
  const cerradas = (ots || []).filter(
    (o) => o.estado === "cerrada" && o.fecha && (!desdeISO || o.fecha.slice(0, 10) >= desdeISO)
  );
  if (cerradas.length === 0) return null;
  const prev = cerradas.filter((o) => o.tipo === "preventivo").length;
  return (prev / cerradas.length) * 100;
}

// Conteo de OTs abiertas y cerradas en el período.
export function contarOTs(ots = [], desdeISO = "") {
  let abiertas = 0, cerradasPeriodo = 0;
  for (const o of ots || []) {
    if (o.estado !== "cerrada") abiertas++;
    else if (o.fecha && (!desdeISO || o.fecha.slice(0, 10) >= desdeISO)) cerradasPeriodo++;
  }
  return { abiertas, cerradasPeriodo };
}

// Top-N equipos de mayor riesgo, en forma compacta para el prompt.
export function topRiesgo(ranking = [], embarcaciones = [], n = 5) {
  return (ranking || [])
    .filter((r) => r.score > 0)
    .slice(0, n)
    .map((r) => ({
      equipo: r.equipo?.sistema || r.equipo?.id_visible || "equipo",
      nave: nombreNave(embarcaciones, r.equipo?.embarcacion_id),
      criticidad: r.equipo?.criticidad || "—",
      score: r.score,
      zona: r.zona,
      mtbfDias: r.mtbf != null ? Math.round(r.mtbf) : null,
      motivos: (r.motivos || []).slice(0, 2),
    }));
}

// MTBF promedio de la flota (días) desde el ranking de riesgo.
export function mtbfPromedio(ranking = []) {
  const vals = (ranking || []).map((r) => r.mtbf).filter((v) => v != null);
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

// Top-N del backlog por score de riesgo (criticidad + antigüedad + prioridad).
export function topBacklog(ots = [], equipos = [], embarcaciones = [], hoy, n = 5) {
  const eqById = new Map((equipos || []).map((e) => [e.id, e]));
  return (ots || [])
    .filter((o) => o.estado !== "cerrada")
    .map((o) => {
      const eq = eqById.get(o.equipo_id) || null;
      return { o, eq, score: scoreBacklog(o, eq, hoy) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ o, score }) => ({
      folio: o.folio || "—",
      sistema: o.sistema || "—",
      nave: nombreNave(embarcaciones, o.embarcacion_id),
      prioridad: o.prioridad || "—",
      diasAbierta: diasAbierta(o, hoy),
      score,
    }));
}

// Ensambla el contexto completo que se envía a Claude.
export function construirContextoInforme({
  empresa = "",
  periodo = { label: "", meses: 0, desde: "", hasta: "" },
  embarcaciones = [],
  equipos = [],
  planesEval = [],
  riesgoRanking = [],
  ots = [],
  estadoPorNave = new Map(),
  presupuestoData = [],
  runRateFlota = { mensual: 0, anualProyectado: 0 },
  sinCobertura = [],
  itemsSubdotados = 0,
  lecturas = [],
  hoy,
} = {}) {
  const desdeISO = periodo?.desde || "";
  const anio = Number((hoy || "").slice(0, 4)) || new Date().getFullYear();

  const pmCount = contarPMs(planesEval);
  const otCount = contarOTs(ots, desdeISO);
  const pctPrev = pctPreventivoPeriodo(ots, desdeISO);

  const equiposRiesgoAlto = (riesgoRanking || []).filter((r) => r.zona === "roja").length;
  const equiposRiesgoMedio = (riesgoRanking || []).filter((r) => r.zona === "amarilla").length;

  // Costos a nivel flota
  const gastoAnioFlota = (presupuestoData || []).reduce((s, e) => s + (e.gasto?.total || 0), 0);
  const presupuestoFlotaTotal = (presupuestoData || []).reduce((s, e) => s + (e.ppto || 0), 0);
  const estFlota = estadoPresupuesto(gastoAnioFlota, presupuestoFlotaTotal, hoy, anio);

  const porNaveCostos = (presupuestoData || [])
    .map((e) => ({
      nave: e.emb?.nombre || "—",
      gastoAnio: Math.round(e.gasto?.total || 0),
      runRateAnual: Math.round(e.rr?.anualProyectado || 0),
      presupuesto: Math.round(e.ppto || 0),
      zona: e.estado?.zona || "sin-dato",
      mesesAgotamiento: e.mesesAgot != null ? Math.round(e.mesesAgot * 10) / 10 : null,
    }))
    .filter((e) => e.gastoAnio > 0 || e.presupuesto > 0)
    .sort((a, b) => b.gastoAnio - a.gastoAnio)
    .slice(0, 6);

  const desgaste = analizarDesgasteFlota({ planesEval, lecturas, equipos, embarcaciones });

  return {
    empresa,
    periodo,
    flota: {
      totalNaves: (embarcaciones || []).length,
      naves: (embarcaciones || []).map((e) => ({
        nombre: e.nombre || e.codigo || "—",
        codigo: e.codigo || "",
        estado: estadoPorNave.get(e.id) || "—",
      })),
    },
    confiabilidad: {
      equiposRiesgoAlto,
      equiposRiesgoMedio,
      mtbfPromedioDias: mtbfPromedio(riesgoRanking),
      topRiesgo: topRiesgo(riesgoRanking, embarcaciones, 5),
    },
    mantenimiento: {
      pmVencidos: pmCount.vencidos,
      pmProximos: pmCount.proximos,
      pmTotal: pmCount.total,
      otsAbiertas: otCount.abiertas,
      otsCerradasPeriodo: otCount.cerradasPeriodo,
      pctPreventivo: pctPrev != null ? Math.round(pctPrev) : null,
      backlogTop: topBacklog(ots, equipos, embarcaciones, hoy, 5),
    },
    costos: {
      gastoAnioFlota: Math.round(gastoAnioFlota),
      runRateAnual: Math.round(runRateFlota?.anualProyectado || 0),
      presupuestoFlota: Math.round(presupuestoFlotaTotal),
      desvioPct: estFlota.porcentaje != null ? Math.round(estFlota.porcentaje) : null,
      zona: estFlota.zona,
      porNave: porNaveCostos,
    },
    inventario: {
      criticosSinStock: (sinCobertura || []).length,
      itemsSubdotados,
      topCriticos: (sinCobertura || []).slice(0, 5).map((c) => ({
        codigo: c.item?.codigo || "—",
        descripcion: c.item?.descripcion || "—",
        equiposCriticos: (c.equiposA || []).length,
      })),
    },
    desgaste,
  };
}
