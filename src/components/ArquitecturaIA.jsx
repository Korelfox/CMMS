import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PageHead, InlineSpinner } from "../ui";
import { fetchAll } from "../lib/db";
import { seriesPdM } from "../lib/pdm";
import { diasDesde } from "../lib/horometro";

// ── Paleta self-contained (dark diagram, sin CSS global) ─────────────────
const BG    = "#0d1117";
const BG2   = "#161b22";
const BDR   = "#21262d";
const INK   = "#e6edf3";
const TEXT  = "#c9d1d9";
const MUTED = "#8b949e";
const DIM   = "#6e7681";

const ACCENT = {
  blue:   { t: "#93c5fd", lg: "rgba(59,130,246,.12)",  mg: "rgba(59,130,246,.18)",  b: "rgba(59,130,246,.35)",  bm: "rgba(59,130,246,.5)"  },
  cyan:   { t: "#67e8f9", lg: "rgba(6,182,212,.12)",   mg: "rgba(6,182,212,.18)",   b: "rgba(6,182,212,.35)",   bm: "rgba(6,182,212,.5)"   },
  purple: { t: "#d8b4fe", lg: "rgba(168,85,247,.12)",  mg: "rgba(168,85,247,.18)",  b: "rgba(168,85,247,.35)",  bm: "rgba(168,85,247,.5)"  },
  green:  { t: "#86efac", lg: "rgba(34,197,94,.12)",   mg: "rgba(34,197,94,.18)",   b: "rgba(34,197,94,.35)",   bm: "rgba(34,197,94,.5)"   },
};

const SEV = {
  red:   { fg: "#f87171", bg: "rgba(239,68,68,.1)",    bd: "rgba(239,68,68,.35)"   },
  amber: { fg: "#fbbf24", bg: "rgba(245,158,11,.1)",   bd: "rgba(245,158,11,.35)"  },
  ok:    { fg: "#34d399", bg: "rgba(34,197,94,.08)",   bd: "rgba(34,197,94,.35)"   },
  slate: { fg: "#94a3b8", bg: "rgba(100,116,139,.12)", bd: "rgba(100,116,139,.3)"  },
  none:  { fg: DIM,       bg: "rgba(15,23,42,.85)",    bd: BDR                      },
};

// ── Primitivas de layout ──────────────────────────────────────────────────

function Sec({ children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 18, background: BG2, border: `1px solid ${BDR}`, borderRadius: 10, padding: "16px 18px" }}>
      {children}
    </div>
  );
}

function SecTitle({ children, badgeLabel, badgeSev = "slate" }) {
  const s = SEV[badgeSev] || SEV.slate;
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: DIM, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      {children}
      {badgeLabel && (
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5, background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}>
          {badgeLabel}
        </span>
      )}
    </div>
  );
}

function Lbl({ mt = 11, children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: DIM, letterSpacing: 0.5, marginBottom: 7, marginTop: mt, textTransform: "uppercase" }}>{children}</div>;
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{children}</div>;
}

function Arr({ children }) {
  return <div style={{ textAlign: "center", color: "#4b6ef6", fontSize: 13, fontWeight: 600, padding: "5px 0" }}>{children ?? "↓"}</div>;
}

// ── Cajas del pipeline ────────────────────────────────────────────────────

function SrcBox({ label, sub, count, loading, warn }) {
  const isEmpty = !loading && count !== undefined && count === 0;
  const isWarn  = warn || isEmpty;
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "9px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, lineHeight: 1.4, background: isWarn ? "rgba(245,158,11,.07)" : "rgba(30,41,59,.8)", border: `1px solid ${isWarn ? "rgba(245,158,11,.4)" : BDR}`, color: isWarn ? "#fbbf24" : TEXT }}>
      {label}
      {sub && <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>{sub}</span>}
      {count !== undefined && <span style={{ display: "block", fontSize: 10, marginTop: 4, color: isEmpty ? "#fbbf24" : DIM }}>{loading ? "…" : `${count.toLocaleString()} registros`}</span>}
    </div>
  );
}

function CtxBox({ label, sub, color }) {
  const a = ACCENT[color];
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "9px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, lineHeight: 1.4, background: a.lg, border: `1px solid ${a.b}`, color: a.t }}>
      {label}
      {sub && <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>{sub}</span>}
    </div>
  );
}

function EdgeBox({ label, sub, color }) {
  const a = ACCENT[color];
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "9px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, lineHeight: 1.4, background: a.mg, border: `1px solid ${a.bm}`, color: a.t }}>
      {label}
      {sub && <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>{sub}</span>}
    </div>
  );
}

function StatBox({ label, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "9px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, lineHeight: 1.4, background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.3)", color: "#cbd5e1" }}>
      {label}
      {sub && <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>{sub}</span>}
    </div>
  );
}

// ── Agente con badge de severidad viva ────────────────────────────────────

function Agent({ id, nombre, desc, valor, sev, loading }) {
  const s = SEV[sev] || SEV.none;
  return (
    <div style={{ flex: 1, minWidth: 150, padding: "12px 14px", borderRadius: 8, background: s.bg, border: `1px solid ${s.bd}`, transition: "background .3s, border-color .3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: "uppercase", letterSpacing: 1 }}>{id}</span>
        {loading
          ? <span style={{ fontSize: 10, color: DIM }}>…</span>
          : <span style={{ fontSize: 10.5, fontWeight: 700, color: s.fg, background: s.bg, border: `1px solid ${s.bd}`, padding: "1px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
              {valor}
            </span>
        }
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 3 }}>{nombre}</div>
      <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

// ── Ítem de brecha ISO ────────────────────────────────────────────────────

function GapItem({ id, titulo, desc, fix, stat, statColor, resuelto }) {
  const bg  = resuelto ? "rgba(34,197,94,.06)" : "rgba(239,68,68,.05)";
  const bd  = resuelto ? "rgba(34,197,94,.3)"  : "rgba(239,68,68,.22)";
  const idC = resuelto ? "#86efac" : "#f87171";
  const tiC = resuelto ? "#86efac" : "#fca5a5";
  return (
    <div style={{ display: "flex", gap: 12, background: bg, border: `1px solid ${bd}`, borderRadius: 7, padding: "11px 13px", alignItems: "flex-start" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: idC, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0, paddingTop: 1, minWidth: 42 }}>{id}</div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: tiC, marginBottom: 4 }}>{resuelto ? "✓ " : ""}{titulo}</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.55, marginBottom: stat || fix ? 5 : 0 }}>{desc}</div>
        {stat && <div style={{ fontSize: 11, color: statColor || "#34d399", fontWeight: 600, marginBottom: fix ? 4 : 0 }}>{stat}</div>}
        {fix  && <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600 }}>{fix}</div>}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export default function ArquitecturaIA() {
  const [datos, setDatos] = useState({ eq: [], ots: [], med: [], lec: [] });
  const [cargando, setCargando] = useState(true);
  const [ts, setTs] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [eq, ots, med, lec] = await Promise.all([
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("mediciones_pdm"),
        fetchAll("lecturas_horometro"),
      ]);
      setDatos({ eq: eq || [], ots: ots || [], med: med || [], lec: lec || [] });
      setTs(new Date());
    } catch { /* mantiene datos previos */ }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const m = useMemo(() => {
    const { eq, ots, med, lec } = datos;

    // IA-A: equipos sin criticidad
    const sinCrit = eq.filter(e => !e.criticidad && e.tipo_nodo !== "sistema").length;
    const sevA = sinCrit > 20 ? "red" : sinCrit > 5 ? "amber" : "ok";

    // IA-B: % OTs correctivas cerradas sin modo_falla
    const corrCerr = ots.filter(o => o.estado === "cerrada" && o.tipo === "correctivo");
    const sinModo  = corrCerr.filter(o => !o.modo_falla).length;
    const pctSin   = corrCerr.length >= 5 ? Math.round(sinModo / corrCerr.length * 100) : null;
    const pctCon   = pctSin != null ? 100 - pctSin : null;
    const sevB     = pctSin == null ? "slate" : pctSin > 60 ? "red" : pctSin > 30 ? "amber" : "ok";

    // IA-C: críticos A con <4 OTs cerradas (Weibull)
    const criticos = eq.filter(e => e.criticidad === "A");
    const sinPred  = criticos.filter(eq2 =>
      ots.filter(o => o.equipo_id === eq2.id && o.tipo === "correctivo" && o.estado === "cerrada").length < 4
    ).length;
    const sevC = criticos.length === 0 ? "slate" : sinPred > 0 ? "amber" : "ok";

    // IA-D: series PdM con datos >30 días
    let pdmStale = 0;
    for (const serie of seriesPdM(med).values()) {
      const d = diasDesde(serie[0]?.fecha);
      if (d == null || d > 30) pdmStale++;
    }
    const sevD = pdmStale > 0 ? "amber" : "ok";

    return {
      nEq: eq.length, nOts: ots.length, nMed: med.length, nLec: lec.length,
      nConLec: new Set(lec.map(l => l.equipo_id)).size,
      sinCrit, sevA,
      nCorr: corrCerr.length, sinModo, pctSin, pctCon, sevB,
      criticos: criticos.length, sinPred, sevC,
      pdmStale, sevD,
    };
  }, [datos]);

  const tsStr = ts ? ts.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHead
        kicker="Sistema · Inteligencia Artificial"
        title="Arquitectura IA"
        sub="Pipeline completo: fuentes de datos → context builders → Edge Functions → Claude API. Módulos estadísticos, agentes de monitoreo y brechas ISO 14224."
      />

      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: BG, color: TEXT, padding: 26, borderRadius: 12, fontSize: 13, lineHeight: 1.5 }}>

        {/* ── Cabecera ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 14, borderBottom: `1px solid ${BDR}`, gap: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>
            Arquitectura de Inteligencia Artificial — CMMS Pesquero
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {cargando && <InlineSpinner />}
            {tsStr && !cargando && (
              <span style={{ fontSize: 11, color: DIM, fontFamily: "'IBM Plex Mono', monospace" }}>
                Actualizado {tsStr}
              </span>
            )}
            <button onClick={cargar} disabled={cargando} style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa", background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.3)", borderRadius: 6, padding: "3px 10px", cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.5 : 1, fontFamily: "inherit" }}>
              ↺ Actualizar
            </button>
          </div>
        </div>

        {/* ── Pipeline Claude API ── */}
        <Sec>
          <SecTitle>Pipeline Claude API</SecTitle>

          <Lbl mt={0}>Fuentes de datos — Supabase PostgreSQL (multi-tenant por empresa_id)</Lbl>
          <Row>
            <SrcBox label="BD Equipos"          sub="criticidad · horometro · tipo_nodo"   count={m.nEq}  loading={cargando} />
            <SrcBox label="OTs & Fallas"         sub="modo_falla · estado · cerrada_en"     count={m.nOts} loading={cargando} />
            <SrcBox label="Mareas & Horómetros"  sub="mareas · lecturas_horometro"          count={m.nLec} loading={cargando} />
            <SrcBox label="Inventario"           sub="items · stock · consumos" />
            <SrcBox label="Mediciones PdM"       sub="⚠ gap — no inyectadas en IA"         count={m.nMed} loading={cargando} warn={!cargando && m.nMed === 0} />
          </Row>

          <Arr />

          <Lbl>Context Builders (src/lib/) — construyen el prompt del sistema</Lbl>
          <Row>
            <CtxBox label="copiloto.js"     sub="flota completa + OTs activas"   color="blue"   />
            <CtxBox label="diagnostico.js"  sub="fallas + modo + historial"       color="cyan"   />
            <CtxBox label="informe context" sub="KPIs + tendencias críticas"      color="purple" />
            <CtxBox label="ocr-parser"      sub="imagen → base64 JPEG"            color="green"  />
          </Row>

          <Arr>{"↓  SSE streaming · respuesta fragmentada en tiempo real"}</Arr>

          <Lbl>Supabase Edge Functions — Deno runtime · solo server-side</Lbl>
          <Row>
            <EdgeBox label="copiloto-flota"     sub="análisis + chat interactivo"   color="blue"   />
            <EdgeBox label="diagnostico-fallas" sub="modo de falla + causa raíz"    color="cyan"   />
            <EdgeBox label="informe-ejecutivo"  sub="resumen gerencial PDF-ready"   color="purple" />
            <EdgeBox label="ocr-factura"        sub="extracción de datos → JSON"    color="green"  />
          </Row>

          <Arr>{"↓  HTTPS · Authorization: Bearer ANTHROPIC_API_KEY"}</Arr>

          <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,.14),rgba(168,85,247,.14))", border: "1px solid rgba(99,102,241,.5)", borderRadius: 9, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#c7d2fe", marginBottom: 5 }}>Anthropic Claude API</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
              claude-sonnet-4-6 · max_tokens 2048–4096 · temperature 0.4–0.7 · streaming SSE
            </div>
            <div style={{ fontSize: 11.5, color: "#34d399", fontWeight: 600 }}>
              🔒 ANTHROPIC_API_KEY — vive solo en Supabase Secrets · nunca llega al navegador
            </div>
          </div>
        </Sec>

        {/* ── Pipeline Estadístico ── */}
        <Sec>
          <SecTitle badgeLabel="Sin Claude · cómputo en browser">Pipeline Estadístico</SecTitle>
          <Row>
            <StatBox label="ConfiabilidadML"  sub="Weibull biparamétrico · curva TTF · estimación β y η" />
            <StatBox label="RCA — Causa Raíz" sub="Pareto 80/20 · Bow-Tie manual · árbol de causas" />
            <StatBox label="Score de Riesgo"  sub="Criticidad × MTTR × Frecuencia de falla" />
          </Row>
        </Sec>

        {/* ── Agentes de monitoreo IA ── */}
        <Sec>
          <SecTitle badgeLabel="Frontend · useMemo · Alertas.jsx" badgeSev="amber">Agentes de Monitoreo IA</SecTitle>
          <Row>
            <Agent
              id="IA-A" nombre="Datos de criticidad"
              desc={`Equipos sin criticidad${!cargando ? ` (${m.nEq} totales)` : ""}. >5 → amber · >20 → rojo`}
              valor={m.sinCrit === 0 ? "✓ OK" : `${m.sinCrit} sin crit.`}
              sev={cargando ? "none" : m.sevA} loading={cargando}
            />
            <Agent
              id="IA-B" nombre="OTs sin modo de falla"
              desc={`% correctivas cerradas sin modo_falla ISO 14224${!cargando && m.nCorr > 0 ? ` (${m.nCorr} OTs)` : ""}. >30% → amber · >60% → rojo`}
              valor={m.nCorr < 5 ? "sin datos" : m.pctSin === 0 ? "✓ OK" : `${m.pctSin}% sin modo`}
              sev={cargando ? "none" : m.sevB} loading={cargando}
            />
            <Agent
              id="IA-C" nombre="Historial críticos A"
              desc={`Críticos A con <4 OTs cerradas (Weibull)${!cargando ? ` · ${m.criticos} críticos A` : ""}. >0 → amber`}
              valor={m.criticos === 0 ? "sin datos" : m.sinPred === 0 ? "✓ OK" : `${m.sinPred}/${m.criticos}`}
              sev={cargando ? "none" : m.sevC} loading={cargando}
            />
            <Agent
              id="IA-D" nombre="Señales PdM activas"
              desc={`Series PdM sin medición >30 días${!cargando && m.nMed > 0 ? ` (${m.nMed} mediciones)` : ""}. >0 → amber`}
              valor={m.pdmStale === 0 ? "✓ OK" : `${m.pdmStale} series`}
              sev={cargando ? "none" : m.sevD} loading={cargando}
            />
          </Row>
        </Sec>

        {/* ── Brechas ISO 14224 ── */}
        <Sec last>
          <SecTitle badgeLabel="Requieren acción" badgeSev="red">Brechas ISO 14224 identificadas</SecTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <GapItem
              id="GAP-1"
              titulo="Weibull usa días calendario en lugar de horas de operación"
              desc="ConfiabilidadML calcula TTF usando fechas de OT. ISO 14224 §9.3 requiere parámetro de exposición = horas reales de operación desde lecturas_horometro. Afecta β (forma) y η (escala) del modelo."
              stat={!cargando && m.nConLec > 0 ? `→ ${m.nConLec} equipos ya tienen lecturas registradas (${m.nLec.toLocaleString()} lecturas totales)` : undefined}
              fix="→ Fix: cruzar lectura de horómetro más cercana a cada fecha de falla para obtener horas TTF real."
            />
            <GapItem
              id="GAP-2"
              titulo="Horómetros no inyectados en contexto IA"
              desc="Copiloto Flota e Informe Ejecutivo no incluyen el historial de horas de operación en su contexto, limitando el análisis de desgaste real y vida remanente de equipos."
              fix="→ Fix: agregar summary de lecturas_horometro en copiloto.js e informe context builder."
            />
            <GapItem
              id="GAP-3"
              resuelto
              titulo="ANTHROPIC_API_KEY configurada — pipeline IA operativo"
              desc="El secreto está cargado en Supabase (Edge Functions Secrets). Las 4 funciones (Copiloto, Diagnóstico, Informe, OCR) operan, y habilita el Informe Ejecutivo quincenal automático."
              fix="✓ Resuelto · 2026-06-14."
            />
            <GapItem
              id="GAP-4"
              titulo="Taxonomía FMECA no estructurada (ISO 14224 Apéndice C)"
              desc="OTs tienen modo_falla de texto libre. ISO 14224 define 3 niveles (clase → grupo → código) para análisis estadístico válido y benchmarking de industria."
              stat={!cargando && m.pctCon != null ? `→ Estado actual: ${m.pctCon}% de OTs correctivas con modo_falla registrado (${m.nCorr} OTs)` : undefined}
              statColor={m.pctCon != null ? (m.pctCon < 40 ? "#fbbf24" : "#34d399") : undefined}
              fix="→ Fix: tabla modo_falla_catalogo + selector jerárquico en OTs (enabler para Diagnóstico IA y Confiabilidad)."
            />
          </div>
        </Sec>

      </div>
    </div>
  );
}
