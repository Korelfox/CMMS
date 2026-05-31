import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Warehouse, ArrowRightLeft, ShoppingCart, Plus, Trash2, Download,
  ChevronRight, X, PackagePlus, Ship, Anchor, Check, AlertCircle,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../lib/db";
import { supabase } from "../lib/supabase";
import { C, archivo, clp, num, isAdmin, canOperate } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

const HOY = () => new Date().toISOString().slice(0, 10);
const skey = (item_id, bodega_id) => `${item_id}__${bodega_id}`;

export default function Almacen() {
  const { profile, empresa } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [comprasItems, setComprasItems] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("stock");

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, bods, its, stk, movs, cps, cpsIts, otsAll] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("bodegas", { order: { col: "codigo", asc: true } }),
        fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
        fetchAll("stock"),
        fetchAll("movimientos", { order: { col: "fecha", asc: false } }),
        fetchAll("compras", { order: { col: "fecha", asc: false } }),
        fetchAll("compras_items"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setBodegas(bods); setItems(its); setStock(stk);
      setMovimientos(movs); setCompras(cps); setComprasItems(cpsIts); setOts(otsAll);
    } catch (e) { setError("No se pudo cargar el almacén. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Mapa de stock para lecturas rápidas: { item_id__bodega_id : cantidad }
  const stockMap = useMemo(() => {
    const m = new Map();
    stock.forEach((s) => m.set(skey(s.item_id, s.bodega_id), Number(s.cantidad) || 0));
    return m;
  }, [stock]);

  const itemDesc = (id) => items.find((i) => i.id === id)?.descripcion || "—";
  const itemPrecio = (id) => items.find((i) => i.id === id)?.precio || 0;
  const whName = (id) => bodegas.find((b) => b.id === id)?.nombre || "—";

  if (loading) return <div><PageHead kicker="Gestión de Almacenes" title="Almacén & Compras" /><Card><InlineSpinner label="Cargando almacén…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Gestión de Almacenes · Libbrecht / Pascual" title="Almacén & Compras"
        sub="Bodegas múltiples (tierra + a bordo), movimientos con consumo ligado a OT, y órdenes de compra con recepción que actualiza el stock automáticamente." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <TabBtn active={tab === "bodegas"} onClick={() => setTab("bodegas")} icon={Warehouse}>Bodegas</TabBtn>
        <TabBtn active={tab === "stock"} onClick={() => setTab("stock")} icon={Warehouse}>Stock por Bodega</TabBtn>
        <TabBtn active={tab === "movs"} onClick={() => setTab("movs")} icon={ArrowRightLeft}>Movimientos</TabBtn>
        <TabBtn active={tab === "compras"} onClick={() => setTab("compras")} icon={ShoppingCart}>Órdenes de Compra</TabBtn>
      </div>

      {tab === "bodegas" && (
        <TabBodegas profile={profile} empresa={empresa} embarcaciones={embarcaciones}
          bodegas={bodegas} setBodegas={setBodegas} recargar={cargar} setError={setError} />
      )}
      {tab === "stock" && (
        <TabStock profile={profile} items={items} bodegas={bodegas} stockMap={stockMap}
          stock={stock} setStock={setStock} setError={setError} />
      )}
      {tab === "movs" && (
        <TabMovimientos profile={profile} items={items} bodegas={bodegas} ots={ots}
          movimientos={movimientos} stockMap={stockMap} itemDesc={itemDesc} whName={whName}
          recargar={cargar} setError={setError} />
      )}
      {tab === "compras" && (
        <TabCompras profile={profile} items={items} bodegas={bodegas} compras={compras}
          comprasItems={comprasItems} stockMap={stockMap}
          itemDesc={itemDesc} itemPrecio={itemPrecio} whName={whName}
          recargar={cargar} setError={setError} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, icon: Icon }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${active ? C.cyan : C.line}`, background: active ? C.cyan : "#fff", color: active ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      <Icon size={15} />{children}
    </button>
  );
}

/* ============================ TAB · BODEGAS ============================ */
function TabBodegas({ profile, empresa, embarcaciones, bodegas, setBodegas, recargar, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", tipo: "tierra", embarcacion_id: "" });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  async function crear() {
    if (!form.codigo.trim() || !form.nombre.trim()) return;
    try {
      const nueva = await insertRow("bodegas", profile.empresa_id, {
        codigo: form.codigo.trim().toUpperCase(), nombre: form.nombre.trim(),
        tipo: form.tipo, embarcacion_id: form.tipo === "a_bordo" ? (form.embarcacion_id || null) : null,
      });
      setBodegas((p) => [...p, nueva]);
      logActivity(profile, "Crear bodega", `${nueva.codigo} · ${nueva.nombre}`);
      setForm({ codigo: "", nombre: "", tipo: "tierra", embarcacion_id: "" }); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? "Ya existe una bodega con ese código." : "No se pudo crear: " + e.message);
    }
  }
  async function eliminar(id) {
    const b = bodegas.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar "${b?.nombre}"? Se borrará también todo el stock que tenga.`)) return;
    const respaldo = bodegas;
    setBodegas((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("bodegas", id); logActivity(profile, "Eliminar bodega", `${b?.codigo} · ${b?.nombre}`); recargar(); }
    catch (e) { setBodegas(respaldo); setError("No se pudo eliminar: " + e.message); }
  }
  async function autoCrear() {
    const puerto = empresa?.puerto_base || "Principal";
    const lista = [{ codigo: "BOD-TIERRA", nombre: `Bodega ${puerto}`, tipo: "tierra", embarcacion_id: null },
      ...embarcaciones.map((e) => ({ codigo: `BOD-${e.codigo}`, nombre: `Pañol ${e.nombre}`, tipo: "a_bordo", embarcacion_id: e.id }))];
    try {
      for (const b of lista) {
        try { await insertRow("bodegas", profile.empresa_id, b); } catch (_) { /* ignora duplicados */ }
      }
      logActivity(profile, "Auto-crear bodegas", `${lista.length} bodegas por defecto`);
      recargar();
    } catch (e) { setError("No se pudieron crear las bodegas: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{bodegas.length} bodega{bodegas.length !== 1 && "s"} registrada{bodegas.length !== 1 && "s"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {puedeOperar && bodegas.length === 0 && embarcaciones.length > 0 && (
            <button onClick={autoCrear} style={ghostBtn}><PackagePlus size={15} /> Crear por defecto</button>
          )}
          {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Nueva Bodega</button>}
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Bodega</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Código"><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="BOD-TIERRA" /></Field>
            <Field label="Nombre"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle()} placeholder="Bodega Puerto Montt" /></Field>
            <Field label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>
                <option value="tierra">Tierra</option><option value="a_bordo">A bordo</option>
              </select>
            </Field>
            {form.tipo === "a_bordo" && (
              <Field label="Embarcación">
                <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value })} style={inputStyle()}>
                  <option value="">— Selecciona —</option>
                  {embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {bodegas.length === 0 ? (
        <Card><Empty>
          <Warehouse size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay bodegas. {embarcaciones.length === 0
            ? "Primero registra al menos una embarcación, luego puedes crear bodegas por defecto automáticamente."
            : "Usa \"Crear por defecto\" para generar la bodega de tierra + un pañol por cada nave, o crea una manualmente."}
        </Empty></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
          {bodegas.map((b) => {
            const emb = embarcaciones.find((e) => e.id === b.embarcacion_id);
            const tono = b.tipo === "a_bordo" ? "cyan" : "steel";
            return (
              <Card key={b.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {b.tipo === "a_bordo" ? <Ship size={20} color={emb?.color || C.cyan} /> : <Anchor size={20} color={C.steel} />}
                    <div>
                      <div style={{ fontWeight: 700, color: C.abyss }}>{b.nombre}</div>
                      <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{b.codigo}</div>
                    </div>
                  </div>
                  {puedeBorrar && <button onClick={() => eliminar(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Pill tone={tono}>{b.tipo === "a_bordo" ? "A bordo" : "Tierra"}</Pill>
                  {emb && <Pill tone="slate">{emb.nombre}</Pill>}
                </div>
              </Card>);
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ TAB · STOCK por bodega ============================ */
function TabStock({ profile, items, bodegas, stockMap, stock, setStock, setError }) {
  const puedeOperar = canOperate(profile?.rol);

  // Edita una celda: upsert (item_id, bodega_id) ← cantidad
  async function setCantidad(item_id, bodega_id, cantidad) {
    const k = skey(item_id, bodega_id);
    const previo = stockMap.get(k) || 0;
    const v = Math.max(0, +cantidad || 0);
    if (v === previo) return;
    // Optimista: actualiza el array local de stock
    setStock((p) => {
      const idx = p.findIndex((s) => s.item_id === item_id && s.bodega_id === bodega_id);
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], cantidad: v }; return c; }
      return [...p, { item_id, bodega_id, cantidad: v, empresa_id: profile.empresa_id, id: "tmp-" + Date.now() }];
    });
    try {
      await upsertRow("stock", profile.empresa_id, { item_id, bodega_id, cantidad: v }, "item_id,bodega_id");
    } catch (e) {
      setStock((p) => p.map((s) => (s.item_id === item_id && s.bodega_id === bodega_id ? { ...s, cantidad: previo } : s)));
      setError("No se pudo guardar el stock: " + e.message);
    }
  }

  function totalItem(item_id) { return bodegas.reduce((s, b) => s + (stockMap.get(skey(item_id, b.id)) || 0), 0); }
  function valorBodega(b) { return items.reduce((s, i) => s + (stockMap.get(skey(i.id, b.id)) || 0) * (i.precio || 0), 0); }
  const valorTotal = items.reduce((s, i) => s + totalItem(i.id) * (i.precio || 0), 0);

  if (bodegas.length === 0) return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero crea bodegas en la pestaña <strong>Bodegas</strong>.</Empty></Card>;
  if (items.length === 0) return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero carga ítems en <strong>Inventario</strong>.</Empty></Card>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bodegas.length + 1, 5)},1fr)`, gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Valor Total Flota</div>
          <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.gold, marginTop: 6 }}>{clp(valorTotal)}</div>
        </Card>
        {bodegas.slice(0, 4).map((b) => (
          <Card key={b.id} style={{ padding: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{b.nombre}</div>
            <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: b.tipo === "a_bordo" ? C.cyan : C.steel, marginTop: 6 }}>{clp(valorBodega(b))}</div>
            <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>{b.tipo === "a_bordo" ? "a bordo" : "tierra"}</div>
          </Card>))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead><tr>
              <th style={thStyle}>Código</th><th style={thStyle}>Descripción</th>
              {bodegas.map((b) => <th key={b.id} style={{ ...thStyle, textAlign: "center" }}>{b.codigo.replace("BOD-", "")}</th>)}
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Mín</th><th style={thStyle}>Estado</th>
            </tr></thead>
            <tbody>
              {items.map((i) => {
                const t = totalItem(i.id);
                const st = t <= i.stock_min ? ["red", "Bajo"] : t <= i.stock_min * 1.5 ? ["yellow", "Revisar"] : ["green", "OK"];
                return (
                  <tr key={i.id}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", color: C.steel, fontWeight: 600 }}>{i.codigo}</td>
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>{i.descripcion}</td>
                    {bodegas.map((b) => (
                      <td key={b.id} style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="number" value={stockMap.get(skey(i.id, b.id)) || 0} disabled={!puedeOperar}
                          onChange={(e) => setCantidad(i.id, b.id, e.target.value)}
                          style={{ ...bluInput, width: 60, textAlign: "center" }} />
                      </td>))}
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{t}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{i.stock_min}</td>
                    <td style={tdStyle}><Pill tone={st[0]}>{st[1]}</Pill></td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ TAB · MOVIMIENTOS ============================ */
function TabMovimientos({ profile, items, bodegas, ots, movimientos, stockMap, itemDesc, whName, recargar, setError }) {
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
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
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

/* ============================ TAB · COMPRAS ============================ */
function TabCompras({ profile, items, bodegas, compras, comprasItems, stockMap, itemDesc, itemPrecio, whName, recargar, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ proveedor: "", bodega_destino: bodegas[0]?.id || "", lead_dias: 7, items: [] });
  const [line, setLine] = useState({ item_id: "", cantidad: 1 });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const puedeAprobar = isAdmin(profile?.rol);

  // Sugerencias de reposición: ítems bajo mínimo (total)
  const totalItem = (id) => bodegas.reduce((s, b) => s + (stockMap.get(skey(id, b.id)) || 0), 0);
  const sugerencias = items.map((i) => ({ ...i, total: totalItem(i.id) })).filter((i) => i.total <= i.stock_min)
    .map((i) => ({ ...i, sugerido: Math.max((i.stock_max || 0) - i.total, 1) }));

  const ocTotal = (oc) => comprasItems.filter((it) => it.compra_id === oc.id).reduce((s, it) => s + (it.cantidad || 0) * (it.precio || 0), 0);
  const ocItemsList = (oc) => comprasItems.filter((it) => it.compra_id === oc.id);
  const pendiente = compras.filter((o) => o.estado !== "recibida").reduce((s, o) => s + ocTotal(o), 0);

  function addLine() {
    if (!line.item_id) return;
    setForm((f) => ({ ...f, items: [...f.items, { item_id: line.item_id, cantidad: line.cantidad, precio: itemPrecio(line.item_id) }] }));
    setLine({ item_id: "", cantidad: 1 });
  }
  function rmLine(idx) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  async function crearOC() {
    if (!form.proveedor.trim() || form.items.length === 0) { setError("Indica proveedor y al menos un ítem."); return; }
    const folio = `OC-${String(compras.length + 1).padStart(3, "0")}`;
    try {
      const cab = await insertRow("compras", profile.empresa_id, {
        folio, proveedor: form.proveedor.trim(), bodega_destino: form.bodega_destino,
        lead_dias: form.lead_dias, estado: "solicitada", fecha: HOY(), created_by: profile.id,
      });
      for (const it of form.items) {
        await insertRow("compras_items", profile.empresa_id, {
          compra_id: cab.id, item_id: it.item_id, cantidad: it.cantidad, precio: it.precio,
        });
      }
      logActivity(profile, "Crear OC", `${folio} · ${form.proveedor} · ${form.items.length} ítems`);
      setForm({ proveedor: "", bodega_destino: bodegas[0]?.id || "", lead_dias: 7, items: [] });
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

  const estTone = { solicitada: "slate", aprobada: "purple", enviada: "steel", recibida: "green" };
  const estLabel = { solicitada: "Solicitada", aprobada: "Aprobada", enviada: "Enviada", recibida: "Recibida" };

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
              <div key={s.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", fontSize: 12 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Bodega destino"><select value={form.bodega_destino} onChange={(e) => setForm({ ...form, bodega_destino: e.target.value })} style={inputStyle()}>
              {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select></Field>
            <Field label="Lead días"><input type="number" value={form.lead_dias} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} /></Field>
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
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 12 }}>
              {form.items.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 6px", borderBottom: idx < form.items.length - 1 ? `1px solid ${C.foam}` : "none", fontSize: 12.5 }}>
                  <span>{itemDesc(it.item_id)} · <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{it.cantidad} × {clp(it.precio)}</span></span>
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

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Ítems</th><th style={thStyle}>Destino</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th><th style={{ ...thStyle, textAlign: "center" }}>Lead</th>
              <th style={thStyle}>Estado</th><th style={thStyle}>Acción</th>{puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {compras.length === 0 ? <tr><td colSpan={puedeBorrar ? 10 : 9}><Empty>Sin órdenes de compra.</Empty></td></tr> :
                compras.map((o) => {
                  const its = ocItemsList(o);
                  return (
                    <tr key={o.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{o.folio}</td>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.fecha}</td>
                      <td style={tdStyle}>{o.proveedor}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: C.slate, maxWidth: 240 }}>{its.map((it) => `${it.cantidad}× ${itemDesc(it.item_id)}`).join(", ")}</td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>{whName(o.bodega_destino)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(ocTotal(o))}</td>
                      <td style={{ ...tdStyle, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.lead_dias}d</td>
                      <td style={tdStyle}><Pill tone={estTone[o.estado]}>{estLabel[o.estado]}</Pill></td>
                      <td style={tdStyle}>{o.estado !== "recibida" && puedeAprobar ? (
                        <button onClick={() => avanzar(o)} style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}>
                          {o.estado === "solicitada" ? "Aprobar" : o.estado === "aprobada" ? "Enviar" : "Recibir →"}
                        </button>
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
