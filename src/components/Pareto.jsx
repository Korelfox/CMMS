import React, { useEffect, useState, useCallback, useMemo } from "react";
import { BarChart3, AlertCircle } from "lucide-react";
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C, archivo, clp, num, tint, lk } from "../theme";
import { modoMeta, codigoLabel } from "../lib/fallasISO";
import { buildEquipoTree } from "../lib/equipTree";
import { Card, PageHead, Pill, FilterBtn, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Análisis de Pareto (80/20): qué pocos sistemas/equipos concentran la mayor
// parte de las fallas o del costo, para enfocar ahí el esfuerzo y el presupuesto.
export default function Pareto() {
  const { profile } = useAuth(); // eslint-disable-line no-unused-vars
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [metrica, setMetrica] = useState("costo");   // "costo" | "fallas"
  const [dim, setDim] = useState("sistema");          // "sistema" | "equipo" | "modo"
  const [nivelISO, setNivelISO] = useState("codigo"); // "codigo" | "grupo" | "clase" (solo dim="modo")

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, o] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("ordenes_trabajo"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o);
    } catch (e) { setError("No se pudo cargar el análisis. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Etiqueta con ruta completa si tiene padre: "Motor Prop > Reductora"
  function eqLabel(id) {
    const eq = equipos.find((e) => e.id === id);
    if (!eq) return null;
    if (eq.parent_id) {
      const padre = equipos.find((e) => e.id === eq.parent_id);
      return padre ? `${padre.sistema} › ${eq.sistema}` : `${eq.id_visible} · ${eq.sistema}`;
    }
    return `${eq.id_visible} · ${eq.sistema}`;
  }

  const { grupos, total, vitales, pctVitales } = useMemo(() => {
    const base = ots.filter((o) => filtro === "all" || o.embarcacion_id === filtro);
    // Para "fallas" (y siempre al agrupar por modo de falla) contamos solo
    // correctivas: son los eventos de falla reales.
    const usar = (metrica === "fallas" || dim === "modo")
      ? base.filter((o) => o.tipo === "correctivo") : base;

    const mapa = new Map();
    usar.forEach((o) => {
      let key;
      if (dim === "equipo") key = eqLabel(o.equipo_id) || o.sistema || "Sin equipo";
      else if (dim === "modo") {
        if (!o.modo_falla) key = "Sin codificar";
        else { const me = modoMeta(o.modo_falla); key = nivelISO === "clase" ? me.clase : nivelISO === "grupo" ? me.grupo : codigoLabel(me.codigo); }
      } else key = o.sistema || "Sin sistema";
      const val = metrica === "costo" ? (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0) : 1;
      mapa.set(key, (mapa.get(key) || 0) + val);
    });

    let arr = [...mapa.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const tot = arr.reduce((s, g) => s + g.value, 0);
    let acumPrev = 0;
    arr = arr.map((g) => {
      const vital = tot > 0 && acumPrev / tot < 0.8;   // contribuye al primer 80%
      acumPrev += g.value;
      return { ...g, pct: tot ? (g.value / tot) * 100 : 0, acum: tot ? (acumPrev / tot) * 100 : 0, vital };
    });
    const nv = arr.filter((g) => g.vital).length;
    const pv = arr.filter((g) => g.vital).reduce((s, g) => s + g.value, 0);
    return { grupos: arr, total: tot, vitales: nv, pctVitales: tot ? (pv / tot) * 100 : 0 };
  }, [ots, equipos, filtro, metrica, dim, nivelISO]); // eslint-disable-line

  const fmt = (v) => (metrica === "costo" ? clp(v) : num(v, 0));
  const chartData = grupos.slice(0, 12).map((g) => ({ ...g, nombreCorto: g.name.length > 16 ? g.name.slice(0, 15) + "…" : g.name }));

  if (loading) return <div><PageHead kicker="Análisis · 80/20" title="Pareto de Fallas y Costos" /><Card><InlineSpinner label="Analizando…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Análisis · Principio de Pareto (80/20)" title="Pareto de Fallas y Costos"
        sub="Identifica los pocos sistemas o equipos que concentran la mayor parte del costo o las fallas, para enfocar ahí el presupuesto y el esfuerzo." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Controles: métrica y dimensión */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 6 }}>Métrica</div>
          <div style={{ display: "flex", gap: 8 }}>
            <FilterBtn active={metrica === "costo"} onClick={() => setMetrica("costo")}>Costo ($)</FilterBtn>
            <FilterBtn active={metrica === "fallas"} onClick={() => setMetrica("fallas")}>Fallas (correctivas)</FilterBtn>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 6 }}>Agrupar por</div>
          <div style={{ display: "flex", gap: 8 }}>
            <FilterBtn active={dim === "sistema"} onClick={() => setDim("sistema")}>Sistema</FilterBtn>
            <FilterBtn active={dim === "equipo"} onClick={() => setDim("equipo")}>Equipo</FilterBtn>
            <FilterBtn active={dim === "modo"} onClick={() => setDim("modo")}>Modo de falla (ISO 14224)</FilterBtn>
          </div>
        </div>
        {dim === "modo" && (
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 6 }}>Nivel ISO</div>
            <div style={{ display: "flex", gap: 8 }}>
              <FilterBtn active={nivelISO === "clase"} onClick={() => setNivelISO("clase")}>Clase</FilterBtn>
              <FilterBtn active={nivelISO === "grupo"} onClick={() => setNivelISO("grupo")}>Grupo</FilterBtn>
              <FilterBtn active={nivelISO === "codigo"} onClick={() => setNivelISO("codigo")}>Código</FilterBtn>
            </div>
          </div>
        )}
      </div>

      {/* Filtro por embarcación */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label={metrica === "costo" ? "Costo total" : "Fallas totales"} value={fmt(total)} tone={C.gold} />
        <KPI label="Pocos vitales" value={vitales} tone={C.red} sub={`${dim === "equipo" ? "equipos" : dim === "modo" ? "modos de falla" : "sistemas"} concentran el 80%`} />
        <KPI label="Concentración" value={`${pctVitales.toFixed(0)}%`} tone={C.steel} sub={`en ${vitales} de ${grupos.length}`} />
      </div>

      {grupos.length === 0 ? (
        <Card><Empty>
          <AlertCircle size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />
          {metrica === "fallas"
            ? "Aún no hay órdenes correctivas registradas para analizar."
            : "Aún no hay costos registrados en las órdenes de trabajo. Ingresa los costos (MO y materiales) para ver el Pareto."}
        </Empty></Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss, marginBottom: 10 }}>
              Curva de Pareto · {metrica === "costo" ? "costo" : "fallas"} por {dim}
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.foam} />
                <XAxis dataKey="nombreCorto" tick={{ fontSize: 10.5, fill: C.slate }} angle={-30} textAnchor="end" interval={0} height={60} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v) => metrica === "costo" ? `$${(v / 1000).toFixed(0)}k` : v} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 7 }}
                  formatter={(val, nombre) => nombre === "acum" ? [`${num(val, 0)}%`, "Acumulado"] : [fmt(val), metrica === "costo" ? "Costo" : "Fallas"]} />
                <ReferenceLine yAxisId="right" y={80} stroke={C.red} strokeDasharray="4 4" label={{ value: "80%", fontSize: 10, fill: C.red, position: "right" }} />
                <Bar yAxisId="left" dataKey="value" radius={[5, 5, 0, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.vital ? C.steel : C.line} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="acum" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>{dim === "equipo" ? "Equipo" : "Sistema"}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{metrica === "costo" ? "Costo" : "Fallas"}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>%</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>% acumulado</th>
                  <th style={thStyle}>Prioridad</th>
                </tr></thead>
                <tbody>
                  {grupos.map((g, i) => (
                    <tr key={g.name} style={g.vital ? { background: tint(C.gold, 16) } : undefined}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{g.name}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmt(g.value)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{g.pct.toFixed(1)}%</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{g.acum.toFixed(1)}%</td>
                      <td style={tdStyle}>{g.vital ? <Pill tone="red">Vital (80%)</Pill> : <Pill tone="slate">Trivial</Pill>}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ marginTop: 16, background: C.mist }}>
            <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
              <strong style={{ color: C.ink }}>Cómo leerlo:</strong> el principio de Pareto dice que ~el 80% del problema viene de ~el 20% de las causas.
              Las barras destacadas y la zona amarilla de la tabla son los <strong>pocos vitales</strong>: {dim === "equipo" ? "equipos" : "sistemas"} donde concentrar
              el plan preventivo, el stock crítico y el presupuesto. La línea dorada muestra el % acumulado; donde cruza el 80% (línea roja) está el corte.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: tone || C.steel, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
