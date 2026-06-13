// ============================================================
//  Lógica pura: Presupuesto de mantenimiento y run-rate.
//  Proyecta el gasto anual desde el ritmo real de los últimos
//  meses y lo contrasta con el presupuesto aprobado.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

const DIA_MS = 86_400_000;

// ── Utilidades de fecha ──────────────────────────────────────

// "YYYY-MM-DD" → { anio, mes (1-12) }
function parseFecha(iso) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

// Clave de mes "YYYY-MM"
function mesKey(anio, mes) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Genera array de claves de mes de los últimos N meses (inclusive hoy)
function ultimosMeses(hoy, n) {
  const ref = new Date(hoy + "T00:00:00");
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setMonth(d.getMonth() - i);
    keys.push(mesKey(d.getFullYear(), d.getMonth() + 1));
  }
  return keys;
}

// Porcentaje del año transcurrido hasta hoy (0-1)
function fraccionAnio(hoy, anio) {
  const ini = new Date(`${anio}-01-01T00:00:00`).getTime();
  const fin = new Date(`${anio}-12-31T23:59:59`).getTime();
  const now = new Date(hoy + "T00:00:00").getTime();
  return Math.min(1, Math.max(0, (now - ini) / (fin - ini)));
}

// ── OT helpers ───────────────────────────────────────────────

function costoOT(o) { return (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0); }

// ── API pública ──────────────────────────────────────────────

// Gasto real de una nave en un año completo, desglosado por tipo de OT.
// embId null → flota completa.
export function gastoAnual(ots = [], embId, anio) {
  const filtradas = (ots || []).filter(
    (o) => o.estado === "cerrada" &&
      (embId == null || o.embarcacion_id === embId) &&
      o.fecha && parseFecha(o.fecha).anio === anio
  );
  let preventivo = 0, correctivo = 0, otro = 0;
  for (const o of filtradas) {
    const c = costoOT(o);
    if (o.tipo === "preventivo") preventivo += c;
    else if (o.tipo === "correctivo") correctivo += c;
    else otro += c;
  }
  return { preventivo, correctivo, otro, total: preventivo + correctivo + otro };
}

// Serie de gasto mensual para los últimos N meses (incluye meses en cero).
// embId null → flota completa.
// → [{ mesKey, label, preventivo, correctivo, otro, total }]
export function serieMensual(ots = [], embId, hoy, meses = 12) {
  const keys  = ultimosMeses(hoy, meses);
  const byMes = new Map(keys.map((k) => [k, { preventivo: 0, correctivo: 0, otro: 0 }]));

  (ots || []).forEach((o) => {
    if (o.estado !== "cerrada" || !o.fecha) return;
    if (embId != null && o.embarcacion_id !== embId) return;
    const k = o.fecha.slice(0, 7);
    if (!byMes.has(k)) return;
    const b = byMes.get(k);
    const c = costoOT(o);
    if (o.tipo === "preventivo") b.preventivo += c;
    else if (o.tipo === "correctivo") b.correctivo += c;
    else b.otro += c;
  });

  return keys.map((k) => {
    const b = byMes.get(k);
    const d = new Date(k + "-01T12:00:00");
    return {
      mesKey: k,
      label: d.toLocaleString("es-CL", { month: "short", year: "2-digit" }),
      preventivo: b.preventivo,
      correctivo: b.correctivo,
      otro: b.otro,
      total: b.preventivo + b.correctivo + b.otro,
    };
  });
}

// Run-rate anual: proyección basada en los últimos `ventana` meses.
// embId null → flota completa.
// → { mensual, anualProyectado, mesesConData }
export function runRate(ots = [], embId, hoy, ventana = 3) {
  const serie    = serieMensual(ots, embId, hoy, ventana);
  const conData  = serie.filter((s) => s.total > 0).length;
  const totalPer = serie.reduce((s, m) => s + m.total, 0);
  const mensual  = ventana > 0 ? totalPer / ventana : 0;
  return { mensual, anualProyectado: mensual * 12, mesesConData: conData };
}

// Estado del presupuesto: compara gasto YTD con la fracción del año transcurrida.
// presupuestoAnual = 0 → sin presupuesto definido → zona "sin-dato"
// → { porcentaje, esperado, desviacion, zona: "ok"|"atención"|"critico"|"sin-dato" }
export function estadoPresupuesto(gastoYTD, presupuestoAnual, hoy, anio) {
  if (!(presupuestoAnual > 0)) return { porcentaje: null, esperado: null, desviacion: null, zona: "sin-dato" };
  const frac      = fraccionAnio(hoy, anio);
  const esperado  = presupuestoAnual * frac;
  const desviacion = gastoYTD - esperado;
  const porcentaje = presupuestoAnual > 0 ? (gastoYTD / presupuestoAnual) * 100 : null;
  const zona = desviacion <= 0 ? "ok"
    : desviacion / presupuestoAnual <= 0.05 ? "atención"
    : "critico";
  return { porcentaje, esperado, desviacion, zona };
}

// Meses hasta agotar el presupuesto al run-rate actual.
// → número de meses o null si sin run-rate o ya agotado
export function mesesHastaAgotamiento(gastoYTD, presupuestoAnual, mensual) {
  if (!(presupuestoAnual > 0) || !(mensual > 0)) return null;
  const saldo = presupuestoAnual - gastoYTD;
  if (saldo <= 0) return 0;
  return saldo / mensual;
}

// Análisis completo de flota para un año.
// presupuestosMap: Map<embarcacion_id, monto_anual>
// → [{ emb, gasto, rr, ppto, estado, mesesAgot }]
export function presupuestoFlota({ ots = [], embarcaciones = [], presupuestosMap = new Map(), hoy, anio }) {
  return (embarcaciones || []).map((emb) => {
    const gasto  = gastoAnual(ots, emb.id, anio);
    const rr     = runRate(ots, emb.id, hoy, 3);
    const ppto   = presupuestosMap.get(emb.id) ?? 0;
    const estado = estadoPresupuesto(gasto.total, ppto, hoy, anio);
    const mesesAgot = mesesHastaAgotamiento(gasto.total, ppto, rr.mensual);
    return { emb, gasto, rr, ppto, estado, mesesAgot };
  });
}
