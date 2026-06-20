// ============================================================
//  Confiabilidad predictiva (Weibull auto-ajustado).
//  Unidad de tiempo preferida: horas reales de operación
//  desde lecturas_horometro (ISO 14224 §9.3).
//  Fallback: días calendario cuando no hay lecturas suficientes.
// ============================================================

import { ajustarWeibull, gammaFunc } from "./calculos";
import { hoyLocal } from "./fechas";

const DIA_MS = 86_400_000;

// ── TTFs en días calendario (fallback sin horómetro) ─────────────────────────
export function ttfsDiasCalendario(equipoId, ots) {
  const fechas = (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.fecha)
    .map((o) => new Date(o.fecha).getTime())
    .sort((a, b) => a - b);
  const ttfs = [];
  for (let i = 1; i < fechas.length; i++) {
    const d = (fechas[i] - fechas[i - 1]) / DIA_MS;
    if (d >= 1) ttfs.push(d);
  }
  return ttfs;
}

// ── Horas operadas acumuladas en una fecha dada (interpolación lineal) ────────
// Retorna null si no hay lecturas para el equipo o si fechaMs es anterior a la
// primera lectura (las horas en ese momento son desconocidas).
// Retorna el último valor conocido si fechaMs es posterior a la última lectura.
export function horasEnFecha(equipoId, fechaMs, lecturas) {
  const propias = (lecturas || [])
    .filter((l) => l.equipo_id === equipoId && l.fecha != null && Number.isFinite(Number(l.horas)))
    .map((l) => ({ t: new Date(l.fecha).getTime(), v: Number(l.horas) }))
    .filter((l) => !isNaN(l.t) && l.v >= 0)
    .sort((a, b) => a.t - b.t);

  if (propias.length === 0) return null;
  if (fechaMs < propias[0].t) return null;                          // período sin cobertura
  if (fechaMs >= propias[propias.length - 1].t) return propias[propias.length - 1].v;

  for (let i = 1; i < propias.length; i++) {
    if (fechaMs <= propias[i].t) {
      const L0 = propias[i - 1], L1 = propias[i];
      const frac = (fechaMs - L0.t) / (L1.t - L0.t);
      return L0.v + frac * (L1.v - L0.v);
    }
  }
  return propias[propias.length - 1].v;
}

// ── TTFs en horas reales de operación (ISO 14224 §9.3) ───────────────────────
// Interpola horas en cada fecha de OT correctiva; omite intervalos donde algún
// extremo es anterior a la primera lectura (horas desconocidas).
export function ttfsHorasOper(equipoId, ots, lecturas) {
  const correctivas = (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.fecha)
    .map((o) => new Date(o.fecha + "T00:00:00").getTime())
    .sort((a, b) => a - b);

  if (correctivas.length < 2) return [];

  const ttfs = [];
  for (let i = 1; i < correctivas.length; i++) {
    const h0 = horasEnFecha(equipoId, correctivas[i - 1], lecturas);
    const h1 = horasEnFecha(equipoId, correctivas[i], lecturas);
    if (h0 === null || h1 === null) continue;  // fuera del rango de lecturas → omitir
    const dh = h1 - h0;
    if (dh >= 1) ttfs.push(dh);
  }
  return ttfs;
}

// Tasa de uso histórica en h/día (pendiente entre primera y última lectura).
function tasaHorasDia(equipoId, lecturas) {
  const propias = (lecturas || [])
    .filter((l) => l.equipo_id === equipoId && l.fecha != null && Number.isFinite(Number(l.horas)))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (propias.length < 2) return null;
  const dias  = (new Date(propias[propias.length - 1].fecha) - new Date(propias[0].fecha)) / DIA_MS;
  const delta = Number(propias[propias.length - 1].horas) - Number(propias[0].horas);
  return dias > 0 && delta > 0 ? delta / dias : null;
}

// ── Funciones de confiabilidad Weibull biparamétrica ────────────────────────
// La unidad de 't' es la misma que los TTFs del modelo (h u d).

// R(t) = e^(-(t/η)^β)
export function confiabilidad(t, beta, eta) {
  if (t <= 0 || !beta || !eta) return 1;
  return Math.exp(-Math.pow(t / eta, beta));
}

// F(t) = 1 − R(t)
export function probFalla(t, beta, eta) {
  return 1 - confiabilidad(t, beta, eta);
}

// h(t) = (β/η)(t/η)^(β−1)
export function tasaFalla(t, beta, eta) {
  if (t <= 0 || !beta || !eta) return 0;
  return (beta / eta) * Math.pow(t / eta, beta - 1);
}

// MTBF = η · Γ(1 + 1/β)  — en la misma unidad que η
export function mtbfDias(beta, eta) {
  if (!beta || !eta || beta <= 0 || eta <= 0) return null;
  return eta * gammaFunc(1 + 1 / beta);
}

// B(p) = η · (−ln(1−p))^(1/β)
export function cuantilWeibull(p, beta, eta) {
  if (p <= 0 || p >= 1 || !beta || !eta) return null;
  return eta * Math.pow(-Math.log(1 - p), 1 / beta);
}

// Vida útil residual condicional: P(T ≤ tActual + VUR | T > tActual) = conf
export function vidaUtilResidual(tActual, beta, eta, conf = 0.5) {
  if (tActual == null || tActual < 0 || !beta || !eta) return null;
  const t0    = Math.max(tActual, 0.001);
  const base  = Math.pow(t0 / eta, beta);
  const delta = -Math.log(1 - Math.min(conf, 0.9999));
  const tNext = eta * Math.pow(base + delta, 1 / beta);
  return Math.max(0, tNext - t0);
}

// Puntos de curva F(t) para SVG
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
  if (beta < 0.9) return { texto: "Mortalidad infantil",      tone: "blue",   raz: "Tasa de fallas DECRECE con el tiempo. El componente mejora con la operación. Revisar proceso de montaje y burn-in." };
  if (beta <= 1.1) return { texto: "Fallas aleatorias",       tone: "green",  raz: "Tasa de fallas CONSTANTE. El PM por horas/calendario no reduce costos; conviene estrategia por condición." };
  if (beta < 2)    return { texto: "Desgaste temprano",       tone: "yellow", raz: "Tasa creciente moderada. Hay degradación; PM preventivo con intervalo próximo a B50 ayuda." };
  if (beta < 4)    return { texto: "Desgaste progresivo",     tone: "amber",  raz: "Degradación clara. Programar PM en B40–B50 para equilibrar costos de intervención vs. falla." };
  return               { texto: "Desgaste severo/acelerado",  tone: "red",    raz: "Degradación muy rápida. Evaluar overhaul, mejora de material o rediseño del componente." };
}

// ── Análisis completo por equipo ──────────────────────────────────────────────
// lecturas: array de lecturas_horometro de la empresa.
// Prioridad: TTFs en horas reales si hay ≥3 intervalos con cobertura de lecturas
// (ISO 14224 §9.3). Si no, TTFs en días calendario.
// → unidad: 'h' | 'd'  — indica en qué unidad están β, η, tActual, rul*, mtbf.
export function analizarEquipo({ equipo, ots = [], lecturas = [], hoy } = {}) {
  const id     = equipo?.id;
  const hoyStr = hoy || hoyLocal();

  // ISO 14224 §9.3: intentar horas reales primero
  const ttfsH    = ttfsHorasOper(id, ots, lecturas);
  const usaHoras = ttfsH.length >= 3;
  const ttfs     = usaHoras ? ttfsH : ttfsDiasCalendario(id, ots);
  const unidad   = usaHoras ? "h" : "d";

  const ajuste = ajustarWeibull(ttfs);
  const { beta, eta } = ajuste || {};

  const correctivas = (ots || []).filter(
    (o) => o.equipo_id === id && o.tipo === "correctivo" && o.fecha,
  );
  const nFallas = correctivas.length;

  const ultimaFecha = correctivas
    .map((o) => new Date(o.fecha))
    .sort((a, b) => b - a)[0] || null;

  const diasUltFalla = ultimaFecha
    ? Math.max(0, (new Date(hoyStr) - ultimaFecha) / DIA_MS)
    : null;

  // tActual en la misma unidad que los TTFs del modelo
  let tActual;
  if (usaHoras && ultimaFecha) {
    const hoyMs = new Date(hoyStr + "T23:59:59").getTime();
    const hHoy  = horasEnFecha(id, hoyMs, lecturas);
    const hUlt  = horasEnFecha(id, ultimaFecha.getTime(), lecturas);
    tActual     = hHoy != null && hUlt != null ? Math.max(0, hHoy - hUlt) : null;
  } else {
    tActual = diasUltFalla;
  }

  const pF    = beta && eta && tActual != null ? probFalla(tActual, beta, eta)              : null;
  const rul50 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.50) : null;
  const rul70 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.70) : null;
  const rul85 = beta && eta && tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.85) : null;
  const mtbf  = mtbfDias(beta, eta);

  // Fecha predicha: convertir RUL de horas a días usando tasa histórica h/día
  let fechaPredichaFalla = null;
  if (rul50 != null) {
    let rulDias;
    if (usaHoras) {
      const tasa = tasaHorasDia(id, lecturas);
      rulDias    = tasa > 0 ? rul50 / tasa : null;
    } else {
      rulDias = rul50;
    }
    if (rulDias != null && rulDias < 3650) {
      fechaPredichaFalla = new Date(new Date(hoyStr).getTime() + Math.round(rulDias) * DIA_MS)
        .toISOString().slice(0, 10);
    }
  }

  const zona = pF == null ? "sin_datos"
    : pF >= 0.70 ? "critica"
    : pF >= 0.40 ? "alerta"
    : pF >= 0.15 ? "vigilar"
    : "estable";

  return {
    equipo, ajuste, beta, eta, tActual, diasUltFalla, unidad,
    pF, rul50, rul70, rul85, mtbf, nFallas, zona, ttfs, fechaPredichaFalla,
  };
}

// ── Ranking predictivo de la flota ────────────────────────────────────────────
export function rankearFlota({ equipos = [], ots = [], lecturas = [], hoy } = {}) {
  const ZONA_ORDEN = { critica: 0, alerta: 1, vigilar: 2, estable: 3, sin_datos: 4 };
  return (equipos || [])
    .map((eq) => analizarEquipo({ equipo: eq, ots, lecturas, hoy }))
    .sort((a, b) => {
      const dz = (ZONA_ORDEN[a.zona] ?? 4) - (ZONA_ORDEN[b.zona] ?? 4);
      return dz !== 0 ? dz : (b.pF ?? -1) - (a.pF ?? -1);
    });
}
