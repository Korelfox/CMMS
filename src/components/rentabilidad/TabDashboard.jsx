import React, { useState, useMemo, useEffect } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel } from "lucide-react";
import { ComposedChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../../lib/db";
import { C, archivo, clp, num, isAdmin, canOperate, tint } from "../../theme";
import { Card, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty, GuiaColapsable } from "../../ui";
import { calcPL } from "./calc";

const COLORES_COSTO = {
  combustible: "#E0A526",
  vivHiCar:    "#60B8C8",
  parteTrip:   "#7C6AF7",
  aceite:      "#F09030",
  mant:        "#E05050",
  otros:       "#94A3B8",
};

export default function TabDashboard({ mareas, capturas, economias, ots, embarcaciones, embName }) {
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

  // Rentabilidad por especie (agrega las líneas de captura del período)
  const porEspecie = useMemo(() => {
    const map = new Map();
    plList.forEach(({ pl }) => (pl.lineas || []).forEach((l) => {
      const key = l.especie_nombre || "(sin especie)";
      const cur = map.get(key) || { especie: key, kg: 0, bruto: 0 };
      cur.kg += (l.kg || 0); cur.bruto += (l.kg || 0) * (l.precio_kg || 0);
      map.set(key, cur);
    }));
    const tot = [...map.values()].reduce((s, e) => s + e.bruto, 0);
    return [...map.values()]
      .map((e) => ({ ...e, precioProm: e.kg > 0 ? e.bruto / e.kg : 0, pct: tot > 0 ? (e.bruto / tot) * 100 : 0 }))
      .sort((a, b) => b.bruto - a.bruto);
  }, [plList]);

  // Eficiencia operacional ($/día, kg/día, combustible $/kg) y mejor/peor marea.
  const efic = useMemo(() => {
    let dias = 0, comb = 0;
    plList.forEach(({ pl }) => { dias += pl.dias || 0; comb += pl.costoComb; });
    const conDia = plList.filter(({ pl }) => pl.dias > 0)
      .map(({ m, pl }) => ({ folio: m.folio || "—", nave: embName(m.embarcacion_id), md: pl.margen / pl.dias }));
    const sorted = [...conDia].sort((a, b) => b.md - a.md);
    return {
      margenDia: dias > 0 ? kpis.margen / dias : null,
      kgDia:     dias > 0 ? kpis.kgTotal / dias : null,
      combPorKg: kpis.kgTotal > 0 ? comb / kpis.kgTotal : null,
      mejor: sorted[0] || null, peor: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    };
  }, [plList, kpis, embName]);

  // Completitud: mareas cerradas (del filtro) sin captura cargada.
  const sinCaptura = useMemo(() =>
    mareas.filter((m) => m.estado === "cerrada" && !capturas.some((c) => c.marea_id === m.id)),
    [mareas, capturas]);

  if (plList.length === 0) return (
    <Card>
      <Empty>Aún no hay mareas con captura registrada. Ve a <strong>Registro por Marea</strong> para ingresar la primera.</Empty>
      {sinCaptura.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "#7a5b00", background: tint(C.amber, 14), border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 12px" }}>
          Hay <strong>{sinCaptura.length}</strong> marea(s) cerrada(s) sin captura cargada.
        </div>
      )}
    </Card>
  );

  const kpiCard = (label, value, tone, sub) => (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone, lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{sub}</div>}
    </Card>
  );

  const TOOLTIP_STYLE = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.1)", padding: "10px 14px", fontSize: 12.5 };

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
        <button onClick={exportarCSV} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, color: C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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

      {/* ── Aviso de completitud de datos ── */}
      {sinCaptura.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#7a5b00", background: tint(C.amber, 14), border: `1px solid ${C.amber}`, borderRadius: 9, padding: "9px 14px", marginBottom: 16 }}>
          <span><strong>{sinCaptura.length}</strong> marea(s) cerrada(s) sin captura cargada</span>
          <span style={{ color: C.slate }}>· {sinCaptura.slice(0, 5).map((m) => m.folio || "—").join(", ")}{sinCaptura.length > 5 ? "…" : ""} — cárgalas en <strong>Registro por Marea</strong> para que entren al análisis.</span>
        </div>
      )}

      {/* ── KPIs de eficiencia operacional ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {kpiCard("Margen por día", efic.margenDia != null ? clp(efic.margenDia) : "—", efic.margenDia >= 0 ? C.green : C.red, "rendimiento del armador")}
        {kpiCard("Captura por día", efic.kgDia != null ? `${num(efic.kgDia, 0)} kg` : "—", C.cyan, "productividad")}
        {kpiCard("Combustible $/kg", efic.combPorKg != null ? clp(efic.combPorKg) : "—", C.gold, "costo de combustible por kilo")}
        {kpiCard("Mejor / peor marea",
          efic.mejor ? `${clp(efic.mejor.md)}/d` : "—",
          efic.mejor && efic.mejor.md >= 0 ? C.green : C.red,
          efic.mejor ? `▲ ${efic.mejor.folio}${efic.peor ? ` · ▼ ${efic.peor.folio} (${clp(efic.peor.md)}/d)` : ""}` : "")}
      </div>

      {/* ── Gráfico por marea ── */}
      <Card style={{ marginBottom: 20, padding: "20px 24px 16px" }}>
        <div style={{ ...archivo, fontWeight: 800, fontSize: 16, color: C.abyss, marginBottom: 4 }}>Resultado por marea</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>Composición del ingreso bruto y margen del armador (%)</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={serie} margin={{ top: 4, right: 50, bottom: 20, left: 12 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="4 4" stroke={tint(C.slate, 12)} vertical={false} />
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
                <div key={r.emb.id} style={{ padding: "10px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: idx === 0 ? tint(C.gold, 7) : "#fff" }}>
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
                  <div style={{ marginTop: 8, height: 5, background: tint(C.slate, 14), borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, r.margenPct || 0))}%`, background: r.margen >= 0 ? C.green : C.red, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Rentabilidad por especie ── */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.foam}` }}>
          <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss }}>Rentabilidad por especie</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>Qué especie aporta más valor bruto en el período (Σ kg × precio)</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr>
              <th style={thStyle}>Especie</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kg</th>
              <th style={{ ...thStyle, textAlign: "right" }}>$/kg prom.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Valor bruto</th>
              <th style={{ ...thStyle, minWidth: 180 }}>% del bruto</th>
            </tr></thead>
            <tbody>
              {porEspecie.map((e) => (
                <tr key={e.especie}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.especie}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{num(e.kg, 0)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>{clp(e.precioProm)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>{clp(e.bruto)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, e.pct)}%`, background: C.cyan, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: C.slate, minWidth: 42, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{num(e.pct, 1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
