import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  PiggyBank, TrendingUp, TrendingDown, CheckCircle2, AlertCircle,
  AlertTriangle, ChevronDown, ChevronRight, Pencil, Check, X as XIcon,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import { fetchAll, upsertRow } from "../lib/db";
import { useAuth } from "../lib/auth";
import {
  serieMensual, runRate, estadoPresupuesto,
  presupuestoFlota,
} from "../lib/presupuesto";
import { C, archivo, num, tint, clp } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";
import { hoyLocal } from "../lib/fechas";

const ANIO_ACTUAL = new Date().getFullYear();
const ZONA_META = {
  ok:       { tone: "green",  label: "OK",         icon: CheckCircle2 },
  "atención": { tone: "yellow", label: "Atención",   icon: AlertTriangle },
  critico:  { tone: "red",    label: "Crítico",     icon: AlertCircle },
  "sin-dato": { tone: "steel",  label: "Sin presupuesto", icon: null },
};

export default function Presupuesto({ onNavigate }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [ots,           setOts]           = useState([]);
  const [presupuestos,  setPresupuestos]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [anio,          setAnio]          = useState(ANIO_ACTUAL);
  const [expanded,      setExpanded]      = useState(null);
  const [editando,      setEditando]      = useState(null);  // embId
  const [editVal,       setEditVal]       = useState("");
  const [saving,        setSaving]        = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, otsAll, pptos] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("ordenes_trabajo"),
        fetchAll("presupuestos").catch(() => []), // graceful si tabla no existe aún
      ]);
      setEmbarcaciones(embs); setOts(otsAll); setPresupuestos(pptos);
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => hoyLocal(), []);

  // Map embarcacion_id → monto para el año seleccionado
  const presupuestosMap = useMemo(() => {
    const m = new Map();
    (presupuestos || []).filter((p) => p.anio === anio).forEach((p) => m.set(p.embarcacion_id, Number(p.monto) || 0));
    return m;
  }, [presupuestos, anio]);

  // Análisis por nave
  const flota = useMemo(() => presupuestoFlota({
    ots, embarcaciones, presupuestosMap, hoy, anio,
  }), [ots, embarcaciones, presupuestosMap, hoy, anio]);

  // KPIs flota
  const gastoFlota      = useMemo(() => flota.reduce((s, e) => s + e.gasto.total, 0), [flota]);
  const pptoFlota       = useMemo(() => flota.reduce((s, e) => s + e.ppto, 0), [flota]);
  const rrFlota         = useMemo(() => runRate(ots, null, hoy, 3), [ots, hoy]);
  const estadoFlota     = useMemo(() => estadoPresupuesto(gastoFlota, pptoFlota, hoy, anio), [gastoFlota, pptoFlota, hoy, anio]);
  const nCriticos       = useMemo(() => flota.filter((e) => e.estado.zona === "critico").length, [flota]);

  // Serie mensual flota para gráfico
  const serie = useMemo(() => serieMensual(ots, null, hoy, 12), [ots, hoy]);
  const pptoMensual = pptoFlota > 0 ? pptoFlota / 12 : null;

  // Guardar presupuesto
  const guardarPpto = useCallback(async (embId) => {
    if (!profile?.empresa_id) return;
    const monto = parseFloat(editVal.replace(/\./g, "").replace(",", ".")) || 0;
    setSaving(true);
    try {
      await upsertRow("presupuestos", profile.empresa_id,
        { embarcacion_id: embId, anio, monto },
        "empresa_id,embarcacion_id,anio"
      );
      setPresupuestos((prev) => {
        const sin = prev.filter((p) => !(p.embarcacion_id === embId && p.anio === anio));
        return [...sin, { embarcacion_id: embId, anio, monto, empresa_id: profile.empresa_id }];
      });
      setEditando(null);
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setSaving(false); }
  }, [profile, editVal, anio]);

  if (loading) return (
    <div>
      <PageHead kicker="Gestión" title="Presupuesto & Run-rate" />
      <Card><InlineSpinner label="Cargando histórico de costos…" /></Card>
    </div>
  );

  return (
    <div>
      <PageHead
        kicker="Gestión · Costos"
        title="Presupuesto & Run-rate"
        sub="Compara el gasto real de mantenimiento (OTs valorizadas) contra el presupuesto aprobado. El run-rate proyecta el gasto anual a partir de los últimos 3 meses."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Selector de año */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>Año:</span>
        {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map((a) => (
          <button key={a} onClick={() => setAnio(a)} style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${anio === a ? C.cyan : C.line}`,
            background: anio === a ? C.cyan : "transparent",
            color: anio === a ? "#fff" : C.slate,
          }}>{a}</button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KCard label={`Gasto real ${anio}`}
          value={clp(gastoFlota)}
          tone={estadoFlota.zona === "critico" ? C.red : C.ink}
          sub={pptoFlota > 0 ? `${num(estadoFlota.porcentaje ?? 0, 1)}% del presupuesto` : "sin presupuesto"} />
        <KCard label="Run-rate anual"
          value={clp(rrFlota.anualProyectado)}
          tone={pptoFlota > 0 && rrFlota.anualProyectado > pptoFlota ? C.red : C.amber}
          sub={`${clp(rrFlota.mensual)}/mes (últimos 3m)`} />
        <KCard label="Presupuesto flota"
          value={pptoFlota > 0 ? clp(pptoFlota) : "—"}
          tone={C.steel}
          sub={`${flota.filter((e) => e.ppto > 0).length} de ${flota.length} naves configuradas`} />
        <KCard label="Naves en zona crítica"
          value={nCriticos}
          tone={nCriticos ? C.red : C.green}
          sub="sobregasto > 5% del esperado" />
      </div>

      {/* Gráfico mensual */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss, marginBottom: 14 }}>
          Gasto mensual flota · últimos 12 meses
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={serie} margin={{ left: 0, right: 10, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.slate }} />
            <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v}
              tick={{ fontSize: 10, fill: C.slate }} width={52} />
            <Tooltip
              formatter={(v, name) => [clp(v), name === "preventivo" ? "Preventivo" : name === "correctivo" ? "Correctivo" : "Otro"]}
              contentStyle={{ fontSize: 12, borderRadius: 7 }}
            />
            <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
            {pptoMensual && (
              <ReferenceLine y={pptoMensual} stroke={C.cyan} strokeDasharray="6 3"
                label={{ value: "Presupuesto/mes", fill: C.cyan, fontSize: 10, position: "insideTopRight" }} />
            )}
            <Bar dataKey="preventivo" stackId="a" fill={C.green} radius={[0, 0, 0, 0]} maxBarSize={40} name="preventivo" />
            <Bar dataKey="correctivo" stackId="a" fill={C.red}   radius={[0, 0, 0, 0]} maxBarSize={40} name="correctivo" />
            <Bar dataKey="otro"       stackId="a" fill={C.steel} radius={[4, 4, 0, 0]} maxBarSize={40} name="otro" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Tabla por nave */}
      {flota.length === 0 ? (
        <Card><Empty>Sin embarcaciones registradas.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {flota.map(({ emb, gasto, rr, ppto, estado, mesesAgot }) => {
            const meta  = ZONA_META[estado.zona];
            const ZIcon = meta.icon;
            const isExp = expanded === emb.id;
            const isEdit = editando === emb.id;
            const borderColor = estado.zona === "critico" ? C.red
              : estado.zona === "atención" ? C.amber
              : estado.zona === "ok" ? C.green : C.line;

            return (
              <Card key={emb.id} style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${borderColor}` }}>
                <button
                  onClick={() => !isEdit && setExpanded(isExp ? null : emb.id)}
                  style={{
                    width: "100%", display: "grid",
                    gridTemplateColumns: "2fr 1.2fr 1.2fr 1.4fr 1fr 1fr 28px",
                    gap: 10, alignItems: "center", padding: "12px 16px",
                    background: estado.zona === "critico" ? tint(C.red, 6) : "transparent",
                    border: "none", cursor: isEdit ? "default" : "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>
                    {emb.nombre}
                    <div style={{ fontSize: 11, color: C.slate, fontWeight: 400 }}>{emb.codigo || ""}</div>
                  </div>

                  <VCol label="Gasto real"
                    value={clp(gasto.total)}
                    tone={estado.zona === "critico" ? C.red : C.ink} />

                  <VCol label="Run-rate anual"
                    value={clp(rr.anualProyectado)}
                    tone={ppto > 0 && rr.anualProyectado > ppto ? C.amber : C.slate} />

                  {/* Presupuesto editable */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Presupuesto {anio}</div>
                    {isEdit ? (
                      <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 2 }}>
                        <input
                          autoFocus
                          type="text"
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") guardarPpto(emb.id); if (e.key === "Escape") setEditando(null); }}
                          style={{ width: 90, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.cyan}`, fontSize: 13, fontWeight: 700 }}
                        />
                        <button onClick={() => guardarPpto(emb.id)} disabled={saving}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.green, padding: 2 }}>
                          <Check size={15} />
                        </button>
                        <button onClick={() => setEditando(null)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2 }}>
                          <XIcon size={15} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                        <span style={{ ...archivo, fontWeight: 700, fontSize: 14, color: ppto > 0 ? C.ink : C.slate }}>
                          {ppto > 0 ? clp(ppto) : "—"}
                        </span>
                        {profile && (
                          <button onClick={() => { setEditando(emb.id); setEditVal(ppto > 0 ? String(ppto) : ""); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2, opacity: 0.6 }}>
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {ZIcon && <ZIcon size={13} color={borderColor} />}
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </div>

                  <VCol label="Agotam. en"
                    value={mesesAgot == null ? "—" : mesesAgot === 0 ? "Agotado" : `${num(mesesAgot, 1)}m`}
                    tone={mesesAgot != null && mesesAgot < 2 ? C.red : mesesAgot != null && mesesAgot < 4 ? C.amber : C.slate} />

                  <div style={{ color: C.slate, display: "flex", justifyContent: "flex-end" }}>
                    {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                      {/* Desglose por tipo */}
                      <DesgloseTipo gasto={gasto} />

                      {/* Indicadores YTD */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, marginBottom: 10 }}>
                          Estado presupuestario YTD
                        </div>
                        <Kpito label="Gasto real"        value={clp(gasto.total)} />
                        <Kpito label="Esperado a la fecha" value={estado.esperado != null ? clp(estado.esperado) : "—"} />
                        <Kpito label="Desvío"
                          value={estado.desviacion != null ? (estado.desviacion >= 0 ? "+" : "") + clp(estado.desviacion) : "—"}
                          tone={estado.desviacion != null && estado.desviacion > 0 ? C.red : C.green} />
                        <Kpito label="% del presupuesto"  value={estado.porcentaje != null ? `${num(estado.porcentaje, 1)}%` : "—"} />
                      </div>

                      {/* Run-rate */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, marginBottom: 10 }}>
                          Run-rate (últimos 3 meses)
                        </div>
                        <Kpito label="Mensual promedio"   value={clp(rr.mensual)} />
                        <Kpito label="Proyección anual"   value={clp(rr.anualProyectado)}
                          tone={ppto > 0 && rr.anualProyectado > ppto ? C.red : undefined} />
                        <Kpito label="Meses con datos"    value={rr.mesesConData} />
                        <Kpito label="Agotamiento est."
                          value={mesesAgot == null ? "—" : mesesAgot === 0 ? "Agotado" : `en ${num(mesesAgot, 1)} meses`}
                          tone={mesesAgot != null && mesesAgot < 3 ? C.red : undefined} />
                        {ppto > 0 && rr.anualProyectado > ppto && (
                          <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>
                            Run-rate supera el presupuesto por {clp(rr.anualProyectado - ppto)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      {onNavigate && (
                        <button onClick={() => onNavigate("ots")}
                          style={{ fontSize: 12, color: C.cyan, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          Ver OTs →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Metodología:</strong>{" "}
          Gasto real = suma de costo_mo + costo_mat de OTs cerradas en el año.
          Run-rate = gasto de los últimos 3 meses ÷ 3 × 12.
          Zona atención = desvío YTD 0-5% sobre lo esperado · Zona crítica {"> 5%"}.
          Presupuestos editables por nave y año — clic en el ícono de lápiz.
        </div>
      </Card>
    </div>
  );
}

function DesgloseTipo({ gasto }) {
  const total = gasto.total || 1;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, marginBottom: 10 }}>
        Desglose por tipo
      </div>
      {[
        { label: "Preventivo",  value: gasto.preventivo, color: C.green },
        { label: "Correctivo",  value: gasto.correctivo, color: C.red   },
        { label: "Otro",        value: gasto.otro,        color: C.steel },
      ].map((row) => (
        <div key={row.label} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.ink, marginBottom: 3 }}>
            <span>{row.label}</span>
            <span style={{ fontWeight: 700 }}>{clp(row.value)}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: tint(row.color, 6), overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(row.value / total) * 100}%`, background: row.color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KCard({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function VCol({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: tone || C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Kpito({ label, value, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: C.slate }}>{label}</span>
      <span style={{ fontWeight: 700, color: tone || C.ink }}>{value}</span>
    </div>
  );
}
