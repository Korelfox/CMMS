import React, { useEffect, useState, useCallback } from "react";
import { Gauge, TrendingUp, Clock, Wrench, AlertCircle } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C, archivo, clp, num, TIPOS_OT, lk } from "../theme";
import { Card, PageHead, Pill, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner } from "../ui";

const TIPO_COLOR = { preventivo: "#1E9E6A", correctivo: "#D8443C", modificativo: "#6C4FA3", predictivo: "#127C8A" };

export default function KPIs() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, otsAll] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(otsAll);
    } catch (e) { setError("No se pudieron cargar los KPIs. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  // ───── Métricas globales (Pascual · Mora Gutiérrez) ────────────────────
  const correctivas = ots.filter((o) => o.tipo === "correctivo");
  const proactivas = ots.filter((o) => ["preventivo", "predictivo", "modificativo"].includes(o.tipo));
  const cerradas = ots.filter((o) => o.estado === "cerrada");
  const abiertas = ots.filter((o) => o.estado !== "cerrada");

  // MTBF = horas de operación entre fallas (promedio de hrs_oper_desde en correctivas)
  const mtbf = correctivas.length
    ? correctivas.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / correctivas.length
    : 0;
  // MTTR = tiempo medio de reparación (promedio de mttr_horas en cerradas)
  const mttr = cerradas.length
    ? cerradas.reduce((s, o) => s + (Number(o.mttr_horas) || 0), 0) / cerradas.length
    : 0;
  // Disponibilidad = MTBF / (MTBF + MTTR)
  const disp = (mtbf + mttr) > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100;
  // Proactividad = OTs proactivas / total
  const propProactivo = ots.length ? (proactivas.length / ots.length) * 100 : 0;
  // Cumplimiento de cierre
  const cumplimiento = ots.length ? (cerradas.length / ots.length) * 100 : 0;
  // Costos
  const costoMO = ots.reduce((s, o) => s + (Number(o.costo_mo) || 0), 0);
  const costoMat = ots.reduce((s, o) => s + (Number(o.costo_mat) || 0), 0);

  // Datos por embarcación
  const porEmbarcacion = embarcaciones.map((e) => {
    const eo = ots.filter((o) => o.embarcacion_id === e.id);
    const eoCorr = eo.filter((o) => o.tipo === "correctivo");
    const eoCerr = eo.filter((o) => o.estado === "cerrada");
    const eMtbf = eoCorr.length ? eoCorr.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / eoCorr.length : 0;
    const eMttr = eoCerr.length ? eoCerr.reduce((s, o) => s + (Number(o.mttr_horas) || 0), 0) / eoCerr.length : 0;
    const eDisp = (eMtbf + eMttr) > 0 ? (eMtbf / (eMtbf + eMttr)) * 100 : 100;
    return {
      ...e,
      ots: eo.length, abiertas: eo.filter((o) => o.estado !== "cerrada").length,
      mtbf: eMtbf, mttr: eMttr, disp: eDisp,
      costo: eo.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0),
    };
  });

  // Datos para gráficos
  const dataTipo = TIPOS_OT.map((t) => ({
    name: t.label, cantidad: ots.filter((o) => o.tipo === t.value).length, color: TIPO_COLOR[t.value],
  }));
  const dataEmb = porEmbarcacion.map((e) => ({ name: e.nombre, total: e.ots, color: e.color }));

  const dispTone = disp >= 90 ? C.green : disp >= 75 ? C.amber : C.red;
  const proTone = propProactivo >= 60 ? C.green : propProactivo >= 40 ? C.amber : C.red;

  if (loading) return <div><PageHead kicker="Confiabilidad" title="KPIs & Confiabilidad" /><Card><InlineSpinner label="Calculando KPIs…" /></Card></div>;

  if (ots.length === 0) {
    return (
      <div>
        <PageHead kicker="Confiabilidad · Pascual" title="KPIs & Confiabilidad" />
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Aún no hay órdenes de trabajo registradas. Los KPIs se calculan a partir de OTs cerradas con sus tiempos y costos.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Confiabilidad · Pascual / Mora Gutiérrez" title="KPIs & Confiabilidad"
        sub="MTBF, MTTR y Disponibilidad calculados desde las OTs. Los datos se llenan automáticamente a medida que registres y cierres trabajos." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <BigKPI label="Disponibilidad" value={`${disp.toFixed(1)}%`} tone={dispTone} icon={Gauge} sub={disp >= 90 ? "excelente" : disp >= 75 ? "aceptable" : "crítica"} />
        <BigKPI label="MTBF" value={`${num(mtbf, 0)}h`} icon={Clock} sub={`${correctivas.length} correctivas`} />
        <BigKPI label="MTTR" value={`${num(mttr, 1)}h`} icon={Wrench} sub={`${cerradas.length} cerradas`} />
        <BigKPI label="Proactividad" value={`${propProactivo.toFixed(0)}%`} tone={proTone} icon={TrendingUp} sub={`${proactivas.length} de ${ots.length} OTs`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        <MiniKPI label="OTs Totales" value={ots.length} />
        <MiniKPI label="OTs Abiertas" value={abiertas.length} tone={abiertas.length ? C.amber : C.green} />
        <MiniKPI label="% Cumplimiento" value={`${cumplimiento.toFixed(0)}%`} />
        <MiniKPI label="Costo Total" value={clp(costoMO + costoMat)} tone={C.gold} sub={`MO ${clp(costoMO)} · Mat ${clp(costoMat)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss, marginBottom: 10 }}>OTs por Tipo</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dataTipo}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.foam} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.slate }} />
              <YAxis tick={{ fontSize: 11, fill: C.slate }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 7 }} />
              <Bar dataKey="cantidad" radius={[5, 5, 0, 0]}>
                {dataTipo.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss, marginBottom: 10 }}>OTs por Embarcación</div>
          {dataEmb.length === 0 ? <Empty>Sin embarcaciones.</Empty> :
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dataEmb}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.foam} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.slate }} />
                <YAxis tick={{ fontSize: 11, fill: C.slate }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 7 }} />
                <Bar dataKey="total" radius={[5, 5, 0, 0]}>
                  {dataEmb.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </Card>
      </div>

      {/* Tabla por embarcación */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px 8px", ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>Confiabilidad por Embarcación</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr>
              <th style={thStyle}>Embarcación</th>
              <th style={{ ...thStyle, textAlign: "right" }}>OTs</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Abiertas</th>
              <th style={{ ...thStyle, textAlign: "right" }}>MTBF (h)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>MTTR (h)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Disp.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Costo</th>
            </tr></thead>
            <tbody>
              {porEmbarcacion.length === 0 ? <tr><td colSpan={7}><Empty>Sin embarcaciones.</Empty></td></tr> :
                porEmbarcacion.map((e) => {
                  const dTone = e.disp >= 90 ? "green" : e.disp >= 75 ? "yellow" : "red";
                  return (
                    <tr key={e.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: e.color }} />
                          <span style={{ fontWeight: 600 }}>{e.nombre}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{e.ots}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: e.abiertas ? C.amber : C.green, fontWeight: 600 }}>{e.abiertas}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{num(e.mtbf, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{num(e.mttr, 1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}><Pill tone={dTone}>{e.disp.toFixed(1)}%</Pill></td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(e.costo)}</td>
                    </tr>);
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Definiciones:</strong>{" "}
          <strong>MTBF</strong> (Mean Time Between Failures) = horas promedio de operación entre fallas correctivas.{" "}
          <strong>MTTR</strong> (Mean Time To Repair) = horas promedio para reparar una OT cerrada.{" "}
          <strong>Disponibilidad</strong> = MTBF ÷ (MTBF + MTTR), objetivo ≥ 90%.{" "}
          <strong>Proactividad</strong> = OTs preventivas + predictivas + modificativas sobre el total. Objetivo de clase mundial: ≥ 70%.
        </div>
      </Card>
    </div>
  );
}

function BigKPI({ label, value, tone, icon: Icon, sub }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
        {Icon && <Icon size={18} color={tone || C.steel} />}
      </div>
      <div style={{ ...archivo, fontSize: 28, fontWeight: 800, color: tone || C.steel, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
function MiniKPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 5 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}
