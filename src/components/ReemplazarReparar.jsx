import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Replace, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, HelpCircle,
  Settings2, Save, Pencil, Ship, Clock, TrendingDown, Wrench, DollarSign, X,
} from "lucide-react";
import { fetchAll, updateRow, logActivity } from "../lib/db";
import { useAuth } from "../lib/auth";
import { analizarFlotaCapex, SUPUESTOS_DEFECTO } from "../lib/capex";
import { margenDiarioNave } from "../lib/lucro";
import { calcPL } from "./rentabilidad/calc";
import { C, clp, num, archivo, tint } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner, Empty, inputStyle } from "../ui";
import { hoyLocal } from "../lib/fechas";

const REC = {
  reemplazar: { label: "REEMPLAZAR", bg: C.red,   fg: "#fff", Icon: AlertTriangle },
  evaluar:    { label: "EVALUAR",    bg: C.amber, fg: "#5c3a00", Icon: HelpCircle },
  reparar:    { label: "REPARAR",    bg: C.green, fg: "#fff", Icon: CheckCircle2 },
};
const CRIT_TONE = { A: "red", B: "yellow", C: "steel" };

function clpC(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
function fmtRatio(r) {
  if (r == null || !Number.isFinite(r)) return "∞";
  return `${num(r, 2)}×`;
}

export default function ReemplazarReparar() {
  const { profile } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filtro, setFiltro]   = useState("todos");
  const [expandido, setExpandido] = useState(new Set());
  const [showSup, setShowSup] = useState(false);
  const [params, setParams]   = useState({
    tasa: SUPUESTOS_DEFECTO.tasa,
    escalada: SUPUESTOS_DEFECTO.escalada,
    ahorroMantencion: SUPUESTOS_DEFECTO.ahorroMantencion,
  });
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [equipos, embs, ots, mareas, capturas, economias] = await Promise.all([
        fetchAll("equipos"),
        fetchAll("embarcaciones"),
        fetchAll("ordenes_trabajo"),
        fetchAll("mareas"),
        fetchAll("marea_captura"),
        fetchAll("marea_economia"),
      ]);
      setData({ equipos, embs, ots, mareas, capturas, economias });
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => hoyLocal(), []);

  const embById = useMemo(() => {
    const m = new Map();
    (data?.embs || []).forEach((e) => m.set(e.id, e));
    return m;
  }, [data]);

  // Margen diario por nave (costo de oportunidad de indisponibilidad).
  const margenDiarioPorEmb = useMemo(() => {
    const m = new Map();
    if (!data) return m;
    for (const emb of data.embs || []) {
      const otsEmb = (data.ots || []).filter((o) => o.embarcacion_id === emb.id);
      const plList = (data.mareas || [])
        .filter((ma) => ma.embarcacion_id === emb.id)
        .map((ma) => {
          try {
            return calcPL(
              ma,
              (data.capturas  || []).filter((c) => c.marea_id === ma.id),
              (data.economias || []).find((e) => e.marea_id === ma.id),
              otsEmb,
            );
          } catch { return null; }
        })
        .filter(Boolean);
      m.set(emb.id, margenDiarioNave(plList));
    }
    return m;
  }, [data]);

  const resultado = useMemo(() => {
    if (!data) return [];
    return analizarFlotaCapex({
      equipos: data.equipos, ots: data.ots, hoy, margenDiarioPorEmb, params,
    });
  }, [data, hoy, margenDiarioPorEmb, params]);

  const stats = useMemo(() => {
    const s = { reemplazar: 0, evaluar: 0, reparar: 0, sin_configurar: 0, ahorro: 0 };
    for (const r of resultado) {
      if (r.estado === "sin_configurar") { s.sin_configurar++; continue; }
      s[r.recomendacion]++;
      if (r.ahorroAnual > 0) s.ahorro += r.ahorroAnual;
    }
    return s;
  }, [resultado]);

  const visible = useMemo(() => {
    if (filtro === "todos") return resultado;
    if (filtro === "sin_configurar") return resultado.filter((r) => r.estado === "sin_configurar");
    return resultado.filter((r) => r.estado === "analizado" && r.recomendacion === filtro);
  }, [resultado, filtro]);

  const toggle = useCallback((id) => {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const guardarCapex = useCallback(async (equipo, draft) => {
    setGuardando(true); setError(null);
    try {
      const capex = {
        valor_reemplazo: Number(draft.valor_reemplazo) || 0,
        vida_util_anios: Number(draft.vida_util_anios) || SUPUESTOS_DEFECTO.vidaUtil,
        valor_residual_pct: draft.valor_residual_pct === "" || draft.valor_residual_pct == null
          ? SUPUESTOS_DEFECTO.valorResidualPct : Number(draft.valor_residual_pct),
      };
      const ficha = { ...(equipo.ficha || {}), capex };
      await updateRow("equipos", equipo.id, { ficha });
      setData((d) => ({ ...d, equipos: d.equipos.map((e) => e.id === equipo.id ? { ...e, ficha } : e) }));
      logActivity(profile, "Configurar CAPEX", `${equipo.id_visible || ""} · ${equipo.sistema || ""}`);
      setEditando(null);
    } catch (e) {
      setError("No se pudo guardar el CAPEX. " + e.message);
    } finally {
      setGuardando(false);
    }
  }, [profile]);

  if (loading) return (
    <div>
      <PageHead kicker="Optimización · Decisión CAPEX" title="Reemplazar vs. Reparar" />
      <Card><InlineSpinner label="Analizando la economía de la flota…" /></Card>
    </div>
  );

  const FILTROS = [
    { key: "todos",          label: "Todos",        count: resultado.length },
    { key: "reemplazar",     label: "Reemplazar",   count: stats.reemplazar },
    { key: "evaluar",        label: "Evaluar",      count: stats.evaluar },
    { key: "reparar",        label: "Reparar",      count: stats.reparar },
    { key: "sin_configurar", label: "Sin configurar", count: stats.sin_configurar },
  ];

  return (
    <div>
      <PageHead
        kicker="Optimización · Decisión CAPEX"
        title="Reemplazar vs. Reparar"
        sub="Por cada equipo: costo anual de seguir reparándolo (correctivos crecientes + lucro cesante) frente al costo anualizado de reemplazarlo (recuperación de capital + mantención del equipo nuevo). Método del Costo Anual Equivalente."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <KpiCard value={stats.reemplazar} label="Recomendados reemplazar" tone={stats.reemplazar > 0 ? "red" : "green"} Icon={AlertTriangle} />
        <KpiCard value={stats.evaluar}    label="A evaluar"               tone={stats.evaluar > 0 ? "yellow" : "steel"} Icon={HelpCircle} />
        <KpiCard value={clpC(stats.ahorro)} label="Ahorro anual potencial" tone="green" Icon={TrendingDown} />
        <KpiCard value={stats.sin_configurar} label="Sin valor de reemplazo" tone="steel" Icon={Settings2} />
      </div>

      {/* Supuestos económicos */}
      <SupuestosPanel
        open={showSup} onToggle={() => setShowSup((v) => !v)}
        params={params} setParams={setParams}
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, margin: "16px 0", flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{ padding: "7px 16px", borderRadius: 20, border: `1px solid ${filtro === f.key ? C.cyan : C.line}`, background: filtro === f.key ? C.cyan : "transparent", color: filtro === f.key ? "#fff" : C.ink, fontSize: 12.5, fontWeight: filtro === f.key ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
            {f.label}{f.count > 0 ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card><Empty>Sin equipos en esta categoría.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((r) => (
            <CapexCard
              key={r.equipo.id}
              r={r}
              nave={embById.get(r.equipo.embarcacion_id)}
              abierto={expandido.has(r.equipo.id)}
              onToggle={() => toggle(r.equipo.id)}
              editando={editando === r.equipo.id}
              onEdit={() => setEditando(r.equipo.id)}
              onCancelEdit={() => setEditando(null)}
              onSave={(draft) => guardarCapex(r.equipo, draft)}
              guardando={guardando}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Supuestos económicos de flota ────────────────────────────────────────────
function SupuestosPanel({ open, onToggle, params, setParams }) {
  const upd = (k) => (e) => {
    const v = e.target.value;
    setParams((p) => ({ ...p, [k]: v === "" ? "" : Number(v) }));
  };
  const CAMPOS = [
    { k: "tasa", label: "Tasa de descuento", sub: "costo de capital anual", suf: "%" },
    { k: "escalada", label: "Escalada de reparación", sub: "alza anual por antigüedad", suf: "%" },
    { k: "ahorroMantencion", label: "Ahorro con equipo nuevo", sub: "menor mantención esperada", suf: "%" },
  ];
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <Settings2 size={16} color={C.steel} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.abyss, flex: 1 }}>Supuestos económicos</span>
        <span style={{ fontSize: 11.5, color: C.slate }}>
          tasa {params.tasa}% · escalada {params.escalada}% · ahorro {params.ahorroMantencion}%
        </span>
        {open ? <ChevronUp size={16} color={C.slate} /> : <ChevronDown size={16} color={C.slate} />}
      </button>
      {open && (
        <div style={{ padding: "4px 16px 16px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {CAMPOS.map((c) => (
            <div key={c.k}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, display: "block", marginBottom: 4 }}>{c.label}</label>
              <div style={{ position: "relative" }}>
                <input type="number" value={params[c.k]} onChange={upd(c.k)} min={0}
                  style={{ ...inputStyle(), paddingRight: 28 }} />
                <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.slate, fontWeight: 600 }}>{c.suf}</span>
              </div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ value, label, tone, Icon }) {
  const bg    = tone === "red" ? "#fef2f2" : tone === "yellow" ? "#fffbeb" : tone === "green" ? "#f0fdf4" : "var(--card-bg)";
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : tone === "green" ? C.green : C.slate;
  return (
    <div style={{ background: bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {Icon && <Icon size={15} color={color} />}
        <span style={{ fontSize: 21, fontWeight: 800, color }}>{value}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Equipment card ────────────────────────────────────────────────────────────
function CapexCard({ r, nave, abierto, onToggle, editando, onEdit, onCancelEdit, onSave, guardando }) {
  const eq = r.equipo;
  const sinCfg = r.estado === "sin_configurar";
  const cfg = sinCfg ? { label: "CONFIGURAR", bg: C.slate, fg: "#fff", Icon: Settings2 } : (REC[r.recomendacion] || REC.evaluar);
  const Icon = cfg.Icon;
  const titulo = eq.sistema || eq.id_visible || "Equipo";
  const subt = [eq.marca, eq.modelo].filter(Boolean).join(" ") || eq.id_visible || "—";

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: (abierto || editando) ? `1px solid ${C.line}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: cfg.bg, color: cfg.fg, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, flexShrink: 0 }}>
              <Icon size={13} /> {cfg.label}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</div>
              <div style={{ fontSize: 12, color: C.slate, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{subt}</span>
                {nave && <><span style={{ color: C.line }}>·</span><Ship size={11} /> {nave.nombre || nave.codigo}</>}
                {r.edad != null && <><span style={{ color: C.line }}>·</span> {r.edad} años</>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {eq.criticidad && <Pill tone={CRIT_TONE[eq.criticidad] || "steel"}>Crit. {eq.criticidad}</Pill>}
            {!sinCfg && r.ahorroAnual > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.green }}>{clp(r.ahorroAnual)}<span style={{ fontSize: 11, fontWeight: 600, color: C.slate }}>/año</span></div>
                <div style={{ fontSize: 11, color: C.slate }}>ahorro al reemplazar</div>
              </div>
            )}
            {!sinCfg && r.ahorroAnual <= 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.steel }}>{fmtRatio(r.ratio)}</div>
                <div style={{ fontSize: 11, color: C.slate }}>reparar / reemplazar</div>
              </div>
            )}
          </div>
        </div>

        {/* CAE comparison */}
        {!sinCfg && (
          <div style={{ marginTop: 14 }}>
            <CaeBar label="Seguir reparando" value={r.rep.cae} max={Math.max(r.rep.cae, r.rem.cae)}
              tone={r.recomendacion === "reparar" ? C.green : C.red} sub="OPEX correctivo + lucro cesante" />
            <CaeBar label="Reemplazar" value={r.rem.cae} max={Math.max(r.rep.cae, r.rem.cae)}
              tone={r.recomendacion === "reparar" ? C.steel : C.green} sub="recuperación de capital + O&M nuevo" />
          </div>
        )}

        {/* Context for sin_configurar */}
        {sinCfg && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.slate, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><Wrench size={12} style={{ verticalAlign: -2 }} /> {r.hist.nEventos} correctivo{r.hist.nEventos !== 1 ? "s" : ""} histórico{r.hist.nEventos !== 1 ? "s" : ""}</span>
            <span><DollarSign size={12} style={{ verticalAlign: -2 }} /> {clp(r.hist.repAcum)} acumulado en reparaciones</span>
            <span style={{ color: C.ocean, fontWeight: 600 }}>Ingresa el valor de reemplazo para analizar →</span>
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          {!sinCfg && r.motivos[0] && (
            <Pill tone={r.recomendacion === "reparar" ? "green" : r.recomendacion === "reemplazar" ? "red" : "yellow"}>
              {r.motivos[0]}
            </Pill>
          )}
          {!sinCfg && r.paybackAnios != null && (
            <Pill tone="steel"><Clock size={11} /> payback {num(r.paybackAnios, 1)} años</Pill>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {!editando && (
              <button onClick={onEdit}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 16, border: `1px solid ${C.line}`, background: "transparent", color: C.slate, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                <Pencil size={12} /> {sinCfg ? "Configurar" : "Editar CAPEX"}
              </button>
            )}
            {!sinCfg && (
              <button onClick={onToggle}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 16, border: `1px solid ${C.line}`, background: "transparent", color: C.slate, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                {abierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {abierto ? "Ocultar detalle" : "Ver detalle"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editando && (
        <CapexForm equipo={eq} onCancel={onCancelEdit} onSave={onSave} guardando={guardando} />
      )}

      {/* Detail */}
      {abierto && !sinCfg && !editando && (
        <CapexDetalle r={r} />
      )}
    </Card>
  );
}

// ── CAE comparison bar ────────────────────────────────────────────────────────
function CaeBar({ label, value, max, tone, sub }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{label} <span style={{ fontSize: 11, fontWeight: 400, color: C.slate }}>· {sub}</span></span>
        <span style={{ fontSize: 13, fontWeight: 800, color: tone }}>{clp(value)}<span style={{ fontSize: 10.5, fontWeight: 600, color: C.slate }}>/año</span></span>
      </div>
      <div style={{ background: C.mist, borderRadius: 4, height: 8 }}>
        <div style={{ background: tone, borderRadius: 4, height: 8, width: `${pct}%`, transition: "width .4s" }} />
      </div>
    </div>
  );
}

// ── Detail breakdown ──────────────────────────────────────────────────────────
function CapexDetalle({ r }) {
  const ratioAcumPct = Math.min(100, Math.round(r.ratioAcum * 100));
  const acumTone = r.ratioAcum >= 1 ? C.red : r.ratioAcum >= 0.6 ? C.amber : C.green;
  return (
    <div style={{ padding: "14px 18px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Mantener */}
        <div>
          <div style={{ ...archivo, fontSize: 12, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Seguir reparando</div>
          <Stat label="Reparación anual (run-rate)" value={clp(r.hist.repAnual)} />
          <Stat label="Reparación proyectada (con escalada)" value={clp(r.rep.repProyectado)} />
          <Stat label={`Lucro cesante (${num(r.hist.diasParadoAnual, 1)} días/año)`} value={r.margenDia != null ? clp(r.rep.lucroAnual) : "sin margen/día"} />
          <Stat label="Costo anual equivalente" value={clp(r.rep.cae)} bold tone={C.red} />
        </div>
        {/* Reemplazar */}
        <div>
          <div style={{ ...archivo, fontSize: 12, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Reemplazar</div>
          <Stat label="Valor de reemplazo (CAPEX)" value={clp(r.Cr)} />
          <Stat label={`Recuperación de capital (${r.vidaUtil} años)`} value={clp(r.rem.capitalRecovery)} />
          <Stat label={`Valor residual (${r.valorResidualPct}%)`} value={clp(r.rem.valorResidual)} />
          <Stat label="Mantención equipo nuevo" value={clp(r.rem.omNuevoAnual)} />
          <Stat label="Costo anual equivalente" value={clp(r.rem.cae)} bold tone={C.green} />
        </div>
      </div>

      {/* Ratio acumulado */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>Reparación acumulada vs. valor de reemplazo</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: acumTone }}>{Math.round(r.ratioAcum * 100)}%</span>
        </div>
        <div style={{ background: C.mist, borderRadius: 4, height: 8, position: "relative" }}>
          <div style={{ background: acumTone, borderRadius: 4, height: 8, width: `${ratioAcumPct}%`, transition: "width .4s" }} />
          <div style={{ position: "absolute", left: "100%", top: -3, transform: "translateX(-1px)", width: 1, height: 14, background: C.slate }} />
        </div>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
          {clp(r.hist.repAcum)} acumulados en {r.hist.nEventos} correctivo{r.hist.nEventos !== 1 ? "s" : ""} · {clp(r.Cr)} reemplazo
        </div>
      </div>

      {/* Motivos */}
      {r.motivos.length > 0 && (
        <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
          {r.motivos.map((m, i) => (
            <li key={i} style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 7 }}>
              <span style={{ color: C.steel, flexShrink: 0, fontWeight: 700 }}>▸</span>{m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, bold, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderTop: `1px solid ${C.foam}` }}>
      <span style={{ fontSize: 12, color: C.slate }}>{label}</span>
      <span style={{ fontSize: bold ? 14 : 12.5, fontWeight: bold ? 800 : 600, color: tone || C.ink, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ── CAPEX edit form ───────────────────────────────────────────────────────────
function CapexForm({ equipo, onCancel, onSave, guardando }) {
  const cfg = equipo?.ficha?.capex || {};
  const [draft, setDraft] = useState({
    valor_reemplazo: cfg.valor_reemplazo ?? "",
    vida_util_anios: cfg.vida_util_anios ?? SUPUESTOS_DEFECTO.vidaUtil,
    valor_residual_pct: cfg.valor_residual_pct ?? SUPUESTOS_DEFECTO.valorResidualPct,
  });
  const upd = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const valido = Number(draft.valor_reemplazo) > 0;

  return (
    <div style={{ padding: "16px 18px", background: tint(C.sky, 5) }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, display: "block", marginBottom: 4 }}>Valor de reemplazo (CAPEX) *</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.slate, fontWeight: 600 }}>$</span>
            <input type="number" value={draft.valor_reemplazo} onChange={upd("valor_reemplazo")} min={0}
              placeholder="Costo de un equipo nuevo equivalente" autoFocus
              style={{ ...inputStyle(), paddingLeft: 22 }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, display: "block", marginBottom: 4 }}>Vida útil</label>
          <div style={{ position: "relative" }}>
            <input type="number" value={draft.vida_util_anios} onChange={upd("vida_util_anios")} min={1}
              style={{ ...inputStyle(), paddingRight: 40 }} />
            <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.slate, fontWeight: 600 }}>años</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, display: "block", marginBottom: 4 }}>Valor residual</label>
          <div style={{ position: "relative" }}>
            <input type="number" value={draft.valor_residual_pct} onChange={upd("valor_residual_pct")} min={0} max={100}
              style={{ ...inputStyle(), paddingRight: 28 }} />
            <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.slate, fontWeight: 600 }}>%</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
        <button onClick={onCancel} disabled={guardando}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", color: C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <X size={14} /> Cancelar
        </button>
        <button onClick={() => onSave(draft)} disabled={!valido || guardando}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: valido ? C.cyan : C.line, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: valido && !guardando ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          <Save size={14} /> {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

ReemplazarReparar.Icon = Replace;
