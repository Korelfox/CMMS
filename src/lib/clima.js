import { hoyLocal } from "./fechas";
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

/** Semáforo zarpe/recalada (viento + oleaje). */
export function evaluarZarpeClima({ vientoKn = 0, oleajeM = 0 } = {}) {
  const v = Number(vientoKn) || 0;
  const o = Number(oleajeM) || 0;
  if (v >= 28 || o >= 3.0) {
    return { nivel: "rojo", label: "No zarpar", tone: "red", icon: "nogo" };
  }
  if (v >= 20 || o >= 2.0) {
    return { nivel: "ambar", label: "Precaución", tone: "yellow", icon: "warn" };
  }
  return { nivel: "verde", label: "Favorable", tone: "green", icon: "go" };
}

/** Semáforo trabajos en cubierta (viento + lluvia próx. 6 h). */
export function evaluarCubierta({ vientoKn = 0, precipMm6h = 0 } = {}) {
  const v = Number(vientoKn) || 0;
  const p = Number(precipMm6h) || 0;
  if (v >= 25 || p >= 5) {
    return { nivel: "rojo", label: "No recomendado", tone: "red", icon: "nogo" };
  }
  if (v >= 18 || p >= 2) {
    return { nivel: "ambar", label: "Limitado", tone: "yellow", icon: "warn" };
  }
  return { nivel: "verde", label: "Adecuado", tone: "green", icon: "go" };
}

/** Semáforo ventana PM en puerto (viento, oleaje, lluvia). */
export function evaluarPmPuerto({ vientoKn = 0, oleajeM = 0, precipMm6h = 0 } = {}) {
  const v = Number(vientoKn) || 0;
  const o = Number(oleajeM) || 0;
  const p = Number(precipMm6h) || 0;
  if (v >= 22 || o >= 2.5 || p >= 8) {
    return { nivel: "rojo", label: "Posponer", tone: "red", icon: "nogo" };
  }
  if (v >= 15 || p >= 3) {
    return { nivel: "ambar", label: "Ventana reducida", tone: "yellow", icon: "warn" };
  }
  return { nivel: "verde", label: "Buena ventana", tone: "green", icon: "go" };
}

/** Tres semáforos operacionales para el widget. */
export function evaluarSemáforosOperacionales(actual = {}, precipMm6h = 0) {
  const base = {
    vientoKn: actual.vientoKn,
    oleajeM: actual.oleajeM,
    precipMm6h,
  };
  return {
    zarpe: evaluarZarpeClima(base),
    cubierta: evaluarCubierta(base),
    pmPuerto: evaluarPmPuerto(base),
  };
}

/** Peor nivel entre semáforos (para pill resumen). */
export function peorSemáforo(semaforos = {}) {
  const orden = { rojo: 3, ambar: 2, verde: 1 };
  const vals = Object.values(semaforos);
  if (!vals.length) return evaluarCondiciones({});
  return vals.reduce((a, b) => (orden[b.nivel] > orden[a.nivel] ? b : a));
}

/** Clave localStorage colapsado del widget por empresa. */
export function storageKeyPronosticoColapsado(empresaId) {
  return empresaId ? `cmms-pronostico-colapsado-${empresaId}` : "cmms-pronostico-colapsado";
}

/** Horas restantes del día local desde serie horaria. */
export function horarioRestanteHoy(horario = []) {
  const hoy = hoyLocal();
  return (horario || []).filter((h) => (h.time || "").startsWith(hoy));
}

/** Serie marea para gráfico 48 h. */
export function serieMarea48h(horario = []) {
  return (horario || []).slice(0, 48)
    .filter((h) => h.mareaM != null)
    .map((h) => ({
      hora: formatearHoraCorta(h.time),
      mareaM: h.mareaM,
    }));
}

/**
 * Detecta pleamar/bajamar estimadas en serie horaria (máx./mín. locales).
 * mareaM en metros MSL — estimación modelada, no datum náutico chileno.
 */
export function analizarMarea(horario = [], ahoraMs = Date.now()) {
  const serie = (horario || []).filter((h) => h.mareaM != null).slice(0, 48);
  if (serie.length < 3) return null;

  const eventos = [];
  for (let i = 1; i < serie.length - 1; i += 1) {
    const prev = serie[i - 1].mareaM;
    const curr = serie[i].mareaM;
    const next = serie[i + 1].mareaM;
    if (curr >= prev && curr >= next) {
      eventos.push({ tipo: "pleamar", time: serie[i].time, alturaM: curr });
    } else if (curr <= prev && curr <= next) {
      eventos.push({ tipo: "bajamar", time: serie[i].time, alturaM: curr });
    }
  }

  const futuros = eventos.filter((e) => new Date(e.time).getTime() > ahoraMs);
  const pleamar = futuros.find((e) => e.tipo === "pleamar") || null;
  const bajamar = futuros.find((e) => e.tipo === "bajamar") || null;
  const actual = serie.find((h) => new Date(h.time).getTime() >= ahoraMs) || serie[0];

  return {
    actualM: actual?.mareaM ?? null,
    pleamar,
    bajamar,
    serie: serieMarea48h(horario),
    estimada: true,
  };
}

/** Etiqueta corta pleamar/bajamar. */
export function etiquetaEventoMarea(evento) {
  if (!evento) return null;
  const tipo = evento.tipo === "pleamar" ? "Pleamar" : "Bajamar";
  return `${tipo} ~${formatearHoraCorta(evento.time)} (${Number(evento.alturaM).toFixed(1)} m)`;
}

/** Localidad oficial SHOA más cercana al puerto del catálogo CMMS. */
export const LOCALIDADES_SHOA = {
  "puerto montt":   "PUERTO MONTT",
  "calbuco":        "PUERTO MONTT",
  "ancud":          "ANCUD",
  "castro":         "CASTRO",
  "chonchi":        "CASTRO",
  "quellon":        "CASTRO",
  "chacao":         "PUERTO CHACAO",
  "talcahuano":     "TALCAHUANO",
  "coronel":        "CORONEL",
  "lota":           "CORONEL",
  "san antonio":    "SAN ANTONIO",
  "valparaiso":     "VALPARAÍSO",
  "coquimbo":       "COQUIMBO",
  "antofagasta":    "ANTOFAGASTA",
  "iquique":        "IQUIQUE",
  "arica":          "ARICA",
  "puerto natales": "PUERTO NATALES",
  "punta arenas":   "PUNTA ARENAS",
};

export function localidadShoa(puertoLabel) {
  const key = normalizarPuerto(puertoLabel);
  if (LOCALIDADES_SHOA[key]) return LOCALIDADES_SHOA[key];
  const parcial = Object.entries(LOCALIDADES_SHOA).find(
    ([k, v]) => key.includes(k) || k.includes(key) ||
      key.includes(v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
  );
  return parcial ? parcial[1] : null;
}

/** Enlaces a fuentes oficiales chilenas (consulta humana, no API). */
export function referenciasMareaOficial(puertoLabel) {
  const localidad = localidadShoa(puertoLabel);
  return {
    localidad,
    shoa: "https://www.shoa.cl/php/mareas.php",
    directemar: "https://www.directemar.cl/directemar/navegacion-y-metereologia/pronosticos-para-la-navegacion",
  };
}

/** Resumen compacto para auditoría en prezarpe. */
export function resumirClimaParaZarpe(datos) {
  if (!datos?.actual) return null;
  const precip6h = precipProximasHoras(datos.horario, 6);
  const sem = evaluarSemáforosOperacionales(datos.actual, precip6h);
  return {
    puerto: datos.puerto,
    actualizado: datos.actualizado,
    vientoKn: datos.actual.vientoKn,
    oleajeM: datos.actual.oleajeM,
    precipMm6h: precip6h,
    semaforoZarpe: sem.zarpe.nivel,
    labelZarpe: sem.zarpe.label,
    localidadShoa: localidadShoa(datos.puerto),
  };
}

export function textoClimaObservacion(resumen) {
  if (!resumen) return "";
  const v = resumen.vientoKn != null ? `${Math.round(resumen.vientoKn)} kn` : "—";
  const o = resumen.oleajeM != null ? `${Number(resumen.oleajeM).toFixed(1)} m` : "—";
  return `Clima al zarpe (${resumen.puerto || "—"}): viento ${v}, oleaje ${o}, semáforo ${resumen.labelZarpe}.`;
}

/**
 * Detecta ventanas adversas próximas 48 h para alertas IA-F.
 * Retorna el evento más próximo con peor severidad.
 */
export function resumirAlertasTemporales(horario = [], ahoraMs = Date.now()) {
  const ventanaMs = 48 * 3600000;
  let peor = null;
  const orden = { rojo: 2, ambar: 1, verde: 0 };

  for (const h of horario || []) {
    const t = new Date(h.time).getTime();
    if (t <= ahoraMs || t > ahoraMs + ventanaMs) continue;
    const ev = evaluarZarpeClima({
      vientoKn: h.vientoKn ?? 0,
      oleajeM: h.oleajeM ?? 0,
    });
    if (ev.nivel === "verde") continue;
    const cand = { time: h.time, ev, vientoKn: h.vientoKn, oleajeM: h.oleajeM, t };
    if (!peor || orden[ev.nivel] > orden[peor.ev.nivel] ||
      (orden[ev.nivel] === orden[peor.ev.nivel] && t < peor.t)) {
      peor = cand;
    }
  }

  return {
    hayTemporal: !!peor,
    peor,
    etiqueta: peor
      ? `Temporal ~${formatearHoraCorta(peor.time)} · ${peor.ev.label}` +
        (peor.vientoKn != null ? ` · ${Math.round(peor.vientoKn)} kn` : "") +
        (peor.oleajeM != null ? ` · ${Number(peor.oleajeM).toFixed(1)} m oleaje` : "")
      : null,
  };
}

/** Insight IA-F a partir de pronóstico cargado. */
export function insightClimaIAF(datos) {
  if (!datos?.actual) return null;
  const precip6h = precipProximasHoras(datos.horario, 6);
  const sem = evaluarSemáforosOperacionales(datos.actual, precip6h);
  const temporal = resumirAlertasTemporales(datos.horario);
  const actualEv = sem.zarpe;
  const sev = actualEv.nivel === "rojo" || temporal.peor?.ev.nivel === "rojo"
    ? "red"
    : actualEv.nivel === "ambar" || temporal.peor?.ev.nivel === "ambar"
      ? "amber"
      : "ok";

  if (sev === "ok") {
    return {
      agente: "IA-F",
      severidad: "ok",
      titulo: "Clima marítimo favorable",
      detalle: `${datos.puerto || "Puerto"} · sin temporal significativa en 48 h · consultar SHOA/Directemar para navegación`,
      valor: Math.round(datos.actual.vientoKn ?? 0),
    };
  }

  const detalle = [
    actualEv.nivel !== "verde"
      ? `Ahora: ${actualEv.label} (${Math.round(datos.actual.vientoKn ?? 0)} kn, ${Number(datos.actual.oleajeM ?? 0).toFixed(1)} m oleaje)`
      : null,
    temporal.etiqueta ? `Próximo pico: ${temporal.etiqueta}` : null,
    "Apoyo operacional — verificar avisos oficiales Directemar.",
  ].filter(Boolean).join(" · ");

  return {
    agente: "IA-F",
    severidad: sev,
    titulo: sev === "red" ? "Condiciones marítimas adversas" : "Precaución meteorológica",
    detalle,
    valor: Math.round(datos.actual.vientoKn ?? 0),
  };
}
