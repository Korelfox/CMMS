import React, { useEffect, useState, useCallback } from "react";
import { Package, Plus, Trash2, Download } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, clp, isAdmin, canOperate } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

export default function Inventario() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { codigo: "", descripcion: "", categoria: "", unidad: "Un", stock_min: 0, stock_max: 0, precio: 0, proveedor: "", lead_dias: 7 };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [its, stk] = await Promise.all([
        fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
        fetchAll("stock"),
      ]);
      setItems(its); setStockEntries(stk);
    } catch (e) { setError("No se pudo cargar el inventario. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function totalStock(itemId) {
    return stockEntries.filter((s) => s.item_id === itemId).reduce((sum, s) => sum + (Number(s.cantidad) || 0), 0);
  }

  // Cálculo ABC: 80% valor acumulado = A, 80-95% = B, 95-100% = C
  const enriquecidos = items
    .map((i) => { const total = totalStock(i.id); return { ...i, total, valor: total * (i.precio || 0) }; })
    .sort((a, b) => b.valor - a.valor);
  const totalValor = enriquecidos.reduce((s, x) => s + x.valor, 0);
  let cum = 0;
  const conABC = enriquecidos.map((x) => { cum += x.valor; const pct = totalValor ? cum / totalValor : 0; return { ...x, abc: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C" }; });

  async function crear() {
    if (!form.codigo.trim() || !form.descripcion.trim()) { setError("Código y descripción son obligatorios."); return; }
    try {
      const nuevo = await insertRow("inventario_items", profile.empresa_id, {
        codigo: form.codigo.trim().toUpperCase(), descripcion: form.descripcion.trim(),
        categoria: form.categoria.trim(), unidad: form.unidad, precio: form.precio,
        stock_min: form.stock_min, stock_max: form.stock_max,
        proveedor: form.proveedor.trim(), lead_dias: form.lead_dias,
      });
      setItems((p) => [...p, nuevo]);
      logActivity(profile, "Crear ítem inventario", `${nuevo.codigo} · ${nuevo.descripcion}`);
      setForm(blank()); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? "Ya existe un ítem con ese código." : "No se pudo crear: " + e.message);
    }
  }

  function onChangeLocal(id, c, v) { setItems((p) => p.map((i) => i.id === id ? { ...i, [c]: v } : i)); }
  async function commit(id, c, v) {
    const previo = items.find((i) => i.id === id)?.[c]; if (previo === v) return;
    onChangeLocal(id, c, v);
    try { await updateRow("inventario_items", id, { [c]: v }); }
    catch (e) { onChangeLocal(id, c, previo); setError("No se pudo guardar: " + e.message); }
  }

  async function eliminar(id) {
    const it = items.find((i) => i.id === id);
    if (!window.confirm(`¿Eliminar "${it?.descripcion}"? Se borrará también su stock en todas las bodegas.`)) return;
    const respaldo = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try { await deleteRow("inventario_items", id); logActivity(profile, "Eliminar ítem", `${it?.codigo} · ${it?.descripcion}`); }
    catch (e) { setItems(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [["Código", "ABC", "Descripción", "Categoría", "Unidad", "Stock Total", "Mín", "Máx", "Precio", "Valor", "Proveedor", "Lead días"],
      ...conABC.map((i) => [i.codigo, i.abc, i.descripcion, i.categoria, i.unidad, i.total, i.stock_min, i.stock_max, i.precio, i.valor, i.proveedor, i.lead_dias])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "inventario.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Repuestos" title="Inventario" /><Card><InlineSpinner label="Cargando inventario…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="ABC + Min-Máx · Libbrecht" title="Inventario de Repuestos"
        sub="Catálogo maestro de repuestos. Clase ABC automática según valor. El stock se gestiona en Almacén & Compras."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
          {puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Agregar Ítem</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <MiniStat label="Valor Total" value={clp(totalValor)} tone={C.gold} />
        <MiniStat label="Ítems Clase A" value={conABC.filter((x) => x.abc === "A").length} tone={C.red} sub="control estricto" />
        <MiniStat label="Bajo Mínimo" value={conABC.filter((x) => x.total <= x.stock_min).length} tone={C.red} />
        <MiniStat label="Total Ítems" value={items.length} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Ítem de Inventario</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            <Field label="Código"><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="INS-001" /></Field>
            <Field label="Descripción" span={2}><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Categoría"><input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={inputStyle()} placeholder="Lubricantes" /></Field>
            <Field label="Unidad"><input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Stock mín"><input type="number" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: +e.target.value })} style={bluInput} /></Field>
            <Field label="Stock máx"><input type="number" value={form.stock_max} onChange={(e) => setForm({ ...form, stock_max: +e.target.value })} style={bluInput} /></Field>
            <Field label="Precio"><input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: +e.target.value })} style={bluInput} /></Field>
            <Field label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Lead días"><input type="number" value={form.lead_dias} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Guardar Ítem</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><Empty>
          <Package size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay ítems en el inventario. {puedeOperar ? "Agrega el primero para comenzar." : "Pide a un administrador que registre los repuestos."}
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead><tr>
                <th style={thStyle}>Código</th><th style={{ ...thStyle, textAlign: "center" }}>ABC</th>
                <th style={thStyle}>Descripción</th><th style={thStyle}>Categoría</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Stock</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Mín</th><th style={{ ...thStyle, textAlign: "right" }}>Máx</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Precio</th><th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={thStyle}>Estado</th>{puedeBorrar && <th style={thStyle}></th>}
              </tr></thead>
              <tbody>
                {conABC.map((i) => {
                  const abcTone = { A: "red", B: "yellow", C: "green" }[i.abc];
                  const st = i.total <= i.stock_min ? ["red", "Bajo"] : i.total <= i.stock_min * 1.5 ? ["yellow", "Revisar"] : ["green", "OK"];
                  return (
                    <tr key={i.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{i.codigo}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={abcTone}>{i.abc}</Pill></td>
                      <td style={tdStyle}><input value={i.descripcion} disabled={!puedeOperar} onChange={(e) => onChangeLocal(i.id, "descripcion", e.target.value)} onBlur={(e) => commit(i.id, "descripcion", e.target.value)} style={inputStyle(220)} /></td>
                      <td style={tdStyle}><input value={i.categoria || ""} disabled={!puedeOperar} onChange={(e) => onChangeLocal(i.id, "categoria", e.target.value)} onBlur={(e) => commit(i.id, "categoria", e.target.value)} style={inputStyle(120)} /></td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{i.total}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={i.stock_min} disabled={!puedeOperar} onChange={(e) => onChangeLocal(i.id, "stock_min", +e.target.value)} onBlur={(e) => commit(i.id, "stock_min", +e.target.value)} style={{ ...bluInput, width: 60, textAlign: "right" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={i.stock_max} disabled={!puedeOperar} onChange={(e) => onChangeLocal(i.id, "stock_max", +e.target.value)} onBlur={(e) => commit(i.id, "stock_max", +e.target.value)} style={{ ...bluInput, width: 60, textAlign: "right" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={i.precio} disabled={!puedeOperar} onChange={(e) => onChangeLocal(i.id, "precio", +e.target.value)} onBlur={(e) => commit(i.id, "precio", +e.target.value)} style={{ ...bluInput, width: 90, textAlign: "right" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(i.valor)}</td>
                      <td style={tdStyle}><Pill tone={st[0]}>{st[1]}</Pill></td>
                      {puedeBorrar && <td style={tdStyle}><button onClick={() => eliminar(i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button></td>}
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
