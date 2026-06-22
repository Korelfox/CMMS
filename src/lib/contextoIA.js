// ============================================================
//  Única fuente de verdad para el contexto estructurado que
//  alimenta los módulos IA: Copiloto de Flota e Informe Ejecutivo.
//
//  Helpers compartidos (contarPMs, contarOTs, …) viven aquí para
//  no duplicarse entre los dos constructores de contexto.
// ============================================================

import { coberturaCriticos, scoreBacklog, diasAbierta } from "./operacional";
import { analizarDesgasteFlota } from "./desgaste";
import { estadoPresupuesto } from "./presupuesto";
import { analizarBrechas, esComponenteNodo } from "./equipoBrechas";
import { requiereCodigoFalla } from "./fallasISO";
import { hoyLocal } from "./fechas";

const DIA_MS = 86_400_000;

// ── Helpers compartidos ──────────────────────────────────────────────────────

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
export function pctPreventivoPeriodo(ots = [], desdeISO = "") {
  const cerradas = (ots || []).filter(
    (o) => o.estado === "cerrada" && o.fecha && (!desdeISO || o.fecha.slice(0, 10) >= desdeISO),
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
      folio:       o.folio || "—",
      sistema:     o.sistema || "—",
      nave:        nombreNave(embarcaciones, o.embarcacion_id),
      prioridad:   o.prioridad || "—",
      diasAbierta: diasAbierta(o, hoy),
      score,
    }));
}

// Top-N equipos de mayor riesgo para el Informe Ejecutivo.
export function topRiesgo(ranking = [], embarcaciones = [], n = 5) {
  return (ranking || [])
    .filter((r) => r.score > 0)
    .slice(0, n)
    .map((r) => ({
      equipo:     r.equipo?.sistema || r.equipo?.id_visible || "equipo",
      nave:       nombreNave(embarcaciones, r.equipo?.embarcacion_id),
      criticidad: r.equipo?.criticidad || "—",
      score:      r.score,
      zona:       r.zona,
      mtbfDias:   r.mtbf != null ? Math.round(r.mtbf) : null,
      motivos:    (r.motivos || []).slice(0, 2),
    }));
}

// ── Calidad de datos (auditoría interna del CMMS) ───────────────────────────
// El Copiloto no solo lee el estado de la flota: audita la calidad de los datos
// que alimentan a TODOS los módulos IA y le dice al usuario cómo cerrarlos.
//
// Reusa motores puros ya existentes para no divergir:
//   · analizarBrechas()  → salud del registro de equipos (modo Optimizar).
//   · requiereCodigoFalla() → qué OTs deben llevar modo de falla ISO 14224.
// Las severidades replican las del motor server-side _gen_insights (IA-A/B/C)
// para que el Copiloto y el Vigilante hablen el mismo idioma.

const RANK_SEVERIDAD = { alta: 0, media: 1, baja: 2 };

export function construirCalidadDatos({
  equipos    = [],
  destinos   = [],
  ots        = [],
  planesEval = [],
} = {}) {
  // 1) Brechas del registro de equipos (criticidad, horómetro, repuestos, ficha…)
  const brechas = analizarBrechas(equipos || [], destinos || []);
  const porTipo = brechas.porTipo || {};

  // 2) ISO 14224 — correctivas cerradas sin modo de falla codificado (≈ IA-B)
  const correctivasCerradas = (ots || []).filter(
    (o) => o.estado === "cerrada" && requiereCodigoFalla(o),
  );
  const sinModo    = correctivasCerradas.filter((o) => !o.modo_falla).length;
  const pctSinModo = correctivasCerradas.length
    ? Math.round((sinModo / correctivasCerradas.length) * 100)
    : null;

  // 3) Confiabilidad — críticos A con <4 correctivas cerradas (Weibull no ajusta).
  // Solo nodos HOJA operativos (componente/instrumento/equipo): un sistema o
  // subsistema es agrupación, no acumula correctivas propias ni se modela con
  // Weibull. Así esta cuenta vive en la misma población que saludRegistro y no
  // contradice a equiposEvaluados (contar todos los A inflaría con nodos padre).
  const corrPorEquipo = new Map();
  for (const o of ots || []) {
    if (o.estado === "cerrada" && o.tipo === "correctivo" && o.equipo_id) {
      corrPorEquipo.set(o.equipo_id, (corrPorEquipo.get(o.equipo_id) || 0) + 1);
    }
  }
  const criticosASinHistorial = (equipos || []).filter(
    (e) => e.criticidad === "A" && esComponenteNodo(e) && (corrPorEquipo.get(e.id) || 0) < 4,
  ).length;

  // 4) Plan preventivo — sin línea base (nunca configurado) o sin intervalo de horas
  const planesSinLineaBase = (planesEval || []).filter((p) => p.tone === "slate").length;
  const planesSinIntervalo = (planesEval || []).filter(
    (p) => !p.esCalendario && !(p.limite > 0),
  ).length;

  // brechasTop: las de mayor impacto, cada una con CÓMO corregirla en la app.
  const top = [];
  const nSinCrit = porTipo.sin_criticidad || 0;
  if (nSinCrit > 0) top.push({
    area:        "Criticidad de equipos",
    severidad:   nSinCrit > 20 ? "alta" : nSinCrit > 5 ? "media" : "baja",
    detalle:     `${nSinCrit} equipos sin criticidad A/B/C asignada`,
    impacto:     "El scoring de riesgo y la priorización del Copiloto pierden precisión",
    comoCorregir: "Equipos → modo Optimizar → pestaña Identidad: asignar criticidad",
  });
  if (correctivasCerradas.length >= 5 && pctSinModo > 30) top.push({
    area:        "Codificación ISO 14224 de fallas",
    severidad:   pctSinModo > 60 ? "alta" : "media",
    detalle:     `${sinModo} de ${correctivasCerradas.length} correctivas cerradas sin modo de falla (${pctSinModo}%)`,
    impacto:     "Pareto, Weibull y Diagnóstico de Fallas trabajan con datos incompletos",
    comoCorregir: "Al cerrar una correctiva, registrar modo/causa/mecanismo (taxonomía ISO 14224)",
  });
  if (criticosASinHistorial > 0) top.push({
    area:        "Historial de confiabilidad (críticos A)",
    severidad:   "media",
    detalle:     `${criticosASinHistorial} equipos críticos A con <4 correctivas registradas`,
    impacto:     "ConfiabilidadML no puede ajustar Weibull ni estimar MTBF",
    comoCorregir: "Registrar en OTs el historial de fallas de estos equipos",
  });
  if (planesSinLineaBase > 0) top.push({
    area:        "Línea base de planes PM",
    severidad:   planesSinLineaBase > 10 ? "media" : "baja",
    detalle:     `${planesSinLineaBase} planes PM sin último mantenimiento registrado`,
    impacto:     "El semáforo de vencimiento y la proyección de desgaste no se calculan",
    comoCorregir: "PlanPM: registrar fecha/horas del último PM de cada plan",
  });
  const nSinHoro = porTipo.sin_horometro || 0;
  if (nSinHoro > 0) top.push({
    area:        "Horómetro de equipos",
    severidad:   nSinHoro > 10 ? "media" : "baja",
    detalle:     `${nSinHoro} equipos sin configuración de horómetro`,
    impacto:     "Sin horas de uso no hay proyección de desgaste ni vida remanente",
    comoCorregir: "Equipos → modo Optimizar → pestaña Operacional: configurar horómetro",
  });
  if (planesSinIntervalo > 0) top.push({
    area:        "Intervalo de planes PM",
    severidad:   "baja",
    detalle:     `${planesSinIntervalo} planes por horas sin intervalo definido`,
    impacto:     "Esos planes nunca generan alerta de vencimiento",
    comoCorregir: "PlanPM: definir el intervalo de horas del plan",
  });
  top.sort((a, b) => RANK_SEVERIDAD[a.severidad] - RANK_SEVERIDAD[b.severidad]);

  return {
    saludRegistro:    brechas.salud,          // % de equipos hoja sin brechas
    equiposEvaluados: brechas.evaluables,
    equiposConBrecha: brechas.equiposConBrecha,
    isoFallas: {
      correctivasCerradas: correctivasCerradas.length,
      sinCodificar:        sinModo,
      pctSinCodificar:     pctSinModo,
    },
    confiabilidad: { criticosASinHistorial },
    planPreventivo: { sinLineaBase: planesSinLineaBase, sinIntervalo: planesSinIntervalo },
    brechasTop: top.slice(0, 6),
  };
}

// ── Contexto para Copiloto de Flota ─────────────────────────────────────────
// Schema compacto optimizado para conversación: resume PMs, OTs, riesgo e
// inventario. Recibe riesgoRanking pre-calculado por el componente (igual que
// construirContextoInforme) para evitar divergencia entre vistas.

export function construirContextoCopiloto({
  empresa        = null,
  embarcaciones  = [],
  equipos        = [],
  planesEval     = [],
  riesgoRanking  = [],
  ots            = [],
  items          = [],
  stock          = [],
  destinos       = [],
  lecturas       = [],
  hoy            = hoyLocal(),
} = {}) {
  const embsById = new Map((embarcaciones || []).map((e) => [e.id, e]));

  // PMs
  const pmCount      = contarPMs(planesEval);
  const pmVencidosArr = (planesEval || []).filter((p) => p.tone === "red");
  const pmPorNave    = {};
  for (const p of pmVencidosArr) {
    const emb  = embsById.get(p.equipo?.embarcacion_id);
    const nave = emb?.nombre || emb?.codigo || "Desconocida";
    pmPorNave[nave] = (pmPorNave[nave] || 0) + 1;
  }

  // OTs (excluye canceladas explícitamente)
  const otsAbiertas = (ots || []).filter((o) => !["cerrada", "cancelada"].includes(o.estado));
  const hoyMs  = new Date(hoy + "T00:00:00").getTime();
  const correctivasUltimos30d = (ots || []).filter(
    (o) => o.tipo === "correctivo" && o.estado === "cerrada" &&
           o.fecha && new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime() >= hoyMs - 30 * DIA_MS,
  ).length;

  // Riesgo
  const topEquiposRiesgo = riesgoRanking.slice(0, 8).map((r) => {
    const emb = embsById.get(r.equipo?.embarcacion_id);
    return {
      equipo:     r.equipo?.id_visible,
      sistema:    r.equipo?.sistema,
      criticidad: r.equipo?.criticidad,
      nave:       emb?.nombre || emb?.codigo || "—",
      score:      r.score,
      zona:       r.zona,
      motivos:    (r.motivos || []).slice(0, 2),
    };
  });

  // Inventario
  const sinCobertura = coberturaCriticos({ items, stock, destinos, equipos })
    .slice(0, 8)
    .map((x) => ({
      codigo:          x.item?.codigo,
      descripcion:     x.item?.descripcion,
      equiposCriticos: (x.equiposA || []).map((e) => e.id_visible || e.sistema).filter(Boolean),
    }));

  const desgaste = analizarDesgasteFlota({ planesEval, lecturas, equipos, embarcaciones });
  const calidadDatos = construirCalidadDatos({ equipos, destinos, ots, planesEval });

  return {
    empresa: empresa?.nombre || "Desconocida",
    flota: (embarcaciones || []).map((e) => ({
      nombre:    e.nombre || e.codigo,
      tipo:      e.tipo,
      matricula: e.matricula,
    })),
    equipos: {
      total:       (equipos || []).length,
      criticidadA: (equipos || []).filter((e) => e.criticidad === "A").length,
      criticidadB: (equipos || []).filter((e) => e.criticidad === "B").length,
    },
    mantenimiento: {
      pmVencidos:          pmCount.vencidos,
      pmProximos30d:       pmCount.proximos,
      pmVencidosPorNave:   pmPorNave,
      otsAbiertas:         otsAbiertas.length,
      otsCorrectivas:      otsAbiertas.filter((o) => o.tipo === "correctivo").length,
      correctivasUltimos30d,
    },
    riesgo: {
      enZonaRoja:      riesgoRanking.filter((r) => r.zona === "roja").length,
      enZonaAmarilla:  riesgoRanking.filter((r) => r.zona === "amarilla").length,
      topEquiposRiesgo,
    },
    inventario: {
      repuestosCriticosSinStock: sinCobertura,
    },
    horasOperacion: desgaste,
    calidadDatos,
    fecha: hoy,
  };
}

// ── Contexto para Informe Ejecutivo ─────────────────────────────────────────
// Schema detallado: costos, presupuesto, período, backlog, desgaste. Recibe
// riesgoRanking y sinCobertura pre-calculados por el componente.

export function construirContextoInforme({
  empresa          = "",
  periodo          = { label: "", meses: 0, desde: "", hasta: "" },
  embarcaciones    = [],
  equipos          = [],
  planesEval       = [],
  riesgoRanking    = [],
  ots              = [],
  estadoPorNave    = new Map(),
  presupuestoData  = [],
  runRateFlota     = { mensual: 0, anualProyectado: 0 },
  sinCobertura     = [],
  itemsSubdotados  = 0,
  lecturas         = [],
  hoy,
} = {}) {
  const desdeISO = periodo?.desde || "";
  const anio     = Number((hoy || "").slice(0, 4)) || new Date().getFullYear();

  const pmCount  = contarPMs(planesEval);
  const otCount  = contarOTs(ots, desdeISO);
  const pctPrev  = pctPreventivoPeriodo(ots, desdeISO);

  const equiposRiesgoAlto  = (riesgoRanking || []).filter((r) => r.zona === "roja").length;
  const equiposRiesgoMedio = (riesgoRanking || []).filter((r) => r.zona === "amarilla").length;

  const gastoAnioFlota        = (presupuestoData || []).reduce((s, e) => s + (e.gasto?.total || 0), 0);
  const presupuestoFlotaTotal = (presupuestoData || []).reduce((s, e) => s + (e.ppto || 0), 0);
  const estFlota              = estadoPresupuesto(gastoAnioFlota, presupuestoFlotaTotal, hoy, anio);

  const porNaveCostos = (presupuestoData || [])
    .map((e) => ({
      nave:             e.emb?.nombre || "—",
      gastoAnio:        Math.round(e.gasto?.total || 0),
      runRateAnual:     Math.round(e.rr?.anualProyectado || 0),
      presupuesto:      Math.round(e.ppto || 0),
      zona:             e.estado?.zona || "sin-dato",
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
      topRiesgo:        topRiesgo(riesgoRanking, embarcaciones, 5),
    },
    mantenimiento: {
      pmVencidos:         pmCount.vencidos,
      pmProximos:         pmCount.proximos,
      pmTotal:            pmCount.total,
      otsAbiertas:        otCount.abiertas,
      otsCerradasPeriodo: otCount.cerradasPeriodo,
      pctPreventivo:      pctPrev != null ? Math.round(pctPrev) : null,
      backlogTop:         topBacklog(ots, equipos, embarcaciones, hoy, 5),
    },
    costos: {
      gastoAnioFlota:   Math.round(gastoAnioFlota),
      runRateAnual:     Math.round(runRateFlota?.anualProyectado || 0),
      presupuestoFlota: Math.round(presupuestoFlotaTotal),
      desvioPct:        estFlota.porcentaje != null ? Math.round(estFlota.porcentaje) : null,
      zona:             estFlota.zona,
      porNave:          porNaveCostos,
    },
    inventario: {
      criticosSinStock: (sinCobertura || []).length,
      itemsSubdotados,
      topCriticos: (sinCobertura || []).slice(0, 5).map((c) => ({
        codigo:          c.item?.codigo || "—",
        descripcion:     c.item?.descripcion || "—",
        equiposCriticos: (c.equiposA || []).length,
      })),
    },
    desgaste,
  };
}
