// Deep links accionables desde alertas (Fase 3 IA — navegación contextual).

import { ALERTA_NAV } from "./alertas";

/** Destinos que Campo puede abrir sin cambiar a Oficina (tab o stack). */
export const CAMPO_INLINE_DEST = new Set([
  "hoy", "trabajo", "horometros", "mas",
  "solicitudes", "inventario", "planpm", "prezarpe", "ots",
]);

/**
 * Resuelve módulo + navParams para una alerta.
 * @returns {{ destino: string, params: object|null, campoEvent?: object }}
 */
export function resolveAlertaNav(alerta, { appMode = "oficina", embarcacionId } = {}) {
  if (!alerta?.cat) return { destino: "alertas", params: null };

  const destino = ALERTA_NAV[alerta.cat] || "alertas";
  const params = {};
  const emb = alerta.embId || embarcacionId;

  switch (alerta.cat) {
    case "ot":
      if (alerta.ref) params.otId = alerta.ref;
      if (appMode === "campo") {
        return {
          destino: "trabajo",
          params: { otId: alerta.ref, openWizard: true, campo: true },
          campoEvent: { tab: "trabajo", otId: alerta.ref, openWizard: true },
        };
      }
      params.detailTab = "ejecucion";
      break;

    case "datos":
      if (alerta.ref) {
        params.otId = alerta.ref;
        params.detailTab = /valorizar/i.test(alerta.titulo || "") ? "costos" : "trazabilidad";
      }
      break;

    case "pm":
      params.tab = "plan";
      if (emb) params.filtro = emb;
      if (alerta.ref) params.planId = alerta.ref;
      if (alerta.equipoId) params.equipoId = alerta.equipoId;
      if (appMode === "campo") {
        params.campo = true;
        return { destino: "planpm", params, campoEvent: null };
      }
      break;

    case "pdm":
      if (alerta.equipoId) params.equipoId = alerta.equipoId;
      params.vista = "series";
      break;

    case "stock":
      params.filtroStock = alerta.sev === "red" ? "bajo" : "revisar";
      if (alerta.ref) params.itemId = alerta.ref;
      if (appMode === "campo") {
        params.campo = true;
        return { destino: "inventario", params, campoEvent: null };
      }
      break;

    case "sla":
      params.filtro = "pendiente";
      params.slaVencido = true;
      if (alerta.ref) params.solicitudId = alerta.ref;
      if (appMode === "campo") {
        params.campo = true;
        return { destino: "solicitudes", params, campoEvent: null };
      }
      break;

    case "equipo":
      if (emb) params.embFiltro = emb;
      if (alerta.ref) params.equipoId = alerta.ref;
      params.vista = "cola";
      if (appMode === "campo") {
        params.campo = true;
        params.tab = "plan";
        return { destino: "planpm", params, campoEvent: null };
      }
      break;

    case "horometro":
      if (alerta.ref) params.equipoId = alerta.ref;
      if (emb) params.embFiltro = emb;
      if (appMode === "campo") {
        params.campo = true;
        return {
          destino: "horometros",
          params,
          campoEvent: { tab: "horometros", params },
        };
      }
      break;

    case "consumo":
      if (emb) params.embFiltro = emb;
      params.vista = "flota";
      if (appMode === "campo") {
        params.campo = true;
        return { destino: "prezarpe", params, campoEvent: null };
      }
      break;

    case "documento":
      if (emb) params.filtro = emb;
      if (alerta.ref) params.docId = alerta.ref;
      break;

    case "compra":
      params.tab = "compras";
      if (alerta.ref) params.compraId = alerta.ref;
      break;

    case "fmeca":
      if (emb) params.embFiltro = emb;
      if (alerta.ref) params.fallaId = alerta.ref;
      break;

    case "varada":
      if (alerta.ref) params.varadaId = alerta.ref;
      if (emb) params.embFiltro = emb;
      break;

    case "clima":
      params.seccion = "clima";
      break;

    case "ia":
      params.modo = "optimizar";
      if (emb) params.embFiltro = emb;
      if (appMode === "campo") {
        params.campo = true;
        params.tab = "plan";
        return { destino: "planpm", params: { ...params, embFiltro: emb }, campoEvent: null };
      }
      break;

    default:
      break;
  }

  const hasParams = Object.keys(params).length > 0;
  return { destino, params: hasParams ? params : null, campoEvent: null };
}

/** Ejecuta navegación desde alerta (header, módulo Alertas, Hoy). */
export function navigateFromAlerta(onNavigate, alerta, opts = {}) {
  const { destino, params, campoEvent } = resolveAlertaNav(alerta, opts);
  if (opts.appMode === "campo" && campoEvent) {
    window.dispatchEvent(new CustomEvent("cmms-campo-nav", { detail: campoEvent }));
    return;
  }
  if (opts.appMode === "campo" && CAMPO_INLINE_DEST.has(destino)) {
    onNavigate?.(destino, { ...(params || {}), campo: true });
    return;
  }
  onNavigate?.(destino, params);
}
