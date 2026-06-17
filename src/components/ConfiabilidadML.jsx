import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sigma, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Clock, CalendarClock, Info, HelpCircle,
} from "lucide-react";
import { fetchAll } from "../lib/db";
import {
  rankearFlota, puntosCurva, cuantilWeibull,
  vidaUtilResidual, probFalla, interpretarBeta, mtbfDias,
} from "../lib/confiabilidad";
import { C } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";

const DIA_MS = 86_400_000;

// ── Paleta por zona ────────────────────────────────────────────────────────────
const ZONA = {
  critica:   { label: "Crítico",   bg: "#fef2f2", border: C.red,    fg: C.red,    dot: C.red    },
  alerta:    { label: "Alerta",    bg: "#fffbeb", border: C.amber,  fg: "#92400e", dot: C.amber  },
  vigilar:   { label: "Vigilar",   bg: "#fefce8", border: "#ca8a04", fg: "#713f12", dot: "#ca8a04" },
  estable:   { label: "Estable",   bg: "#f0fdf4", border: C.green,  fg: "#14532d", dot: C.green  },
  sin_datos: { label: "Sin datos", bg: "transparent", border: C.line, fg: C.slate, dot: C.slate  },
};
const BETA_TONE_COLOR = {
  blue: "#3b82f6", green: C.green, yellow: "#ca8a04", amber: C.amber, red: C.red,
};

// ── Helpers de formato ─────────────────────────────────────────────────────────
const pct = (v)  => v == null ? "—" : `${Math.round(v * 100)}%`;
const dec2 = (v) => v == null ? "—" : v.toFixed(2);

// Muestra duración en la unidad del modelo: 'h' → "Xh" o "~Xd"; 'd' → "Xd"
function mostrarDuracion(v, unidad) {
  if (v == null) return "—";
  if (unidad === "h") return v < 24 ? `${Math.round(v)}h` : `~${Math.round(v / 24)}d`;
  return v < 1 ? "<1d" : `${Math.round(v)}d`;
}

function rulColor(v, unidad) {
  if (v == null) return C.slate;
  const d = unidad === "h" ? v / 24 : v;
  return d < 7 ? C.red : d < 30 ? C.amber : d < 90 ? "#ca8a04" : C.green;
}
function fechaCorta(iso) {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function ConfiabilidadML() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ranking");
  const [filtroEmb, setFiltroEmb]     = useState("todas");
  const [filtroCrit, setFiltroCrit]   = useState("todas");
  const [filtroZona, setFiltroZona]   = useState("todas");
  const [equipoSelId, setEquipoSelId] = useState(null);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, equipos, ots, lecturas] = await Promise.all([
        fetchAll("embarcaciones"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("lecturas_horometro"),
      ]);
      setData({ embs, equipos, ots, lecturas });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ranking = useMemo(() => {
    if (!data) return [];
    return rankearFlota({ equipos: data.equipos, ots: data.ots, lecturas: data.lecturas || [], hoy });
  }, [data, hoy]);

  const embName = useMemo(() => {
    const m = new Map((data?.embs || []).map((e) => [e.id, e.nombre || e.codigo]));
    return (embId) => m.get(embId) || "—";
  }, [data]);

  // Primer equipo con ajuste disponible (default tab Weibull)
  const primerosConAjuste = useMemo(() => ranking.filter((r) => r.ajuste), [ranking]);

  const equipoSelFinal = useMemo(() => {
    if (equipoSelId) return ranking.find((r) => r.equipo.id === equipoSelId) || null;
    return primerosConAjuste[0] || ranking[0] || null;
  }, [equipoSelId, ranking, primerosConAjuste]);

  // Filtros para ranking
  const visible = useMemo(() => {
    return ranking.filter((r) => {
      if (filtroEmb !== "todas" && r.equipo.embarcacion_id !== filtroEmb) return false;
      if (filtroCrit !== "todas" && r.equipo.criticidad !== filtroCrit) return false;
      if (filtroZona !== "todas" && r.zona !== filtroZona) return false;
      return true;
    });
  }, [ranking, filtroEmb, filtroCrit, filtroZona]);

  // KPIs
  const nCritica   = useMemo(() => ranking.filter((r) => r.zona === "critica").length,   [ranking]);
  const nAlerta    = useMemo(() => ranking.filter((r) => r.zona === "alerta").length,    [ranking]);
  const nVigilar   = useMemo(() => ranking.filter((r) => r.zona === "vigilar").length,   [ranking]);
  const nSinDatos  = useMemo(() => ranking.filter((r) => r.zona === "sin_datos").length, [ranking]);
  const nConAjuste = useMemo(() => ranking.filter((r) => r.ajuste).length,               [ranking]);

  if (loading) return (
    <div>
      <PageHead kicker="Análisis · Confiabilidad" title="Predictivo ML" />
      <Card><InlineSpinner label="Ajustando distribuciones Weibull…" /></Card>
    </div>
  );

  const TABS = [
    { key: "ranking",    label: "Ranking ML"           },
    { key: "curva",      label: "Curva de Sobrevivencia" },
    { key: "calendario", label: "Calendario 90d"        },
  ];

  return (
    <div>
      <PageHead
        kicker="Análisis · Confiabilidad"
        title="Predictivo ML"
        sub={`Weibull auto-ajustado desde historial de fallas. ${nConAjuste} de ${ranking.length} equipos con modelo estadístico activo.`}
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard n={nCritica}  label="Críticos"    tone="red"    />
        <KpiCard n={nAlerta}   label="Alerta"      tone="yellow" />
        <KpiCard n={nVigilar}  label="Vigilar"     tone="steel"  />
        <KpiCard n={nSinDatos} label="Sin historia" tone="slate"  sub={`${nConAjuste} con modelo`} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${C.line}` }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "9px 18px", border: "none", background: "transparent", color: tab === t.key ? C.cyan : C.slate, fontWeight: tab === t.key ? 700 : 400, fontSize: 13, cursor: "pointer", fontFamily: "inherit", borderBottom: tab === t.key ? `2.5px solid ${C.cyan}` : "2.5px solid transparent", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ranking"    && <TabRanking visible={visible} embName={embName} filtroEmb={filtroEmb} setFiltroEmb={setFiltroEmb} filtroCrit={filtroCrit} setFiltroCrit={setFiltroCrit} filtroZona={filtroZona} setFiltroZona={setFiltroZona} embs={data?.embs || []} />}
      {tab === "curva"      && <TabCurva equipoSel={equipoSelFinal} ranking={ranking} embName={embName} onSelect={setEquipoSelId} />}
      {tab === "calendario" && <TabCalendario ranking={ranking} embs={data?.embs || []} hoy={hoy} />}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ n, label, tone, sub }) {
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : tone === "steel" ? C.steel : C.slate;
  const bg    = tone === "red" ? "#fef2f2" : tone === "yellow" ? "#fffbeb" : "var(--card-bg)";
  return (
    <div style={{ background: bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.slate, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.steel, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Tab 1: Ranking ML ─────────────────────────────────────────────────────────
function TabRanking({ visible, embName, filtroEmb, setFiltroEmb, filtroCrit, setFiltroCrit, filtroZona, setFiltroZona, embs }) {
  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroEmb} onChange={(e) => setFiltroEmb(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "var(--card-bg)", color: C.ink, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
          <option value="todas">Todas las naves</option>
          {embs.map((e) => <option key={e.id} value={e.id}>{e.nombre || e.codigo}</option>)}
        </select>
        {["todas","A","B","C"].map((c) => (
          <button key={c} onClick={() => setFiltroCrit(c)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${filtroCrit===c ? C.cyan : C.line}`, background: filtroCrit===c ? C.cyan : "transparent", color: filtroCrit===c ? "#fff" : C.ink, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: filtroCrit===c ? 700 : 400 }}>
            {c === "todas" ? "Toda crit." : `Crit. ${c}`}
          </button>
        ))}
        {["todas","critica","alerta","vigilar","estable","sin_datos"].map((z) => (
          <button key={z} onClick={() => setFiltroZona(z)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${filtroZona===z ? (ZONA[z]?.border||C.cyan) : C.line}`, background: filtroZona===z ? (ZONA[z]?.border||C.cyan) : "transparent", color: filtroZona===z ? "#fff" : C.ink, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: filtroZona===z ? 700 : 400 }}>
            {z === "todas" ? "Todas zonas" : ZONA[z]?.label || z}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card><div style={{ padding: "32px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>Sin equipos con estos filtros.</div></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}`, background: "var(--card-bg)" }}>
                  {["Equipo","Nave","Crit","Zona","F(t) actual","RUL (50%)","Falla predicha","β","Fallas"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.slate, fontSize: 11, letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const z     = ZONA[r.zona] || ZONA.sin_datos;
                  const interp = r.beta ? interpretarBeta(r.beta) : null;
                  return (
                    <tr key={r.equipo.id} style={{ borderBottom: `1px solid ${C.line}`, background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,.015)" }}>
                      {/* Equipo */}
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: C.abyss, whiteSpace: "nowrap" }}>
                        {r.equipo.id_visible || r.equipo.id}
                        <div style={{ fontSize: 11, color: C.slate, fontWeight: 400 }}>{r.equipo.sistema}</div>
                      </td>
                      {/* Nave */}
                      <td style={{ padding: "10px 14px", color: C.ink, whiteSpace: "nowrap" }}>{embName(r.equipo.embarcacion_id)}</td>
                      {/* Criticidad */}
                      <td style={{ padding: "10px 14px" }}>
                        <Pill tone={r.equipo.criticidad === "A" ? "red" : r.equipo.criticidad === "B" ? "yellow" : "steel"}>{r.equipo.criticidad || "—"}</Pill>
                      </td>
                      {/* Zona */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", background: z.bg, border: `1px solid ${z.border}`, color: z.fg, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{z.label}</span>
                      </td>
                      {/* F(t) bar */}
                      <td style={{ padding: "10px 14px", minWidth: 110 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, background: C.line, borderRadius: 3, height: 6 }}>
                            <div style={{ width: `${(r.pF || 0) * 100}%`, height: 6, borderRadius: 3, background: z.border }} />
                          </div>
                          <span style={{ color: z.fg, fontWeight: 700, fontSize: 12, minWidth: 34, textAlign: "right" }}>{pct(r.pF)}</span>
                        </div>
                      </td>
                      {/* RUL */}
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: rulColor(r.rul50, r.unidad), whiteSpace: "nowrap" }}>{mostrarDuracion(r.rul50, r.unidad)}</td>
                      {/* Fecha predicha */}
                      <td style={{ padding: "10px 14px", color: r.fechaPredichaFalla ? C.ink : C.slate, whiteSpace: "nowrap" }}>
                        {r.fechaPredichaFalla ? (
                          <><span style={{ fontWeight: 700 }}>{fechaCorta(r.fechaPredichaFalla)}</span><span style={{ color: C.slate, fontSize: 10.5, marginLeft: 4 }}>/{r.fechaPredichaFalla.slice(0,4)}</span></>
                        ) : "—"}
                      </td>
                      {/* β */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {r.beta ? (
                          <span title={interp?.raz} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `${BETA_TONE_COLOR[interp?.tone] || C.slate}18`, color: BETA_TONE_COLOR[interp?.tone] || C.slate, borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 12 }}>
                            β={dec2(r.beta)}
                          </span>
                        ) : <span style={{ color: C.slate }}>—</span>}
                      </td>
                      {/* # Fallas */}
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: r.nFallas > 0 ? C.ink : C.slate, textAlign: "center" }}>{r.nFallas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: C.slate }}>
        F(t) = probabilidad de falla acumulada al tiempo actual. RUL = Vida útil residual al 50% confianza. Unidad: <b>h</b> = horas reales de operación (ISO 14224 §9.3) · <b>d</b> = días calendario (sin horómetro).
      </div>
    </div>
  );
}

// ── Tab 2: Curva de Sobrevivencia ─────────────────────────────────────────────
function TabCurva({ equipoSel, ranking, embName, onSelect }) {
  const [expandInfo, setExpandInfo] = useState(false);

  const conAjuste = ranking.filter((r) => r.ajuste);

  return (
    <div>
      {/* Selector de equipo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: C.slate }}>Equipo:</label>
        <select value={equipoSel?.equipo.id || ""} onChange={(e) => onSelect(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "var(--card-bg)", color: C.ink, fontSize: 13, cursor: "pointer", fontFamily: "inherit", minWidth: 260 }}>
          {conAjuste.map((r) => (
            <option key={r.equipo.id} value={r.equipo.id}>
              {r.equipo.id_visible} — {r.equipo.sistema} ({embName(r.equipo.embarcacion_id)})
            </option>
          ))}
          {ranking.filter((r) => !r.ajuste).map((r) => (
            <option key={r.equipo.id} value={r.equipo.id} disabled>
              {r.equipo.id_visible} — sin datos suficientes
            </option>
          ))}
        </select>
        {conAjuste.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.slate }}>Se necesitan ≥4 OTs correctivas por equipo para ajustar el modelo.</span>
        )}
      </div>

      {!equipoSel?.ajuste ? (
        <Card>
          <div style={{ padding: "40px 0", textAlign: "center", color: C.slate }}>
            <HelpCircle size={32} color={C.line} style={{ margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6 }}>Datos insuficientes</div>
            <div style={{ fontSize: 13, maxWidth: 380, margin: "0 auto" }}>
              Se requieren al menos 4 OTs correctivas para este equipo (genera ≥3 intervalos de tiempo entre fallas).
              Actualmente: {equipoSel?.nFallas ?? 0} OT{equipoSel?.nFallas !== 1 ? "s" : ""} correctiva{equipoSel?.nFallas !== 1 ? "s" : ""}.
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Parámetros y métricas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <ParamCard label="β (forma)" value={dec2(equipoSel.beta)} sub={interpretarBeta(equipoSel.beta)?.texto} color={BETA_TONE_COLOR[interpretarBeta(equipoSel.beta)?.tone]} />
            <ParamCard label={`η (escala)`} value={`${Math.round(equipoSel.eta)}${equipoSel.unidad}`} sub={`Vida característica B63.2 (${equipoSel.unidad === "h" ? "horas op." : "días cal."})`} />
            <ParamCard label="MTBF" value={`${Math.round(mtbfDias(equipoSel.beta, equipoSel.eta))}${equipoSel.unidad}`} sub={`Vida media esperada (${equipoSel.unidad === "h" ? "horas op." : "días cal."})`} />
            <ParamCard label="R² ajuste" value={dec2(equipoSel.ajuste.r2)} sub={`n=${equipoSel.ajuste.n} fallas`} color={equipoSel.ajuste.r2 >= 0.85 ? C.green : equipoSel.ajuste.r2 >= 0.65 ? C.amber : C.red} />
          </div>

          {/* Interpretación β */}
          {(() => {
            const interp = interpretarBeta(equipoSel.beta);
            if (!interp) return null;
            const color = BETA_TONE_COLOR[interp.tone] || C.slate;
            return (
              <div style={{ borderRadius: 10, border: `1px solid ${color}30`, background: `${color}0d`, padding: "12px 16px" }}>
                <button onClick={() => setExpandInfo((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Info size={14} color={color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>β = {dec2(equipoSel.beta)} → {interp.texto}</span>
                  </div>
                  {expandInfo ? <ChevronUp size={14} color={color} /> : <ChevronDown size={14} color={color} />}
                </button>
                {expandInfo && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>{interp.raz}</p>}
              </div>
            );
          })()}

          {/* Cuantiles B10/B50/B90 */}
          <Card style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Cuantiles de falla</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[[0.10,"B10","10% habrá fallado para"],[0.50,"B50","50% habrá fallado para"],[0.90,"B90","90% habrá fallado para"]].map(([p, lbl, desc]) => {
                const v = cuantilWeibull(p, equipoSel.beta, equipoSel.eta);
                return (
                  <div key={lbl} style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>{lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: p <= 0.1 ? C.green : p <= 0.5 ? C.amber : C.red }}>{v != null ? `${Math.round(v)}${equipoSel.unidad}` : "—"}</div>
                    <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>{desc}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* VUR con 3 niveles de confianza */}
          {equipoSel.tActual != null && (
            <Card style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Clock size={14} color={C.steel} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Vida Útil Residual — equipo lleva {Math.round(equipoSel.tActual)}{equipoSel.unidad} desde última falla
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[[0.50,"50% confianza","Intervalo agresivo"],[0.70,"70% confianza","Intervalo moderado"],[0.85,"85% confianza","Intervalo conservador"]].map(([conf, lbl, sub]) => {
                  const rul = vidaUtilResidual(equipoSel.tActual, equipoSel.beta, equipoSel.eta, conf);
                  const color = rulColor(rul, equipoSel.unidad);
                  return (
                    <div key={conf} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginBottom: 4 }}>{lbl}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color }}>{mostrarDuracion(rul, equipoSel.unidad)}</div>
                      <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>{sub}</div>
                      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 4 }}>
                        {rul != null ? `F(t+VUR) = ${pct(conf)}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Curva SVG */}
          <Card style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 12 }}>
              Curva de probabilidad de falla acumulada F(t) — <span style={{ fontWeight: 400 }}>{equipoSel.equipo.id_visible} · {equipoSel.equipo.sistema}</span>
            </div>
            <CurvaWeibull analisis={equipoSel} />
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              <Leyenda color="#3b82f6" label="Curva F(t)" />
              <Leyenda color="#a855f7" label="Punto actual" dot />
              <Leyenda color="#ef4444" label="Fallas históricas" triangle />
              <Leyenda color="#ef4444"  label="Zona VUR50" faint />
              <Leyenda color="#f59e0b"  label="Zona VUR70" faint />
              <Leyenda color="#a855f7"  label="Zona VUR85" faint />
            </div>
            {equipoSel.ajuste.r2 < 0.65 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: `1px solid ${C.amber}`, fontSize: 12, color: "#92400e" }}>
                <AlertTriangle size={13} />
                Ajuste bajo (R²={dec2(equipoSel.ajuste.r2)}). Necesita más datos. El modelo existe pero la curva es aproximada.
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ParamCard({ label, value, sub, color }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.abyss }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Leyenda({ color, label, dot, triangle, faint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.slate }}>
      {faint  && <div style={{ width: 14, height: 8, background: color, opacity: 0.2, borderRadius: 2 }} />}
      {!faint && !triangle && <div style={{ width: 18, height: dot ? 0 : 2.5, background: color, borderRadius: 2, position: "relative" }}>
        {dot && <div style={{ position: "absolute", top: -4, left: 4, width: 8, height: 8, background: color, borderRadius: "50%", border: "2px solid #fff" }} />}
      </div>}
      {triangle && <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `8px solid ${color}`, opacity: 0.6 }} />}
      {label}
    </div>
  );
}

// ── SVG Curva Weibull ──────────────────────────────────────────────────────────
function CurvaWeibull({ analisis }) {
  const { beta, eta, tActual, ttfs, unidad } = analisis;
  if (!beta || !eta) return null;

  const W = 580, H = 238;
  const ml = 52, mr = 28, mt = 28, mb = 44;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const pts  = puntosCurva(beta, eta, 120);
  const tMax = pts[pts.length - 1]?.t || eta * 4;

  const px = (t) => ml + (Math.min(t, tMax) / tMax) * pw;
  const py = (p) => mt + (1 - Math.min(p, 1)) * ph;

  // X axis ticks
  const rawStep = tMax / 6;
  const step    = rawStep < 10 ? Math.ceil(rawStep) : rawStep < 60 ? Math.ceil(rawStep / 5) * 5 : Math.ceil(rawStep / 30) * 30;
  const xTicks  = [];
  for (let t = 0; t <= tMax + 0.5; t += step) xTicks.push(Math.round(t));

  // Curve path
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)},${py(p.prob).toFixed(1)}`).join(" ");

  // Cumulative historical failure positions
  let cum = 0;
  const failPos = (ttfs || []).map((d) => { cum += d; return cum; }).filter((t) => t <= tMax * 1.05);

  // Current point
  const pAct = tActual != null ? probFalla(tActual, beta, eta) : null;

  // RUL bands
  const rul50 = tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.50) : null;
  const rul70 = tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.70) : null;
  const rul85 = tActual != null ? vidaUtilResidual(tActual, beta, eta, 0.85) : null;

  const THRESH = [
    { p: 0.15, color: C.green },
    { p: 0.40, color: C.amber },
    { p: 0.70, color: C.red   },
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: "system-ui, sans-serif", display: "block", overflow: "visible" }}>

      {/* RUL bands (behind curve) */}
      {tActual != null && rul85 != null && tActual <= tMax && (
        <rect x={px(tActual)} y={mt} width={Math.min(px(tActual + rul85) - px(tActual), pw)} height={ph}
          fill="#a855f7" opacity={0.07} />
      )}
      {tActual != null && rul70 != null && tActual <= tMax && (
        <rect x={px(tActual)} y={mt} width={Math.min(px(tActual + rul70) - px(tActual), pw)} height={ph}
          fill="#f59e0b" opacity={0.10} />
      )}
      {tActual != null && rul50 != null && tActual <= tMax && (
        <rect x={px(tActual)} y={mt} width={Math.min(px(tActual + rul50) - px(tActual), pw)} height={ph}
          fill="#ef4444" opacity={0.11} />
      )}

      {/* Area fill */}
      <path d={`${pathD} L${px(tMax).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`}
        fill="#3b82f6" opacity={0.07} />

      {/* Threshold lines */}
      {THRESH.map((th) => (
        <g key={th.p}>
          <line x1={ml} y1={py(th.p)} x2={W - mr} y2={py(th.p)}
            stroke={th.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.6} />
          <text x={W - mr + 3} y={py(th.p) + 4} fontSize={9} fill={th.color} fontWeight="700">{Math.round(th.p * 100)}%</text>
        </g>
      ))}

      {/* Main curve */}
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinecap="round" />

      {/* Historical failures (red triangles on x-axis) */}
      {failPos.map((t, i) => {
        const cx = px(t);
        return (
          <g key={i}>
            <line x1={cx} y1={py(0) + 3} x2={cx} y2={py(0) + 14} stroke="#ef4444" strokeWidth={1.5} opacity={0.6} />
            <polygon points={`${cx},${py(0)+3} ${cx-5},${py(0)+14} ${cx+5},${py(0)+14}`}
              fill="#ef4444" opacity={0.65} />
          </g>
        );
      })}

      {/* Current operating point */}
      {tActual != null && pAct != null && tActual <= tMax && (
        <>
          <line x1={px(tActual)} y1={mt - 4} x2={px(tActual)} y2={py(0)}
            stroke="#a855f7" strokeWidth={1.5} strokeDasharray="6 3" />
          <circle cx={px(tActual)} cy={py(pAct)} r={7}
            fill="#a855f7" stroke="#fff" strokeWidth={2} />
          <rect x={px(tActual) - 34} y={mt - 22} width={68} height={17} rx={4} fill="#a855f7" opacity={0.92} />
          <text x={px(tActual)} y={mt - 10} fontSize={9.5} fill="#fff" textAnchor="middle" fontWeight="700">
            Ahora: {pct(pAct)}
          </text>
        </>
      )}

      {/* X axis */}
      <line x1={ml} y1={py(0)} x2={W - mr} y2={py(0)} stroke="#94a3b8" strokeWidth={1} />
      {xTicks.map((t) => (
        <g key={t}>
          <line x1={px(t)} y1={py(0)} x2={px(t)} y2={py(0) + 4} stroke="#94a3b8" strokeWidth={1} />
          <text x={px(t)} y={py(0) + 15} fontSize={9} fill="#94a3b8" textAnchor="middle">{t}{unidad}</text>
        </g>
      ))}
      <text x={ml + pw / 2} y={H - 4} fontSize={10} fill="#64748b" textAnchor="middle">
        {unidad === "h" ? "Horas de operación desde última falla (ISO 14224 §9.3)" : "Días desde última falla correctiva"}
      </text>

      {/* Y axis */}
      <line x1={ml} y1={mt} x2={ml} y2={py(0)} stroke="#94a3b8" strokeWidth={1} />
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1={ml - 4} y1={py(p)} x2={ml} y2={py(p)} stroke="#94a3b8" strokeWidth={1} />
          <text x={ml - 7} y={py(p) + 4} fontSize={9} fill="#94a3b8" textAnchor="end">{Math.round(p * 100)}%</text>
        </g>
      ))}
    </svg>
  );
}

// ── Tab 3: Calendario 90d ─────────────────────────────────────────────────────
function TabCalendario({ ranking, embs, hoy }) {
  const DIAS = 90;

  // Agrupar predicciones por nave
  const porNave = useMemo(() => {
    const T0       = new Date(hoy);
    const embById  = new Map(embs.map((e) => [e.id, e]));
    const m = new Map();
    for (const r of ranking) {
      if (!r.fechaPredichaFalla) continue;
      const d = (new Date(r.fechaPredichaFalla) - T0) / DIA_MS;
      if (d < 0 || d > DIAS) continue;
      const embId = r.equipo.embarcacion_id;
      if (!m.has(embId)) m.set(embId, []);
      m.get(embId).push({ ...r, dFalla: d });
    }
    return [...m.entries()].map(([embId, items]) => ({ emb: embById.get(embId), items })).filter((n) => n.emb);
  }, [ranking, hoy, embs]);

  if (porNave.length === 0) {
    return (
      <Card>
        <div style={{ padding: "40px 0", textAlign: "center", color: C.slate }}>
          <CalendarClock size={32} color={C.line} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6 }}>Sin predicciones en los próximos 90 días</div>
          <div style={{ fontSize: 13 }}>Se necesitan ≥4 OTs correctivas por equipo para generar predicciones.</div>
        </div>
      </Card>
    );
  }

  const W = 640, ml = 110, mr = 16, mt = 42, rowH = 52;
  const pw = W - ml - mr;
  const H  = mt + porNave.length * rowH + 20;

  const pxc = (d) => ml + (d / DIAS) * pw;
  const pyc = (i) => mt + i * rowH + rowH / 2;

  // Week dividers
  const weeks = Array.from({ length: 14 }, (_, i) => i * 7).filter((d) => d <= DIAS);

  // Month labels (T0 computed locally here — only used for calendar rendering)
  const months = [];
  const T0render = new Date(hoy);
  for (let d = 1; d <= DIAS; d++) {
    const date = new Date(T0render.getTime() + d * DIA_MS);
    if (date.getDate() === 1) months.push({ d, label: date.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }) });
  }

  const ZONA_COL = { critica: "#ef4444", alerta: "#f59e0b", vigilar: "#ca8a04", estable: "#22c55e", sin_datos: "#94a3b8" };

  return (
    <Card style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.slate, marginBottom: 12 }}>
        Fallas predichas en los próximos 90 días — predicción al 50% de confianza (VUR50)
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
          style={{ fontFamily: "system-ui", display: "block", minWidth: 520, overflow: "visible" }}>

          {/* Week grid */}
          {weeks.map((d) => (
            <line key={d} x1={pxc(d)} y1={mt - 10} x2={pxc(d)} y2={H - 4}
              stroke="#e2e8f0" strokeWidth={d % 28 === 0 ? 1.5 : 0.8} />
          ))}

          {/* Month labels */}
          {months.map((m, i) => (
            <text key={i} x={pxc(m.d)} y={mt - 14} fontSize={9.5} fill="#64748b" fontWeight="600" textAnchor="middle">{m.label}</text>
          ))}

          {/* Day markers 30/60/90 */}
          {[30, 60, 90].map((d) => (
            <g key={d}>
              <line x1={pxc(d)} y1={mt - 22} x2={pxc(d)} y2={mt - 12} stroke="#94a3b8" strokeWidth={1} />
              <text x={pxc(d)} y={mt - 26} fontSize={9} fill="#94a3b8" textAnchor="middle">+{d}d</text>
            </g>
          ))}

          {/* Today */}
          <line x1={pxc(0)} y1={mt - 10} x2={pxc(0)} y2={H - 4} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={pxc(0)} y={mt - 14} fontSize={9} fill="#a855f7" textAnchor="middle" fontWeight="700">Hoy</text>

          {/* Vessel rows */}
          {porNave.map(({ emb, items }, i) => (
            <g key={emb.id}>
              {i % 2 !== 0 && (
                <rect x={0} y={pyc(i) - rowH / 2} width={W} height={rowH} fill="#f8fafc" />
              )}
              {/* Vessel name */}
              <text x={ml - 8} y={pyc(i) + 5} fontSize={11.5} fill="#1e293b" fontWeight="700" textAnchor="end">
                {emb.nombre || emb.codigo}
              </text>
              {/* Baseline */}
              <line x1={ml} y1={pyc(i)} x2={W - mr} y2={pyc(i)} stroke="#e2e8f0" strokeWidth={1} />
              {/* Equipment markers */}
              {items.map((r, j) => {
                const cx    = pxc(r.dFalla);
                const color = ZONA_COL[r.zona] || "#94a3b8";
                const cr    = r.equipo.criticidad === "A" ? 9 : r.equipo.criticidad === "B" ? 7 : 5;
                const yy    = j % 2 === 0 ? pyc(i) - 8 : pyc(i) + 8;
                return (
                  <g key={j}>
                    <circle cx={cx} cy={yy} r={cr} fill={color} opacity={0.85} stroke="#fff" strokeWidth={1.5} />
                    <text x={cx} y={yy - cr - 3} fontSize={7.5} fill={color} textAnchor="middle" fontWeight="700">
                      {r.equipo.id_visible}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Bottom axis */}
          <line x1={ml} y1={H - 6} x2={W - mr} y2={H - 6} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {[["Crítico","#ef4444"],["Alerta","#f59e0b"],["Vigilar","#ca8a04"],["Estable","#22c55e"]].map(([lbl, col]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.slate }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
            {lbl}
          </div>
        ))}
        <div style={{ fontSize: 11, color: C.slate }}>· Tamaño = criticidad (A mayor)</div>
      </div>
    </Card>
  );
}
