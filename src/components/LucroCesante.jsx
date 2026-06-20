import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  TrendingDown, Anchor, Wrench, ChevronDown, ChevronRight, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { fetchAll } from "../lib/db";
import { calcPL } from "./rentabilidad/calc";
import { lucroCesanteNave } from "../lib/lucro";
import { C, archivo, clp, num, tint } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";
import { hoyLocal } from "../lib/fechas";

const PERIODOS = [
  { label: "3 meses",  meses: 3  },
  { label: "6 meses",  meses: 6  },
  { label: "12 meses", meses: 12 },
  { label: "24 meses", meses: 24 },
];

export default function LucroCesante({ onNavigate }) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [mareas,        setMareas]        = useState([]);
  const [capturas,      setCapturas]      = useState([]);
  const [economias,     setEconomias]     = useState([]);
  const [ots,           setOts]           = useState([]);
  const [varadas,       setVaradas]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [meses,         setMeses]         = useState(12);
  const [expanded,      setExpanded]      = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, mrs, caps, ecos, otsAll, vars] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("mareas"),
        fetchAll("marea_captura"),
        fetchAll("marea_economia"),
        fetchAll("ordenes_trabajo"),
        fetchAll("varadas"),
      ]);
      setEmbarcaciones(embs); setMareas(mrs); setCapturas(caps);
      setEconomias(ecos); setOts(otsAll); setVaradas(vars);
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => hoyLocal(), []);

  const corteISO = useMemo(() => {
    const d = new Date(hoy + "T00:00:00");
    d.setMonth(d.getMonth() - meses);
    return d.toISOString().slice(0, 10);
  }, [hoy, meses]);

  const flota = useMemo(() => embarcaciones.map((emb) => {
    const mareasFilt = mareas.filter(
      (m) => m.embarcacion_id === emb.id && m.estado === "cerrada" && m.zarpe_at >= corteISO
    );
    const otsNave = ots.filter((o) => o.embarcacion_id === emb.id);
    const plList  = mareasFilt
      .map((m) => calcPL(m, capturas, economias.find((e) => e.marea_id === m.id), otsNave))
      .filter(Boolean);
    return { emb, ...lucroCesanteNave({ plList, ots, varadas, embId: emb.id, corteISO }) };
  }), [embarcaciones, mareas, capturas, economias, ots, varadas, corteISO]);

  const totales = useMemo(() => {
    let lucroTotal = 0, lucroCorr = 0, lucroVarada = 0, costoPrev = 0, diasCorr = 0, diasVarada = 0, hasData = false;
    flota.forEach((f) => {
      if (f.lucroTotal  != null) { lucroTotal  += f.lucroTotal;  hasData = true; }
      if (f.lucroCorr   != null)   lucroCorr   += f.lucroCorr;
      if (f.lucroVarada != null)   lucroVarada += f.lucroVarada;
      costoPrev  += f.costoPrev;
      diasCorr   += f.diasCorr;
      diasVarada += f.diasVarada;
    });
    return { lucroTotal, lucroCorr, lucroVarada, costoPrev, diasCorr, diasVarada, hasData };
  }, [flota]);

  const chartData = useMemo(() =>
    flota
      .filter((f) => f.lucroTotal != null && f.lucroTotal > 0)
      .map((f) => ({
        name:    (f.emb.nombre || f.emb.codigo || "").slice(0, 14),
        fallas:  Math.round(f.lucroCorr   || 0),
        varadas: Math.round(f.lucroVarada || 0),
      }))
      .sort((a, b) => (b.fallas + b.varadas) - (a.fallas + a.varadas)),
  [flota]);

  const factorExposicion = totales.costoPrev > 0 && totales.lucroCorr > 0
    ? totales.lucroCorr / totales.costoPrev : null;

  if (loading) return (
    <div>
      <PageHead kicker="Análisis Financiero" title="Lucro Cesante" />
      <Card><InlineSpinner label="Calculando impacto económico de la flota…" /></Card>
    </div>
  );

  return (
    <div>
      <PageHead
        kicker="Análisis Financiero · ISO 55000"
        title="Lucro Cesante"
        sub="Margen del armador no capturado por días de paralización: fallas correctivas + varadas planificadas. Fallas = costo evitable. Varadas = inversión planificada."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Selector de período */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {PERIODOS.map((p) => (
          <button key={p.meses} onClick={() => setMeses(p.meses)} style={{
            padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
            border: `1px solid ${meses === p.meses ? C.cyan : C.line}`,
            background: meses === p.meses ? C.cyan : "transparent",
            color: meses === p.meses ? "#fff" : C.slate,
          }}>{p.label}</button>
        ))}
      </div>

      {/* KPIs ejecutivos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPICard
          label="Lucro Cesante Total"
          value={totales.hasData ? clp(totales.lucroTotal) : "—"}
          tone={totales.lucroTotal > 0 ? C.red : C.green}
          sub={`${num(totales.diasCorr + totales.diasVarada, 1)} días detenida la flota`}
        />
        <KPICard
          label="Por fallas no planificadas"
          value={totales.hasData ? clp(totales.lucroCorr) : "—"}
          tone={totales.lucroCorr > 0 ? C.red : C.green}
          sub={`${num(totales.diasCorr, 1)} días · porción evitable`}
        />
        <KPICard
          label="Por varadas planificadas"
          value={totales.hasData ? clp(totales.lucroVarada) : "—"}
          tone={C.amber}
          sub={`${num(totales.diasVarada, 1)} días · costo de negocio`}
        />
        <KPICard
          label="Preventivo invertido"
          value={clp(totales.costoPrev)}
          tone={C.cyan}
          sub="OTs preventivas en el período"
        />
      </div>

      {/* Insight ejecutivo */}
      {factorExposicion != null && (
        <Card style={{ marginBottom: 16, background: tint(C.red, 5), borderLeft: `4px solid ${C.red}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertCircle size={18} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>
              Por cada <strong>$1</strong> invertido en mantenimiento preventivo, las fallas no
              planificadas representaron{" "}
              <strong style={{ color: C.red, fontSize: 15 }}>
                ${num(factorExposicion, 1)}
              </strong>{" "}
              de margen no capturado.{" "}
              {factorExposicion >= 2
                ? "El potencial retorno de mayor inversión en preventivo es alto."
                : "La inversión en preventivo es proporcionada al impacto actual de las fallas."}
            </div>
          </div>
        </Card>
      )}

      {/* Gráfico por nave */}
      {chartData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss, marginBottom: 14 }}>
            Lucro Cesante por Nave
          </div>
          <ResponsiveContainer width="100%" height={Math.max(100, chartData.length * 54)}>
            <BarChart layout="vertical" data={chartData} margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: C.slate }}
                tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: C.ink }} />
              <Tooltip
                formatter={(v, key) => [clp(v), key === "fallas" ? "Fallas" : "Varadas"]}
                contentStyle={{ fontSize: 12, borderRadius: 7 }}
              />
              <Bar dataKey="fallas"  stackId="a" fill={C.red}   name="fallas"  />
              <Bar dataKey="varadas" stackId="a" fill={C.amber} name="varadas" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, color: C.slate }}>
            <span><Dot color={C.red}   />Fallas correctivas</span>
            <span><Dot color={C.amber} />Varadas planificadas</span>
          </div>
        </Card>
      )}

      {/* Detalle por nave */}
      {flota.length === 0 ? (
        <Card><Empty>Sin embarcaciones registradas.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flota.map((f) => {
            const isExp     = expanded === f.emb.id;
            const sinMargen = f.margenDia == null;
            const toneLC    = f.lucroTotal > 0 ? C.red : f.lucroTotal === 0 ? C.green : C.slate;
            return (
              <Card key={f.emb.id} style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setExpanded(isExp ? null : f.emb.id)}
                  style={{
                    width: "100%", display: "grid",
                    gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.6fr 1.4fr 28px",
                    gap: 12, alignItems: "center", padding: "14px 18px",
                    background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ ...archivo, fontWeight: 800, fontSize: 14, color: C.abyss }}>
                      {f.emb.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 1 }}>{f.emb.codigo || ""}</div>
                  </div>
                  <MCol label="Margen/día"       value={f.margenDia != null ? clp(f.margenDia) : "—"} note={sinMargen ? "sin mareas" : null} />
                  <MCol label="Días fallas"      value={num(f.diasCorr, 1) + "d"}   tone={f.diasCorr > 5 ? C.red : f.diasCorr > 0 ? C.amber : C.slate} />
                  <MCol label="Días varadas"     value={num(f.diasVarada, 1) + "d"} tone={f.diasVarada > 0 ? C.amber : C.slate} />
                  <MCol label="Lucro cesante"    value={f.lucroTotal != null ? clp(f.lucroTotal) : "—"} tone={toneLC} large />
                  <MCol label="Prev. invertido"  value={clp(f.costoPrev)} tone={C.cyan} />
                  <div style={{ color: C.slate, display: "flex", justifyContent: "flex-end" }}>
                    {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>
                </button>

                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 18px 14px" }}>
                    {f.eventos.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.slate, padding: "6px 0" }}>
                        Sin eventos de paralización en el período seleccionado.
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["Tipo", "Fecha", "Descripción", "Sistema", "Días", "Impacto $"].map((h) => (
                              <th key={h} style={{ ...thSt, textAlign: h === "Impacto $" ? "right" : "left" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {f.eventos.map((ev) => (
                            <tr key={ev.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                              <td style={tdSt}>
                                <Pill tone={ev.tipo === "correctiva" ? "red" : "yellow"}>
                                  {ev.tipo === "correctiva"
                                    ? <><Wrench size={10} /> Falla</>
                                    : <><Anchor size={10} /> Varada</>}
                                </Pill>
                              </td>
                              <td style={{ ...tdSt, color: C.slate, whiteSpace: "nowrap" }}>{ev.fecha || "—"}</td>
                              <td style={tdSt}>
                                {onNavigate && ev.tipo === "correctiva" ? (
                                  <button onClick={() => onNavigate("ots", { otId: ev.id })}
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.cyan, fontSize: 13, textDecoration: "underline" }}>
                                    {ev.descripcion}
                                  </button>
                                ) : onNavigate && ev.tipo === "varada" ? (
                                  <button onClick={() => onNavigate("varada")}
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.cyan, fontSize: 13, textDecoration: "underline" }}>
                                    {ev.descripcion}
                                  </button>
                                ) : ev.descripcion}
                              </td>
                              <td style={{ ...tdSt, color: C.slate }}>{ev.sistema || "—"}</td>
                              <td style={{ ...tdSt, fontWeight: 700 }}>{num(ev.dias, 1)}d</td>
                              <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: f.margenDia != null ? C.red : C.slate }}>
                                {f.margenDia != null ? clp(ev.dias * f.margenDia) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {sinMargen && (
                      <div style={{ marginTop: 8, fontSize: 12, color: C.slate }}>
                        Sin mareas con captura registrada en el período → impacto económico no calculable.
                        Ingresa capturas en <strong>Rentabilidad por Marea</strong> para activarlo.
                      </div>
                    )}
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
          Margen/día = margen del armador acumulado ÷ días de mar en el período (mareas cerradas con captura).
          Días por falla = MTTR de OTs correctivas cerradas ÷ 24.
          Días de varada = duración real de varadas cerradas.
          Las fallas son costo evitable; las varadas son inversión planificada de mantenimiento mayor.
        </div>
      </Card>
    </div>
  );
}

function KPICard({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 21, fontWeight: 800, color: tone || C.steel, lineHeight: 1.15, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{sub}</div>}
    </Card>
  );
}

function MCol({ label, value, tone, note, large }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontWeight: 700, fontSize: large ? 15 : 13, color: tone || C.ink, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: C.slate }}>{note}</div>}
    </div>
  );
}

function Dot({ color }) {
  return (
    <span style={{ display: "inline-block", width: 10, height: 10, background: color, borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
  );
}

const thSt = { fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px 8px 0" };
const tdSt = { fontSize: 13, padding: "8px 8px 8px 0", verticalAlign: "middle" };
