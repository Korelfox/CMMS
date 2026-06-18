/** Reglas de integridad del registro de equipos (Fase 3 — modo Optimizar). */

import { requiereFechaInstalacionEquipo, tieneFechaInstalacion } from "./plantillaPesquera.js";

export const BRECHA_META = {
  critico_indisponible: { label: "Crítico indisponible", tone: "red", tab: "identidad", prio: 1 },
  huerfano: { label: "Padre inválido", tone: "red", tab: "identidad", prio: 2 },
  sin_criticidad: { label: "Sin criticidad", tone: "amber", tab: "identidad", prio: 3 },
  sin_horometro: { label: "Sin horómetro", tone: "amber", tab: "operacional", prio: 4 },
  sin_repuestos: { label: "Sin repuestos", tone: "amber", tab: "repuestos", prio: 5 },
  sin_fecha_instalacion: { label: "Sin fecha de instalación", tone: "amber", tab: "ficha", prio: 6 },
  sin_ficha: { label: "Sin ficha técnica", tone: "amber", tab: "ficha", prio: 7 },
  mal_clasificado: { label: "Raíz mal clasificada", tone: "amber", tab: "identidad", prio: 8 },
};

const COMPONENTE_TIPOS = new Set(["componente", "instrumento", "equipo"]);
const ESTADOS_INDISP = new Set(["fuera_servicio", "en_reparacion"]);

export function esComponenteNodo(eq) {
  return COMPONENTE_TIPOS.has(eq?.tipo_nodo);
}

/** Nodos cuyo registro debe estar completo para alimentar PM / inventario. */
export function esHojaEvaluable(eq, idsConHijos) {
  if (eq.tipo_nodo === "sistema") return false;
  if (eq.tipo_nodo === "subsistema") return !idsConHijos.has(eq.id);
  return esComponenteNodo(eq);
}

export function horometroConfigurado(eq) {
  const h = eq.horometro;
  return h === "propio" || h === "hereda" || h === "no";
}

export function fichaCompleta(eq) {
  if (eq.ficha && typeof eq.ficha === "object" && Object.keys(eq.ficha).length > 0) return true;
  return !!(String(eq.marca || "").trim() || String(eq.modelo || "").trim());
}

function pushBrecha(out, tipo, _eq) {
  const meta = BRECHA_META[tipo];
  out.push({ tipo, ...meta });
}

export function brechasDeEquipo(eq, byId, repsPorEquipo, idsConHijos) {
  const out = [];
  if (!esHojaEvaluable(eq, idsConHijos)) return out;

  if (eq.parent_id) {
    const padre = byId.get(eq.parent_id);
    if (!padre || padre.embarcacion_id !== eq.embarcacion_id) pushBrecha(out, "huerfano", eq);
  } else if (eq.tipo_nodo === "equipo") {
    pushBrecha(out, "mal_clasificado", eq);
  }

  if (!eq.criticidad) pushBrecha(out, "sin_criticidad", eq);

  if (esComponenteNodo(eq) && !horometroConfigurado(eq)) pushBrecha(out, "sin_horometro", eq);

  if (eq.criticidad === "A" && esComponenteNodo(eq) && !(repsPorEquipo.get(eq.id) > 0)) {
    pushBrecha(out, "sin_repuestos", eq);
  }

  if (esComponenteNodo(eq) && !fichaCompleta(eq)) pushBrecha(out, "sin_ficha", eq);

  if (requiereFechaInstalacionEquipo(eq) && !tieneFechaInstalacion(eq)) {
    pushBrecha(out, "sin_fecha_instalacion", eq);
  }

  if (eq.criticidad === "A" && ESTADOS_INDISP.has(eq.estado)) {
    pushBrecha(out, "critico_indisponible", eq);
  }

  return out;
}

export function buildIndices(equipos) {
  const byId = new Map(equipos.map((e) => [e.id, e]));
  const idsConHijos = new Set();
  equipos.forEach((e) => { if (e.parent_id) idsConHijos.add(e.parent_id); });
  return { byId, idsConHijos };
}

export function analizarBrechas(equipos, destinos, { scope = null } = {}) {
  const { byId, idsConHijos } = buildIndices(equipos);
  const repsPorEquipo = new Map();
  destinos.forEach((d) => repsPorEquipo.set(d.equipo_id, (repsPorEquipo.get(d.equipo_id) || 0) + 1));

  const lista = scope ?? equipos;
  const items = [];
  const porTipo = {};
  let evaluables = 0;
  let completos = 0;
  const idsConBrecha = new Set();

  for (const eq of lista) {
    if (!esHojaEvaluable(eq, idsConHijos)) continue;
    evaluables++;
    const brechas = brechasDeEquipo(eq, byId, repsPorEquipo, idsConHijos);
    if (brechas.length === 0) {
      completos++;
    } else {
      idsConBrecha.add(eq.id);
      for (const b of brechas) {
        items.push({ equipoId: eq.id, equipo: eq, ...b });
        porTipo[b.tipo] = (porTipo[b.tipo] || 0) + 1;
      }
    }
  }

  items.sort((a, b) => {
    if (a.prio !== b.prio) return a.prio - b.prio;
    return (a.equipo.id_visible || "").localeCompare(b.equipo.id_visible || "", "es");
  });

  return {
    items,
    porTipo,
    total: items.length,
    equiposConBrecha: idsConBrecha.size,
    idsConBrecha,
    evaluables,
    completos,
    salud: evaluables > 0 ? Math.round((completos / evaluables) * 100) : 100,
  };
}
