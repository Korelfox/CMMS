import { hoyLocal } from "./fechas";
// ============================================================
//  Sugerencia de stock mínimo/máximo basada en historial de
//  fallas correctivas y criticidad de los equipos vinculados.
//  Supuesto: 1 unidad consumida por evento correctivo.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

const DIA_MS  = 86_400_000;
const PERIODO = 365;               // días de análisis por defecto
const CICLO   = 90;                // días entre reposiciones (Q)

// Factor de seguridad por criticidad máxima del equipo destinatario.
const FACTOR_SEG = { A: 2.5, B: 1.5, C: 1.0 };

// Criticidad ordinal A > B > C.
function critMax(equipos = []) {
  if (equipos.some((e) => e.criticidad === "A")) return "A";
  if (equipos.some((e) => e.criticidad === "B")) return "B";
  return "C";
}

// Correctivas cerradas en últimos periodoDias sobre un conjunto de equipoIds.
// hoy: "YYYY-MM-DD"
export function correctivasPorEquipos(ots = [], equipoIds = [], periodoDias = PERIODO, hoy) {
  if (!equipoIds.length) return 0;
  const hoyMs = new Date((hoy || hoyLocal()) + "T00:00:00").getTime();
  const corte = hoyMs - periodoDias * DIA_MS;
  const idSet = new Set(equipoIds);
  return (ots || []).filter(
    (o) => idSet.has(o.equipo_id) &&
      o.tipo === "correctivo" && o.estado === "cerrada" &&
      o.fecha && new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime() >= corte
  ).length;
}

// Sugiere min/max para un ítem dado sus equipos destino y el historial de OTs.
// equiposDestino: array de equipos (con criticidad) vinculados al ítem.
// → { minSugerido, maxSugerido, demandaDiaria, confianza, razon }
export function sugerirMinMax({ item, equiposDestino = [], ots = [], periodoDias = PERIODO, hoy } = {}) {
  const equipoIds     = (equiposDestino || []).map((e) => e.id);
  const crit          = critMax(equiposDestino);
  const leadDias      = Math.max(1, Number(item?.lead_dias) || 14);
  const factorSeg     = FACTOR_SEG[crit] ?? 1.0;
  const nCorrectivas  = correctivasPorEquipos(ots, equipoIds, periodoDias, hoy);
  const demandaDiaria = nCorrectivas / periodoDias;

  let minSugerido = Math.ceil(demandaDiaria * leadDias * factorSeg);
  // Equipos críticos A necesitan al menos 1 unidad estratégica aunque no haya historial
  if (crit === "A" && minSugerido < 1) minSugerido = 1;

  let maxSugerido = minSugerido + Math.max(1, Math.ceil(demandaDiaria * CICLO));
  // Si demanda es cero y no es crítico A → sin stock
  if (demandaDiaria === 0 && crit !== "A") { minSugerido = 0; maxSugerido = 0; }

  const confianza = nCorrectivas >= 5 ? "alta" : nCorrectivas >= 2 ? "media" : "baja";
  const razon = nCorrectivas >= 2
    ? `${nCorrectivas} correctivas en ${periodoDias}d → demanda ${(demandaDiaria * 30).toFixed(1)}/mes · lead ${leadDias}d · seg ×${factorSeg} (crit ${crit})`
    : crit === "A"
      ? `Sin historial suficiente pero equipo crítico A → stock estratégico mínimo`
      : `Sin historial de fallas correctivas en el período`;

  return { minSugerido, maxSugerido, demandaDiaria, confianza, razon };
}

// Análisis completo de la cartera de ítems.
// items: inventario_items[]  destinos: inventario_item_destinos[]  equipos: equipos[]  ots: ots[]
// → [{ item, equiposDestino, minActual, maxActual, minSugerido, maxSugerido,
//      deltaMins, deltaMaxs, accion, demandaDiaria, confianza, razon }]
//    ordenado por |deltaMins| + |deltaMaxs| desc (mayor urgencia primero)
export function analizarMinMax({ items = [], equipos = [], ots = [], destinos = [], periodoDias = PERIODO, hoy } = {}) {
  const eqMap = new Map((equipos || []).map((e) => [e.id, e]));

  return (items || [])
    .map((item) => {
      const equipoIds    = (destinos || []).filter((d) => d.item_id === item.id).map((d) => d.equipo_id);
      const equiposDest  = equipoIds.map((id) => eqMap.get(id)).filter(Boolean);
      const minActual    = Number(item.stock_min) || 0;
      const maxActual    = Number(item.stock_max) || 0;

      const { minSugerido, maxSugerido, demandaDiaria, confianza, razon } = sugerirMinMax({
        item, equiposDestino: equiposDest, ots, periodoDias, hoy,
      });

      const deltaMins = minSugerido - minActual;
      const deltaMaxs = maxSugerido - maxActual;
      const totalDelta = Math.abs(deltaMins) + Math.abs(deltaMaxs);

      let accion;
      if (totalDelta === 0) {
        accion = "ok";
      } else if (deltaMins > 0 || deltaMaxs > 0) {
        accion = "aumentar";
      } else {
        accion = "reducir";
      }

      return {
        item,
        equiposDestino: equiposDest,
        minActual,
        maxActual,
        minSugerido,
        maxSugerido,
        deltaMins,
        deltaMaxs,
        totalDelta,
        accion,
        demandaDiaria,
        confianza,
        razon,
      };
    })
    .sort((a, b) => b.totalDelta - a.totalDelta);
}
