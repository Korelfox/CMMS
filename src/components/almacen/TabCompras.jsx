import React, { useState } from "react";
import { Plus, Trash2, Check, X, ShoppingCart, PackagePlus, Search, ChevronRight, Download, AlertCircle } from "lucide-react";
import { insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../../lib/db";
import { C, archivo, clp, num, isAdmin, tint } from "../../theme";
import { Card, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty } from "../../ui";
import { HOY, skey } from "./util";

export default function TabCompras({ profile, items, bodegas, compras, comprasItems, stockMap, itemDesc, itemPrecio, whName, ocInit, onOcInitUsed, recargar, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ proveedor: "", bodega_destino: bodegas[0]?.id || "", lead_dias: 7, ref_proveedor: "", notas: "", items: [] });
  const [line, setLine] = useState({ item_id: "", cantidad: 1 });
  const [recepPanel, setRecepPanel] = useState(null);  // oc.id al recibir parcialmente
  const [recepCants, setRecepCants] = useState({});    // { compra_item_id: cantidad_a_recibir }
  const [fEstado, setFEstado] = useState("all");
  const [fProv, setFProv] = useState("all");
  const [fBusca, setFBusca] = useState("");
  const puedeOperar = isAdmin(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const puedeAprobar = isAdmin(profile?.rol);

  // Inicializar form desde botón "Reponer" en Stock
  React.useEffect(() => {
    if (ocInit?.items?.length > 0) {
      setForm((f) => ({ ...f, proveedor: ocInit.proveedor || f.proveedor, items: ocInit.items }));
      setShowForm(true);
      onOcInitUsed?.();
    }
  }, [ocInit]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemCodigo    = (id) => items.find((i) => i.id === id)?.codigo     || "";
  const itemCategoria = (id) => items.find((i) => i.id === id)?.categoria || "";

  // Sugerencias de reposición: solo ítems con un mínimo real definido
  // (stock_min > 0) cuyo stock total esté en o bajo ese mínimo. Así se
  // excluyen los ítems sin configurar (valores en 0), que no aportan info.
  const totalItem = (id) => bodegas.reduce((s, b) => s + (stockMap.get(skey(id, b.id)) || 0), 0);
  const sugerencias = items.map((i) => ({ ...i, total: totalItem(i.id) })).filter((i) => (i.stock_min || 0) > 0 && i.total <= i.stock_min)
    .map((i) => ({ ...i, sugerido: Math.max((i.stock_max || 0) - i.total, 1) }));

  const ocTotal = (oc) => comprasItems.filter((it) => it.compra_id === oc.id).reduce((s, it) => s + (it.cantidad || 0) * (it.precio || 0), 0);
  const ocItemsList = (oc) => comprasItems.filter((it) => it.compra_id === oc.id);
  const pendiente = compras.filter((o) => o.estado !== "recibida").reduce((s, o) => s + ocTotal(o), 0);

  // ── Filtros de OCs ───────────────────────────────────────────
  const proveedores = [...new Set(compras.map((o) => o.proveedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const qOC = fBusca.trim().toLowerCase();
  const comprasFiltradas = compras.filter((o) =>
    (fEstado === "all" || o.estado === fEstado) &&
    (fProv === "all" || o.proveedor === fProv) &&
    (!qOC || (o.folio || "").toLowerCase().includes(qOC) || (o.proveedor || "").toLowerCase().includes(qOC) || (o.ref_proveedor || "").toLowerCase().includes(qOC) || (o.notas || "").toLowerCase().includes(qOC))
  );
  const hayFiltroOC = fEstado !== "all" || fProv !== "all" || !!qOC;

  function addLine() {
    if (!line.item_id) return;
    setForm((f) => ({ ...f, items: [...f.items, { item_id: line.item_id, cantidad: line.cantidad, precio: itemPrecio(line.item_id) }] }));
    setLine({ item_id: "", cantidad: 1 });
  }
  function rmLine(idx) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  // ── Recepción parcial ─────────────────────────────────────────
  function abrirRecepcion(oc) {
    const cants = {};
    ocItemsList(oc).forEach((it) => {
      const pendiente = Math.max(0, it.cantidad - (it.cantidad_recibida || 0));
      cants[it.id] = pendiente;
    });
    setRecepCants(cants);
    setRecepPanel(oc.id);
  }
  async function confirmarRecepcion(oc) {
    const its = ocItemsList(oc);
    try {
      let todoRecibido = true;
      for (const it of its) {
        const yaRecibido  = it.cantidad_recibida || 0;
        const aRecibir    = Math.min(Math.max(0, +recepCants[it.id] || 0), it.cantidad - yaRecibido);
        const nuevoTotal  = yaRecibido + aRecibir;
        if (nuevoTotal < it.cantidad) todoRecibido = false;
        if (aRecibir <= 0) continue;
        const prevStock = stockMap.get(skey(it.item_id, oc.bodega_destino)) || 0;
        await upsertRow("stock", profile.empresa_id, { item_id: it.item_id, bodega_id: oc.bodega_destino, cantidad: prevStock + aRecibir }, "item_id,bodega_id");
        await insertRow("movimientos", profile.empresa_id, {
          fecha: HOY(), tipo: "entrada", item_id: it.item_id, bodega_to: oc.bodega_destino,
          cantidad: aRecibir, responsable: profile.nombre || "Compras",
          motivo: `Recepción ${todoRecibido ? "completa" : "parcial"} ${oc.folio}`, created_by: profile.id,
        });
        await updateRow("compras_items", it.id, { cantidad_recibida: nuevoTotal });
      }
      if (todoRecibido) {
        await updateRow("compras", oc.id, { estado: "recibida", fecha_recepcion: HOY() });
        logActivity(profile, "Recibir OC completa", `${oc.folio} → ${whName(oc.bodega_destino)}`);
      } else {
        logActivity(profile, "Recepción parcial OC", `${oc.folio} — pendiente de completar`);
      }
      setRecepPanel(null); setRecepCants({});
      recargar();
    } catch (e) { setError("No se pudo procesar la recepción: " + e.message); }
  }

  async function crearOC() {
    if (!form.proveedor.trim() || form.items.length === 0) { setError("Indica proveedor y al menos un ítem."); return; }
    const folio = `OC-${String(compras.length + 1).padStart(3, "0")}`;
    try {
      const cab = await insertRow("compras", profile.empresa_id, {
        folio, proveedor: form.proveedor.trim(), bodega_destino: form.bodega_destino,
        lead_dias: form.lead_dias, ref_proveedor: form.ref_proveedor.trim() || null,
        notas: form.notas.trim() || null, estado: "solicitada", fecha: HOY(), created_by: profile.id,
      });
      for (const it of form.items) {
        await insertRow("compras_items", profile.empresa_id, {
          compra_id: cab.id, item_id: it.item_id, cantidad: it.cantidad, precio: it.precio,
        });
      }
      logActivity(profile, "Crear OC", `${folio} · ${form.proveedor} · ${form.items.length} ítems`);
      setForm({ proveedor: "", bodega_destino: bodegas[0]?.id || "", lead_dias: 7, ref_proveedor: "", notas: "", items: [] });
      setShowForm(false); recargar();
    } catch (e) { setError("No se pudo crear la OC: " + e.message); }
  }

  function crearDesdeSugerencias() {
    if (sugerencias.length === 0) return;
    setForm({ proveedor: sugerencias[0].proveedor || "", bodega_destino: bodegas[0]?.id || "", lead_dias: 7,
      items: sugerencias.map((s) => ({ item_id: s.id, cantidad: s.sugerido, precio: s.precio })) });
    setShowForm(true);
  }

  async function avanzar(oc) {
    const flow = { solicitada: "aprobada", aprobada: "enviada", enviada: "recibida" };
    const next = flow[oc.estado]; if (!next) return;
    try {
      if (next === "recibida") {
        // Suma stock en la bodega destino + registra movimientos de entrada
        for (const it of ocItemsList(oc)) {
          const prev = stockMap.get(skey(it.item_id, oc.bodega_destino)) || 0;
          await upsertRow("stock", profile.empresa_id, { item_id: it.item_id, bodega_id: oc.bodega_destino, cantidad: prev + it.cantidad }, "item_id,bodega_id");
          await insertRow("movimientos", profile.empresa_id, {
            fecha: HOY(), tipo: "entrada", item_id: it.item_id, bodega_to: oc.bodega_destino,
            cantidad: it.cantidad, responsable: "Compras", motivo: `Recepción ${oc.folio}`, created_by: profile.id,
          });
        }
        await updateRow("compras", oc.id, { estado: "recibida", fecha_recepcion: HOY() });
        logActivity(profile, "Recibir OC", `${oc.folio} · stock ingresado a ${whName(oc.bodega_destino)}`);
      } else {
        await updateRow("compras", oc.id, { estado: next });
        logActivity(profile, "Avanzar OC", `${oc.folio} → ${next}`);
      }
      recargar();
    } catch (e) { setError("No se pudo avanzar la OC: " + e.message); }
  }

  async function eliminar(id) {
    const o = compras.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar la orden ${o?.folio}?`)) return;
    try { await deleteRow("compras", id); logActivity(profile, "Eliminar OC", o?.folio); recargar(); }
    catch (e) { setError("No se pudo eliminar: " + e.message); }
  }

  const estTone  = { solicitada: "slate", aprobada: "purple", enviada: "steel", recibida: "green" };
  const estLabel = { solicitada: "Solicitada", aprobada: "Aprobada", enviada: "Enviada", recibida: "Recibida" };

  function calcETA(fecha, lead_dias) {
    if (!fecha || !lead_dias) return null;
    const d = new Date(fecha); d.setDate(d.getDate() + Number(lead_dias));
    return d.toISOString().slice(0, 10);
  }
  function etaSemaforo(oc) {
    if (oc.estado === "recibida") return null;
    const eta = calcETA(oc.fecha, oc.lead_dias);
    if (!eta) return null;
    const hoy = HOY();
    const diasRestantes = Math.ceil((new Date(eta) - new Date(hoy)) / 86400000);
    if (diasRestantes < 0)  return { color: C.red,   label: `${Math.abs(diasRestantes)}d atrasada`, eta };
    if (diasRestantes <= 3) return { color: C.amber,  label: `llega en ${diasRestantes}d`, eta };
    return                         { color: C.green,  label: `llega en ${diasRestantes}d`, eta };
  }

  if (items.length === 0 || bodegas.length === 0) {
    return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Necesitas ítems en Inventario y al menos una bodega para crear compras.</Empty></Card>;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>OCs Abiertas</div>
          <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: C.steel, marginTop: 6 }}>{compras.filter((o) => o.estado !== "recibida").length}</div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{compras.length} totales</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Valor Pendiente</div>
          <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: C.gold, marginTop: 6 }}>{clp(pendiente)}</div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>no recibido aún</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Ítems Bajo Mínimo</div>
          <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: sugerencias.length ? C.red : C.green, marginTop: 6 }}>{sugerencias.length}</div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>requieren reposición</div>
        </Card>
      </div>

      {sugerencias.length > 0 && puedeOperar && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.amber}`, background: C.yellowBg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PackagePlus size={17} color={C.amber} />
              <strong style={{ color: C.abyss, fontSize: 14 }}>Sugerencias de Reposición</strong>
            </div>
            <button onClick={crearDesdeSugerencias} style={{ ...primaryBtn, background: C.amber }}><ShoppingCart size={15} /> Generar OC sugerida</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sugerencias.map((s) => (
              <div key={s.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", fontSize: 12 }}>
                <strong>{s.descripcion}</strong> <span style={{ color: C.slate }}>· {s.total}/{s.stock_min}</span> <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.green, fontWeight: 600 }}>→ {s.sugerido}</span>
              </div>))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva OC</button>}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Orden de Compra</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Bodega destino"><select value={form.bodega_destino} onChange={(e) => setForm({ ...form, bodega_destino: e.target.value })} style={inputStyle()}>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select></Field>
            <Field label="Lead días"><input type="number" value={form.lead_dias} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} /></Field>
            <Field label="N° ref. proveedor"><input value={form.ref_proveedor} onChange={(e) => setForm({ ...form, ref_proveedor: e.target.value })} style={inputStyle()} placeholder="OC-PROV-001" /></Field>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Field label="Notas u observaciones"><input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ ...inputStyle(), width: "100%" }} placeholder="Instrucciones de entrega, contacto, urgencia…" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr auto", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
            <Field label="Ítem"><select value={line.item_id} onChange={(e) => setLine({ ...line, item_id: e.target.value })} style={inputStyle()}>
              <option value="">— Selecciona —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.codigo} · {i.descripcion}</option>)}
            </select></Field>
            <Field label="Cantidad"><input type="number" value={line.cantidad} onChange={(e) => setLine({ ...line, cantidad: +e.target.value })} style={bluInput} /></Field>
            <button onClick={addLine} style={ghostBtn}><Plus size={15} /> Agregar</button>
          </div>
          {form.items.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 12 }}>
              {form.items.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 6px", borderBottom: idx < form.items.length - 1 ? `1px solid ${C.foam}` : "none", fontSize: 12.5 }}>
                  <span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>{itemCodigo(it.item_id)}</span>
                    {" · "}{itemDesc(it.item_id)}
                    {itemCategoria(it.item_id) && <span style={{ color: C.slate, fontSize: 11.5 }}> [{itemCategoria(it.item_id)}]</span>}
                    {" · "}<span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{it.cantidad} × {clp(it.precio)}</span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(it.cantidad * it.precio)}</span>
                    <button onClick={() => rmLine(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={14} /></button>
                  </div>
                </div>))}
              <div style={{ textAlign: "right", padding: "8px 6px 2px", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: C.gold }}>Total: {clp(form.items.reduce((s, it) => s + it.cantidad * it.precio, 0))}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}><button onClick={crearOC} style={primaryBtn}>Crear OC</button><button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button></div>
        </Card>
      )}

      {/* ── Panel de recepción parcial ── */}
      {recepPanel && (() => {
        const oc  = compras.find((o) => o.id === recepPanel);
        const its = ocItemsList(oc);
        return (
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.cyan}`, background: tint(C.cyan, 8) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Recepción de mercadería</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.abyss, marginTop: 2 }}>
                  {oc.folio} · {oc.proveedor} — indica las cantidades que efectivamente llegaron
                </div>
              </div>
              <button onClick={() => setRecepPanel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
              <thead><tr>
                <th style={thStyle}>Ítem</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ordenado</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ya recibido</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Pendiente</th>
                <th style={{ ...thStyle, textAlign: "center", width: 130 }}>Recibir ahora</th>
              </tr></thead>
              <tbody>
                {its.map((it) => {
                  const yaRecibido = it.cantidad_recibida || 0;
                  const pendiente  = Math.max(0, it.cantidad - yaRecibido);
                  return (
                    <tr key={it.id}>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel }}>{itemCodigo(it.item_id)}</div>
                        <div style={{ fontSize: 12.5 }}>{itemDesc(it.item_id)}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{it.cantidad}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: yaRecibido > 0 ? C.green : C.slate }}>{yaRecibido}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: pendiente > 0 ? C.amber : C.green, fontWeight: 700 }}>{pendiente}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {pendiente > 0 ? (
                          <input type="number" min={0} max={pendiente}
                            value={recepCants[it.id] ?? pendiente}
                            onChange={(e) => setRecepCants((p) => ({ ...p, [it.id]: Math.min(+e.target.value, pendiente) }))}
                            style={{ ...bluInput, width: 70, textAlign: "center" }} />
                        ) : <span style={{ fontSize: 12, color: C.green }}>✓ Completo</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => confirmarRecepcion(oc)} style={primaryBtn}><Check size={15} /> Confirmar recepción</button>
              <button onClick={() => setRecepPanel(null)} style={ghostBtn}>Cancelar</button>
            </div>
          </Card>
        );
      })()}

      {/* ── Filtros de OCs ── */}
      {compras.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
            <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={fBusca} onChange={(e) => setFBusca(e.target.value)}
              placeholder="Buscar folio, proveedor, ref o notas…"
              style={{ ...inputStyle(), width: "100%", paddingLeft: 32, fontSize: 13 }} />
          </div>
          {[["all", "Todos", C.slate], ["solicitada", "Solicitada", C.slate], ["aprobada", "Aprobada", C.purple], ["enviada", "Enviada", C.steel], ["recibida", "Recibida", C.green]].map(([v, lbl, tone]) => {
            const active = fEstado === v;
            const n = v === "all" ? null : compras.filter((o) => o.estado === v).length;
            return <button key={v} onClick={() => setFEstado(v)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${active ? tone : C.line}`, background: active ? tone : "#fff", color: active ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{lbl}{n != null && <span style={{ opacity: 0.75, marginLeft: 4, fontSize: 11 }}>({n})</span>}</button>;
          })}
          {proveedores.length > 0 && (
            <select value={fProv} onChange={(e) => setFProv(e.target.value)} style={{ ...inputStyle(180), fontSize: 12.5 }}>
              <option value="all">Todos los proveedores</option>
              {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {hayFiltroOC && (
            <button onClick={() => { setFEstado("all"); setFProv("all"); setFBusca(""); }}
              style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: "none", color: C.slate, fontSize: 12, cursor: "pointer" }}>
              <X size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Limpiar
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>{comprasFiltradas.length} de {compras.length} OCs</span>
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Ítems</th><th style={thStyle}>Destino</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={thStyle}>ETA</th><th style={thStyle}>Ref / Notas</th>
              <th style={thStyle}>Estado</th><th style={thStyle}>Acción</th>{puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {comprasFiltradas.length === 0 ? <tr><td colSpan={puedeBorrar ? 11 : 10}><Empty>{compras.length === 0 ? "Sin órdenes de compra." : "Sin OCs para los filtros seleccionados."}</Empty></td></tr> :
                comprasFiltradas.map((o) => {
                  const its = ocItemsList(o);
                  return (
                    <tr key={o.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{o.folio}</td>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.fecha}</td>
                      <td style={tdStyle}>{o.proveedor}</td>
                      <td style={{ ...tdStyle, maxWidth: 260 }}>
                        {its.map((it, idx) => (
                          <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 11 }}>{itemCodigo(it.item_id)}</span>
                            <span style={{ color: C.ink }}> {it.cantidad}× {itemDesc(it.item_id)}</span>
                            {itemCategoria(it.item_id) && <span style={{ color: C.slate, fontSize: 11 }}> [{itemCategoria(it.item_id)}]</span>}
                          </div>
                        ))}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>{whName(o.bodega_destino)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(ocTotal(o))}</td>
                      <td style={tdStyle}>
                        {(() => { const s = etaSemaforo(o); return s ? (
                          <div>
                            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.slate }}>{s.eta}</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginTop: 2 }}>● {s.label}</div>
                          </div>
                        ) : o.estado === "recibida" ? <span style={{ fontSize: 11, color: C.green }}>✓ Recibida</span> : <span style={{ fontSize: 11, color: C.slate }}>—</span>; })()}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 180 }}>
                        {o.ref_proveedor && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, color: C.steel }}>{o.ref_proveedor}</div>}
                        {o.notas && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>{o.notas}</div>}
                        {!o.ref_proveedor && !o.notas && <span style={{ color: C.line }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, minWidth: 180 }}><OCStepper estado={o.estado} /></td>
                      <td style={tdStyle}>{o.estado !== "recibida" && puedeAprobar ? (
                        o.estado === "enviada" ? (
                          <button onClick={() => abrirRecepcion(o)}
                            style={{ ...primaryBtn, padding: "5px 10px", fontSize: 12, background: C.cyan, borderColor: C.cyan }}>
                            ↓ Recibir
                          </button>
                        ) : (
                          <button onClick={() => avanzar(o)} style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}>
                            {o.estado === "solicitada" ? "Aprobar" : "Enviar →"}
                          </button>
                        )
                      ) : o.estado === "recibida" ? <span style={{ fontSize: 11.5, color: C.green, fontFamily: "'IBM Plex Mono', monospace" }}>{o.fecha_recepcion}</span> : <span style={{ fontSize: 11, color: C.slate }}>requiere Jefe</span>}</td>
                      {puedeBorrar && <td style={tdStyle}><button onClick={() => eliminar(o.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button></td>}
                    </tr>);
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Timeline visual de estado OC ───────────────────────────── */
const OC_STEPS = [
  { key: "solicitada", label: "Solicitada" },
  { key: "aprobada",   label: "Aprobada"   },
  { key: "enviada",    label: "Enviada"     },
  { key: "recibida",   label: "Recibida"   },
];
function OCStepper({ estado }) {
  const idx = OC_STEPS.findIndex((s) => s.key === estado);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {OC_STEPS.map((step, i) => {
        const done    = i < idx;
        const current = i === idx;
        const color   = done || current ? (estado === "recibida" ? C.green : C.cyan) : "#CBD5E1";
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, border: current ? `2px solid ${color}` : "none", boxShadow: current ? `0 0 0 3px ${color}30` : "none", flexShrink: 0 }} />
              <span style={{ fontSize: 8.5, color: current ? color : done ? C.slate : "#CBD5E1", fontWeight: current ? 700 : 400, whiteSpace: "nowrap" }}>{step.label}</span>
            </div>
            {i < OC_STEPS.length - 1 && (
              <div style={{ width: 22, height: 2, background: done ? color : "#CBD5E1", marginBottom: 11, flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
