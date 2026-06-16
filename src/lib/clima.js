// ============================================================
//  Clima marítimo — lookup de puertos chilenos, evaluación
//  operacional y formateo. Funciones puras para tests.
// ============================================================

/** Puertos pesqueros/industriales chilenos → coordenadas aprox. */
export const PUERTOS_CHILE = {
  "puerto montt":    { lat: -41.471, lon: -72.936, label: "Puerto Montt" },
  "calbuco":         { lat: -41.773, lon: -73.130, label: "Calbuco" },
  "ancud":           { lat: -41.869, lon: -73.820, label: "Ancud" },
  "castro":          { lat: -42.482, lon: -73.762, label: "Castro" },
  "chonchi":         { lat: -42.623, lon: -73.776, label: "Chonchi" },
  "quellon":         { lat: -43.116, lon: -73.617, label: "Quellón" },
  "chacao":          { lat: -41.745, lon: -73.520, label: "Chacao" },
  "talcahuano":      { lat: -36.724, lon: -73.117, label: "Talcahuano" },
  "coronel":         { lat: -37.033, lon: -73.133, label: "Coronel" },
  "lota":            { lat: -37.089, lon: -73.157, label: "Lota" },
  "san antonio":     { lat: -33.594, lon: -71.620, label: "San Antonio" },
  "valparaiso":      { lat: -33.047, lon: -71.612, label: "Valparaíso" },
  "coquimbo":        { lat: -29.953, lon: -71.343, label: "Coquimbo" },
  "antofagasta":     { lat: -23.650, lon: -70.400, label: "Antofagasta" },
  "iquique":         { lat: -20.214, lon: -70.152, label: "Iquique" },
  "arica":           { lat: -18.479, lon: -70.319, label: "Arica" },
  "puerto natales":  { lat: -51.725, lon: -72.526, label: "Puerto Natales" },
  "punta arenas":    { lat: -53.163, lon: -70.908, label: "Punta Arenas" },
};

export const COORDS_DEFECTO = PUERTOS_CHILE["puerto montt"];

/** Normaliza nombre de puerto para lookup (minúsculas, sin tildes). */
export function normalizarPuerto(nombre) {
  return (nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Resuelve coordenadas desde texto libre de puerto_base. */
export function resolverCoordenadas(puertoBase) {
  const key = normalizarPuerto(puertoBase);
  if (!key) {
    return { ...COORDS_DEFECTO, origen: "defecto", consulta: null };
  }
  if (PUERTOS_CHILE[key]) {
    return { ...PUERTOS_CHILE[key], origen: "exacto", consulta: key };
  }
  const parcial = Object.entries(PUERTOS_CHILE).find(
    ([k, v]) => key.includes(k) || k.includes(key) ||
      key.includes(v.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
  );
  if (parcial) {
    return { ...parcial[1], origen: "parcial", consulta: key };
  }
  return { ...COORDS_DEFECTO, origen: "defecto", consulta: key };
}

/** Rosa de los vientos abreviada desde grados. */
export function direccionViento(grados) {
  if (grados == null || Number.isNaN(Number(grados))) return "—";
  const pts = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return pts[Math.round(((Number(grados) % 360) / 45)) % 8];
}

/** Etiqueta WMO simplificada para UI. */
export function etiquetaClima(code) {
  const c = Number(code);
  if (c === 0)  return "Despejado";
  if (c <= 3)  return "Parcialmente nublado";
  if (c <= 48) return "Niebla";
  if (c <= 55) return "Llovizna";
  if (c <= 65) return "Lluvia";
  if (c <= 75) return "Nieve";
  if (c <= 82) return "Chubascos";
  if (c <= 99) return "Tormenta";
  return "Variable";
}

/** Semáforo operacional según viento (kn) y oleaje (m). */
export function evaluarCondiciones({ vientoKn = 0, oleajeM = 0 } = {}) {
  const v = Number(vientoKn) || 0;
  const o = Number(oleajeM) || 0;
  if (v >= 28 || o >= 3.0) {
    return { nivel: "rojo", label: "Condiciones adversas", tone: "red" };
  }
  if (v >= 20 || o >= 2.0) {
    return { nivel: "ambar", label: "Precaución", tone: "yellow" };
  }
  return { nivel: "verde", label: "Favorable", tone: "green" };
}

/** Resume pronóstico horario en bloques diarios (próximos N días). */
export function resumirPorDia(horario = [], dias = 3) {
  const map = new Map();
  for (const h of horario) {
    const dia = (h.time || "").slice(0, 10);
    if (!dia) continue;
    if (!map.has(dia)) map.set(dia, []);
    map.get(dia).push(h);
  }
  return [...map.entries()].slice(0, dias).map(([fecha, horas]) => {
    const vientos = horas.map((x) => x.vientoKn).filter((n) => n != null);
    const oleajes = horas.map((x) => x.oleajeM).filter((n) => n != null);
    const temps   = horas.map((x) => x.tempC).filter((n) => n != null);
    const maxV = vientos.length ? Math.max(...vientos) : null;
    const maxO = oleajes.length ? Math.max(...oleajes) : null;
    const ev = evaluarCondiciones({ vientoKn: maxV || 0, oleajeM: maxO || 0 });
    return {
      fecha,
      tempMin: temps.length ? Math.min(...temps) : null,
      tempMax: temps.length ? Math.max(...temps) : null,
      vientoMaxKn: maxV,
      oleajeMaxM: maxO,
      evaluacion: ev,
      horas: horas.length,
    };
  });
}

/** Formatea fecha ISO a etiqueta corta es-CL. */
export function formatearDia(fechaISO) {
  if (!fechaISO) return "—";
  const d = new Date(fechaISO + "T12:00:00");
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

/** Lista ordenada de puertos disponibles en el selector. */
export function listaPuertos() {
  return Object.values(PUERTOS_CHILE)
    .map((p) => p.label)
    .sort((a, b) => a.localeCompare(b, "es"));
}

/** true si la etiqueta coincide con un puerto del catálogo. */
export function esPuertoConocido(label) {
  return listaPuertos().includes(label);
}

/** Puerto inicial: preferencia guardada válida, o resolución desde puerto_base. */
export function puertoInicial(puertoBase, guardado = null) {
  if (guardado && esPuertoConocido(guardado)) return guardado;
  return resolverCoordenadas(puertoBase).label;
}

/** Clave localStorage para preferencia de puerto por empresa. */
export function storageKeyPuertoClima(empresaId) {
  return empresaId ? `cmms-puerto-clima-${empresaId}` : "cmms-puerto-clima";
}

/** Hora corta desde ISO horario Open-Meteo. */
export function formatearHoraCorta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/** Serie para gráfico 48 h (viento, oleaje, precipitación). */
export function serieGrafico48h(horario = []) {
  return (horario || []).slice(0, 48).map((h) => ({
    hora: formatearHoraCorta(h.time),
    vientoKn: h.vientoKn ?? null,
    oleajeM: h.oleajeM ?? null,
    precipMm: h.precipMm ?? null,
  }));
}

/** Etiqueta legible del modelo de oleaje Open-Meteo. */
export function etiquetaModeloOleaje(slug) {
  const map = {
    ncep_gfswave016: "GFS Wave 16 km",
    ecmwf_wam: "ECMWF WAM",
    meteofrance_mfwam: "MeteoFrance",
  };
  return map[slug] || slug || "—";
}

/** Precipitación acumulada próximas N horas. */
export function precipProximasHoras(horario = [], horas = 6) {
  return (horario || []).slice(0, horas).reduce(
    (s, h) => s + (Number(h.precipMm) || 0), 0,
  );
}
