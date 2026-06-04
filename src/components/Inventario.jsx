import React, { useEffect, useState, useCallback } from "react";
import { Package, Plus, Trash2, Download, Anchor, X, Pencil, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, clp, isAdmin, canOperate } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

const CATEGORIAS = [
  "Lubricantes",
  "Filtros",
  "Repuestos Motor",
  "Repuestos Hidráulico",
  "Repuestos Propulsión",
  "Eléctrico / Electrónico",
  "Seguridad y EPP",
  "Consumibles",
  "Herramientas",
  "Correas y Fajas",
  "Rodamientos",
  "Sellos y Juntas",
  "Sistema de Enfriamiento",
  "Mangueras y Tuberías",
  "Combustible y Aditivos",
  "Pintura y Anticorrosivo",
  "Estructural / Casco",
];

export default function Inventario() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [destinoPanel, setDestinoPanel] = useState(null); // item_id | null
  const [filtroCat, setFiltroCat] = useState("all");
  const [codigoEdit, setCodigoEdit] = useState({ id: null, valor: "" });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { codigo: "", descripcion: "", categoria: "", unidad: "Un", stock_min: 0, stock_max: 0, precio: 0, proveedor: "", lead_dias: 7, equipoIds: [] };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [its, stk, embs, eqs, dests] = await Promise.all([
        fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
        fetchAll("stock"),
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("inventario_item_destinos"),
      ]);
      setItems(its); setStockEntries(stk); setEmbarcaciones(embs); setEquipos(eqs); setDestinos(dests);
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

  const categoriasUsadas = [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort();
  const tablaFiltrada = filtroCat === "all" ? conABC : conABC.filter((i) => i.categoria === filtroCat);

  // ── Destinos ─────────────────────────────────────────────────
  function destinosDeItem(itemId) { return destinos.filter((d) => d.item_id === itemId); }
  function embColor(embId) { return embarcaciones.find((e) => e.id === embId)?.color || C.steel; }

  async function agregarDestino(itemId, equipoId) {
    if (destinos.some((d) => d.item_id === itemId && d.equipo_id === equipoId)) return;
    try {
      const nuevo = await insertRow("inventario_item_destinos", profile.empresa_id, { item_id: itemId, equipo_id: equipoId });
      setDestinos((p) => [...p, nuevo]);
    } catch (e) { setError("No se pudo asignar destino: " + e.message); }
  }

  async function quitarDestino(destinoId) {
    const respaldo = destinos;
    setDestinos((p) => p.filter((d) => d.id !== destinoId));
    try { await deleteRow("inventario_item_destinos", destinoId); }
    catch (e) { setDestinos(respaldo); setError("No se pudo quitar destino: " + e.message); }
  }

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
      if (form.equipoIds.length > 0) {
        const dests = await Promise.all(
          form.equipoIds.map((eqId) => insertRow("inventario_item_destinos", profile.empresa_id, { item_id: nuevo.id, equipo_id: eqId }))
        );
        setDestinos((p) => [...p, ...dests]);
      }
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

  function iniciarEditCodigo(id, valorActual) {
    setCodigoEdit({ id, valor: valorActual });
    setError(null);
  }
  function cancelarCodigo() { setCodigoEdit({ id: null, valor: "" }); }
  async function confirmarCodigo(id) {
    const nuevo = codigoEdit.valor.trim().toUpperCase();
    if (!nuevo) { setError("El código no puede quedar vacío."); return; }
    if (items.some((i) => i.codigo === nuevo && i.id !== id)) { setError(`El código "${nuevo}" ya existe en otro ítem.`); return; }
    const previo = items.find((i) => i.id === id)?.codigo;
    setItems((p) => p.map((i) => i.id === id ? { ...i, codigo: nuevo } : i));
    setCodigoEdit({ id: null, valor: "" });
    try { await updateRow("inventario_items", id, { codigo: nuevo }); logActivity(profile, "Editar código", `${previo} → ${nuevo}`); }
    catch (e) { setItems((p) => p.map((i) => i.id === id ? { ...i, codigo: previo } : i)); setError("No se pudo actualizar: " + e.message); }
  }

  async function eliminar(id) {
    const it = items.find((i) => i.id === id);
    if (!window.confirm(`¿Eliminar "${it?.descripcion}"? Se borrará también su stock en todas las bodegas.`)) return;
    const respaldo = items;
    setItems((p) => p.filter((i) => i.id !== id));
    setDestinos((p) => p.filter((d) => d.item_id !== id));
    if (destinoPanel === id) setDestinoPanel(null);
    try { await deleteRow("inventario_items", id); logActivity(profile, "Eliminar ítem", `${it?.codigo} · ${it?.descripcion}`); }
    catch (e) { setItems(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [
      ["Código", "ABC", "Descripción", "Categoría", "Unidad", "Stock Total", "Mín", "Máx", "Precio", "Valor", "Proveedor", "Lead días", "Destino (naves/equipos)"],
      ...conABC.map((i) => {
        const dests = destinosDeItem(i.id);
        const destinoStr = dests.map((d) => {
          const eq = equipos.find((e) => e.id === d.equipo_id);
          const emb = embarcaciones.find((e) => e.id === eq?.embarcacion_id);
          return `${emb?.nombre || "?"} / ${eq?.id_visible || "?"}`;
        }).join(" | ");
        return [i.codigo, i.abc, i.descripcion, i.categoria, i.unidad, i.total, i.stock_min, i.stock_max, i.precio, i.valor, i.proveedor, i.lead_dias, destinoStr];
      }),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "inventario.csv"; a.click();
  }

  const itemPanel = destinoPanel ? items.find((i) => i.id === destinoPanel) : null;

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

      {/* ── Filtro por categoría ── */}
      {categoriasUsadas.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <FilterBtn active={filtroCat === "all"} onClick={() => setFiltroCat("all")}>Todas</FilterBtn>
          {categoriasUsadas.map((cat) => (
            <FilterBtn key={cat} active={filtroCat === cat} onClick={() => setFiltroCat(cat)}>
              {cat} <span style={{ opacity: 0.6, fontSize: 10.5 }}>({conABC.filter((i) => i.categoria === cat).length})</span>
            </FilterBtn>
          ))}
        </div>
      )}

      {/* ── Formulario nuevo ítem ── */}
      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Ítem de Inventario</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            <Field label="Código"><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="INS-001" /></Field>
            <Field label="Descripción" span={2}><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Categoría">
              <input value={form.categoria} list="inv-categorias" onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={inputStyle()} placeholder="Seleccionar o escribir…" />
            </Field>
            <Field label="Unidad"><input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Stock mín"><input type="number" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: +e.target.value })} style={bluInput} /></Field>
            <Field label="Stock máx"><input type="number" value={form.stock_max} onChange={(e) => setForm({ ...form, stock_max: +e.target.value })} style={bluInput} /></Field>
            <Field label="Precio"><input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: +e.target.value })} style={bluInput} /></Field>
            <Field label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Lead días"><input type="number" value={form.lead_dias} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} /></Field>
          </div>

          {equipos.length > 0 && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                Destino · Nave & Equipo <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                {embarcaciones.map((emb) => {
                  const eqsNave = buildEquipoTree(equipos.filter((eq) => eq.embarcacion_id === emb.id));
                  if (!eqsNave.length) return null;
                  return (
                    <div key={emb.id} style={{ minWidth: 170 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: emb.color || C.steel, marginBottom: 7, display: "flex", alignItems: "center", gap: 5, borderBottom: `2px solid ${emb.color || C.steel}`, paddingBottom: 4 }}>
                        <Anchor size={12} /> {emb.nombre}
                      </div>
                      {eqsNave.map((eq) => (
                        <label key={eq.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.ink, marginBottom: 5, cursor: "pointer", paddingLeft: eq.depth * 14 }}>
                          <input type="checkbox"
                            checked={form.equipoIds.includes(eq.id)}
                            onChange={(e) => setForm((f) => ({
                              ...f, equipoIds: e.target.checked ? [...f.equipoIds, eq.id] : f.equipoIds.filter((id) => id !== eq.id),
                            }))}
                          />
                          {eq.depth > 0 && <span style={{ color: C.slate, fontSize: 11 }}>└─</span>}
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: C.slate, minWidth: 58 }}>{eq.id_visible}</span>
                          <span>{eq.sistema}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Guardar Ítem</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {/* ── Panel de destinos (editor inline) ── */}
      {itemPanel && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.steel}`, background: "#F8FAFD" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Asignar destino</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.abyss, marginTop: 2 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>{itemPanel.codigo}</span>
                {" · "}{itemPanel.descripcion}
              </div>
            </div>
            <button onClick={() => setDestinoPanel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 14 }}>
            Selecciona los equipos a los que está destinado este repuesto. Los cambios se guardan al instante.
          </div>
          {embarcaciones.length === 0 ? (
            <span style={{ fontSize: 12.5, color: C.slate }}>No hay embarcaciones registradas.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
              {embarcaciones.map((emb) => {
                const eqsNave = equipos.filter((eq) => eq.embarcacion_id === emb.id);
                if (!eqsNave.length) return null;
                const itemDests = destinosDeItem(destinoPanel);
                return (
                  <div key={emb.id} style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: emb.color || C.steel, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, borderBottom: `2px solid ${emb.color || C.steel}`, paddingBottom: 5 }}>
                      <Anchor size={13} /> {emb.nombre}
                    </div>
                    {eqsNave.map((eq) => {
                      const destino = itemDests.find((d) => d.equipo_id === eq.id);
                      return (
                        <label key={eq.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, marginBottom: 6, cursor: "pointer", paddingLeft: eq.depth * 14 }}>
                          <input type="checkbox"
                            checked={!!destino}
                            onChange={() => destino ? quitarDestino(destino.id) : agregarDestino(destinoPanel, eq.id)}
                          />
                          {eq.depth > 0 && <span style={{ color: C.slate, fontSize: 11, flexShrink: 0 }}>└─</span>}
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: C.slate, minWidth: 60 }}>{eq.id_visible}</span>
                          <span>{eq.sistema}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Tabla principal ── */}
      {items.length === 0 ? (
        <Card><Empty>
          <Package size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay ítems en el inventario. {puedeOperar ? "Agrega el primero para comenzar." : "Pide a un administrador que registre los repuestos."}
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead><tr>
                <th style={thStyle}>Código</th>
                <th style={{ ...thStyle, textAlign: "center" }}>ABC</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Categoría</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Stock</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Mín</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Máx</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Destino</th>
                {puedeBorrar && <th style={thStyle}></th>}
              </tr></thead>
              <tbody>
                {tablaFiltrada.map((i) => {
                  const abcTone = { A: "red", B: "yellow", C: "green" }[i.abc];
                  const st = i.total <= i.stock_min ? ["red", "Bajo"] : i.total <= i.stock_min * 1.5 ? ["yellow", "Revisar"] : ["green", "OK"];
                  const itemDests = destinosDeItem(i.id);
                  const isOpen = destinoPanel === i.id;
                  return (
                    <tr key={i.id} style={{ background: isOpen ? "#EFF6FF" : undefined }}>
                      <td style={tdStyle}>
                        {codigoEdit.id === i.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              value={codigoEdit.valor}
                              autoFocus
                              onChange={(e) => setCodigoEdit((p) => ({ ...p, valor: e.target.value.toUpperCase() }))}
                              onKeyDown={(e) => { if (e.key === "Enter") confirmarCodigo(i.id); if (e.key === "Escape") cancelarCodigo(); }}
                              style={{ ...inputStyle(80), fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.abyss, textTransform: "uppercase" }}
                            />
                            <button onClick={() => confirmarCodigo(i.id)}
                              title="Confirmar"
                              style={{ background: C.green, border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", padding: "3px 7px", display: "flex", alignItems: "center" }}>
                              <Check size={13} strokeWidth={2.5} />
                            </button>
                            <button onClick={cancelarCodigo}
                              title="Cancelar"
                              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 5, cursor: "pointer", color: C.slate, padding: "3px 7px", display: "flex", alignItems: "center" }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{i.codigo}</span>
                            {puedeOperar && (
                              <button onClick={() => iniciarEditCodigo(i.id, i.codigo)}
                                title="Editar código"
                                style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2, opacity: 0.45, lineHeight: 1 }}>
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={abcTone}>{i.abc}</Pill></td>
                      <td style={tdStyle}>
                        <input value={i.descripcion} disabled={!puedeOperar}
                          onChange={(e) => onChangeLocal(i.id, "descripcion", e.target.value)}
                          onBlur={(e) => commit(i.id, "descripcion", e.target.value)}
                          style={inputStyle(220)} />
                      </td>
                      <td style={tdStyle}>
                        <input value={i.categoria || ""} list="inv-categorias" disabled={!puedeOperar}
                          onChange={(e) => onChangeLocal(i.id, "categoria", e.target.value)}
                          onBlur={(e) => commit(i.id, "categoria", e.target.value)}
                          style={inputStyle(120)} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{i.total}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.stock_min} disabled={!puedeOperar}
                          onChange={(e) => onChangeLocal(i.id, "stock_min", +e.target.value)}
                          onBlur={(e) => commit(i.id, "stock_min", +e.target.value)}
                          style={{ ...bluInput, width: 60, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.stock_max} disabled={!puedeOperar}
                          onChange={(e) => onChangeLocal(i.id, "stock_max", +e.target.value)}
                          onBlur={(e) => commit(i.id, "stock_max", +e.target.value)}
                          style={{ ...bluInput, width: 60, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.precio} disabled={!puedeOperar}
                          onChange={(e) => onChangeLocal(i.id, "precio", +e.target.value)}
                          onBlur={(e) => commit(i.id, "precio", +e.target.value)}
                          style={{ ...bluInput, width: 90, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(i.valor)}</td>
                      <td style={tdStyle}><Pill tone={st[0]}>{st[1]}</Pill></td>

                      {/* Columna Destino */}
                      <td style={{ ...tdStyle, minWidth: 150 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                          {itemDests.slice(0, 3).map((d) => {
                            const eq = equipos.find((e) => e.id === d.equipo_id);
                            const color = embColor(eq?.embarcacion_id);
                            const embNombre = embarcaciones.find((emb) => emb.id === eq?.embarcacion_id)?.nombre || "";
                            return (
                              <span key={d.id}
                                title={`${embNombre} · ${eq?.sistema || ""}`}
                                style={{
                                  fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace",
                                  background: `${color}18`, color, border: `1px solid ${color}50`,
                                  borderRadius: 4, padding: "1px 6px", fontWeight: 700, whiteSpace: "nowrap",
                                }}>
                                {eq?.id_visible || "?"}
                              </span>
                            );
                          })}
                          {itemDests.length > 3 && (
                            <span style={{ fontSize: 10.5, color: C.slate }}>+{itemDests.length - 3}</span>
                          )}
                          {puedeOperar && (
                            <button onClick={() => setDestinoPanel(isOpen ? null : i.id)}
                              style={{
                                background: isOpen ? C.steel : "none",
                                color: isOpen ? "#fff" : C.slate,
                                border: `1px solid ${isOpen ? C.steel : C.line}`,
                                borderRadius: 4, cursor: "pointer", padding: "1px 8px",
                                fontSize: 11, lineHeight: 1.7, whiteSpace: "nowrap",
                              }}>
                              {isOpen ? "✕" : itemDests.length === 0 ? "+ Asignar" : "✎"}
                            </button>
                          )}
                        </div>
                      </td>

                      {puedeBorrar && (
                        <td style={tdStyle}>
                          <button onClick={() => eliminar(i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <datalist id="inv-categorias">
        {CATEGORIAS.map((c) => <option key={c} value={c} />)}
      </datalist>
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
