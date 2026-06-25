import React, { useState, useMemo, useRef, useEffect } from "react";
import { Download, Plus, X, ChevronRight, ChevronDown, AlertCircle, Ship, Search } from "lucide-react";
import { rpcCall, logActivity } from "../../lib/db";
import { C, canOperate, clp, tint } from "../../theme";
import { Card, Pill, primaryBtn, exportBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty } from "../../ui";
import { HOY, skey } from "./util";

/* ── Metadatos de tipo ─────────────────────────────────────────── */
const TIPO_META = {
  entrada:  { label: "Entrada",             tone: "green",  group: "simple" },
  salida:   { label: "Salida",              tone: "red",    group: "simple" },
  traslado: { label: "Traslado",            tone: "steel",  group: "simple" },
  ajuste:   { label: "Ajuste",              tone: "yellow", group: "simple" },
  despacho: { label: "Despacho a Nave",     tone: "cyan",   group: "nave"   },
  retorno:  { label: "Retorno de Nave",     tone: "purple", group: "nave"   },
};

const FORM_0 = (bodegas) => ({
  tipo: "salida", item_id: "", cantidad: 1,
  bodega_from: bodegas[0]?.id || "", bodega_to: "",
  ot_id: "", responsable: "", motivo: "",
});

const BATCH_0 = (bodegas) => ({
  emb_id: "", bodega_nave: "",
  bodega_tierra: bodegas.find((b) => b.tipo === "tierra")?.id || bodegas[0]?.id || "",
  items: [], responsable: "", motivo: "",
});

/* ============================ TAB · MOVIMIENTOS ============================ */
export default function TabMovimientos({
  profile, items, bodegas, embarcaciones = [], ots,
  movimientos, stockMap, itemDesc, whName, recargar, setError,
}) {
  const [tipoActivo, setTipoActivo] = useState("salida");
  const [form, setForm]             = useState(() => FORM_0(bodegas));
  const [batch, setBatch]           = useState(() => BATCH_0(bodegas));
  const [bLine, setBLine]           = useState({ item_id: "", cantidad: 1 });
  const [expandidos, setExpandidos] = useState(new Set());
  const [fTipo, setFTipo]           = useState("all");
  const [fNave, setFNave]           = useState("all");
  const [fBusca, setFBusca]         = useState("");

  const puedeOperar = canOperate(profile?.rol);
  const esNaval     = tipoActivo === "despacho" || tipoActivo === "retorno";

  /* ── Clasificación bodegas ── */
  const bodsTierra = bodegas.filter((b) => b.tipo === "tierra");

  /* ── Embarcaciones con pañol registrado ── */
  const embsConPanol = embarcaciones
    .map((e) => ({ ...e, panol: bodegas.find((b) => b.embarcacion_id === e.id && b.tipo === "a_bordo") }))
    .filter((e) => e.panol);

  /* ── Helpers ── */
  const stockDisp = (item_id, bod_id) => stockMap.get(skey(item_id, bod_id)) || 0;
  const embDeNave = (bodId) => {
    const b = bodegas.find((x) => x.id === bodId);
    if (!b?.embarcacion_id) return null;
    return embarcaciones.find((e) => e.id === b.embarcacion_id)?.nombre || null;
  };

  /* ── KPIs ── */
  const mesHoy     = HOY().slice(0, 7);
  const movsMes    = movimientos.filter((m) => m.fecha?.startsWith(mesHoy));
  const despachosM = movsMes.filter((m) => m.tipo === "despacho").length;
  const retornosM  = movsMes.filter((m) => m.tipo === "retorno").length;
  const navesHist  = [...new Set(
    movimientos.flatMap((m) => [embDeNave(m.bodega_from), embDeNave(m.bodega_to)]).filter(Boolean)
  )].sort();

  /* ── Seleccionar embarcación en batch ── */
  function selEmb(emb_id) {
    const emb = embsConPanol.find((e) => e.id === emb_id);
    setBatch((b) => ({ ...b, emb_id, bodega_nave: emb?.panol?.id || "" }));
  }

  /* ── Gestión items batch ── */
  function addBLine() {
    if (!bLine.item_id || bLine.cantidad <= 0) return;
    setBatch((b) => ({ ...b, items: [...b.items, { item_id: bLine.item_id, cantidad: Number(bLine.cantidad) }] }));
    setBLine({ item_id: "", cantidad: 1 });
  }
  const rmBLine = (idx) => setBatch((b) => ({ ...b, items: b.items.filter((_, i) => i !== idx) }));

  /* ── Registrar movimiento simple ── */
  async function registrar() {
    if (!form.item_id || form.cantidad <= 0) { setError("Selecciona el ítem y una cantidad mayor a 0."); return; }
    const tipo = tipoActivo;
    const cant = Number(form.cantidad);
    const fb   = form.bodega_from;
    const tb   = form.bodega_to;
    const resp = form.responsable || profile?.nombre || "";
    try {
      if (tipo === "traslado") {
        // Ambos lados atómicos en una sola transacción server-side
        await rpcCall("fn_registrar_traslado", {
          p_empresa_id: profile.empresa_id, p_item_id: form.item_id,
          p_bodega_from: fb, p_bodega_to: tb, p_cantidad: cant,
          p_responsable: resp, p_motivo: form.motivo,
          p_fecha: HOY(), p_created_by: profile.id, p_tipo: "traslado",
        });
      } else {
        // entrada / salida / ajuste: RPC unificado con stock atómico + movimiento + costo OT
        await rpcCall("fn_registrar_movimiento", {
          p_empresa_id: profile.empresa_id, p_tipo: tipo,
          p_item_id: form.item_id,
          p_bodega_from: (tipo === "salida")  ? fb : null,
          p_bodega_to:   (tipo !== "salida")  ? tb : null,
          p_cantidad: cant, p_ot_id: form.ot_id || null,
          p_responsable: resp, p_motivo: form.motivo,
          p_fecha: HOY(), p_created_by: profile.id,
        });
        if (tipo === "salida" && form.ot_id) {
          const ot   = ots.find((o) => o.id === form.ot_id);
          const item = items.find((i) => i.id === form.item_id);
          const cost = cant * (Number(item?.precio) || 0);
          if (ot && cost > 0) logActivity(profile, "Cargo repuesto a OT", `${ot.folio} · ${cant}× ${itemDesc(form.item_id)} · +${clp(cost)}`);
        }
      }
      logActivity(profile, `Movimiento: ${tipo}`, `${cant}× ${itemDesc(form.item_id)}`);
      setForm((f) => ({ ...f, cantidad: 1, ot_id: "", motivo: "" }));
      recargar();
    } catch (e) { setError("No se pudo registrar el movimiento: " + e.message); }
  }

  /* ── Registrar despacho / retorno (lote multi-ítem) ── */
  async function registrarBatch() {
    if (!batch.emb_id || !batch.bodega_nave) { setError("Selecciona una embarcación con pañol asignado."); return; }
    if (batch.items.length === 0) { setError("Agrega al menos un ítem al lote."); return; }
    const tipo    = tipoActivo;
    const fromBod = tipo === "despacho" ? batch.bodega_tierra : batch.bodega_nave;
    const toBod   = tipo === "despacho" ? batch.bodega_nave   : batch.bodega_tierra;
    const loteId  = crypto.randomUUID();
    const embNom  = embarcaciones.find((e) => e.id === batch.emb_id)?.nombre || "";
    const resp = batch.responsable || profile?.nombre || "";
    try {
      // Todos los ítems del lote usan el mismo lote_id para agrupación visual
      for (const it of batch.items) {
        await rpcCall("fn_registrar_traslado", {
          p_empresa_id: profile.empresa_id, p_item_id: it.item_id,
          p_bodega_from: fromBod, p_bodega_to: toBod, p_cantidad: it.cantidad,
          p_responsable: resp, p_motivo: batch.motivo,
          p_fecha: HOY(), p_created_by: profile.id, p_tipo: tipo,
          p_lote_id: loteId,
        });
      }
      logActivity(profile, tipo === "despacho" ? "Despacho a nave" : "Retorno de nave", `${batch.items.length} ítem(s) · ${embNom}`);
      setBatch(BATCH_0(bodegas));
      recargar();
    } catch (e) { setError(`No se pudo registrar el ${tipo}: ` + e.message); }
  }

  /* ── Exportar CSV ── */
  function exportar() {
    const rows = [
      ["Fecha","Tipo","Ítem","Cantidad","Origen","Destino","OT","Responsable","Motivo","Lote"],
      ...movimientos.map((m) => [m.fecha, m.tipo, itemDesc(m.item_id), m.cantidad,
        whName(m.bodega_from), whName(m.bodega_to), m.ot_id||"", m.responsable, m.motivo, m.lote_id||""]),
    ];
    const csv = rows.map((r) => r.map((c) => { const s = String(c??""); return /[",\n;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }).join(";")).join("\n");
    const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "movimientos.csv"; a.click();
  }

  /* ── Filtrado + agrupación por lote ── */
  const movsGrp = useMemo(() => {
    const q = fBusca.trim().toLowerCase();
    const filtered = movimientos.filter((m) => {
      const embFrom = embDeNave(m.bodega_from);
      const embTo   = embDeNave(m.bodega_to);
      return (
        (fTipo === "all" || m.tipo === fTipo) &&
        (fNave === "all" || embFrom === fNave || embTo === fNave) &&
        (!q || itemDesc(m.item_id).toLowerCase().includes(q) ||
               (m.responsable||"").toLowerCase().includes(q) ||
               (m.motivo||"").toLowerCase().includes(q))
      );
    });
    const seenLotes = new Set();
    return filtered.reduce((acc, m) => {
      if (m.lote_id) {
        if (!seenLotes.has(m.lote_id)) {
          seenLotes.add(m.lote_id);
          acc.push({
            esLote: true, loteId: m.lote_id,
            movs: movimientos.filter((x) => x.lote_id === m.lote_id),
            fecha: m.fecha, tipo: m.tipo,
            bodega_from: m.bodega_from, bodega_to: m.bodega_to,
            responsable: m.responsable, motivo: m.motivo,
          });
        }
      } else {
        acc.push({ esLote: false, mov: m });
      }
      return acc;
    }, []);
  }, [movimientos, fTipo, fNave, fBusca]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalFiltered = movsGrp.reduce((n, e) => n + (e.esLote ? e.movs.length : 1), 0);

  /* ── Guard ── */
  if (items.length === 0 || bodegas.length === 0) {
    return (
      <Card><Empty><AlertCircle size={28} color={C.amber}/><br/>
        Necesitas ítems en Inventario y al menos una bodega para registrar movimientos.
      </Empty></Card>
    );
  }

  const needFrom = (t) => t === "salida" || t === "traslado";
  const needTo   = (t) => t === "entrada" || t === "traslado" || t === "ajuste";

  return (
    <div>

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:16 }}>
        <KpiCard label="Movimientos del mes"  value={movsMes.length}    color={C.steel}  sub={`${movimientos.length} registros en total`}/>
        <KpiCard label="Despachos del mes"    value={despachosM}        color={C.cyan}   sub="salidas a embarcación"/>
        <KpiCard label="Retornos del mes"     value={retornosM}         color={C.purple} sub="ingresos desde nave"/>
        <KpiCard label="Naves en historial"   value={navesHist.length}  color={C.gold}   sub={`${embsConPanol.length} con pañol activo`}/>
      </div>

      {/* ── Formulario ───────────────────────────────────────── */}
      {puedeOperar && (
        <Card style={{ marginBottom:16, background:C.mist }}>

          {/* Selector de tipo */}
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {["entrada","salida","traslado","ajuste"].map((t) => {
              const meta = TIPO_META[t];
              const act  = tipoActivo === t;
              return (
                <button key={t}
                  onClick={() => { setTipoActivo(t); setForm((f) => ({...f, tipo:t})); }}
                  style={{ padding:"5px 13px", borderRadius:7,
                    border:`1px solid ${act ? C[meta.tone] : C.line}`,
                    background: act ? C[meta.tone] : C.surface,
                    color: act ? "#fff" : C.slate,
                    fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                  {meta.label}
                </button>
              );
            })}
            <div style={{ width:1, background:C.line, height:22, margin:"0 6px" }}/>
            {["despacho","retorno"].map((t) => {
              const meta = TIPO_META[t];
              const act  = tipoActivo === t;
              return (
                <button key={t}
                  onClick={() => { setTipoActivo(t); }}
                  style={{ padding:"5px 13px", borderRadius:7,
                    border:`1px solid ${act ? C[meta.tone] : C.line}`,
                    background: act ? C[meta.tone] : C.surface,
                    color: act ? "#fff" : C.slate,
                    fontSize:12.5, fontWeight:700, cursor:"pointer",
                    display:"flex", alignItems:"center", gap:5 }}>
                  <Ship size={13}/>{meta.label}
                </button>
              );
            })}
          </div>

          {/* ── Form simple (entrada / salida / traslado / ajuste) ── */}
          {!esNaval && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"3fr 3fr 1fr", gap:12, marginBottom:12 }}>
                <Field label="Ítem" span={2}>
                  <ItemSearch items={items} value={form.item_id} onChange={(id) => setForm({...form, item_id:id})}/>
                </Field>
                <Field label={form.item_id && needFrom(tipoActivo) ? `Cantidad (disp: ${stockDisp(form.item_id, form.bodega_from)})` : "Cantidad"}>
                  <input type="number" value={form.cantidad} onFocus={(e) => e.target.select()} onChange={(e) => setForm({...form, cantidad:+e.target.value})} style={bluInput} min={0.01} step="any"/>
                </Field>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {needFrom(tipoActivo) && (
                  <Field label="Bodega origen">
                    <select value={form.bodega_from} onChange={(e) => setForm({...form, bodega_from:e.target.value})} style={inputStyle()}>
                      {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                  </Field>
                )}
                {needTo(tipoActivo) && (
                  <Field label={tipoActivo === "ajuste" ? "Bodega (fijar cantidad)" : "Bodega destino"}>
                    <select value={form.bodega_to} onChange={(e) => setForm({...form, bodega_to:e.target.value})} style={inputStyle()}>
                      <option value="">— Selecciona —</option>
                      {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                  </Field>
                )}
                {tipoActivo === "salida" && (
                  <Field label="OT asociada">
                    <select value={form.ot_id} onChange={(e) => setForm({...form, ot_id:e.target.value})} style={inputStyle()}>
                      <option value="">— Ninguna —</option>
                      {ots.map((o) => <option key={o.id} value={o.id}>{o.folio} · {o.sistema}</option>)}
                    </select>
                    {form.ot_id && (
                      <div style={{ fontSize:10.5, color:C.steel, marginTop:4 }}>
                        ✓ El costo (cantidad × precio del ítem) se cargará automáticamente a la OT.
                      </div>
                    )}
                  </Field>
                )}
                <Field label="Responsable">
                  <input value={form.responsable} onChange={(e) => setForm({...form, responsable:e.target.value})} style={inputStyle()} placeholder={profile?.nombre}/>
                </Field>
                <Field label="Motivo">
                  <input value={form.motivo} onChange={(e) => setForm({...form, motivo:e.target.value})} style={inputStyle()} placeholder="Detalle del movimiento"/>
                </Field>
                <div style={{ display:"flex", alignItems:"flex-end" }}>
                  <button onClick={registrar} style={primaryBtn}><Plus size={16}/> Registrar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Form batch (despacho / retorno) ── */}
          {esNaval && (
            <div>
              {/* Banner contextual */}
              <div style={{ background:tint(tipoActivo==="despacho"?C.cyan:C.purple, 7),
                border:`1px solid ${tint(tipoActivo==="despacho"?C.cyan:C.purple, 20)}`,
                borderRadius:8, padding:"9px 14px", marginBottom:14,
                display:"flex", alignItems:"center", gap:8, fontSize:12.5 }}>
                <Ship size={15} color={tipoActivo==="despacho"?C.cyan:C.purple}/>
                <span style={{ fontWeight:700, color:tipoActivo==="despacho"?C.cyan:C.purple }}>
                  {tipoActivo==="despacho" ? "Despacho de suministros a embarcación" : "Retorno de suministros desde embarcación"}
                </span>
                <span style={{ color:C.slate }}>— Carga múltiple ítems en un solo lote</span>
              </div>

              {/* Cabecera del lote */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12 }}>
                <Field label="Embarcación">
                  <select value={batch.emb_id} onChange={(e) => selEmb(e.target.value)} style={{...inputStyle(), fontWeight:600}}>
                    <option value="">— Selecciona nave —</option>
                    {embsConPanol.length === 0
                      ? <option disabled>Sin naves con pañol registrado</option>
                      : embsConPanol.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </Field>
                <Field label={tipoActivo==="despacho" ? "Pañol destino (nave)" : "Pañol origen (nave)"}>
                  {batch.bodega_nave ? (
                    <div style={{...inputStyle(), display:"flex", alignItems:"center", gap:6,
                      background:tint(C.cyan,8), pointerEvents:"none", cursor:"default"}}>
                      <Ship size={12} color={C.cyan}/>{whName(batch.bodega_nave)}
                    </div>
                  ) : (
                    <div style={{...inputStyle(), color:C.slate, pointerEvents:"none"}}>— selecciona nave —</div>
                  )}
                </Field>
                <Field label={tipoActivo==="despacho" ? "Bodega origen (tierra)" : "Bodega destino (tierra)"}>
                  <select value={batch.bodega_tierra} onChange={(e) => setBatch((b) => ({...b, bodega_tierra:e.target.value}))} style={inputStyle()}>
                    {(bodsTierra.length > 0 ? bodsTierra : bodegas).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Responsable">
                  <input value={batch.responsable} onChange={(e) => setBatch((b) => ({...b, responsable:e.target.value}))} style={inputStyle()} placeholder={profile?.nombre}/>
                </Field>
              </div>
              <div style={{ marginBottom:12 }}>
                <Field label="Misión / Motivo">
                  <input value={batch.motivo} onChange={(e) => setBatch((b) => ({...b, motivo:e.target.value}))}
                    style={{...inputStyle(), width:"100%", boxSizing:"border-box"}}
                    placeholder="Ej: Zarpe 2026-06-10 · Ruta norte · Abastecimiento motor"/>
                </Field>
              </div>

              {/* Agregar ítem al lote */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 150px auto", gap:10, alignItems:"flex-end", marginBottom:10 }}>
                <Field label="Ítem a agregar">
                  <ItemSearch items={items} value={bLine.item_id} onChange={(id) => setBLine({...bLine, item_id:id})}/>
                </Field>
                <Field label={bLine.item_id
                  ? `Cant. (disp: ${stockDisp(bLine.item_id, tipoActivo==="despacho"?batch.bodega_tierra:batch.bodega_nave)})`
                  : "Cantidad"}>
                  <input type="number" value={bLine.cantidad} onFocus={(e) => e.target.select()} onChange={(e) => setBLine({...bLine, cantidad:+e.target.value})} style={bluInput} min={0.01} step="any"/>
                </Field>
                <button onClick={addBLine}
                  style={{ padding:"7px 14px", borderRadius:7, border:`1px solid ${C.line}`,
                    background:C.surface, color:C.steel, fontSize:12.5, fontWeight:600,
                    cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                  <Plus size={14}/> Agregar
                </button>
              </div>

              {/* Tabla del lote */}
              {batch.items.length > 0 && (
                <div style={{ border:`1px solid ${C.line}`, borderRadius:8, overflow:"hidden", marginBottom:14 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr style={{ background:C.foam }}>
                      <th style={{...thStyle, fontSize:11}}>Código</th>
                      <th style={{...thStyle, fontSize:11}}>Descripción</th>
                      <th style={{...thStyle, fontSize:11, textAlign:"right"}}>Cantidad</th>
                      <th style={{...thStyle, fontSize:11, textAlign:"right"}}>Disponible</th>
                      <th style={thStyle}/>
                    </tr></thead>
                    <tbody>
                      {batch.items.map((it, idx) => {
                        const origenBod = tipoActivo==="despacho" ? batch.bodega_tierra : batch.bodega_nave;
                        const disp   = stockDisp(it.item_id, origenBod);
                        const excede = it.cantidad > disp;
                        const item   = items.find((i) => i.id === it.item_id);
                        return (
                          <tr key={idx} style={{ borderBottom:`1px solid ${C.foam}`, background: excede ? tint(C.red,5) : undefined }}>
                            <td style={{...tdStyle, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, color:C.steel, fontSize:11}}>{item?.codigo}</td>
                            <td style={{...tdStyle, fontSize:12.5}}>{item?.descripcion}</td>
                            <td style={{...tdStyle, textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600}}>{it.cantidad}</td>
                            <td style={{...tdStyle, textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, color: excede?C.red:C.green}}>
                              {disp}{excede && <span style={{ fontSize:10, marginLeft:4 }}>⚠</span>}
                            </td>
                            <td style={tdStyle}>
                              <button onClick={() => rmBLine(idx)}
                                style={{ background:"none", border:"none", cursor:"pointer", color:C.slate, padding:"2px 4px" }}>
                                <X size={14}/>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ background:C.foam, padding:"8px 12px", fontSize:12, color:C.slate, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>{batch.items.length} ítem{batch.items.length!==1?"s":""} en el lote</span>
                    {batch.items.some((it) => it.cantidad > stockDisp(it.item_id, tipoActivo==="despacho"?batch.bodega_tierra:batch.bodega_nave)) && (
                      <span style={{ color:C.red, fontWeight:600 }}>⚠ Algunos ítems superan el stock disponible</span>
                    )}
                  </div>
                </div>
              )}

              <button onClick={registrarBatch}
                style={{ ...primaryBtn, background: tipoActivo==="despacho"?C.cyan:C.purple, borderColor: tipoActivo==="despacho"?C.cyan:C.purple }}>
                <Ship size={15}/> {tipoActivo==="despacho" ? "Confirmar Despacho a Nave" : "Confirmar Retorno a Bodega"}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* ── Barra de filtros + exportar ──────────────────────── */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:"1 1 200px", maxWidth:280 }}>
          <Search size={13} color={C.slate} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)" }}/>
          <input value={fBusca} onChange={(e) => setFBusca(e.target.value)}
            placeholder="Ítem, responsable, motivo…"
            style={{...inputStyle(), paddingLeft:28, width:"100%", boxSizing:"border-box", fontSize:12.5}}/>
        </div>
        {["all","entrada","salida","traslado","ajuste","despacho","retorno"].map((v) => {
          const meta = TIPO_META[v];
          const act  = fTipo === v;
          const col  = v === "all" ? C.steel : C[(meta?.tone) || "slate"];
          return (
            <button key={v} onClick={() => setFTipo(v)}
              style={{ padding:"4px 10px", borderRadius:7,
                border:`1px solid ${act?col:C.line}`,
                background: act ? col : C.surface,
                color: act ? "#fff" : C.slate,
                fontSize:12, fontWeight:600, cursor:"pointer",
                display:"flex", alignItems:"center", gap:4 }}>
              {(v==="despacho"||v==="retorno") && <Ship size={11}/>}
              {v==="all" ? "Todos" : meta?.label || v}
            </button>
          );
        })}
        {navesHist.length > 0 && (
          <select value={fNave} onChange={(e) => setFNave(e.target.value)}
            style={{...inputStyle(160), fontSize:12.5, flex:"0 0 auto"}}>
            <option value="all">Todas las naves</option>
            {navesHist.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <button onClick={exportar} style={exportBtn}><Download size={14}/> Exportar</button>
        <span style={{ marginLeft:"auto", fontSize:11.5, color:C.slate, whiteSpace:"nowrap" }}>
          {totalFiltered} / {movimientos.length} mov.
        </span>
      </div>

      {/* ── Tabla ────────────────────────────────────────────── */}
      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:920 }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Ítem</th>
              <th style={{...thStyle, textAlign:"right"}}>Cant.</th>
              <th style={thStyle}>Origen → Destino</th>
              <th style={thStyle}>Responsable</th>
              <th style={thStyle}>Motivo / Misión</th>
            </tr></thead>
            <tbody>
              {movsGrp.length === 0 ? (
                <tr><td colSpan={7}>
                  <Empty>Sin movimientos{movimientos.length > 0 ? " para los filtros seleccionados" : ""}.</Empty>
                </td></tr>
              ) : movsGrp.map((entry) => {
                /* ── Fila resumen de lote ── */
                if (entry.esLote) {
                  const isExp      = expandidos.has(entry.loteId);
                  const accentCol  = entry.tipo==="despacho" ? C.cyan : C.purple;
                  const embNomLote = embDeNave(entry.tipo==="despacho" ? entry.bodega_to : entry.bodega_from);
                  return (
                    <React.Fragment key={entry.loteId}>
                      <tr style={{ background:tint(accentCol, 7), cursor:"pointer" }}
                          onClick={() => setExpandidos((prev) => {
                            const s = new Set(prev);
                            s.has(entry.loteId) ? s.delete(entry.loteId) : s.add(entry.loteId);
                            return s;
                          })}>
                        <td style={{...tdStyle, fontFamily:"'IBM Plex Mono',monospace", fontSize:12}}>{entry.fecha}</td>
                        <td style={tdStyle}><Pill tone={TIPO_META[entry.tipo]?.tone||"slate"}>{TIPO_META[entry.tipo]?.label||entry.tipo}</Pill></td>
                        <td style={{...tdStyle, fontWeight:600, fontSize:13}} colSpan={2}>
                          {entry.movs.length} ítem{entry.movs.length!==1?"s":""} en lote
                          {embNomLote && <span style={{ marginLeft:8, color:accentCol, fontWeight:700 }}>· {embNomLote}</span>}
                        </td>
                        <td style={{...tdStyle, fontSize:12}}>
                          <RutaBodega m={entry} whName={whName} embDeNave={embDeNave}/>
                        </td>
                        <td style={{...tdStyle, fontSize:12}}>{entry.responsable}</td>
                        <td style={{...tdStyle, fontSize:12, color:C.slate}}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span>{entry.motivo}</span>
                            <span style={{ color:accentCol, marginLeft:8, flexShrink:0 }}>
                              {isExp ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Filas expandidas del lote */}
                      {isExp && entry.movs.map((m) => (
                        <tr key={m.id} style={{ background:tint(accentCol, 3) }}>
                          <td style={{...tdStyle, paddingLeft:28, fontSize:11, color:C.slate}}></td>
                          <td style={tdStyle}/>
                          <td style={{...tdStyle, fontSize:12, paddingLeft:24}}>{itemDesc(m.item_id)}</td>
                          <td style={{...tdStyle, textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600}}>{m.cantidad}</td>
                          <td style={{...tdStyle, fontSize:11, color:C.slate}} colSpan={3}>
                            {items.find((i) => i.id === m.item_id)?.codigo || ""}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                }

                /* ── Fila movimiento simple ── */
                const m = entry.mov;
                return (
                  <tr key={m.id}>
                    <td style={{...tdStyle, fontFamily:"'IBM Plex Mono',monospace", fontSize:12}}>{m.fecha}</td>
                    <td style={tdStyle}><Pill tone={TIPO_META[m.tipo]?.tone||"slate"}>{TIPO_META[m.tipo]?.label||m.tipo}</Pill></td>
                    <td style={{...tdStyle, fontSize:12.5}}>{itemDesc(m.item_id)}</td>
                    <td style={{...tdStyle, textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600}}>{m.cantidad}</td>
                    <td style={{...tdStyle, fontSize:12}}>
                      <RutaBodega m={m} whName={whName} embDeNave={embDeNave}/>
                    </td>
                    <td style={{...tdStyle, fontSize:12.5}}>{m.responsable}</td>
                    <td style={{...tdStyle, fontSize:12, color:C.slate}}>{m.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────────── */
function RutaBodega({ m, whName, embDeNave }) {
  const fromNave = m.bodega_from ? embDeNave(m.bodega_from) : null;
  const toNave   = m.bodega_to   ? embDeNave(m.bodega_to)   : null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
      {m.bodega_from ? (
        <span style={{ display:"flex", alignItems:"center", gap:3 }}>
          {fromNave && <Ship size={11} color={C.cyan}/>}
          {fromNave || whName(m.bodega_from)}
        </span>
      ) : <span style={{ color:C.line }}>—</span>}
      <ChevronRight size={11} color={C.line}/>
      {m.bodega_to ? (
        <span style={{ display:"flex", alignItems:"center", gap:3 }}>
          {toNave && <Ship size={11} color={C.cyan}/>}
          {toNave || whName(m.bodega_to)}
        </span>
      ) : <span style={{ color:C.line }}>—</span>}
    </div>
  );
}

function KpiCard({ label, value, color, sub }) {
  return (
    <Card style={{ padding:14 }}>
      <div style={{ fontSize:11, letterSpacing:".8px", textTransform:"uppercase", color:C.slate, fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:"'Archivo',sans-serif", fontSize:26, fontWeight:800, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.slate, marginTop:3 }}>{sub}</div>}
    </Card>
  );
}

/* ── ItemSearch: buscador de ítems con autocompletado ────────── */
function ItemSearch({ items, value, onChange, placeholder = "Buscar código o descripción…" }) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(-1);
  const containerRef        = useRef(null);

  const selected = items.find((i) => i.id === value);
  const inputVal = open ? query : (selected ? `${selected.codigo} · ${selected.descripcion}` : "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 60);
    return items.filter((i) =>
      (i.codigo || "").toLowerCase().includes(q) ||
      (i.descripcion || "").toLowerCase().includes(q)
    ).slice(0, 60);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false); setQuery(""); setCursor(-1);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleFocus() { setOpen(true); setQuery(""); setCursor(-1); }

  function handleChange(e) { setQuery(e.target.value); setOpen(true); setCursor(-1); }

  function select(item) { onChange(item.id); setOpen(false); setQuery(""); setCursor(-1); }

  function clear(e) { e.stopPropagation(); onChange(""); setQuery(""); setOpen(false); }

  function handleKey(e) {
    if (!open) { if (e.key === "ArrowDown") { setOpen(true); } return; }
    if (e.key === "ArrowDown")  { setCursor((c) => Math.min(c + 1, filtered.length - 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp")   { setCursor((c) => Math.max(c - 1, -1)); e.preventDefault(); }
    else if (e.key === "Enter")     { if (cursor >= 0 && filtered[cursor]) { select(filtered[cursor]); } e.preventDefault(); }
    else if (e.key === "Escape")    { setOpen(false); setQuery(""); setCursor(-1); }
  }

  return (
    <div ref={containerRef} style={{ position:"relative" }}>
      <div style={{ position:"relative" }}>
        <Search size={13} color={C.slate}
          style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}/>
        <input
          value={inputVal}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKey}
          placeholder={placeholder}
          style={{ ...inputStyle(), paddingLeft:28, paddingRight: value ? 28 : 10,
            width:"100%", boxSizing:"border-box" }}
        />
        {value && (
          <button onClick={clear}
            style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)",
              background:"none", border:"none", cursor:"pointer", color:C.slate, padding:2, lineHeight:1 }}>
            <X size={13}/>
          </button>
        )}
      </div>
      {open && (
        <div style={{ position:"absolute", zIndex:999, top:"calc(100% + 3px)", left:0, right:0,
          background:C.surface, border:`1px solid ${C.line}`, borderRadius:8,
          boxShadow:"0 8px 24px rgba(10,26,42,.12)", maxHeight:220, overflowY:"auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding:"10px 12px", fontSize:12, color:C.slate }}>Sin resultados</div>
          ) : filtered.map((item, idx) => (
            <div key={item.id}
              onMouseDown={(e) => { e.preventDefault(); select(item); }}
              style={{ padding:"7px 12px", cursor:"pointer", fontSize:12.5,
                background: cursor === idx ? tint(C.cyan,12) : (item.id === value ? tint(C.green,8) : undefined),
                borderBottom:`1px solid ${C.foam}`,
                display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                color:C.steel, fontWeight:700, flexShrink:0, minWidth:60 }}>{item.codigo}</span>
              <span style={{ color:C.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.descripcion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
