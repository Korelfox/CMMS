// ============================================================
//  Cálculos puros del CMMS (sin dependencias de UI).
//  Centralizados aquí para poder probarlos de forma unitaria y
//  reutilizarlos entre módulos (Criticidad, CGM, Weibull).
// ============================================================

// ── Criticidad (INGEMAN / Parra & Crespo) ───────────────────
// CT = Frecuencia × (Producción + Seguridad + Ambiente + Costo)
export const calcCT = (c) =>
  (c.frec || 0) * ((c.prod || 0) + (c.seg || 0) + (c.amb || 0) + (c.costo || 0));

// Categoría por nivel de CT → [tono, etiqueta]
export const catCT = (ct) =>
  ct >= 50 ? ["red", "Alta"] : ct >= 20 ? ["yellow", "Media"] : ["green", "Baja"];

// ── Costo Global de Mantención (modelo Pascual) ─────────────
// Tasa anual de costo de capital sobre inventario inmovilizado.
export const TASA_INV = 0.20;

// Cg = Ci + Cf + Ca + Ai (todos mensuales)
export function cgmCalcular(c) {
  const Ci = ((c.hh_c || 0) + (c.hh_p || 0)) * (c.c_hh || 0) + (c.rep || 0) + (c.fung || 0);
  const Cf = (c.hrs_par || 0) * (c.val_prod || 0) + (c.g_extra || 0);
  const Ca = ((c.val_inv || 0) * TASA_INV) / 12;
  const Ai = (c.vida || 0) > 0 ? (c.val_eq || 0) / (c.vida * 12) : 0;
  return { Ci, Cf, Ca, Ai, total: Ci + Cf + Ca + Ai };
}

// ── Confiabilidad Weibull (Pascual) ─────────────────────────
// Función gamma Γ(z) por aproximación de Lanczos.
export function gammaFunc(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFunc(1 - z));
  z -= 1;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < c.length; i++) x += c[i] / (z + i);
  const t = z + c.length - 1.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// MTBF para Weibull biparamétrica: MTBF = η · Γ(1 + 1/β) + γ
export function calcMTBF(beta, eta, gamma) {
  if (!beta || !eta) return 0;
  return eta * gammaFunc(1 + 1 / beta) + (gamma || 0);
}

// Tiempo óptimo de intervención preventiva:
//   Ts* = η · (1 / (r · (β − 1)))^(1/β) + γ,  con r = Cf / Ci.  Solo β > 1.
export function calcTsOpt(beta, eta, gamma, cf, ci) {
  if (beta <= 1) return null;
  if (!cf || !ci || cf <= 0 || ci <= 0) return null;
  const r = cf / ci;
  if (r <= 0) return null;
  const factor = 1 / (r * (beta - 1));
  if (factor <= 0) return null;
  return eta * Math.pow(factor, 1 / beta) + (gamma || 0);
}

// ── Ajuste Weibull desde historial real de fallas ───────────
// Muestras TBF (horas operadas entre fallas) de un equipo: cada OT
// correctiva registra hrs_oper_desde = horas desde la falla anterior.
export function muestrasTBF(ots = [], equipoId) {
  return (ots || [])
    .filter((o) => o?.equipo_id === equipoId && o?.tipo === "correctivo" && Number(o?.hrs_oper_desde) > 0)
    .map((o) => Number(o.hrs_oper_desde));
}

// Estimación de β y η por regresión de rangos medianos (Bernard) —
// método de papel probabilístico Weibull. Lineariza
//   F(t) = 1 − exp(−(t/η)^β)  →  ln(−ln(1−F)) = β·ln(t) − β·ln(η)
// y ajusta por mínimos cuadrados. Requiere ≥ 3 fallas.
// → { beta, eta, n, r2 } | null si no hay datos suficientes
export function ajustarWeibull(muestras = []) {
  const t = (muestras || []).filter((x) => Number(x) > 0).map(Number).sort((a, b) => a - b);
  const n = t.length;
  if (n < 3) return null;
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const F = (i + 1 - 0.3) / (n + 0.4);          // rango mediano de Bernard
    xs.push(Math.log(t[i]));
    ys.push(Math.log(-Math.log(1 - F)));
  }
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;                      // todas las muestras iguales
  const beta = sxy / sxx;
  if (!(beta > 0)) return null;
  const eta = Math.exp(-((my - beta * mx) / beta));
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  return { beta, eta, n, r2 };
}

// Decisión RCM: Inspección / Reemplazo / Overhaul / PM Preventivo / Reparar
export function decidir(beta, mtbf, tsOpt, r) {
  if (beta <= 1) {
    return { tipo: "Inspección", tone: "yellow",
      raz: "β ≤ 1: las fallas son aleatorias o de mortalidad infantil. El PM por calendario no ayuda; conviene inspección por condición." };
  }
  if (mtbf < 200 && r > 3) {
    return { tipo: "Reemplazo", tone: "red",
      raz: "MTBF muy bajo y el costo de falla supera ampliamente al de intervención: la operación pierde dinero, conviene reemplazar." };
  }
  if (tsOpt && tsOpt < mtbf * 0.3 && beta > 2) {
    return { tipo: "Overhaul", tone: "purple",
      raz: "La degradación es agresiva (β > 2) y el óptimo cae muy temprano. Una intervención mayor (overhaul) puede reiniciar el reloj y mejorar la vida útil." };
  }
  if (tsOpt && tsOpt > 0) {
    return { tipo: "PM Preventivo", tone: "green",
      raz: `Programa PM en Ts* = ${Math.round(tsOpt)} h. Es el punto donde el costo total se minimiza.` };
  }
  return { tipo: "Reparar (correctivo)", tone: "slate",
    raz: "No hay óptimo claro. Mantén estrategia correctiva y revisa parámetros con más datos." };
}
