// ============================================================
//  Confiabilidad predictiva (Weibull auto-ajustado).
//  Todas las funciones son puras. Unidad de tiempo: DÍAS calendario.
//  Se apoya en ajustarWeibull + gammaFunc ya existentes en calculos.js.
// ============================================================

import { ajustarWeibull, gammaFunc } from "./calculos";

const DIA_MS = 86_400_000;

// ── TTFs en días entre OTs correctivas consecutivas ──────────────────────────
// Fuente de datos: fechas de OTs (sin requerir hrs_oper_desde).
export function ttfsDiasCalendario(equipoId, ots) {
  const fechas = (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.fecha)
    .map((o) => new Date(o.fecha).getTime())
    .sort((a, b) => a - b);
  const ttfs = [];
  for (let i = 1; i < fechas.length; i++) {
    const d = (fechas[i] - fechas[i - 1]) / DIA_MS;
    if (d >= 1) ttfs.push(d);  // filtra OTs duplicadas del mismo día
  }
  return ttfs;
}

// ── Funciones de confiabilidad Weibull biparamétrica ────────────────────────

// R(t) = e^(-(t/η)^β)  — probabilidad de sobrevivir hasta el tiempo t
export function confiabilidad(t, beta, eta) {
  if (t <= 0 || !beta || !eta) return 1;
  return Math.exp(-Math.pow(t / eta, beta));
}

// F(t) = 1 − R(t)  — probabilidad de haber fallado antes de t
export function probFalla(t, beta, eta) {
  return 1 - confiabilidad(t, beta, eta);
}

// h(t) = (β/η)(t/η)^(β−1)  — tasa de falla instantánea
export function tasaFalla(t, beta, eta) {
  if (t <= 0 || !beta || !eta) return 0;
  return (beta / eta) * Math.pow(t / eta, beta - 1);
}

// MTBF = η · Γ(1 + 1/β)  — vida media en días
export function mtbfDias(beta, eta) {
  if (!beta || !eta || beta <= 0 || eta <= 0) return null;
  return eta * gammaFunc(1 + 1 / beta);
}

// B(p) = η · (−ln(1−p))^(1/β)  — cuantil: tiempo en que p fracción ha fallado
export function cuantilWeibull(p, beta, eta) {
  if (p <= 0 || p >= 1 || !beta || !eta) return null;
  return eta * Math.pow(-Math.log(1 - p), 1 / beta);
}

// Vida útil residual condicional al nivel de confianza dado.
// P(T ≤ tActual + VUR | T > tActual) = conf.
// Resolución analítica: tNext = η·((tActual/η)^β − ln(1−conf))^(1/β)
export function vidaUtilResidual(tActual, beta, eta, conf = 0.5) {
  if (tActual == null || tActual < 0 || !beta || !eta) return null;
  const t0    = Math.max(tActual, 0.001);
  const base  = Math.pow(t0 / eta, beta);
  const delta = -Math.log(1 - Math.min(conf, 0.9999));
  const tNext = eta * Math.pow(base + delta, 1 / beta);
  return Math.max(0, tNext - t0);
}

// Puntos de la curva F(t) para trazar en SVG (0 → B99.9)
export function puntosCurva(beta, eta, nPuntos = 120) {
  if (!beta || !eta) return [];
  const tMax = cuantilWeibull(0.999, beta, eta) || eta * 4;
  const paso = tMax / nPuntos;
  return Array.from({ length: nPuntos + 1 }, (_, i) => {
    const t = i * paso;
    return { t, prob: probFalla(t, beta, eta) };
  });
}

// Interpretación del parámetro de forma β
export function interpretarBeta(beta) {
  if (!beta) return null;
  if (beta < 0.9) return { texto: "Mortalidad infantil",   tone: "blue",   raz: "Tasa de fallas DECRECE con el tiempo. El componente mejora con la operación. Revisar proceso de montaje y burn-in." };
  if (beta <= 1.1) return { texto: "Fallas aleatorias",    tone: "green",  raz: "Tasa de fallas CONSTANTE. El PM por horas/calendario no reduce costos; conviene estrategia por condición." };
  if (beta < 2)    return { texto: "Desgaste temprano",    tone: "yellow", raz: "Tasa creciente moderada. Hay degradación; PM preventivo con intervalo próximo a B50 ayuda." };
  if (beta < 4)    return { texto: "Desgaste progresivo",  tone: "amber",  raz: "Degradación clara. Programar PM en B40–B50 para equilibrar costos de intervención vs. falla." };
  return               { texto: "Desgaste severo/acelerado", tone: "red",  raz: "Degradación muy rápida. Evaluar overhaul, mejora de material o rediseño del componente." };
}

// ── Análisis completo por equipo ──────────────────────────────────────────────
// → { equipo, ajuste, beta, eta, tActual, diasUltFalla,
//     pF, rul50, rul70, rul85, mtbf, nFallas, zona, ttfs, fechaPredichaFalla }
export function analizarEquipo({ equipo, ots = [], hoy } = {}) {
  const id    = equipo?.id;
  const ttfs  = ttfsDiasCalendario(id, ots);
  const ajuste = ajustarWeibull(ttfs);           // null si ttfs.length < 3
  const { beta, eta } = ajuste || {};

  const correctivas = (ots || []).filter(
    (o) => o.equipo_id === id && o.tipo === "correctivo" && o.fecha,
  );
  const nFallas = correctivas.length;

  const ultimaFecha = correctivas
    .map((o) => new Date(o.fecha))
    .sort((a, b) => b - a)[0] || null;
  const diasUltFalla = ultimaFecha
    ? Math.max(0, (new Date(hoy) - ultimaFecha) / DIA_MS)
    : null;

  const tActual = diasUltFalla;

  const pF   = beta && eta && tActual != null ? probFalla(tActual, beta, eta)             : null;
  const rul50 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.50) : null;
  const rul70 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.70) : null;
  const rul85 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.85) : null;

  const mtbf = mtbfDias(beta, eta);

  const fechaPredichaFalla = rul50 != null && rul50 < 3650
    ? new Date(new Date(hoy).getTime() + Math.round(rul50) * DIA_MS).toISOString().slice(0, 10)
    : null;

  const zona = pF == null ? "sin_datos"
    : pF >= 0.70 ? "critica"
    : pF >= 0.40 ? "alerta"
    : pF >= 0.15 ? "vigilar"
    : "estable";

  return {
    equipo, ajuste, beta, eta, tActual, diasUltFalla,
    pF, rul50, rul70, rul85, mtbf, nFallas, zona, ttfs, fechaPredichaFalla,
  };
}

// ── Ranking predictivo de la flota ────────────────────────────────────────────
// Ordenado por zona (critica → estable → sin_datos), luego por pF desc.
export function rankearFlota({ equipos = [], ots = [], hoy } = {}) {
  const ZONA_ORDEN = { critica: 0, alerta: 1, vigilar: 2, estable: 3, sin_datos: 4 };
  return (equipos || [])
    .map((eq) => analizarEquipo({ equipo: eq, ots, hoy }))
    .sort((a, b) => {
      const dz = (ZONA_ORDEN[a.zona] ?? 4) - (ZONA_ORDEN[b.zona] ?? 4);
      return dz !== 0 ? dz : (b.pF ?? -1) - (a.pF ?? -1);
    });
}
