import React, { useState, useMemo, useEffect } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel, Printer } from "lucide-react";
import { ComposedChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../../lib/db";
import { supabase } from "../../lib/supabase";
import { C, archivo, clp, num, isAdmin, canOperate, tint } from "../../theme";
import { Card, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty, GuiaColapsable } from "../../ui";
import { calcPL } from "./calc";

// Liquidación de marea: abre una ventana con la hoja imprimible (reparto a la
// parte + monto por tripulante) para entregar a la tripulación.
function imprimirLiquidacion(m, pl, nave) {
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return;
  const fdate = (s) => s ? new Date(s).toLocaleDateString("es-CL") : "—";
  const row = (lbl, val, opts = {}) => `<tr><td style="${opts.bold ? "font-weight:700;" : ""}${opts.indent ? "padding-left:18px;color:#5A7184;" : ""}">${lbl}</td><td class=r style="${opts.bold ? "font-weight:700;" : ""}${opts.color ? `color:${opts.color};` : ""}">${val}</td></tr>`;
  const caps = pl.lineas.map((l) => `<tr><td>${l.especie_nombre || "—"}</td><td class=r>${num(l.kg, 0)} kg</td><td class=r>${clp(l.precio_kg)}</td><td class=r>${clp((l.kg || 0) * (l.precio_kg || 0))}</td></tr>`).join("");
  const html = `<!doctype html><html lang=es><head><meta charset=utf-8>
<title>Liquidación ${m.folio || ""}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0A1A2A;margin:32px;font-size:13px}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#5A7184;font-size:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th,td{padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:left}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#5A7184}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  .box{border:1px solid #D6E2EC;border-radius:10px;padding:6px 14px;margin-top:8px}
  .tot{font-size:16px;font-weight:800}
  .pos{color:#1E9E6A}.neg{color:#D8443C}.gold{color:#B8860B}
  .firma{margin-top:42px;display:flex;justify-content:space-between;color:#5A7184;font-size:12px}
  .firma div{border-top:1px solid #94A3B8;padding-top:6px;width:42%}
  @media print{body{margin:14px}}
</style></head><body>
  <h1>Liquidación de Marea — ${nave}</h1>
  <div class=sub>Folio ${m.folio || "—"} · ${fdate(m.zarpe_at)} → ${fdate(m.recalada_at)}${pl.dias ? ` · ${num(pl.dias, 1)} días` : ""} · ${pl.numTrip || 0} tripulante(s) · Generado ${new Date().toLocaleDateString("es-CL")}</div>

  <table><thead><tr><th>Especie</th><th class=r>Kg</th><th class=r>$/kg</th><th class=r>Subtotal</th></tr></thead>
  <tbody>${caps}<tr><td style="font-weight:700">Total captura</td><td class=r style="font-weight:700">${num(pl.kgTotal, 0)} kg</td><td></td><td class=r style="font-weight:700">${clp(pl.valorBruto)}</td></tr></tbody></table>

  <div class=box><table>
    ${row("Valor bruto de la captura", clp(pl.valorBruto), { bold: true })}
    ${row("Combustible", "− " + clp(pl.costoComb), { indent: true })}
    ${row("Víveres", "− " + clp(pl.costoViveres), { indent: true })}
    ${row("Hielo", "− " + clp(pl.costoHielo), { indent: true })}
    ${row("Carnada", "− " + clp(pl.costoCarnada), { indent: true })}
    ${row("Gastos del pozo", "− " + clp(pl.gastosPozo), { bold: true })}
    ${row("Líquido a repartir", clp(pl.liquido), { bold: true })}
    ${row(`Parte tripulación (${num(pl.pct, 0)}%)`, clp(pl.parteTrip), { bold: true, color: "#1E9E6A" })}
    ${pl.porTripulante != null ? row(`→ Por tripulante (÷ ${pl.numTrip})`, clp(pl.porTripulante), { indent: true, color: "#1E9E6A" }) : ""}
  </table></div>

  <div class=box><table>
    ${row("Ingreso del armador (líquido − parte trip.)", clp(pl.ingresoArmador), { bold: true })}
    ${row("Aceite", "− " + clp(pl.costoAceite), { indent: true })}
    ${row("Mantención (OT)", "− " + clp(pl.costoOTs), { indent: true })}
    ${row("Otros", "− " + clp(pl.costoOtros), { indent: true })}
    <tr><td class=tot>Margen del armador</td><td class="r tot ${pl.margen >= 0 ? "pos" : "neg"}">${clp(pl.margen)}</td></tr>
  </table></div>

  <div class=firma><div>Armador</div><div>Recibí conforme (tripulación)</div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},150);}</script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

export default function TabMareas({ profile, embarcaciones, mareas, allOts, especies, capturas: allCapturas, setCapturas, economias: allEconomias, setEconomias, conf, embName, setError, onNavigate, navMareaId, onNavUsed }) {
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
      <GuiaColapsable titulo="Cómo funciona el reparto «a la parte»" icon={Fish}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, background: tint(C.steel, 8), borderRadius: 8, padding: "12px 14px", marginBottom: 10, lineHeight: 1.8 }}>
          Valor bruto captura  (Σ kg × precio)<br />
          <strong>−</strong> Gastos del pozo  (combustible + víveres + hielo + carnada)<br />
          <strong>=</strong> Líquido a repartir<br />
          <strong>×</strong> % tripulación  →  <span style={{ color: C.green }}>parte de la tripulación</span><br />
          <strong>−</strong> Costos del armador  (aceite + mantención OT + otros)<br />
          <strong>=</strong> <span style={{ color: C.gold, fontWeight: 700 }}>Margen del armador</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
          <li>El <strong>combustible, víveres, hielo y carnada</strong> se descuentan <em>antes</em> del reparto (pozo común).</li>
          <li>El <strong>aceite y la mantención</strong> los asume el armador, <em>después</em> del reparto.</li>
          <li>El % de tripulación y N° de tripulantes se definen por marea (default en <strong>Configuración</strong>).</li>
        </ul>
      </GuiaColapsable>
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
              {pl?.tieneCaptura && (
                <button onClick={(e) => { e.stopPropagation(); imprimirLiquidacion(m, pl, embName(m.embarcacion_id)); }}
                  title="Imprimir liquidación de la marea (PDF)"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, padding: "3px 9px", borderRadius: 5, border: `1px solid ${C.line}`, background: "none", color: C.slate, cursor: "pointer" }}>
                  <Printer size={11} /> Liquidación
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
                            <input type="number" value={l.kg} onFocus={(e) => e.target.select()} onChange={(e) => updLine(l._key, "kg", e.target.value)} style={{ ...bluInput, width: 90, textAlign: "right" }} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <input type="number" value={l.precio_kg} onFocus={(e) => e.target.select()} onChange={(e) => updLine(l._key, "precio_kg", e.target.value)} style={{ ...bluInput, width: 120, textAlign: "right" }} />
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
                    <Field label="Precio combustible ($/L)"><input type="number" value={editEco.precio_combustible_l} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, precio_combustible_l: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Precio aceite ($/L)"><input type="number" value={editEco.precio_aceite_l} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, precio_aceite_l: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Víveres ($)"><input type="number" value={editEco.costo_viveres} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, costo_viveres: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Hielo ($)"><input type="number" value={editEco.costo_hielo} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, costo_hielo: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Carnada ($)"><input type="number" value={editEco.costo_carnada} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, costo_carnada: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Otros costos armador ($)"><input type="number" value={editEco.costo_otros} onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, costo_otros: +e.target.value }))} style={bluInput} /></Field>
                    <Field label="Parte tripulación (%)">
                      <input type="number" min={0} max={100} value={editEco.parte_tripulacion_pct}
                        onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, parte_tripulacion_pct: +e.target.value }))}
                        style={{ ...bluInput, borderColor: C.cyan }} />
                    </Field>
                    <Field label="N° tripulantes (partes iguales)">
                      <input type="number" min={0} value={editEco.num_tripulantes}
                        onFocus={(e) => e.target.select()} onChange={(e) => setEditEco((p) => ({ ...p, num_tripulantes: +e.target.value }))}
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
    <div style={{ background: tint(C.sky, 8), border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 20px", marginTop: 4 }}>
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
            <div style={{ marginTop: 14, padding: "12px 14px", background: tint(C.green, 8), borderRadius: 8, border: `1px solid ${C.green}30` }}>
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
