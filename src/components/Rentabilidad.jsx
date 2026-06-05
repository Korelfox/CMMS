import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel } from "lucide-react";
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Legend,
} from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../lib/db";
import { supabase } from "../lib/supabase";
import { C, archivo, clp, num, isAdmin, canOperate } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn,
  inputStyle, bluInput, thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

// ── Modelo a la parte — cálculo P&L ───────────────────────────
// Gastos del pozo (se descuentan ANTES del reparto):
//   combustible + víveres + hielo + carnada
// Costos del armador (NO se comparten, van después del reparto):
//   aceite + mantención (OTs) + otros
export function calcPL(marea, capturas = [], eco, otsNave = []) {
  if (!marea) return null;
  const lineas = capturas.filter((c) => c.marea_id === marea.id);
  const valorBruto = lineas.reduce((s, c) => s + (c.kg || 0) * (c.precio_kg || 0), 0);
  const kgTotal    = lineas.reduce((s, c) => s + (c.kg || 0), 0);

  const combCons  = Math.max(0, (marea.comb_ini  || 0) - (marea.comb_fin  || 0));
  const aceiteCons= Math.max(0, (marea.aceite_ini|| 0) - (marea.aceite_fin|| 0));

  const pComb    = eco?.precio_combustible_l || 0;
  const pAceite  = eco?.precio_aceite_l      || 0;

  // ── Gastos del pozo ──
  const costoComb    = combCons * pComb;
  const costoViveres = eco?.costo_viveres || 0;
  const costoHielo   = eco?.costo_hielo   || 0;
  const costoCarnada = eco?.costo_carnada || 0;
  const gastosPozo   = costoComb + costoViveres + costoHielo + costoCarnada;

  // ── Reparto ──
  const liquido        = Math.max(0, valorBruto - gastosPozo);
  const pct            = eco?.parte_tripulacion_pct ?? 50;
  const parteTrip      = liquido * (pct / 100);
  const ingresoArmador = liquido - parteTrip;
  const numTrip        = eco?.num_tripulantes || 0;
  const porTripulante  = numTrip > 0 ? parteTrip / numTrip : null;

  // ── Costos del armador ──
  const costoAceite  = aceiteCons * pAceite;
  const otsEnMarea   = otsNave.filter((o) =>
    o.embarcacion_id === marea.embarcacion_id
    && o.fecha && marea.zarpe_at && marea.recalada_at
    && new Date(o.fecha) >= new Date(marea.zarpe_at)
    && new Date(o.fecha) <= new Date(marea.recalada_at));
  const costoOTs = otsEnMarea.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);
  const costoOtros    = eco?.costo_otros || 0;
  const costosArmador = costoAceite + costoOTs + costoOtros;
  const margen        = ingresoArmador - costosArmador;

  const dias = marea.zarpe_at && marea.recalada_at
    ? Math.max(0.01, (new Date(marea.recalada_at) - new Date(marea.zarpe_at)) / 86400000) : null;

  return {
    valorBruto, kgTotal, combCons, aceiteCons,
    costoComb, costoViveres, costoHielo, costoCarnada, gastosPozo,
    liquido, pct, parteTrip, numTrip, porTripulante, ingresoArmador,
    costoAceite, costoOTs, costoOtros, costosArmador, margen,
    margenPct:          valorBruto > 0    ? (margen / valorBruto) * 100    : null,
    margenSobreIngreso: ingresoArmador > 0? (margen / ingresoArmador) * 100: null,
    armadorPorKg:       kgTotal > 0       ? ingresoArmador / kgTotal       : null,
    margenPorDia:       dias              ? margen / dias                  : null,
    precioProm:         kgTotal > 0       ? valorBruto / kgTotal           : null,
    dias, tieneCaptura: lineas.length > 0, tieneEco: !!eco, lineas, otsEnMarea,
  };
}

// ── Componente principal ───────────────────────────────────────
export default function Rentabilidad({ onNavigate, navParams }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [mareas,    setMareas]    = useState([]);
  const [ots,       setOts]       = useState([]);
  const [especies,  setEspecies]  = useState([]);
  const [capturas,  setCapturas]  = useState([]);
  const [economias, setEconomias] = useState([]);
  const [conf,      setConf]      = useState({ precio_combustible_l: 0, precio_aceite_l: 0, parte_tripulacion_pct: 50 });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [tab,       setTab]       = useState("dashboard");
  const [navMareaId, setNavMareaId] = useState(null);  // ID de marea a abrir automáticamente
  const [filtroEmb, setFiltroEmb] = useState("all");

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, ms, os, esp, caps, ecos, empData] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("mareas",        { order: { col: "zarpe_at", asc: false } }),
        fetchAll("ordenes_trabajo"),
        fetchAll("especies",      { order: { col: "nombre",   asc: true } }),
        fetchAll("marea_captura"),
        fetchAll("marea_economia"),
        supabase.from("empresas")
          .select("precio_combustible_l,precio_aceite_l,parte_tripulacion_pct")
          .eq("id", profile.empresa_id).single().then((r) => r.data || {}),
      ]);
      setEmbarcaciones(embs); setMareas(ms); setOts(os);
      setEspecies(esp); setCapturas(caps); setEconomias(ecos);
      if (empData) setConf(empData);
    } catch (e) { setError("No se pudo cargar rentabilidad. " + e.message); }
    finally { setLoading(false); }
  }, [profile?.empresa_id]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  // Navegar desde otro módulo con marea específica (ej. desde Consumos)
  useEffect(() => {
    if (navParams?.mareaId) {
      setTab("mareas");
      setNavMareaId(navParams.mareaId);
    }
  }, [navParams]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  const mareasFiltradas = useMemo(() =>
    mareas.filter((m) => m.estado === "cerrada" && (filtroEmb === "all" || m.embarcacion_id === filtroEmb)),
    [mareas, filtroEmb]);

  if (loading) return (
    <div><PageHead kicker="Gestión Comercial" title="Rentabilidad por Marea" />
    <Card><InlineSpinner label="Cargando datos económicos…" /></Card></div>
  );

  const shared = { profile, embarcaciones, ots, especies, setEspecies, capturas, setCapturas, economias, setEconomias, conf, setConf, embName, setError, recargar: cargar, onNavigate };

  return (
    <div>
      <PageHead kicker="Gestión Comercial · Flota Pesquera" title="Rentabilidad por Marea"
        sub="Modelo a la parte: ingreso bruto → gastos del pozo → líquido → parte tripulación → margen del armador." />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {[["dashboard", LayoutDashboard, "Dashboard"], ["mareas", Fish, "Registro por Marea"], ["especies", BookOpen, "Especies"], ["config", Settings, "Configuración"]].map(([id, Icon, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${tab === id ? C.cyan : C.line}`, background: tab === id ? C.cyan : "#fff", color: tab === id ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon size={15} />{lbl}
          </button>
        ))}
        {(tab === "mareas" || tab === "dashboard") && embarcaciones.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 8 }}>
            <FilterBtn active={filtroEmb === "all"} onClick={() => setFiltroEmb("all")}>Toda la flota</FilterBtn>
            {embarcaciones.map((v) => (
              <FilterBtn key={v.id} active={filtroEmb === v.id} onClick={() => setFiltroEmb(v.id)} color={v.color}>{v.nombre}</FilterBtn>
            ))}
          </div>
        )}
      </div>

      {tab === "dashboard" && <TabDashboard mareas={mareasFiltradas} capturas={capturas} economias={economias} ots={ots} embarcaciones={embarcaciones} embName={embName} />}
      {tab === "mareas"   && <TabMareas   {...shared} mareas={mareasFiltradas} allOts={ots} navMareaId={navMareaId} onNavUsed={() => setNavMareaId(null)} />}
      {tab === "especies" && <TabEspecies {...shared} />}
      {tab === "config"   && <TabConfig   {...shared} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// TAB DASHBOARD
// ─────────────────────────────────────────────────────────────────
const COLORES_COSTO = {
  combustible: "#E0A526",
  vivHiCar:    "#60B8C8",
  parteTrip:   "#7C6AF7",
  aceite:      "#F09030",
  mant:        "#E05050",
  otros:       "#94A3B8",
};

function TabDashboard({ mareas, capturas, economias, ots, embarcaciones, embName }) {
  const [periodo, setPeriodo] = useState("todo"); // "30" | "90" | "180" | "todo"

  // P&L por cada marea con datos, filtrado por período
  const plList = useMemo(() => {
    const hoy   = new Date();
    const corte = periodo !== "todo" ? new Date(hoy.getTime() - Number(periodo) * 86400000) : null;
    return mareas
      .filter((m) => m.estado === "cerrada" && (!corte || (m.zarpe_at && new Date(m.zarpe_at) >= corte)))
      .map((m) => ({ m, pl: calcPL(m, capturas, economias.find((e) => e.marea_id === m.id), ots) }))
      .filter(({ pl }) => pl?.tieneCaptura);
  }, [mareas, capturas, economias, ots, periodo]);

  // KPIs globales
  const kpis = useMemo(() => {
    const z = { valorBruto: 0, margen: 0, kgTotal: 0, parteTrip: 0, gastosPozo: 0, costosArmador: 0 };
    plList.forEach(({ pl }) => {
      z.valorBruto    += pl.valorBruto;
      z.margen        += pl.margen;
      z.kgTotal       += pl.kgTotal;
      z.parteTrip     += pl.parteTrip;
      z.gastosPozo    += pl.gastosPozo;
      z.costosArmador += pl.costosArmador;
    });
    return { ...z, mareas: plList.length, margenPct: z.valorBruto > 0 ? (z.margen / z.valorBruto) * 100 : null };
  }, [plList]);

  // Serie temporal para gráfico (últimas 15, de más antigua a más nueva)
  const serie = useMemo(() =>
    [...plList].slice(-15).map(({ m, pl }) => ({
      name:          m.folio || new Date(m.zarpe_at).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }),
      nave:          embName(m.embarcacion_id),
      gastosPozo:    +pl.gastosPozo.toFixed(0),
      parteTrip:     +pl.parteTrip.toFixed(0),
      costosArmador: +pl.costosArmador.toFixed(0),
      margen:        +pl.margen.toFixed(0),
      margenPct:     pl.margenPct !== null ? +pl.margenPct.toFixed(1) : null,
    })),
    [plList, embName]);

  // Composición de costos (agregado)
  const composicion = useMemo(() => {
    const z = { combustible: 0, vivHiCar: 0, parteTrip: 0, aceite: 0, mant: 0, otros: 0 };
    plList.forEach(({ pl }) => {
      z.combustible += pl.costoComb;
      z.vivHiCar    += pl.costoViveres + pl.costoHielo + pl.costoCarnada;
      z.parteTrip   += pl.parteTrip;
      z.aceite      += pl.costoAceite;
      z.mant        += pl.costoOTs;
      z.otros       += pl.costoOtros;
    });
    return [
      { label: "Combustible",          value: z.combustible, color: COLORES_COSTO.combustible },
      { label: "Víveres / Hielo / Carnada", value: z.vivHiCar, color: COLORES_COSTO.vivHiCar },
      { label: "Parte tripulación",    value: z.parteTrip,   color: COLORES_COSTO.parteTrip  },
      { label: "Aceite",               value: z.aceite,      color: COLORES_COSTO.aceite     },
      { label: "Mantención (OTs)",     value: z.mant,        color: COLORES_COSTO.mant       },
      { label: "Otros",                value: z.otros,       color: COLORES_COSTO.otros      },
    ].filter((d) => d.value > 0);
  }, [plList]);
  const totalCostos = composicion.reduce((s, d) => s + d.value, 0);

  // Ranking de naves
  const ranking = useMemo(() => {
    const por = {};
    embarcaciones.forEach((e) => { por[e.id] = { emb: e, n: 0, bruto: 0, margen: 0, kg: 0, trip: 0 }; });
    plList.forEach(({ m, pl }) => {
      if (!por[m.embarcacion_id]) return;
      const r = por[m.embarcacion_id];
      r.n++; r.bruto += pl.valorBruto; r.margen += pl.margen; r.kg += pl.kgTotal; r.trip += pl.parteTrip;
    });
    return Object.values(por)
      .filter((r) => r.n > 0)
      .map((r) => ({ ...r, margenPct: r.bruto > 0 ? (r.margen / r.bruto) * 100 : null, armadorKg: r.kg > 0 ? (r.margen + r.trip) / r.kg : null }))
      .sort((a, b) => b.margen - a.margen);
  }, [plList, embarcaciones]);

  // Punto de equilibrio por marea
  const breakEven = useMemo(() =>
    plList.map(({ m, pl }) => {
      if (!pl.precioProm || pl.precioProm === 0) return null;
      const pct       = pl.pct / 100;
      // bruto_needed = gastos_pozo + costos_armador / (1 - pct)
      const brutoNeed = pct < 1 ? pl.gastosPozo + pl.costosArmador / (1 - pct) : null;
      const kgNeed    = brutoNeed !== null ? brutoNeed / pl.precioProm : null;
      return {
        folio:    m.folio || "—",
        nave:     embName(m.embarcacion_id),
        kgReal:   pl.kgTotal,
        kgNeed:   kgNeed !== null ? Math.ceil(kgNeed) : null,
        delta:    kgNeed !== null ? pl.kgTotal - kgNeed : null,
        margen:   pl.margen,
      };
    }).filter(Boolean).slice(-12),
    [plList, embName]);

  if (plList.length === 0) return (
    <Card><Empty>Aún no hay mareas con captura registrada. Ve a <strong>Registro por Marea</strong> para ingresar la primera.</Empty></Card>
  );

  const kpiCard = (label, value, tone, sub) => (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone, lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{sub}</div>}
    </Card>
  );

  const TOOLTIP_STYLE = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.1)", padding: "10px 14px", fontSize: 12.5 };

  // Exportar dashboard a CSV
  function exportarCSV() {
    const filas = [
      ["Folio", "Nave", "Zarpe", "Recalada", "Días", "Kg", "Precio prom $/kg", "Ingreso bruto", "Gastos pozo", "Parte trip", "Costos armador", "Margen", "Margen %", "Break-even kg"],
      ...plList.map(({ m, pl }) => {
        const pct = pl.pct / 100;
        const brutoNeed = pct < 1 ? pl.gastosPozo + pl.costosArmador / (1 - pct) : null;
        const kgNeed = brutoNeed !== null && pl.precioProm ? Math.ceil(brutoNeed / pl.precioProm) : "";
        return [
          m.folio || "", embName(m.embarcacion_id),
          m.zarpe_at ? new Date(m.zarpe_at).toLocaleDateString("es-CL") : "",
          m.recalada_at ? new Date(m.recalada_at).toLocaleDateString("es-CL") : "",
          pl.dias ? num(pl.dias, 1) : "",
          num(pl.kgTotal, 0), pl.precioProm ? num(pl.precioProm, 0) : "",
          num(pl.valorBruto, 0), num(pl.gastosPozo, 0), num(pl.parteTrip, 0),
          num(pl.costosArmador, 0), num(pl.margen, 0),
          pl.margenPct !== null ? num(pl.margenPct, 1) : "", kgNeed,
        ];
      }),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "rentabilidad.csv"; a.click();
  }

  return (
    <div>
      {/* ── Controles: período + export ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: C.slate, fontWeight: 600 }}>Período:</span>
        {[["30", "Último mes"], ["90", "3 meses"], ["180", "6 meses"], ["todo", "Todo"]].map(([v, lbl]) => (
          <button key={v} onClick={() => setPeriodo(v)}
            style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${periodo === v ? C.cyan : C.line}`, background: periodo === v ? C.cyan : "#fff", color: periodo === v ? "#fff" : C.slate }}>
            {lbl}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={exportarCSV} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
        {kpiCard("Mareas analizadas",   kpis.mareas,                          C.steel)}
        {kpiCard("Ingreso bruto total",  clp(kpis.valorBruto),                C.steel,  `${num(kpis.kgTotal, 0)} kg total`)}
        {kpiCard("Margen del armador",   clp(kpis.margen),                    kpis.margen >= 0 ? C.green : C.red, kpis.margenPct !== null ? `${num(kpis.margenPct, 1)}% sobre bruto` : "—")}
        {kpiCard("Parte tripulación",    clp(kpis.parteTrip),                 C.steel,  `${kpis.valorBruto > 0 ? num((kpis.parteTrip / kpis.valorBruto) * 100, 1) : "—"}% del bruto`)}
        {kpiCard("Captura total",        `${num(kpis.kgTotal, 0)} kg`,        C.cyan,   kpis.kgTotal > 0 && kpis.valorBruto > 0 ? `${clp(kpis.valorBruto / kpis.kgTotal)}/kg promedio` : "")}
      </div>

      {/* ── Gráfico por marea ── */}
      <Card style={{ marginBottom: 20, padding: "20px 24px 16px" }}>
        <div style={{ ...archivo, fontWeight: 800, fontSize: 16, color: C.abyss, marginBottom: 4 }}>Resultado por marea</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>Composición del ingreso bruto y margen del armador (%)</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={serie} margin={{ top: 4, right: 50, bottom: 20, left: 12 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="4 4" stroke="#EBF0F5" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.slate }} angle={-25} textAnchor="end" height={44} />
            <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={48} />
            <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.slate }} tickFormatter={(v) => `${v}%`} width={38} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => {
                const labels = { gastosPozo: "Gastos pozo", parteTrip: "Parte tripulación", costosArmador: "Costos armador", margen: "Margen armador", margenPct: "Margen %" };
                return [name === "margenPct" ? `${num(v, 1)}%` : clp(v), labels[name] || name];
              }} />
            <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 10 }}
              formatter={(v) => ({ gastosPozo: "Gastos pozo", parteTrip: "Parte tripulación", costosArmador: "Costos armador", margen: "Margen armador", margenPct: "Margen %" }[v] || v)} />
            <ReferenceLine yAxisId="r" y={0} stroke={C.slate} strokeDasharray="4 3" strokeWidth={1} />
            <Bar yAxisId="l" dataKey="gastosPozo"    stackId="a" fill={COLORES_COSTO.combustible} radius={[0,0,0,0]} />
            <Bar yAxisId="l" dataKey="parteTrip"     stackId="a" fill={COLORES_COSTO.parteTrip} />
            <Bar yAxisId="l" dataKey="costosArmador" stackId="a" fill={COLORES_COSTO.mant} />
            <Bar yAxisId="l" dataKey="margen"        stackId="a" radius={[4,4,0,0]}>
              {serie.map((s, i) => <Cell key={i} fill={s.margen >= 0 ? C.green : C.red} />)}
            </Bar>
            <Line yAxisId="r" type="monotone" dataKey="margenPct" stroke={C.abyss} strokeWidth={2}
              dot={{ r: 4, fill: "#fff", stroke: C.abyss, strokeWidth: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Fila: Composición de costos + Ranking ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

        {/* Composición de costos */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Composición de costos</div>
          {composicion.length === 0 ? <Empty>Sin datos</Empty> : (
            <>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PieChart width={200} height={180}>
                  <Pie data={composicion} cx={95} cy={85} innerRadius={48} outerRadius={82} dataKey="value" paddingAngle={2}>
                    {composicion.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ ...TOOLTIP_STYLE, fontSize: 12 }}
                    formatter={(v, _, props) => [clp(v), props.payload.label]} />
                </PieChart>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {composicion.map((d) => (
                  <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: C.slate }}>{d.label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.ink }}>{clp(d.value)}</span>
                    <span style={{ fontSize: 11, color: C.slate, minWidth: 36, textAlign: "right" }}>{totalCostos > 0 ? `${num((d.value / totalCostos) * 100, 1)}%` : "—"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Ranking de naves */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Ranking de naves</div>
          {ranking.length === 0 ? <Empty>Sin datos</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ranking.map((r, idx) => (
                <div key={r.emb.id} style={{ padding: "10px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: idx === 0 ? "#FFFBF0" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.emb.color || C.steel }} />
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: C.abyss }}>{r.emb.nombre}</span>
                      <span style={{ fontSize: 11.5, color: C.slate }}>{r.n} marea{r.n !== 1 && "s"}</span>
                    </div>
                    <Pill tone={r.margen >= 0 ? "green" : "red"}>{r.margenPct !== null ? `${num(r.margenPct, 1)}%` : "—"}</Pill>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 11.5 }}>
                    <div><span style={{ color: C.slate }}>Bruto: </span><strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{clp(r.bruto)}</strong></div>
                    <div><span style={{ color: C.slate }}>Margen: </span><strong style={{ color: r.margen >= 0 ? C.green : C.red, fontFamily: "'IBM Plex Mono', monospace" }}>{clp(r.margen)}</strong></div>
                    <div><span style={{ color: C.slate }}>Captura: </span><strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{num(r.kg, 0)} kg</strong></div>
                  </div>
                  {/* Barra de margen */}
                  <div style={{ marginTop: 8, height: 5, background: "#EDF0F5", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, r.margenPct || 0))}%`, background: r.margen >= 0 ? C.green : C.red, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Punto de equilibrio ── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.foam}` }}>
          <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss }}>Punto de equilibrio por marea</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>Kg mínimos para que el armador cubra todos sus costos (incluida parte tripulación)</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr>
              <th style={thStyle}>Marea</th>
              <th style={thStyle}>Nave</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kg reales</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kg break-even</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Diferencia</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Margen armador</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Estado</th>
            </tr></thead>
            <tbody>
              {breakEven.map((b, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{b.folio}</td>
                  <td style={tdStyle}>{b.nave}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{num(b.kgReal, 0)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>{b.kgNeed !== null ? num(b.kgNeed, 0) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: b.delta >= 0 ? C.green : C.red }}>
                    {b.delta !== null ? `${b.delta >= 0 ? "+" : ""}${num(b.delta, 0)}` : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: b.margen >= 0 ? C.green : C.red }}>
                    {clp(b.margen)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <Pill tone={b.margen >= 0 ? "green" : "red"}>{b.margen >= 0 ? "✓ Rentable" : "✕ Pérdida"}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// TAB MAREAS — registro de captura y costos
// ─────────────────────────────────────────────────────────────────
function TabMareas({ profile, embarcaciones, mareas, allOts, especies, capturas: allCapturas, setCapturas, economias: allEconomias, setEconomias, conf, embName, setError, onNavigate, navMareaId, onNavUsed }) {
  const [open,      setOpen]      = useState(null);
  const [editLines, setEditLines] = useState([]);
  const [editEco,   setEditEco]   = useState({});
  const [saving,    setSaving]    = useState(false);

  // Auto-abrir marea cuando llegamos desde Consumos
  useEffect(() => {
    if (navMareaId && mareas.find((m) => m.id === navMareaId)) {
      abrirMarea(navMareaId);
      onNavUsed?.();
      setTimeout(() => {
        document.getElementById(`marea-card-${navMareaId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [navMareaId, mareas]); // eslint-disable-line

  function abrirMarea(mareaId) {
    if (open === mareaId) { setOpen(null); return; }
    const caps = allCapturas.filter((c) => c.marea_id === mareaId);
    const eco  = allEconomias.find((e) => e.marea_id === mareaId) || {};
    setEditLines(caps.map((c) => ({ ...c, _key: c.id })));
    setEditEco({
      precio_combustible_l:  eco.precio_combustible_l  ?? conf?.precio_combustible_l  ?? 0,
      precio_aceite_l:       eco.precio_aceite_l        ?? conf?.precio_aceite_l        ?? 0,
      costo_viveres:         eco.costo_viveres           ?? 0,
      costo_hielo:           eco.costo_hielo             ?? 0,
      costo_carnada:         eco.costo_carnada           ?? 0,
      costo_otros:           eco.costo_otros             ?? 0,
      parte_tripulacion_pct: eco.parte_tripulacion_pct   ?? conf?.parte_tripulacion_pct ?? 50,
      num_tripulantes:       eco.num_tripulantes          ?? 0,
      notas: eco.notas ?? "",
    });
    setOpen(mareaId);
  }

  const addLine = () => setEditLines((p) => [...p, { _key: Date.now(), especie_id: "", especie_nombre: "", kg: 0, precio_kg: 0 }]);
  const rmLine  = (k) => setEditLines((p) => p.filter((l) => l._key !== k));

  function updLine(k, f, v)  { setEditLines((p) => p.map((l) => l._key === k ? { ...l, [f]: v } : l)); }
  function pickEsp(k, espId) {
    const esp = especies.find((e) => e.id === espId);
    setEditLines((p) => p.map((l) => l._key === k
      ? { ...l, especie_id: espId, especie_nombre: esp?.nombre || "", precio_kg: esp?.precio_kg_default || l.precio_kg }
      : l));
  }

  async function guardar(mareaId) {
    setSaving(true);
    try {
      // Reemplaza capturas: borra todas y re-inserta las válidas
      await supabase.from("marea_captura").delete()
        .eq("marea_id", mareaId).eq("empresa_id", profile.empresa_id);
      const nuevasCaps = [];
      for (const l of editLines.filter((l) => (l.kg || 0) > 0)) {
        const row = await insertRow("marea_captura", profile.empresa_id, {
          marea_id: mareaId, especie_id: l.especie_id || null,
          especie_nombre: l.especie_nombre || "", kg: +l.kg, precio_kg: +l.precio_kg,
        });
        nuevasCaps.push(row);
      }
      // Upsert economía
      const ecoRow = await upsertRow("marea_economia", profile.empresa_id,
        { marea_id: mareaId, ...editEco, updated_at: new Date().toISOString(), created_by: profile.id },
        "marea_id");
      setCapturas((p) => [...p.filter((c) => c.marea_id !== mareaId), ...nuevasCaps]);
      setEconomias((p) => [...p.filter((e) => e.marea_id !== mareaId), ecoRow]);
      logActivity(profile, "Guardar rentabilidad", `Marea folio ${mareas?.find?.((m) => m.id === mareaId)?.folio || mareaId}`);
      setOpen(null);
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setSaving(false); }
  }

  if (mareas.length === 0) return (
    <Card><Empty>No hay mareas cerradas. Cierra una marea en <strong>Prezarpe → Recalada</strong> para registrar su rentabilidad.</Empty></Card>
  );

  return (
    <div>
      {mareas.map((m) => {
        const pl    = calcPL(m, allCapturas, allEconomias.find((e) => e.marea_id === m.id), allOts);
        const isOpen = open === m.id;
        const emb    = embarcaciones.find((e) => e.id === m.embarcacion_id);
        return (
          <Card key={m.id} id={`marea-card-${m.id}`} style={{ marginBottom: 10, borderLeft: `4px solid ${pl?.tieneCaptura ? C.green : C.line}` }}>
            {/* ── Cabecera clickeable ── */}
            <div onClick={() => abrirMarea(m.id)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {isOpen ? <ChevronDown size={17} color={C.slate} /> : <ChevronRight size={17} color={C.slate} />}
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, minWidth: 90 }}>{m.folio || "—"}</span>
              <span style={{ fontWeight: 700, color: emb?.color || C.abyss }}>{embName(m.embarcacion_id)}</span>
              <span style={{ fontSize: 12, color: C.slate }}>
                {m.zarpe_at   ? new Date(m.zarpe_at).toLocaleDateString("es-CL")   : "—"}
                {" → "}
                {m.recalada_at? new Date(m.recalada_at).toLocaleDateString("es-CL") : "—"}
                {pl?.dias && <span style={{ marginLeft: 6 }}>({num(pl.dias, 1)} días)</span>}
              </span>
              <div style={{ flex: 1 }} />
              {onNavigate && (
                <button onClick={(e) => { e.stopPropagation(); onNavigate("consumos"); }}
                  title="Ver consumos de la flota"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, padding: "3px 9px", borderRadius: 5, border: `1px solid ${C.line}`, background: "none", color: C.slate, cursor: "pointer" }}>
                  <Fuel size={11} /> Consumos
                </button>
              )}
              {pl?.tieneCaptura ? (
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.slate, textTransform: "uppercase", letterSpacing: 1 }}>Bruto</div>
                    <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, color: C.steel }}>{clp(pl.valorBruto)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.slate, textTransform: "uppercase", letterSpacing: 1 }}>Margen armador</div>
                    <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 18, color: pl.margen >= 0 ? C.green : C.red }}>{clp(pl.margen)}</div>
                  </div>
                  <Pill tone={pl.margen >= 0 ? "green" : "red"}>{pl.margenPct !== null ? `${num(pl.margenPct, 1)}%` : "—"}</Pill>
                </div>
              ) : <Pill tone="slate">Sin datos</Pill>}
            </div>

            {/* ── Panel de edición ── */}
            {isOpen && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.foam}`, paddingTop: 16 }}>

                {/* Captura */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.abyss, marginBottom: 10 }}>🐟 Captura</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                    <thead><tr>
                      <th style={thStyle}>Especie</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 110 }}>Kg</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 140 }}>Precio $/kg</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 140 }}>Subtotal</th>
                      <th style={{ ...thStyle, width: 36 }}></th>
                    </tr></thead>
                    <tbody>
                      {editLines.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: "center", padding: 14, color: C.slate, fontSize: 12.5 }}>Sin líneas — agrega una especie.</td></tr>
                      )}
                      {editLines.map((l) => (
                        <tr key={l._key}>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <select value={l.especie_id || ""} onChange={(e) => pickEsp(l._key, e.target.value)} style={{ ...inputStyle(140), fontSize: 12.5 }}>
                                <option value="">— Ad hoc —</option>
                                {especies.filter((e) => e.activa).map((esp) => <option key={esp.id} value={esp.id}>{esp.nombre}</option>)}
                              </select>
                              {!l.especie_id && (
                                <input value={l.especie_nombre || ""} onChange={(e) => updLine(l._key, "especie_nombre", e.target.value)} placeholder="Nombre" style={{ ...inputStyle(110), fontSize: 12.5 }} />
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <input type="number" value={l.kg} onChange={(e) => updLine(l._key, "kg", e.target.value)} style={{ ...bluInput, width: 90, textAlign: "right" }} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <input type="number" value={l.precio_kg} onChange={(e) => updLine(l._key, "precio_kg", e.target.value)} style={{ ...bluInput, width: 120, textAlign: "right" }} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                            {clp((l.kg || 0) * (l.precio_kg || 0))}
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => rmLine(l._key)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr>
                      <td colSpan={2} style={{ padding: "8px 12px" }}>
                        <button onClick={addLine} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12 }}><Plus size={13} /> Agregar especie</button>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: 12.5 }}>Total captura:</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: C.steel }}>
                        {clp(editLines.reduce((s, l) => s + (l.kg || 0) * (l.precio_kg || 0), 0))}
                        <span style={{ fontSize: 11, color: C.slate, marginLeft: 6 }}>({num(editLines.reduce((s, l) => s + (l.kg || 0), 0), 0)} kg)</span>
                      </td>
                      <td />
                    </tr></tfoot>
                  </table>
                </div>

                {/* Costos */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.abyss, marginBottom: 12 }}>⛽ Costos y reparto</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                    <Field label="Precio combustible ($/L)"><input type="number" value={editEco.precio_combustible_l} onChange={(e) => setEditEco((p) => ({ ...p, precio_combustible_l: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Precio aceite ($/L)"><input type="number" value={editEco.precio_aceite_l} onChange={(e) => setEditEco((p) => ({ ...p, precio_aceite_l: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Víveres ($)"><input type="number" value={editEco.costo_viveres} onChange={(e) => setEditEco((p) => ({ ...p, costo_viveres: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Hielo ($)"><input type="number" value={editEco.costo_hielo} onChange={(e) => setEditEco((p) => ({ ...p, costo_hielo: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Carnada ($)"><input type="number" value={editEco.costo_carnada} onChange={(e) => setEditEco((p) => ({ ...p, costo_carnada: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Otros costos armador ($)"><input type="number" value={editEco.costo_otros} onChange={(e) => setEditEco((p) => ({ ...p, costo_otros: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Parte tripulación (%)">
                      <input type="number" min={0} max={100} value={editEco.parte_tripulacion_pct}
                        onChange={(e) => setEditEco((p) => ({ ...p, parte_tripulacion_pct: +e.target.value }))}
                        style={{ ...bluInput, borderColor: C.cyan }} />
                    </Field>
                    <Field label="N° tripulantes (partes iguales)">
                      <input type="number" min={0} value={editEco.num_tripulantes}
                        onChange={(e) => setEditEco((p) => ({ ...p, num_tripulantes: +e.target.value }))}
                        style={{ ...bluInput, borderColor: C.steel }} />
                    </Field>
                    <Field label="Notas"><input value={editEco.notas} onChange={(e) => setEditEco((p) => ({ ...p, notas: e.target.value }))} style={inputStyle()} placeholder="Observaciones…" /></Field>
                  </div>
                </div>

                {/* Preview P&L en vivo */}
                <PLPreview marea={m} editLines={editLines} editEco={editEco}
                  otsNave={allOts.filter((o) => o.embarcacion_id === m.embarcacion_id)} />

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={() => guardar(m.id)} disabled={saving} style={primaryBtn}>
                    <Check size={15} /> {saving ? "Guardando…" : "Guardar rentabilidad"}
                  </button>
                  <button onClick={() => setOpen(null)} style={ghostBtn}>Cancelar</button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Preview P&L en tiempo real ─────────────────────────────────
function PLPreview({ marea, editLines, editEco, otsNave }) {
  const [showOTs, setShowOTs] = useState(false);
  const lineas  = editLines.map((l) => ({ ...l, marea_id: marea.id }));
  const ecoFake = { ...editEco, marea_id: marea.id };
  const pl = calcPL(marea, lineas, ecoFake, otsNave);
  if (!pl || pl.valorBruto === 0) return null;

  const row = (label, val, bold, color = C.ink) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.foam}`, fontSize: 13, fontWeight: bold ? 700 : 400, color }}>
      <span>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{clp(val)}</span>
    </div>
  );

  return (
    <div style={{ background: "#F0F8FF", border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 20px", marginTop: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Vista previa P&L</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        {/* Lado izquierdo: del bruto al ingreso del armador */}
        <div>
          {row("Valor bruto captura", pl.valorBruto, true, C.abyss)}
          {row(`  − Combustible (${num(pl.combCons, 0)} L)`, -pl.costoComb)}
          {row("  − Víveres", -pl.costoViveres)}
          {row("  − Hielo", -pl.costoHielo)}
          {row("  − Carnada", -pl.costoCarnada)}
          {row("= Líquido a repartir", pl.liquido, true, C.steel)}
          {row(`  − Parte tripulación (${pl.pct}%)`, -pl.parteTrip)}
          {row("= Ingreso del armador", pl.ingresoArmador, true, C.cyan)}
        </div>
        {/* Lado derecho: costos del armador y margen */}
        <div>
          {row(`  − Aceite (${num(pl.aceiteCons, 1)} L)`, -pl.costoAceite)}
          {row("  − Mantención (OTs en la marea)", -pl.costoOTs)}
          {pl.otsEnMarea?.length > 0 && (
            <div style={{ marginLeft: 12, marginBottom: 4 }}>
              <button onClick={() => setShowOTs((p) => !p)}
                style={{ fontSize: 11, color: C.slate, background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline" }}>
                {showOTs ? "▲ ocultar" : `▼ ver ${pl.otsEnMarea.length} OT${pl.otsEnMarea.length > 1 ? "s" : ""}`}
              </button>
              {showOTs && (
                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                  {pl.otsEnMarea.map((o) => (
                    <div key={o.id} style={{ fontSize: 11.5, color: C.slate, display: "flex", justifyContent: "space-between", padding: "2px 6px", background: C.foam, borderRadius: 4 }}>
                      <span><span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>{o.folio}</span> · {o.descripcion?.slice(0, 50) || o.sistema}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.red, fontWeight: 600 }}>{clp((Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {row("  − Otros costos armador", -pl.costoOtros)}
          <div style={{ height: 24 }} />
          {row("= Margen del armador", pl.margen, true, pl.margen >= 0 ? C.green : C.red)}
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.slate }}>Margen: <strong style={{ color: pl.margen >= 0 ? C.green : C.red }}>{pl.margenPct !== null ? `${num(pl.margenPct, 1)}%` : "—"}</strong></span>
            {pl.armadorPorKg !== null && <span style={{ fontSize: 12, color: C.slate }}>Armador/kg: <strong style={{ color: C.steel }}>{clp(pl.armadorPorKg)}</strong></span>}
            <span style={{ fontSize: 12, color: C.slate }}>Captura: <strong style={{ color: C.steel }}>{num(pl.kgTotal, 0)} kg</strong></span>
          </div>

          {/* Desglose por tripulante */}
          {pl.porTripulante !== null && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: "#EFF9EF", borderRadius: 8, border: `1px solid ${C.green}30` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
                Desglose tripulación — {pl.numTrip} tripulantes (partes iguales)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, color: C.slate }}>Fondo a repartir</div>
                  <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, color: C.steel }}>{clp(pl.parteTrip)}</div>
                </div>
                <div style={{ textAlign: "center", borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 10.5, color: C.slate }}>Por tripulante</div>
                  <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, color: C.green }}>{clp(pl.porTripulante)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10.5, color: C.slate }}>Por día de marea</div>
                  <div style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, color: C.steel }}>
                    {pl.dias ? clp(pl.porTripulante / pl.dias) : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB ESPECIES — catálogo
// ─────────────────────────────────────────────────────────────────
const ESPECIES_CL = [
  "Merluza común","Merluza del sur","Merluza de cola","Jibia","Reineta",
  "Congrio dorado","Congrio colorado","Congrio negro","Albacora / Pez espada",
  "Atún","Jurel","Caballa","Sardina","Anchoveta","Salmón","Trucha",
  "Langostino colorado","Langostino amarillo","Camarón nailon","Camarón de roca",
  "Pulpo","Jaiba","Centolla","Loco","Erizo","Macha","Chorito",
];

function TabEspecies({ profile, especies, setEspecies, setError }) {
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const [form, setForm]         = useState({ nombre: "", precio_kg_default: 0 });
  const [showForm, setShowForm] = useState(false);

  async function crear() {
    if (!form.nombre.trim()) return;
    try {
      const nueva = await insertRow("especies", profile.empresa_id, {
        nombre: form.nombre.trim(), precio_kg_default: +form.precio_kg_default, activa: true,
      });
      setEspecies((p) => [...p, nueva]);
      logActivity(profile, "Crear especie", nueva.nombre);
      setForm({ nombre: "", precio_kg_default: 0 }); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? `Ya existe "${form.nombre}".` : "No se pudo crear: " + e.message);
    }
  }

  async function commitEsp(id, campo, val) {
    const prev = especies.find((e) => e.id === id)?.[campo];
    if (prev === val) return;
    setEspecies((p) => p.map((e) => e.id === id ? { ...e, [campo]: val } : e));
    try { await updateRow("especies", id, { [campo]: val }); }
    catch (e) { setEspecies((p) => p.map((e2) => e2.id === id ? { ...e2, [campo]: prev } : e2)); setError("Error al guardar: " + e.message); }
  }

  async function eliminarEsp(id) {
    const esp = especies.find((e) => e.id === id);
    if (!window.confirm(`¿Eliminar "${esp?.nombre}"?`)) return;
    const bk = especies;
    setEspecies((p) => p.filter((e) => e.id !== id));
    try { await deleteRow("especies", id); }
    catch (e) { setEspecies(bk); setError("No se pudo eliminar: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{especies.length} especie{especies.length !== 1 && "s"} — los precios se pre-llenan al registrar capturas.</div>
        {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={15} /> Agregar especie</button>}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 14, background: "#F8FAFF" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: 12, alignItems: "flex-end" }}>
            <Field label="Nombre de la especie">
              <input value={form.nombre} list="esp-sugeridas"
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                style={inputStyle()} placeholder="Merluza, Jibia, Reineta…" />
              <datalist id="esp-sugeridas">{ESPECIES_CL.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Precio $/kg referencial">
              <input type="number" value={form.precio_kg_default}
                onChange={(e) => setForm({ ...form, precio_kg_default: e.target.value })}
                style={bluInput} />
            </Field>
            <button onClick={crear} style={{ ...primaryBtn, marginTop: 22 }}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={{ ...ghostBtn, marginTop: 22 }}>✕</button>
          </div>
        </Card>
      )}

      {especies.length === 0 ? (
        <Card><Empty>Sin especies. Agrega las que pesca tu flota para pre-llenar precios automáticamente al registrar capturas.</Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={thStyle}>Especie</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Precio $/kg referencial</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Activa</th>
              {puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {especies.map((esp) => (
                <tr key={esp.id}>
                  <td style={tdStyle}>
                    <input value={esp.nombre} disabled={!puedeOperar}
                      onChange={(e) => setEspecies((p) => p.map((x) => x.id === esp.id ? { ...x, nombre: e.target.value } : x))}
                      onBlur={(e) => commitEsp(esp.id, "nombre", e.target.value)}
                      style={inputStyle(240)} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <input type="number" value={esp.precio_kg_default} disabled={!puedeOperar}
                      onChange={(e) => setEspecies((p) => p.map((x) => x.id === esp.id ? { ...x, precio_kg_default: +e.target.value } : x))}
                      onBlur={(e) => commitEsp(esp.id, "precio_kg_default", +e.target.value)}
                      style={{ ...bluInput, width: 130, textAlign: "right" }} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={!!esp.activa} disabled={!puedeOperar}
                      onChange={(e) => commitEsp(esp.id, "activa", e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: C.green, cursor: puedeOperar ? "pointer" : "default" }} />
                  </td>
                  {puedeBorrar && (
                    <td style={tdStyle}>
                      <button onClick={() => eliminarEsp(esp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB CONFIG — precios por defecto de la empresa
// ─────────────────────────────────────────────────────────────────
function TabConfig({ profile, conf, setConf, setError }) {
  const [form, setForm] = useState(conf);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setForm(conf); }, [conf]);

  async function guardar() {
    try {
      const { error } = await supabase.from("empresas").update({
        precio_combustible_l:   form.precio_combustible_l,
        precio_aceite_l:        form.precio_aceite_l,
        parte_tripulacion_pct:  form.parte_tripulacion_pct,
      }).eq("id", profile.empresa_id);
      if (error) throw error;
      setConf(form);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      logActivity(profile, "Config rentabilidad", `Comb $${form.precio_combustible_l}/L · Parte ${form.parte_tripulacion_pct}%`);
    } catch (e) { setError("No se pudo guardar la configuración: " + e.message); }
  }

  return (
    <Card style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 4 }}>Valores por defecto de la empresa</div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 20, lineHeight: 1.6 }}>
        Estos precios se pre-llenan al abrir cada marea. Puedes ajustarlos por marea sin modificar este default.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <Field label="Precio combustible ($/L)">
          <input type="number" value={form.precio_combustible_l || 0}
            onChange={(e) => setForm((p) => ({ ...p, precio_combustible_l: +e.target.value }))}
            style={{ ...bluInput, width: "100%" }} />
        </Field>
        <Field label="Precio aceite ($/L)">
          <input type="number" value={form.precio_aceite_l || 0}
            onChange={(e) => setForm((p) => ({ ...p, precio_aceite_l: +e.target.value }))}
            style={{ ...bluInput, width: "100%" }} />
        </Field>
        <Field label="Parte de la tripulación (% del líquido)">
          <input type="number" min={0} max={100} value={form.parte_tripulacion_pct || 50}
            onChange={(e) => setForm((p) => ({ ...p, parte_tripulacion_pct: +e.target.value }))}
            style={{ ...bluInput, width: "100%", borderColor: C.cyan }} />
        </Field>
      </div>
      <button onClick={guardar} style={{ ...primaryBtn, gap: 8 }}>
        {saved ? <><Check size={15} /> Guardado</> : "Guardar configuración"}
      </button>
      <div style={{ marginTop: 20, padding: "12px 14px", background: C.mist, borderRadius: 8, fontSize: 12.5, color: C.slate, lineHeight: 1.6 }}>
        <strong style={{ color: C.ink }}>Modelo a la parte:</strong> el líquido a repartir es el bruto menos los gastos del pozo (combustible, víveres, hielo, carnada). La tripulación recibe su porcentaje del líquido. El armador paga por separado el aceite y el mantenimiento.
      </div>
    </Card>
  );
}
