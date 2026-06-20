import { hoyLocal } from "./fechas";
// ============================================================
//  Lógica pura del módulo Varada / Parada Mayor.
//  Todas las funciones son deterministas e inyectables para tests.
// ============================================================

export const RESPONSABLE_TIPOS = [
  { value: "propio",     label: "Propio",     color: "#1c5c9b" },
  { value: "astillero",  label: "Astillero",  color: "#7c3aed" },
  { value: "tercero",    label: "Tercero",    color: "#d97706" },
  { value: "inspeccion", label: "Inspección", color: "#0891b2" },
];

export const TIPOS_VARADA = [
  { value: "varada",        label: "Varada en dique",   tone: "indigo" },
  { value: "carena",        label: "Carena",             tone: "purple" },
  { value: "parada_puerto", label: "Parada de puerto",   tone: "steel"  },
];

export const ESTADOS_VARADA = [
  { value: "planificacion", label: "Planificación", tone: "steel"  },
  { value: "ejecucion",     label: "En ejecución",  tone: "yellow" },
  { value: "cerrada",       label: "Cerrada",        tone: "green"  },
  { value: "cancelada",     label: "Cancelada",      tone: "slate"  },
];

export const ESTADOS_TRABAJO = [
  { value: "pendiente",    label: "Pendiente",    tone: "slate"  },
  { value: "en_progreso",  label: "En progreso",  tone: "yellow" },
  { value: "completado",   label: "Completado",   tone: "green"  },
  { value: "cancelado",    label: "Cancelado",    tone: "slate"  },
];

// Progreso físico de la varada: % de trabajos completados (cancelados no cuentan).
// → { total, completados, enProgreso, pendientes, pct }
export function calcularProgreso(trabajos = []) {
  const activos = (trabajos || []).filter((t) => t.estado !== "cancelado");
  const total       = activos.length;
  const completados = activos.filter((t) => t.estado === "completado").length;
  const enProgreso  = activos.filter((t) => t.estado === "en_progreso").length;
  const pendientes  = activos.filter((t) => t.estado === "pendiente").length;
  const pct         = total > 0 ? Math.round((completados / total) * 100) : 0;
  return { total, completados, enProgreso, pendientes, pct };
}

// HH totales estimadas del alcance de una varada.
export function hhTotalesVarada(trabajos = []) {
  return (trabajos || [])
    .filter((t) => t.estado !== "cancelado")
    .reduce((s, t) => s + (Number(t.horas_estimadas) || 0), 0);
}

// Costo real acumulado desde todas las OTs ligadas a la varada.
// ots: arreglo completo de OTs; varadaId: id de la varada.
export function costoTotalVarada(ots = [], varadaId) {
  if (!varadaId) return 0;
  return (ots || [])
    .filter((o) => o.varada_id === varadaId)
    .reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);
}

// Desglose por sistema: agrupación de trabajos y su costo asociado.
// → [{ sistema, trabajos: [...], horas, completados, total }]
export function resumenPorSistema(trabajos = [], ots = [], varadaId) {
  const mapa = new Map();
  for (const t of trabajos || []) {
    const key = t.sistema || "Sin sistema";
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key).push(t);
  }
  return [...mapa.entries()].map(([sistema, items]) => {
    const activos    = items.filter((t) => t.estado !== "cancelado");
    const completados = activos.filter((t) => t.estado === "completado").length;
    const horas      = activos.reduce((s, t) => s + (Number(t.horas_estimadas) || 0), 0);
    const otsDelSistema = (ots || []).filter(
      (o) => o.varada_id === varadaId && o.sistema === sistema
    );
    const costo = otsDelSistema.reduce(
      (s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0
    );
    return { sistema, trabajos: items, horas, completados, total: activos.length, costo };
  }).sort((a, b) => b.total - a.total);
}

// Días de duración estimada / real de una varada.
// → { estimados: number|null, reales: number|null, desviacion: number|null }
export function duracionVarada(v, hoy) {
  if (!v) return { estimados: null, reales: null, desviacion: null };
  const hoyStr = hoy || hoyLocal();
  const DIA = 86_400_000;

  let estimados = null;
  if (v.fecha_inicio && v.fecha_fin_estimada) {
    const ini = new Date(v.fecha_inicio + "T00:00:00");
    const fin = new Date(v.fecha_fin_estimada + "T00:00:00");
    estimados = Math.max(0, Math.round((fin - ini) / DIA));
  }

  let reales = null;
  if (v.fecha_inicio) {
    const ini  = new Date(v.fecha_inicio + "T00:00:00");
    const fin  = v.fecha_fin_real
      ? new Date(v.fecha_fin_real + "T00:00:00")
      : new Date(hoyStr + "T00:00:00");
    reales = Math.max(0, Math.round((fin - ini) / DIA));
  }

  const desviacion = estimados != null && reales != null ? reales - estimados : null;
  return { estimados, reales, desviacion };
}

// Tono e ícono de semáforo para una varada según estado y fechas.
// hoy: "YYYY-MM-DD" (inyectable).
// → [tone, label]
export function estadoVaradaTone(v, hoy) {
  if (!v) return ["slate", "—"];
  const hoyStr = hoy || hoyLocal();
  if (v.estado === "cancelada") return ["slate",  "Cancelada"];
  if (v.estado === "cerrada")   return ["green",  "Cerrada"];
  if (v.estado === "ejecucion") {
    if (v.fecha_fin_estimada && v.fecha_fin_estimada < hoyStr)
      return ["red",    "Atrasada"];
    return ["yellow", "En ejecución"];
  }
  // planificacion
  if (v.fecha_inicio && v.fecha_inicio <= hoyStr)
    return ["yellow", "Iniciar ejecución"];
  return ["steel",  "Planificación"];
}

// Trabajos críticos para zarpe que aún no están listos.
// Son los que deben completarse antes de que la nave pueda zarpar.
// → filtro: critico_zarpe=true, estado != completado, != cancelado
export function trabajosBloqueantes(trabajos = []) {
  return (trabajos || []).filter(
    (t) => t.critico_zarpe && t.estado !== "completado" && t.estado !== "cancelado"
  );
}

// Desvío de presupuesto: costo real vs presupuesto.
// → { presupuesto, costo, desvio, pct, tone }
export function desvioPrespuesto(varada, costoReal) {
  const presupuesto = Number(varada?.presupuesto) || 0;
  const costo       = Number(costoReal) || 0;
  if (presupuesto <= 0) return { presupuesto: 0, costo, desvio: null, pct: null, tone: "slate" };
  const desvio = costo - presupuesto;
  const pct    = Math.round((costo / presupuesto) * 100);
  const tone   = pct > 110 ? "red" : pct > 95 ? "yellow" : "green";
  return { presupuesto, costo, desvio, pct, tone };
}
