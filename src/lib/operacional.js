// ============================================================
//  Lógica pura del nivel operacional de flota.
//  - evaluarZarpe: semáforo GO / CONDICIONAL / NO-GO por nave
//    (la decisión operativa diaria del armador).
//  - diasEnMar: utilización real desde las mareas.
//  - scoreBacklog: prioridad de riesgo de cada OT abierta para
//    ordenar la cola de trabajo (SMRP: backlog en semanas-cuadrilla).
//  Criticidad de equipos: "A" (crítico) / "B" / "C".
// ============================================================

const DIA_MS = 86_400_000;

// ── Semáforo de zarpe ───────────────────────────────────────
// Evalúa una embarcación contra el estado real de la operación.
// planesEval: salida de evaluarPlanes(planes, equipos) de lib/pm.
// hoy: "YYYY-MM-DD" (inyectable para tests).
// → { nivel: "go"|"condicional"|"nogo", bloqueos: [...], advertencias: [...] }
//   cada razón: { texto, nav, ref? } (nav = módulo donde se resuelve)
export function evaluarZarpe(embId, { equipos = [], ots = [], documentos = [], planesEval = [], hoy } = {}) {
  const hoyD = new Date((hoy || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const bloqueos = [], advertencias = [];

  // 1) Equipos fuera de servicio o en reparación
  for (const e of equipos) {
    if (e.embarcacion_id !== embId) continue;
    const nombre = e.sistema || e.id_visible || "equipo";
    if (e.estado === "fuera_servicio") {
      if (e.criticidad === "A") bloqueos.push({ texto: `${nombre} fuera de servicio (crítico A)`, nav: "equipos" });
      else advertencias.push({ texto: `${nombre} fuera de servicio`, nav: "equipos" });
    } else if (e.estado === "en_reparacion" && e.criticidad === "A") {
      advertencias.push({ texto: `${nombre} en reparación (crítico A)`, nav: "equipos" });
    }
  }

  // 2) OTs abiertas críticas / altas
  for (const o of ots) {
    if (o.embarcacion_id !== embId || o.estado === "cerrada") continue;
    if (o.prioridad === "critica") {
      bloqueos.push({ texto: `OT crítica abierta · ${o.folio || ""} · ${o.sistema || ""}`.trim(), nav: "ots", ref: o.id });
    } else if (o.prioridad === "alta") {
      advertencias.push({ texto: `OT alta abierta · ${o.folio || ""} · ${o.sistema || ""}`.trim(), nav: "ots", ref: o.id });
    }
  }

  // 3) Documentos / certificados (vencido bloquea; por vencer ≤7 días advierte)
  for (const d of documentos) {
    if (d.embarcacion_id !== embId || !d.vencimiento) continue;
    const dias = Math.floor((new Date(d.vencimiento + "T00:00:00") - hoyD) / DIA_MS);
    if (dias < 0) bloqueos.push({ texto: `${d.tipo || "Documento"} vencido el ${d.vencimiento}`, nav: "cumplimiento" });
    else if (dias <= 7) advertencias.push({ texto: `${d.tipo || "Documento"} vence en ${dias} día${dias !== 1 ? "s" : ""}`, nav: "cumplimiento" });
  }

  // 4) PM vencido sobre equipo crítico A
  for (const r of planesEval) {
    if (r.tone !== "red" || r.equipo?.embarcacion_id !== embId) continue;
    if (r.equipo?.criticidad === "A") {
      advertencias.push({ texto: `PM vencido en crítico A · ${r.plan.descripcion} (${r.equipo.sistema || r.equipo.id_visible})`, nav: "planpm" });
    }
  }

  const nivel = bloqueos.length ? "nogo" : advertencias.length ? "condicional" : "go";
  return { nivel, bloqueos, advertencias };
}

// ── Utilización: días en mar dentro de una ventana ──────────
// Suma la intersección de cada marea [zarpe_at, recalada_at|ahora]
// con la ventana [ahora - ventanaDias, ahora]. → días (decimal)
export function diasEnMar(mareas = [], embId, hoyMs = Date.now(), ventanaDias = 30) {
  const ini = hoyMs - ventanaDias * DIA_MS;
  let ms = 0;
  for (const m of mareas || []) {
    if (m?.embarcacion_id !== embId || !m?.zarpe_at) continue;
    const z = new Date(m.zarpe_at).getTime();
    const r = m.recalada_at ? new Date(m.recalada_at).getTime() : hoyMs;
    const desde = Math.max(z, ini), hasta = Math.min(r, hoyMs);
    if (hasta > desde) ms += hasta - desde;
  }
  return ms / DIA_MS;
}

// ── Backlog priorizado ──────────────────────────────────────
const PESO_PRIORIDAD  = { critica: 40, alta: 28, media: 16, baja: 8 };
const PESO_CRITICIDAD = { A: 25, B: 12, C: 5 };
const PESO_TIPO       = { correctivo: 10, predictivo: 6, preventivo: 4, modificativo: 2 };

// Días que lleva abierta una OT desde su fecha (≥ 0).
export function diasAbierta(ot, hoy) {
  if (!ot?.fecha) return 0;
  const hoyD = new Date((hoy || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const d = Math.floor((hoyD - new Date(ot.fecha.slice(0, 10) + "T00:00:00")) / DIA_MS);
  return Math.max(0, d);
}

// Score de riesgo 0-100: prioridad de la OT + criticidad del equipo
// + antigüedad (envejecimiento) + naturaleza del trabajo.
export function scoreBacklog(ot, equipo, hoy) {
  let s = PESO_PRIORIDAD[ot?.prioridad] ?? 12;
  s += equipo ? (PESO_CRITICIDAD[equipo.criticidad] ?? 8) : 10;  // sin criticidad/equipo: incertidumbre media
  s += Math.min(25, diasAbierta(ot, hoy) * 0.5);                 // +0.5/día, tope 25 (50 días)
  s += PESO_TIPO[ot?.tipo] ?? 4;
  return Math.min(100, Math.round(s));
}

// Nivel visual del score → [tono Pill, etiqueta]
export function nivelScore(s) {
  if (s >= 70) return ["red",    "Urgente"];
  if (s >= 45) return ["yellow", "Alta"];
  if (s >= 25) return ["steel",  "Media"];
  return              ["green",  "Baja"];
}

// Semanas-cuadrilla de backlog (SMRP): HH pendientes / HH disponibles
// por semana. Sano: 2–4 semanas. → null si no hay capacidad definida.
export function semanasCuadrilla(hhTotal, hhSemana) {
  const cap = Number(hhSemana);
  if (!(cap > 0)) return null;
  return (Number(hhTotal) || 0) / cap;
}
