import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Fuel, Droplet, Waves, AlertCircle, TrendingUp, Gauge } from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "../lib/auth"; // eslint-disable-line no-unused-vars
import { fetchAll } from "../lib/db";
import { C, archivo, num } from "../theme";
import { Card, PageHead, Pill, FilterBtn, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Consumo neto por marea (sin reabastecimiento intermedio): lo cargado al
// zarpar menos lo que quedó al recalar. Combustible a nivel nave (L/h);
// aceite repartido entre los motores que consumen, proporcional a sus horas (L/100h).
function calcMarea(m, equiposNave) {
  const consumidores = equiposNave.filter((e) => e.consume_aceite);
  const horasPorEq = {};
  let horasNave = 0;
  equiposNave.forEach((e) => {
    const ini = Number(m.horometros_ini?.[e.id] ?? 0);
    const fin = Number(m.horometros_fin?.[e.id] ?? ini);
    const h = Math.max(0, fin - ini);
    horasPorEq[e.id] = h;
    if (h > horasNave) horasNave = h;   // la marea dura lo que opera el motor de mayor uso
  });
  const dias = m.recalada_at && m.zarpe_at ? Math.max(0.01, (new Date(m.recalada_at) - new Date(m.zarpe_at)) / 86400000) : null;
  const combCons = Math.max(0, (m.comb_ini || 0) - (m.comb_fin || 0));
  const aceiteCons = Math.max(0, (m.aceite_ini || 0) - (m.aceite_fin || 0));
  const aguaCons = Math.max(0, (m.agua_ini || 0) - (m.agua_fin || 0));
  const combLh = horasNave > 0 ? combCons / horasNave : 0;

  const sumaHorasCons = consumidores.reduce((s, e) => s + (horasPorEq[e.id] || 0), 0);
  const aceitePorMotor = consumidores.map((e) => {
    const h = horasPorEq[e.id] || 0;
    const aceiteAtrib = sumaHorasCons > 0 ? aceiteCons * (h / sumaHorasCons) : 0;
    const l100h = h > 0 ? (aceiteAtrib / h) * 100 : 0;
    return { eqId: e.id, nombre: e.sistema || e.id_visible, horas: h, aceite: aceiteAtrib, l100h };
  });
  // L/100h de aceite de la nave (sobre el motor de mayor uso, referencia global)
  const aceiteL100h = horasNave > 0 ? (aceiteCons / horasNave) * 100 : 0;

  return { dias, combCons, aceiteCons, aguaCons, horasNave, combLh, aceiteL100h, aceitePorMotor };
}

export default function Consumos() {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [mareas, setMareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, ms] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("mareas", { order: { col: "zarpe_at", asc: true } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms);
    } catch (e) { setError("No se pudo cargar consumos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  const { filas, kpis, serie, motoresAlerta } = useMemo(() => {
    const cerradas = mareas.filter((m) => m.estado === "cerrada" && (filtro === "all" || m.embarcacion_id === filtro));
    const fs = cerradas.map((m) => {
      const eqNave = equipos.filter((e) => e.embarcacion_id === m.embarcacion_id);
      return { m, calc: calcMarea(m, eqNave) };
    });
    // KPIs promedio (solo mareas con horas operadas)
    const conHoras = fs.filter((f) => f.calc.horasNave > 0);
    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
    const kpis = {
      mareas: fs.length,
      horas: fs.reduce((s, f) => s + f.calc.horasNave, 0),
      combLh: avg(conHoras.map((f) => f.calc.combLh)),
      aceiteL100h: avg(conHoras.map((f) => f.calc.aceiteL100h)),
    };
    // Serie temporal para el gráfico
    const serie = fs.map((f) => ({
      name: f.m.folio || new Date(f.m.zarpe_at).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }),
      combLh: +f.calc.combLh.toFixed(1),
      aceiteL100h: +f.calc.aceiteL100h.toFixed(2),
    }));
    // Alerta de tendencia por motor: último L/100h vs promedio previo (>30% = en aumento)
    const porMotor = {};
    fs.forEach((f) => f.calc.aceitePorMotor.forEach((am) => {
      if (am.horas <= 0) return;
      (porMotor[am.eqId] = porMotor[am.eqId] || { nombre: am.nombre, vals: [] }).vals.push(am.l100h);
    }));
    const motoresAlerta = [];
    Object.values(porMotor).forEach((mt) => {
      if (mt.vals.length >= 3) {
        const ult = mt.vals[mt.vals.length - 1];
        const prev = mt.vals.slice(0, -1);
        const prom = prev.reduce((s, x) => s + x, 0) / prev.length;
        if (prom > 0 && ult > prom * 1.3) motoresAlerta.push({ nombre: mt.nombre, ult, prom });
      }
    });
    return { filas: fs, kpis, serie, motoresAlerta };
  }, [mareas, equipos, filtro]);

  if (loading) return <div><PageHead kicker="Análisis · Eficiencia" title="Consumos & Eficiencia" /><Card><InlineSpinner label="Calculando consumos…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Análisis · Eficiencia operacional" title="Consumos & Eficiencia"
        sub="Consumo neto por marea (zarpe vs recalada). Combustible por hora de la nave y aceite por 100 horas de cada motor: el indicador clave de salud del motor." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
      </div>

      {motoresAlerta.length > 0 && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: C.red, marginBottom: 4 }}>
            <TrendingUp size={17} /> Consumo de aceite en aumento
          </div>
          {motoresAlerta.map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.slate }}>
              <strong>{a.nombre}</strong>: última marea {num(a.ult, 2)} L/100h vs promedio {num(a.prom, 2)} L/100h — revisar motor (posible desgaste).
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Mareas cerradas" value={kpis.mareas} />
        <KPI label="Horas operadas" value={`${num(kpis.horas, 0)} h`} tone={C.steel} />
        <KPI label="Combustible" value={`${num(kpis.combLh, 1)} L/h`} tone={C.gold} sub="promedio de la nave" />
        <KPI label="Aceite" value={`${num(kpis.aceiteL100h, 2)} L/100h`} tone={kpis.aceiteL100h > 0 ? C.amber : C.green} sub="salud del motor" />
      </div>

      {filas.length === 0 ? (
        <Card><Empty>
          <AlertCircle size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Aún no hay mareas cerradas con datos de recalada. Registra el prezarpe al zarpar y los datos de stock + horómetros al recalar para ver el consumo.
        </Empty></Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss, marginBottom: 10 }}>Tendencia por marea</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={serie} margin={{ top: 10, right: 16, bottom: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.foam} />
                <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: C.slate }} angle={-25} textAnchor="end" height={50} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.slate }} label={{ value: "L/h comb.", angle: -90, position: "insideLeft", fontSize: 10, fill: C.slate }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.slate }} label={{ value: "L/100h aceite", angle: 90, position: "insideRight", fontSize: 10, fill: C.slate }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 7 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="l" type="monotone" name="Combustible L/h" dataKey="combLh" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line yAxisId="r" type="monotone" name="Aceite L/100h" dataKey="aceiteL100h" stroke={C.red} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                <thead><tr>
                  <th style={thStyle}>Marea</th><th style={thStyle}>Embarcación</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Días</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Comb. (L)</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>L/h</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Aceite (L)</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>L/100h</th>
                </tr></thead>
                <tbody>
                  {[...filas].reverse().map(({ m, calc }) => (
                    <tr key={m.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{m.folio || "—"}</td>
                      <td style={tdStyle}>{embName(m.embarcacion_id)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{calc.dias ? num(calc.dias, 1) : "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{num(calc.horasNave, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{num(calc.combCons, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{num(calc.combLh, 1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{num(calc.aceiteCons, 1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                        <Pill tone={calc.aceiteL100h > 2 ? "red" : calc.aceiteL100h > 1 ? "yellow" : "green"}>{num(calc.aceiteL100h, 2)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ marginTop: 16, background: C.mist }}>
            <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
              <strong style={{ color: C.ink }}>Cómo leerlo:</strong> el <strong>aceite L/100h</strong> es el mejor indicador de salud de un motor diésel.
              Si sube marea a marea, el motor consume más aceite del normal (desgaste de anillos/camisas) — conviene programar una intervención antes de que falle.
              El consumo se reparte entre los motores marcados "consume aceite" en proporción a sus horas operadas.
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
      <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone || C.steel, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
