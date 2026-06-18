// Sugerencia de “siguiente acción” para tab Hoy (Fase 3 IA — reglas Copiloto).

import { resolveAlertaNav } from "./alertaNav";
import { generarAlertas } from "./alertas";
import { filterByEmbarcacion } from "./embarcacionActiva";
import { evaluarPlanes } from "./pm";

const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };

/**
 * Prioriza la mejor acción para el técnico en Campo.
 * @returns {object|null} { titulo, detalle, cta, kind, otId?, destino?, params?, alerta? }
 */
export function sugerirSiguienteAccion({
  ots = [],
  planesEval = [],
  enEjecucion = null,
  alertas = [],
  embarcacionId,
} = {}) {
  if (enEjecucion) {
    const pasos = Array.isArray(enEjecucion.checklist) ? enEjecucion.checklist : [];
    const hechos = pasos.filter((p) => p.ok).length;
    return {
      kind: "ot_continue",
      titulo: `Continuar ${enEjecucion.folio}`,
      detalle: enEjecucion.descripcion || enEjecucion.sistema || "OT en ejecución",
      cta: pasos.length ? `Checklist ${hechos}/${pasos.length}` : "Continuar checklist",
      otId: enEjecucion.id,
      razon: "Tienes una OT en curso — cerrarla reduce el backlog del turno.",
    };
  }

  const critica = [...ots]
    .filter((o) => o.prioridad === "critica" || o.prioridad === "alta")
    .sort((a, b) => (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9))[0];

  if (critica) {
    return {
      kind: "ot_start",
      titulo: `Iniciar ${critica.folio}`,
      detalle: critica.descripcion || critica.sistema || "OT prioritaria",
      cta: critica.prioridad === "critica" ? "Iniciar crítica" : "Iniciar OT",
      otId: critica.id,
      razon: "Prioridad operativa: atiende la OT de mayor impacto antes que el resto.",
    };
  }

  const pmUrg = planesEval.find((r) => r.tone === "red") || planesEval.find((r) => r.tone === "yellow");
  if (pmUrg) {
    const { destino, params } = resolveAlertaNav(
      { cat: "pm", ref: pmUrg.plan?.id, equipoId: pmUrg.equipo?.id, embId: embarcacionId, sev: pmUrg.tone === "red" ? "red" : "amber" },
      { appMode: "campo", embarcacionId },
    );
    return {
      kind: "nav",
      titulo: `PM · ${pmUrg.plan?.descripcion || "preventivo"}`,
      detalle: pmUrg.label,
      cta: "Ver plan PM",
      destino,
      params: { ...(params || {}), campo: true },
      razon: "Preventivo vencido o próximo — evita correctivo no planificado.",
    };
  }

  const alertaTop = alertas[0];
  if (alertaTop) {
    const { destino, params, campoEvent } = resolveAlertaNav(alertaTop, { appMode: "campo", embarcacionId });
    return {
      kind: campoEvent?.tab === "trabajo" ? "ot_start" : "nav",
      titulo: alertaTop.titulo,
      detalle: alertaTop.detalle,
      cta: "Ir a gestionar",
      otId: alertaTop.cat === "ot" ? alertaTop.ref : undefined,
      destino: campoEvent?.tab || destino,
      params: campoEvent ? { ...campoEvent, campo: true } : { ...(params || {}), campo: true },
      alerta: alertaTop,
      razon: "Copiloto detectó una alerta que conviene resolver ahora.",
    };
  }

  const siguiente = [...ots].sort((a, b) => (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9))[0];
  if (siguiente) {
    return {
      kind: "ot_start",
      titulo: `Trabajar ${siguiente.folio}`,
      detalle: siguiente.descripcion || "—",
      cta: "Abrir OT",
      otId: siguiente.id,
      razon: "Siguiente OT en la cola del turno.",
    };
  }

  return null;
}

/** Alertas scoped a una embarcación (subset ligero para Hoy). */
export function alertasParaEmbarcacion(raw, embarcacionId, empresa) {
  if (!raw || !embarcacionId) return [];
  const ots = filterByEmbarcacion(raw.ordenes_trabajo || [], embarcacionId);
  const equipos = filterByEmbarcacion(raw.equipos || [], embarcacionId);
  const embarcaciones = (raw.embarcaciones || []).filter((e) => e.id === embarcacionId);
  const eqIds = new Set(equipos.map((e) => e.id));
  const plsFiltrados = (raw.planes_pm || []).filter((p) => p.activo && eqIds.has(p.equipo_id));
  const planesEval = evaluarPlanes(plsFiltrados, equipos);
  return generarAlertas({
    embarcaciones,
    equipos,
    items: raw.inventario_items || [],
    stock: raw.stock || [],
    ots,
    solicitudes: filterByEmbarcacion(raw.solicitudes || [], embarcacionId),
    compras: raw.compras || [],
    prezarpes: filterByEmbarcacion(raw.prezarpes || [], embarcacionId),
    documentos: filterByEmbarcacion(raw.documentos || [], embarcacionId),
    planesEval,
    mediciones: raw.mediciones_pdm || [],
    fallas: filterByEmbarcacion(raw.fallas || [], embarcacionId),
    destinos: raw.inventario_item_destinos || [],
    varadas: filterByEmbarcacion(raw.varadas || [], embarcacionId),
    lecturas: raw.lecturas_horometro || [],
    empresa,
  }).filter((a) => a.sev === "red" || a.sev === "amber");
}
