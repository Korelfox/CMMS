// ============================================================
//  Lógica pura: Reemplazar vs. Reparar (decisión CAPEX).
//  Para cada equipo contrasta el costo anual de SEGUIR REPARANDO
//  (OPEX correctivo creciente con la edad + lucro cesante por
//  indisponibilidad) contra el costo anual de REEMPLAZARLO
//  (recuperación de capital del nuevo equipo + su mantención).
//  Usa el método del Costo Anual Equivalente (CAE/EUAC) y la
//  regla del ratio de reparación acumulada.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

const DIA_MS = 86_400_000;

// Supuestos por defecto (ajustables a nivel flota desde la UI).
export const SUPUESTOS_DEFECTO = {
  tasa: 12,              // tasa de descuento / costo de capital anual (%)
  escalada: 8,           // alza anual del costo de reparación por antigüedad (%)
  ahorroMantencion: 75,  // ahorro de mantención esperado con equipo nuevo (%)
  vidaUtil: 15,          // vida útil económica por defecto (años)
  valorResidualPct: 10,  // valor residual al final de la vida útil (% del CAPEX)
};

// Umbrales de decisión sobre el ratio CAE_mantener / CAE_reemplazar.
const RATIO_REEMPLAZAR = 1.15;
const RATIO_REPARAR    = 0.85;

// ── Factor de recuperación de capital (CRF) ──────────────────
// Anualiza una inversión a lo largo de n años a la tasa i.
// CRF = i(1+i)^n / ((1+i)^n − 1).  Con i=0 → 1/n.
export function factorRecuperacionCapital(tasaPct, n) {
  const i = (Number(tasaPct) || 0) / 100;
  const anios = Math.max(1, Number(n) || 1);
  if (i === 0) return 1 / anios;
  const f = Math.pow(1 + i, anios);
  return (i * f) / (f - 1);
}

// ── Costo Anual Equivalente de REEMPLAZAR ────────────────────
// Recuperación del capital depreciable + interés sobre el valor
// residual + mantención anual del equipo nuevo (más baja).
// → { capitalRecovery, omNuevoAnual, valorResidual, cae }
export function caeReemplazo({
  Cr,
  vidaUtil,
  valorResidualPct = SUPUESTOS_DEFECTO.valorResidualPct,
  tasa = SUPUESTOS_DEFECTO.tasa,
  repAnual = 0,
  ahorroMantencion = SUPUESTOS_DEFECTO.ahorroMantencion,
}) {
  const capex = Math.max(0, Number(Cr) || 0);
  const i = (Number(tasa) || 0) / 100;
  const vr = capex * (Math.min(100, Math.max(0, Number(valorResidualPct) || 0)) / 100);
  const crf = factorRecuperacionCapital(tasa, vidaUtil);

  const capitalRecovery = (capex - vr) * crf + vr * i;
  const omNuevoAnual = Math.max(0, Number(repAnual) || 0) *
    (1 - Math.min(100, Math.max(0, Number(ahorroMantencion) || 0)) / 100);

  return {
    capitalRecovery: Math.round(capitalRecovery),
    omNuevoAnual: Math.round(omNuevoAnual),
    valorResidual: Math.round(vr),
    cae: Math.round(capitalRecovery + omNuevoAnual),
  };
}

// ── Historial de reparaciones de un equipo ───────────────────
// Agrega el costo correctivo (MO+materiales) de OTs cerradas y la
// indisponibilidad (MTTR) tanto histórica como en la ventana reciente.
// → { repAcum, repAnual, repVentana, nEventos, nEventosVentana,
//     diasParadoAnual, primeraFecha, ultimaFecha, aniosHistorial }
export function historialReparaciones(ots = [], equipoId, hoy, ventanaMeses = 12) {
  const corte = new Date((hoy || "") + "T00:00:00");
  corte.setMonth(corte.getMonth() - ventanaMeses);
  const corteISO = corte.toISOString().slice(0, 10);

  const corr = (ots || []).filter(
    (o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.estado === "cerrada",
  );

  let repAcum = 0, repVentana = 0, nEventosVentana = 0, diasParadoVentana = 0;
  let primeraFecha = null, ultimaFecha = null;

  for (const o of corr) {
    const costo = (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0);
    repAcum += costo;
    const f = (o.fecha || "").slice(0, 10);
    if (f) {
      if (!primeraFecha || f < primeraFecha) primeraFecha = f;
      if (!ultimaFecha  || f > ultimaFecha)  ultimaFecha  = f;
      if (f >= corteISO) {
        repVentana += costo;
        nEventosVentana++;
        diasParadoVentana += (Number(o.mttr_horas) || 0) / 24;
      }
    }
  }

  // Años de historial cubiertos (mínimo la propia ventana, para no
  // sobre-anualizar equipos con un único evento reciente).
  let aniosHistorial = ventanaMeses / 12;
  if (primeraFecha && hoy) {
    const span = (new Date(hoy + "T00:00:00") - new Date(primeraFecha + "T00:00:00")) / DIA_MS / 365;
    aniosHistorial = Math.max(ventanaMeses / 12, span);
  }

  const repAnualHist = aniosHistorial > 0 ? repAcum / aniosHistorial : repAcum;
  // Run-rate anual: prioriza la ventana reciente; si no hubo eventos
  // recientes, cae al promedio histórico para no subestimar el riesgo.
  const repAnual = nEventosVentana > 0
    ? repVentana * (12 / ventanaMeses)
    : repAnualHist;
  const diasParadoAnual = nEventosVentana > 0
    ? diasParadoVentana * (12 / ventanaMeses)
    : 0;

  return {
    repAcum: Math.round(repAcum),
    repAnual: Math.round(repAnual),
    repVentana: Math.round(repVentana),
    nEventos: corr.length,
    nEventosVentana,
    diasParadoAnual: Math.round(diasParadoAnual * 10) / 10,
    primeraFecha,
    ultimaFecha,
    aniosHistorial: Math.round(aniosHistorial * 10) / 10,
  };
}

// ── Costo Anual Equivalente de MANTENER (reparar) ────────────
// Reparación proyectada (creciente con la edad relativa) + lucro
// cesante anual por días de paralización.
// → { repProyectado, lucroAnual, cae }
export function caeMantener({
  repAnual = 0,
  edad = null,
  vidaUtil = SUPUESTOS_DEFECTO.vidaUtil,
  escalada = SUPUESTOS_DEFECTO.escalada,
  diasParadoAnual = 0,
  margenDia = null,
}) {
  const base = Math.max(0, Number(repAnual) || 0);
  const vu = Math.max(1, Number(vidaUtil) || 1);
  const edadRel = edad != null ? Math.min(2, Math.max(0, edad / vu)) : 1;
  const factor = 1 + (Math.max(0, Number(escalada) || 0) / 100) * edadRel;
  const repProyectado = base * factor;
  const lucroAnual = margenDia != null
    ? Math.max(0, Number(diasParadoAnual) || 0) * margenDia
    : 0;

  return {
    repProyectado: Math.round(repProyectado),
    lucroAnual: Math.round(lucroAnual),
    cae: Math.round(repProyectado + lucroAnual),
  };
}

// ── Análisis CAPEX completo de un equipo ─────────────────────
// params: { tasa, escalada, ahorroMantencion } (supuestos de flota).
// El CAPEX por equipo (valor de reemplazo, vida útil, residual) vive
// en equipo.ficha.capex.
// → objeto rico con recomendación, CAEs, ratios, ahorro y payback.
export function analizarEquipoCapex({ equipo, ots = [], hoy, margenDia = null, params = {} } = {}) {
  const sup = { ...SUPUESTOS_DEFECTO, ...params };
  const capexCfg = equipo?.ficha?.capex || {};
  const Cr = Number(capexCfg.valor_reemplazo) || 0;
  const vidaUtil = Number(capexCfg.vida_util_anios) || sup.vidaUtil;
  const valorResidualPct = capexCfg.valor_residual_pct != null
    ? Number(capexCfg.valor_residual_pct) : sup.valorResidualPct;

  const anioFab = parseInt(equipo?.anio, 10);
  const anioActual = parseInt((hoy || "").slice(0, 4), 10) || new Date().getFullYear();
  const edad = Number.isFinite(anioFab) && anioFab > 1900 ? Math.max(0, anioActual - anioFab) : null;

  const hist = historialReparaciones(ots, equipo?.id, hoy);

  // Sin CAPEX configurado no se puede comparar contra reemplazo.
  if (!(Cr > 0)) {
    return {
      equipo, estado: "sin_configurar", edad, vidaUtil, valorResidualPct,
      Cr: 0, hist, recomendacion: null,
    };
  }

  const rep = caeMantener({
    repAnual: hist.repAnual, edad, vidaUtil, escalada: sup.escalada,
    diasParadoAnual: hist.diasParadoAnual, margenDia,
  });
  const rem = caeReemplazo({
    Cr, vidaUtil, valorResidualPct, tasa: sup.tasa,
    repAnual: hist.repAnual, ahorroMantencion: sup.ahorroMantencion,
  });

  const ratio = rem.cae > 0 ? rep.cae / rem.cae : (rep.cae > 0 ? Infinity : 0);
  const ratioAcum = Cr > 0 ? hist.repAcum / Cr : 0;
  const ahorroAnual = rep.cae - rem.cae;                       // >0 ⇒ reemplazar ahorra
  const inversionNeta = Cr - rem.valorResidual;
  const paybackAnios = ahorroAnual > 0 ? inversionNeta / ahorroAnual : null;
  const finVidaUtil = edad != null && edad >= vidaUtil * 1.2;

  // Señales que fuerzan o sustentan la recomendación.
  const motivos = [];
  if (ratioAcum >= 1) motivos.push(`Reparaciones acumuladas (${Math.round(ratioAcum * 100)}%) ya superan el valor de reemplazo`);
  else if (ratioAcum >= 0.6) motivos.push(`Reparaciones acumuladas equivalen al ${Math.round(ratioAcum * 100)}% del valor de reemplazo`);
  if (finVidaUtil) motivos.push(`Edad ${edad} años supera la vida útil (${vidaUtil} años)`);
  if (ahorroAnual > 0) motivos.push(`Reemplazar ahorra ${Math.round(ahorroAnual).toLocaleString("es-CL")} $/año`);
  else motivos.push(`Reparar sigue siendo ${Math.round(-ahorroAnual).toLocaleString("es-CL")} $/año más barato`);
  if (hist.nEventos === 0) motivos.push("Sin historial de correctivos registrado");

  let recomendacion;
  if (ratio >= RATIO_REEMPLAZAR || ratioAcum >= 1 || finVidaUtil) recomendacion = "reemplazar";
  else if (ratio < RATIO_REPARAR && ratioAcum < 0.6) recomendacion = "reparar";
  else recomendacion = "evaluar";

  return {
    equipo,
    estado: "analizado",
    recomendacion,
    edad, vidaUtil, valorResidualPct, Cr,
    hist,
    rep, rem,
    ratio, ratioAcum,
    ahorroAnual, inversionNeta, paybackAnios,
    finVidaUtil,
    margenDia,
    motivos,
  };
}

// ── Análisis CAPEX de toda la flota ──────────────────────────
// margenDiarioPorEmb: Map<embarcacion_id, $/día | null> (opcional).
// Ordena: reemplazar primero, luego por ahorro anual desc; los
// equipos sin configurar van al final.
export function analizarFlotaCapex({
  equipos = [], ots = [], hoy, margenDiarioPorEmb = new Map(), params = {},
} = {}) {
  const otsPorEquipo = new Map();
  for (const o of ots || []) {
    if (!o.equipo_id) continue;
    if (!otsPorEquipo.has(o.equipo_id)) otsPorEquipo.set(o.equipo_id, []);
    otsPorEquipo.get(o.equipo_id).push(o);
  }

  const orden = { reemplazar: 0, evaluar: 1, reparar: 2 };
  return (equipos || [])
    .filter((e) => e.tipo_nodo !== "sistema" && e.tipo_nodo !== "grupo")
    .map((equipo) => {
      const margenDia = margenDiarioPorEmb instanceof Map
        ? (margenDiarioPorEmb.get(equipo.embarcacion_id) ?? null) : null;
      return analizarEquipoCapex({
        equipo, ots: otsPorEquipo.get(equipo.id) || [], hoy, margenDia, params,
      });
    })
    .sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "sin_configurar" ? 1 : -1;
      if (a.estado === "sin_configurar") return (b.hist?.repAcum || 0) - (a.hist?.repAcum || 0);
      const oa = orden[a.recomendacion] ?? 3, ob = orden[b.recomendacion] ?? 3;
      if (oa !== ob) return oa - ob;
      return (b.ahorroAnual || 0) - (a.ahorroAnual || 0);
    });
}
