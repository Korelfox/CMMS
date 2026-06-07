import React, { useState } from "react";
import { Download, Plus, ChevronRight, AlertCircle } from "lucide-react";
import { insertRow, upsertRow, logActivity } from "../../lib/db";
import { C, canOperate } from "../../theme";
import { Card, Pill, primaryBtn, exportBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty } from "../../ui";
import { HOY, skey } from "./util";

/* ============================ TAB · MOVIMIENTOS ============================ */
export default function TabMovimientos({ profile, items, bodegas, ots, movimientos, stockMap, itemDesc, whName, recargar, setError }) {
  const [form, setForm] = useState({
    tipo: "salida", item_id: "", bodega_from: bodegas[0]?.id || "", bodega_to: "",
    cantidad: 1, ot_id: "", responsable: profile?.nombre || "", motivo: "",
  });
  const puedeOperar = canOperate(profile?.rol);
  const needFrom = form.tipo === "salida" || form.tipo === "traslado";
  const needTo = form.tipo === "entrada" || form.tipo === "traslado" || form.tipo === "ajuste";

  async function registrar() {
    if (!form.item_id || form.cantidad <= 0) { setError("Selecciona el ítem y una cantidad mayor a 0."); return; }
    const cant = Number(form.cantidad);
    try {
      // 1) Actualizar stock primero (lo más crítico)
      if (form.tipo === "entrada") {
        const prev = stockMap.get(skey(form.item_id, form.bodega_to)) || 0;
        await upsertRow("stock", profile.empresa_id, { item_id: form.item_id, bodega_id: form.bodega_to, cantidad: prev + cant }, "item_id,bodega_id");
      } else if (form.tipo === "salida") {
        const prev = stockMap.get(skey(form.item_id, form.bodega_from)) || 0;
        await upsertRow("stock", profile.empresa_id, { item_id: form.item_id, bodega_id: form.bodega_from, cantidad: Math.max(0, prev - cant) }, "item_id,bodega_id");
      } else if (form.tipo === "traslado") {
        const pf = stockMap.get(skey(form.item_id, form.bodega_from)) || 0;
        const pt = stockMap.get(skey(form.item_id, form.bodega_to)) || 0;
        await upsertRow("stock", profile.empresa_id, { item_id: form.item_id, bodega_id: form.bodega_from, cantidad: Math.max(0, pf - cant) }, "item_id,bodega_id");
        await upsertRow("stock", profile.empresa_id, { item_id: form.item_id, bodega_id: form.bodega_to, cantidad: pt + cant }, "item_id,bodega_id");
      } else if (form.tipo === "ajuste") {
        await upsertRow("stock", profile.empresa_id, { item_id: form.item_id, bodega_id: form.bodega_to, cantidad: cant }, "item_id,bodega_id");
      }
      // 2) Registrar el movimiento (auditoría)
      await insertRow("movimientos", profile.empresa_id, {
        fecha: HOY(), tipo: form.tipo, item_id: form.item_id,
        bodega_from: needFrom ? form.bodega_from : null,
        bodega_to: needTo ? form.bodega_to : null,
        cantidad: cant, ot_id: form.ot_id || null,
        responsable: form.responsable, motivo: form.motivo, created_by: profile.id,
      });
      logActivity(profile, `Movimiento: ${form.tipo}`, `${cant}× ${itemDesc(form.item_id)}${form.ot_id ? " · OT" : ""}`);
      setForm((f) => ({ ...f, cantidad: 1, ot_id: "", motivo: "" }));
      recargar();
    } catch (e) { setError("No se pudo registrar el movimiento: " + e.message); }
  }

  function exportar() {
    const filas = [["Fecha", "Tipo", "Ítem", "Cantidad", "Origen", "Destino", "OT", "Responsable", "Motivo"],
      ...movimientos.map((m) => [m.fecha, m.tipo, itemDesc(m.item_id), m.cantidad, whName(m.bodega_from), whName(m.bodega_to), m.ot_id || "", m.responsable, m.motivo])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "movimientos.csv"; a.click();
  }

  const tipoTone = { entrada: "green", salida: "red", traslado: "steel", ajuste: "yellow" };
  const tipoLabel = { entrada: "Entrada", salida: "Salida", traslado: "Traslado", ajuste: "Ajuste" };

  if (items.length === 0 || bodegas.length === 0) {
    return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Necesitas ítems en Inventario y al menos una bodega para registrar movimientos.</Empty></Card>;
  }

  return (
    <div>
      {puedeOperar && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Registrar Movimiento</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>
              <option value="entrada">Entrada</option><option value="salida">Salida</option><option value="traslado">Traslado</option><option value="ajuste">Ajuste</option>
            </select></Field>
            <Field label="Ítem" span={2}><select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })} style={inputStyle()}>
              <option value="">— Selecciona —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.codigo} · {i.descripcion}</option>)}
            </select></Field>
            <Field label="Cantidad"><input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: +e.target.value })} style={bluInput} /></Field>

            {needFrom && <Field label="Bodega origen"><select value={form.bodega_from} onChange={(e) => setForm({ ...form, bodega_from: e.target.value })} style={inputStyle()}>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select></Field>}
            {needTo && <Field label={form.tipo === "ajuste" ? "Bodega (fijar cantidad)" : "Bodega destino"}>
              <select value={form.bodega_to} onChange={(e) => setForm({ ...form, bodega_to: e.target.value })} style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select></Field>}
            {form.tipo === "salida" && (
              <Field label="OT asociada (opcional)"><select value={form.ot_id} onChange={(e) => setForm({ ...form, ot_id: e.target.value })} style={inputStyle()}>
                <option value="">— Ninguna —</option>
                {ots.map((o) => <option key={o.id} value={o.id}>{o.folio} · {o.sistema}</option>)}
              </select></Field>
            )}
            <Field label="Responsable"><input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Motivo" span={2}><input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} style={inputStyle()} placeholder="Detalle del movimiento" /></Field>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={registrar} style={primaryBtn}><Plus size={16} /> Registrar</button></div>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th><th style={thStyle}>Tipo</th><th style={thStyle}>Ítem</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Cant.</th><th style={thStyle}>Origen → Destino</th>
              <th style={thStyle}>Responsable</th><th style={thStyle}>Motivo</th>
            </tr></thead>
            <tbody>
              {movimientos.length === 0 ? <tr><td colSpan={7}><Empty>Sin movimientos registrados.</Empty></td></tr> :
                movimientos.map((m) => (
                  <tr key={m.id}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{m.fecha}</td>
                    <td style={tdStyle}><Pill tone={tipoTone[m.tipo]}>{tipoLabel[m.tipo]}</Pill></td>
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>{itemDesc(m.item_id)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{m.cantidad}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{m.bodega_from ? whName(m.bodega_from) : "—"} <ChevronRight size={11} style={{ display: "inline", verticalAlign: "middle" }} /> {m.bodega_to ? whName(m.bodega_to) : "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>{m.responsable}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: C.slate }}>{m.motivo}</td>
                  </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
