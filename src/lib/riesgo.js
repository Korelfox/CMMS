// ============================================================
//  Riesgo de falla por equipo / flota.
//  Combina estado PM, historial de fallas (MTBF) y frecuencia
//  de correctivas para producir un score de riesgo 0-100.
//  Todas las funciones son puras e inyectables para tests.
// ============================================================

const DIA_MS = 86_400_000;

// Media de días entre fallas consecutivas de un equipo.
// Requiere al menos 2 correctivas cerradas con fecha.
// → días (number) | null
export function mtbfDias(ots = [], equipoId) {
  const fallas = (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.estado === "cerrada" && o.fecha)
    .map((o) => new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime())
    .sort((a, b) => a - b);
  if (fallas.length < 2) return null;
  let suma = 0;
  for (let i = 1; i < fallas.length; i++) suma += fallas[i] - fallas[i - 1];
  const mediaMs = suma / (fallas.length - 1);
  return mediaMs / DIA_MS;
}

// Días transcurridos desde la última correctiva cerrada del equipo.
// hoy: "YYYY-MM-DD"
// → días (number) | null
export function diasDesdeUltimaFalla(ots = [], equipoId, hoy) {
  const hoyMs = new Date((hoy || new Date().toISOString().slice(0, 10)) + "T00:00:00").getTime();
  const fallas = (ots || [])
    .filter((o) => o.equipo_id === equipoId && o.tipo === "correctivo" && o.estado === "cerrada" && o.fecha)
    .map((o) => new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime());
  if (fallas.length === 0) return null;
  const ultima = Math.max(...fallas);
  return Math.max(0, (hoyMs - ultima) / DIA_MS);
}

// Correctivas cerradas en los últimos periodoDias para un equipo.
export function correctivasRecientes(ots = [], equipoId, periodoDias, hoy) {
  const hoyMs = new Date((hoy || new Date().toISOString().slice(0, 10)) + "T00:00:00").getTime();
  const corte = hoyMs - periodoDias * DIA_MS;
  return (ots || []).filter(
    (o) => o.equipo_id === equipoId &&
      o.tipo === "correctivo" && o.estado === "cerrada" &&
      o.fecha && new Date(o.fecha.slice(0, 10) + "T00:00:00").getTime() >= corte
  ).length;
}

const MULT_CRIT = { A: 1.4, B: 1.1, C: 0.85 };

// Score de riesgo (0-100) para un equipo individual.
// planesEvalEquipo: subset de evaluarPlanes() filtrado al equipo.
// otsFalla: OTs de ESTE equipo (ya filtradas fuera).
// → { score, zona, motivos, mtbf, diasUltimaFalla }
export function scoreRiesgoEquipo({ equipo, planesEvalEquipo = [], otsFalla = [], hoy }) {
  let pts = 0;
  const motivos = [];

  // 1. Estado PM
  const rojos    = (planesEvalEquipo || []).filter((p) => p.tone === "red");
  const amarillos = (planesEvalEquipo || []).filter((p) => p.tone === "yellow");
  if (rojos.length > 0) {
    pts += 40;
    motivos.push(`PM vencido: ${rojos[0].plan.descripcion}`);
  } else if (amarillos.length > 0) {
    pts += 20;
    motivos.push(`PM próximo: ${amarillos[0].plan.descripcion}`);
  }

  // 2. Proximidad al MTBF
  const mtbf            = mtbfDias(otsFalla, equipo?.id);
  const diasUltimaFalla = diasDesdeUltimaFalla(otsFalla, equipo?.id, hoy);
  if (mtbf != null && diasUltimaFalla != null && mtbf > 0) {
    const ratio = diasUltimaFalla / mtbf;
    if (ratio >= 1.0) {
      pts += 30;
      motivos.push(`MTBF superado: ${Math.round(diasUltimaFalla)}d desde última falla (MTBF=${Math.round(mtbf)}d)`);
    } else if (ratio >= 0.75) {
      pts += 20;
      motivos.push(`Acercándose al MTBF (${Math.round(ratio * 100)}% consumido)`);
    } else if (ratio >= 0.5) {
      pts += 10;
    }
  }

  // 3. Frecuencia de fallas reciente (12 meses)
  const nFallas = correctivasRecientes(otsFalla, equipo?.id, 365, hoy);
  if (nFallas >= 5) {
    pts += 15;
    motivos.push(`${nFallas} fallas correctivas en los últimos 12 meses`);
  } else if (nFallas >= 3) {
    pts += 10;
    motivos.push(`${nFallas} fallas correctivas en los últimos 12 meses`);
  } else if (nFallas >= 1) {
    pts += 5;
  }

  // Multiplicador criticidad
  const mult  = MULT_CRIT[equipo?.criticidad] ?? 1.0;
  const score = Math.min(100, Math.round(pts * mult));
  const zona  = score >= 40 ? "roja" : score >= 20 ? "amarilla" : "verde";

  return { score, zona, motivos, mtbf, diasUltimaFalla, nFallas12m: nFallas };
}

// Ranking de riesgo de toda la flota (o de una nave si embId != null).
// planesEval: salida de evaluarPlanes(planes, equipos).
// → [{ equipo, score, zona, motivos, mtbf, diasUltimaFalla, planes[] }] sorted score desc.
export function riesgoFlota({ planesEval = [], ots = [], equipos = [], embId = null, hoy }) {
  const hoyStr = hoy || new Date().toISOString().slice(0, 10);
  const lista  = (equipos || []).filter((e) => !embId || e.embarcacion_id === embId);

  return lista.map((equipo) => {
    const planesEvalEquipo = (planesEval || []).filter((p) => p.equipo?.id === equipo.id);
    const otsFalla         = (ots || []).filter((o) => o.equipo_id === equipo.id);
    const { score, zona, motivos, mtbf, diasUltimaFalla, nFallas12m } = scoreRiesgoEquipo({
      equipo, planesEvalEquipo, otsFalla, hoy: hoyStr,
    });
    return {
      equipo,
      score,
      zona,
      motivos,
      mtbf,
      diasUltimaFalla,
      nFallas12m,
      planes: planesEvalEquipo,
    };
  }).sort((a, b) => b.score - a.score);
}
