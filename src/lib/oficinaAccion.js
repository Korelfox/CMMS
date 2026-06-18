// Sugerencia de “siguiente acción” para Tablero Oficina (Copiloto operacional).

import { resolveAlertaNav } from "./alertaNav";
import { filterByEmbarcacion } from "./embarcacionActiva";

const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };
const SLA_HORAS = { critica: 4, alta: 8, media: 24, baja: 72 };

function slaVencido(sol) {
  if (sol.estado !== "pendiente") return false;
  const obj = SLA_HORAS[sol.prioridad] || 24;
  const h = (Date.now() - new Date(sol.created_at).getTime()) / 36e5;
  return h >= obj;
}

function scope(list, embarcacionId) {
  return embarcacionId ? filterByEmbarcacion(list, embarcacionId) : list;
}

/**
 * @returns {object|null} { titulo, detalle, cta, razon, kind, destino?, params?, alerta?, otId? }
 */
export function sugerirSiguienteAccionOficina({
  ots = [],
  solicitudes = [],
  planesEval = [],
  stockBajo = 0,
  embarcacionId,
} = {}) {
  const otsF = scope(ots.filter((o) => o.estado !== "cerrada"), embarcacionId);
  const solsF = scope(solicitudes, embarcacionId);
  const pmF = embarcacionId
    ? planesEval.filter((r) => r.equipo?.embarcacion_id === embarcacionId)
    : planesEval;

  const enEjec = otsF.find((o) => o.estado === "en_ejecucion");
  if (enEjec) {
    return {
      kind: "ot",
      titulo: `Supervisar ${enEjec.folio}`,
      detalle: enEjec.descripcion || enEjec.sistema || "OT en ejecución",
      cta: "Abrir OT · ejecución",
      otId: enEjec.id,
      destino: "ots",
      params: { otId: enEjec.id, detailTab: "ejecucion" },
      razon: "Hay una OT en curso — validar avance y recursos antes que el resto.",
    };
  }

  const sla = [...solsF].filter(slaVencido).sort((a, b) => (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9))[0];
  if (sla) {
    const alerta = { cat: "sla", ref: sla.id, sev: "red", titulo: sla.folio, detalle: sla.descripcion };
    const { destino, params } = resolveAlertaNav(alerta, { appMode: "oficina", embarcacionId });
    return {
      kind: "nav",
      titulo: `SLA vencido · ${sla.folio || "Solicitud"}`,
      detalle: sla.descripcion || "—",
      cta: "Gestionar solicitud",
      destino,
      params,
      alerta,
      razon: "Solicitud fuera de SLA — convertir a OT o rechazar con criterio.",
    };
  }

  const crit = [...otsF]
    .filter((o) => o.prioridad === "critica" || o.prioridad === "alta")
    .sort((a, b) => (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9))[0];
  if (crit) {
    return {
      kind: "ot",
      titulo: `Priorizar ${crit.folio}`,
      detalle: crit.descripcion || crit.sistema || "OT de alta prioridad",
      cta: crit.prioridad === "critica" ? "Abrir OT crítica" : "Abrir OT",
      otId: crit.id,
      destino: "ots",
      params: { otId: crit.id, detailTab: "ejecucion" },
      razon: "OT crítica o alta sin atender — impacto operacional inmediato.",
    };
  }

  const pm = pmF.find((r) => r.tone === "red") || pmF.find((r) => r.tone === "yellow");
  if (pm) {
    const alerta = {
      cat: "pm",
      ref: pm.plan?.id,
      equipoId: pm.equipo?.id,
      embId: embarcacionId || pm.equipo?.embarcacion_id,
      sev: pm.tone === "red" ? "red" : "amber",
    };
    const { destino, params } = resolveAlertaNav(alerta, { appMode: "oficina", embarcacionId });
    return {
      kind: "nav",
      titulo: `PM · ${pm.plan?.descripcion || "preventivo"}`,
      detalle: pm.label,
      cta: "Ver plan PM",
      destino,
      params,
      alerta,
      razon: "Preventivo vencido o próximo — programar antes de correctivo no planificado.",
    };
  }

  if (stockBajo > 0) {
    const alerta = { cat: "stock", sev: "red" };
    const { destino, params } = resolveAlertaNav(alerta, { appMode: "oficina", embarcacionId });
    return {
      kind: "nav",
      titulo: `${stockBajo} ítem${stockBajo !== 1 ? "s" : ""} bajo stock mínimo`,
      detalle: "Repuestos críticos por reponer o comprar",
      cta: "Revisar inventario",
      destino,
      params,
      alerta,
      razon: "Stock bajo mínimo — riesgo de parada por falta de repuesto.",
    };
  }

  const pend = solsF.filter((s) => s.estado === "pendiente").length;
  if (pend > 0) {
    return {
      kind: "nav",
      titulo: `${pend} solicitud${pend !== 1 ? "es" : ""} pendiente${pend !== 1 ? "s" : ""}`,
      detalle: "Cola de requerimientos sin convertir a OT",
      cta: "Ver solicitudes",
      destino: "solicitudes",
      params: { filtro: "pendiente" },
      razon: "Backlog de solicitudes — conviene vaciar la cola del turno.",
    };
  }

  return null;
}
