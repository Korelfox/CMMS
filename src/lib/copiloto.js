// ============================================================
//  Contexto para el Copiloto IA de Flota.
//  Ensambla un resumen compacto del estado operacional real
//  para inyectarlo en el system prompt de Claude.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

import { riesgoFlota } from "./riesgo";
import { coberturaCriticos } from "./operacional";
import { analizarDesgasteFlota } from "./desgaste";

const DIA_MS = 86_400_000;

// Resumen compacto de la flota para el Copiloto IA.
// → JSON plano con métricas clave: PMs, OTs, riesgo, inventario.
export function construirResumenFlota({
  empresa        = null,
  embarcaciones  = [],
  equipos        = [],
  planesEval     = [],
  ots            = [],
  items          = [],
  stock          = [],
  destinos       = [],
  lecturas       = [],
  hoy            = new Date().toISOString().slice(0, 10),
} = {}) {
  const embsById = new Map((embarcaciones || []).map((e) => [e.id, e]));

  // ── PM status ───────────────────────────────────────────────
  const pmVencidos = (planesEval || []).filter((p) => p.tone === "red");
  const pmProximos = (planesEval || []).filter((p) => p.tone === "yellow");

  const pmPorNave = {};
  for (const p of pmVencidos) {
    const emb  = embsById.get(p.equipo?.embarcacion_id);
    const nave = emb?.nombre || emb?.codigo || "Desconocida";
    pmPorNave[nave] = (pmPorNave[nave] || 0) + 1;
  }

  // ── OTs ─────────────────────────────────────────────────────
  const otsAbiertas = (ots || []).filter((o) => !["cerrada", "cancelada"].includes(o.estado));

  // ── Riesgo ──────────────────────────────────────────────────
  const ranking   = riesgoFlota({ planesEval, ots, equipos, hoy });
  const topRiesgo = ranking.slice(0, 8).map((r) => {
    const emb = embsById.get(r.equipo?.embarcacion_id);
    return {
      equipo:     r.equipo?.id_visible,
      sistema:    r.equipo?.sistema,
      criticidad: r.equipo?.criticidad,
      nave:       emb?.nombre || emb?.codigo || "—",
      score:      r.score,
      zona:       r.zona,
      motivos:    (r.motivos || []).slice(0, 2),
    };
  });

  // ── Correctivas recientes 30d ────────────────────────────────
  const hoyMs  = new Date(hoy + "T00:00:00").getTime();
  const hace30 = hoyMs - 30 * DIA_MS;
  const correctivasUltimos30d = (ots || []).filter(
    (o) => o.tipo === "correctivo" && o.estado === "cerrada" &&
           o.fecha && new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime() >= hace30,
  ).length;

  // ── Repuestos críticos sin stock ─────────────────────────────
  const sinCobertura = coberturaCriticos({ items, stock, destinos, equipos })
    .slice(0, 8)
    .map((x) => ({
      codigo:          x.item?.codigo,
      descripcion:     x.item?.descripcion,
      equiposCriticos: (x.equiposA || []).map((e) => e.id_visible || e.sistema).filter(Boolean),
    }));

  // ── Desgaste y horas operación ──────────────────────────────
  const desgaste = analizarDesgasteFlota({ planesEval, lecturas, equipos, embarcaciones });

  return {
    empresa: empresa?.nombre || "Desconocida",
    flota: (embarcaciones || []).map((e) => ({
      nombre:    e.nombre || e.codigo,
      tipo:      e.tipo,
      matricula: e.matricula,
    })),
    equipos: {
      total:        (equipos || []).length,
      criticidadA:  (equipos || []).filter((e) => e.criticidad === "A").length,
      criticidadB:  (equipos || []).filter((e) => e.criticidad === "B").length,
    },
    mantenimiento: {
      pmVencidos:          pmVencidos.length,
      pmProximos30d:       pmProximos.length,
      pmVencidosPorNave:   pmPorNave,
      otsAbiertas:         otsAbiertas.length,
      otsCorrectivas:      otsAbiertas.filter((o) => o.tipo === "correctivo").length,
      correctivasUltimos30d,
    },
    riesgo: {
      enZonaRoja:     ranking.filter((r) => r.zona === "roja").length,
      enZonaAmarilla: ranking.filter((r) => r.zona === "amarilla").length,
      topEquiposRiesgo: topRiesgo,
    },
    inventario: {
      repuestosCriticosSinStock: sinCobertura,
    },
    horasOperacion: desgaste,
    fecha: hoy,
  };
}
