import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Scale, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, HelpCircle,
  Wrench, CalendarClock, Package, Clock,
} from "lucide-react";
import { fetchAll } from "../lib/db";
import { evaluarPlanes } from "../lib/pm";
import { optimizarFlota } from "../lib/optimizador";
import { margenDiarioNave } from "../lib/lucro";
import { calcPL } from "./rentabilidad/calc";
import { C } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";
import { hoyLocal } from "../lib/fechas";

const HH_DIARIOS = 8;

const REC = {
  mantener_puerto: { label: "MANTENER EN PUERTO", bg: C.red,    fg: "#fff",    Icon: AlertTriangle },
  evaluar:         { label: "EVALUAR TRADE-OFF",  bg: "#f59e0b", fg: "#7c2d12", Icon: HelpCircle    },
  zarpar:          { label: "ZARPAR",             bg: C.green,  fg: "#fff",    Icon: CheckCircle2  },
};

const NIVEL_COLOR = { critico: C.red, urgente: C.amber, moderado: "#d4a017", bajo: C.green };

function clp(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function OptimizadorVentana() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filtro, setFiltro]   = useState("todas");
  const [expandido, setExpandido] = useState(new Set());

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, equipos, planes, ots, items, destinos, stock, mareas, capturas, economias] = await Promise.all([
        fetchAll("embarcaciones"),
        fetchAll("equipos"),
        fetchAll("planes_pm"),
        fetchAll("ordenes_trabajo"),
        fetchAll("inventario_items"),
        fetchAll("inventario_item_destinos"),
        fetchAll("stock"),
        fetchAll("mareas"),
        fetchAll("marea_captura"),
        fetchAll("marea_economia"),
      ]);
      setData({
        embs, equipos, planesEval: evaluarPlanes(planes, equipos),
        ots, items, destinos, stock, mareas, capturas, economias,
      });
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => hoyLocal(), []);

  const margenDiarioPorEmb = useMemo(() => {
    if (!data) return new Map();
    const m = new Map();
    for (const emb of data.embs || []) {
      const maresEmb = (data.mareas || []).filter((ma) => ma.embarcacion_id === emb.id);
      const otsEmb   = (data.ots    || []).filter((o)  => o.embarcacion_id  === emb.id);
      const plList   = maresEmb.map((ma) => {
        try {
          return calcPL(
            ma,
            (data.capturas  || []).filter((c) => c.marea_id === ma.id),
            (data.economias || []).find((e)   => e.marea_id === ma.id),
            otsEmb,
          );
        } catch { return null; }
      }).filter(Boolean);
      m.set(emb.id, margenDiarioNave(plList));
    }
    return m;
  }, [data]);

  const resultado = useMemo(() => {
    if (!data) return [];
    return optimizarFlota({
      embarcaciones:      data.embs,
      equipos:            data.equipos,
      planesEval:         data.planesEval,
      ots:                data.ots,
      items:              data.items,
      stock:              data.stock,
      destinos:           data.destinos,
      margenDiarioPorEmb,
      hoy,
    });
  }, [data, margenDiarioPorEmb, hoy]);

  const visible = useMemo(() =>
    filtro === "todas" ? resultado : resultado.filter((r) => r.recomendacion === filtro),
    [resultado, filtro],
  );

  const toggle = useCallback((id) => {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (loading) return (
    <div>
      <PageHead kicker="Operación · Planificación" title="Optimizador de Ventana" />
      <Card><InlineSpinner label="Calculando recomendaciones de flota…" /></Card>
    </div>
  );

  const nMantener = resultado.filter((r) => r.recomendacion === "mantener_puerto").length;
  const nEvaluar  = resultado.filter((r) => r.recomendacion === "evaluar").length;
  const nZarpar   = resultado.filter((r) => r.recomendacion === "zarpar").length;
  const hhTotal   = resultado.reduce((s, r) => s + r.ventana.hhTotal, 0);

  const FILTROS = [
    { key: "todas",           label: "Todas",    count: resultado.length },
    { key: "mantener_puerto", label: "Mantener", count: nMantener        },
    { key: "evaluar",         label: "Evaluar",  count: nEvaluar         },
    { key: "zarpar",          label: "Zarpar",   count: nZarpar          },
  ];

  return (
    <div>
      <PageHead
        kicker="Operación · Planificación"
        title="Optimizador de Ventana"
        sub="Por cada nave: urgencia de mantenimiento vs. costo de oportunidad de no pescar. Prioriza qué hacer en la recalada y cuántos días reservar."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard value={nMantener} label="Mantener en puerto" tone={nMantener > 0 ? "red" : "green"} />
        <KpiCard value={nEvaluar}  label="Evaluar trade-off"  tone={nEvaluar  > 0 ? "yellow" : "steel"} />
        <KpiCard value={nZarpar}   label="Pueden zarpar"      tone="green" />
        <KpiCard value={`${hhTotal}h`} label="HH pendiente total" tone="steel" Icon={Clock} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            style={{ padding: "7px 16px", borderRadius: 20, border: `1px solid ${filtro === f.key ? C.cyan : C.line}`, background: filtro === f.key ? C.cyan : "transparent", color: filtro === f.key ? "#fff" : C.ink, fontSize: 12.5, fontWeight: filtro === f.key ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
            {f.label}{f.count > 0 ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <div style={{ padding: "32px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>
            Sin naves con esta recomendación.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((r) => (
            <VentanaCard
              key={r.embarcacion.id}
              rec={r}
              abierto={expandido.has(r.embarcacion.id)}
              onToggle={() => toggle(r.embarcacion.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ value, label, tone, Icon }) {
  const bg    = tone === "red" ? "#fef2f2" : tone === "yellow" ? "#fffbeb" : tone === "green" ? "#f0fdf4" : "var(--card-bg)";
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : tone === "green" ? C.green : C.slate;
  return (
    <div style={{ background: bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {Icon && <Icon size={15} color={color} />}
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Vessel card ────────────────────────────────────────────────────────────────
function VentanaCard({ rec, abierto, onToggle }) {
  const { embarcacion, recomendacion, urgencia, tareas, ventana, margenDiario, costoVentana } = rec;
  const cfg       = REC[recomendacion] || REC.evaluar;
  const barColor  = NIVEL_COLOR[urgencia.nivel] || C.slate;
  const nTareas   = tareas.length;
  const nSinParts = tareas.filter((t) => !t.partsOk).length;

  const Icon = cfg.Icon;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px 12px", borderBottom: abierto ? `1px solid ${C.line}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {/* Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: cfg.bg, color: cfg.fg, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, flexShrink: 0 }}>
              <Icon size={13} />
              {cfg.label}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.abyss }}>{embarcacion.nombre || embarcacion.codigo}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{embarcacion.tipo || "—"} {embarcacion.matricula ? `· ${embarcacion.matricula}` : ""}</div>
            </div>
          </div>

          {/* Right: metrics */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {ventana.hhTotal > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{ventana.diasRecomendados}d · {ventana.hhTotal}h</div>
                <div style={{ fontSize: 11, color: C.slate }}>ventana recomendada</div>
              </div>
            )}
            {costoVentana != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{clp(costoVentana)}</div>
                <div style={{ fontSize: 11, color: C.slate }}>costo oportunidad</div>
              </div>
            )}
          </div>
        </div>

        {/* Urgency bar */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: barColor, textTransform: "uppercase", letterSpacing: 0.5 }}>Urgencia {urgencia.nivel}</span>
              {margenDiario != null && (
                <span style={{ fontSize: 11, color: C.slate }}>· costo/día {clp(margenDiario)}</span>
              )}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{urgencia.score}/100</span>
          </div>
          <div style={{ background: C.line, borderRadius: 4, height: 6 }}>
            <div style={{ background: barColor, borderRadius: 4, height: 6, width: `${urgencia.score}%`, transition: "width .4s" }} />
          </div>
          {urgencia.motivos.length > 0 && (
            <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", listStyle: "none" }}>
              {urgencia.motivos.map((m, i) => (
                <li key={i} style={{ fontSize: 12, color: C.slate, lineHeight: 1.6, display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ color: barColor, flexShrink: 0 }}>▸</span>{m}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick badges */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {nTareas > 0 ? (
            <Pill tone="steel">{nTareas} tarea{nTareas !== 1 ? "s" : ""}</Pill>
          ) : (
            <Pill tone="green">Sin tareas pendientes</Pill>
          )}
          {nSinParts > 0 && (
            <Pill tone="red"><Package size={11} /> {nSinParts} sin repuesto{nSinParts !== 1 ? "s" : ""}</Pill>
          )}
          {ventana.diasMinimos > 0 && (
            <Pill tone="steel"><Clock size={11} /> mínimo {ventana.diasMinimos}d</Pill>
          )}
          {/* Expand/collapse */}
          {nTareas > 0 && (
            <button onClick={onToggle}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 16, border: `1px solid ${C.line}`, background: "transparent", color: C.slate, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {abierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {abierto ? "Ocultar tareas" : "Ver tareas priorizadas"}
            </button>
          )}
        </div>
      </div>

      {/* Task list */}
      {abierto && nTareas > 0 && (
        <div style={{ padding: "12px 18px 16px" }}>
          <TareasList tareas={tareas} ventana={ventana} />
        </div>
      )}
    </Card>
  );
}

// ── Prioritized task list ──────────────────────────────────────────────────────
function TareasList({ tareas, ventana }) {
  const limiteMin = ventana.diasMinimos     * HH_DIARIOS;
  const limiteRec = ventana.diasRecomendados * HH_DIARIOS;

  let seccion = null;

  return (
    <div>
      {tareas.map((t, i) => {
        const prevSec = seccion;
        if (t.hhAcumulado <= limiteMin)           seccion = "min";
        else if (t.hhAcumulado <= limiteRec)      seccion = "buf";
        else                                       seccion = "sig";
        const showHeader = seccion !== prevSec;

        return (
          <React.Fragment key={t.id || i}>
            {showHeader && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
                <div style={{ flex: 1, height: 1, background: C.line }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: seccion === "sig" ? C.slate : C.steel, flexShrink: 0, padding: "0 6px" }}>
                  {seccion === "min" ? `Ventana mínima (${ventana.diasMinimos}d)` : seccion === "buf" ? `Buffer recomendado (+${ventana.diasRecomendados - ventana.diasMinimos}d)` : "Próxima recalada"}
                </span>
                <div style={{ flex: 1, height: 1, background: C.line }} />
              </div>
            )}
            <TareaRow tarea={t} dim={seccion === "sig"} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Single task row ────────────────────────────────────────────────────────────
function TareaRow({ tarea, dim }) {
  const isPm   = tarea.tipo === "pm";
  const isRojo = isPm ? tarea.tone === "red" : tarea.prioridadOt === "critica";
  const isAmb  = isPm ? tarea.tone === "yellow" : tarea.prioridadOt === "alta";
  const dotColor = isRojo ? C.red : isAmb ? C.amber : C.slate;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.line}`, opacity: dim ? 0.45 : 1 }}>
      {/* Type icon */}
      <div style={{ flexShrink: 0, color: dotColor }}>
        {isPm ? <CalendarClock size={14} /> : <Wrench size={14} />}
      </div>

      {/* Description + equipment */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tarea.descripcion}
        </div>
        {tarea.sistema && (
          <div style={{ fontSize: 11.5, color: C.slate }}>{tarea.sistema}</div>
        )}
      </div>

      {/* Criticidad badge */}
      {tarea.criticidadEquipo && (
        <Pill tone={tarea.criticidadEquipo === "A" ? "red" : tarea.criticidadEquipo === "B" ? "yellow" : "steel"}>
          {tarea.criticidadEquipo}
        </Pill>
      )}

      {/* Parts status */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
        {tarea.partsOk ? (
          <CheckCircle2 size={13} color={C.green} />
        ) : (
          <>
            <Package size={12} color={C.red} />
            <span style={{ color: C.red, fontWeight: 600 }}>{tarea.partsFaltantes} falta{tarea.partsFaltantes !== 1 ? "n" : ""}</span>
          </>
        )}
      </div>

      {/* HH + cumulative */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{tarea.hhEstimado}h</div>
        <div style={{ fontSize: 10.5, color: C.slate }}>acum: {tarea.hhAcumulado}h</div>
      </div>
    </div>
  );
}

// ── Icon for page header (used in AppShell import) ────────────────────────────
OptimizadorVentana.Icon = Scale;
