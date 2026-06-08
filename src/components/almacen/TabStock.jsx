import React, { useState, useMemo } from "react";
import { Search, List, FolderTree, Layers, ChevronRight, ChevronDown, X, Check, Pencil, AlertCircle } from "lucide-react";
import { updateRow, upsertRow } from "../../lib/db";
import { buildEquipoTree } from "../../lib/equipTree";
import { useArbolColapsable, EquipoNodoLabel, fondoTipo } from "../../lib/arbolColapsable";
import { estadoStock as estadoStockOf } from "../../lib/stock";
import { C, archivo, clp, canOperate, tint } from "../../theme";
import { Card, Pill, inputStyle, bluInput, thStyle, tdStyle, Empty } from "../../ui";
import { skey } from "./util";

export default function TabStock({ profile, items, setItems, bodegas, stockMap, stock, setStock, setError, onReponer, equipos = [], destinos = [], embarcaciones = [] }) {
  const puedeOperar = canOperate(profile?.rol);
  const [stockEdit, setStockEdit] = useState({ item_id: null, bodega_id: null, valor: "" });
  const [descEdit, setDescEdit]   = useState({ id: null, valor: "" });
  const [filtroSt, setFiltroSt]   = useState("all");
  const [filtroABC, setFiltroABC] = useState("all");
  const [busqueda, setBusqueda]   = useState("");
  const [vista, setVista]         = useState("plano");      // plano | categoria | jerarquia
  const [gruposCol, setGruposCol] = useState(() => new Set());

  // ── Stock ────────────────────────────────────────────────────
  async function setCantidad(item_id, bodega_id, v) {
    const previo = stockMap.get(skey(item_id, bodega_id)) || 0;
    if (v === previo) return;
    setStock((p) => {
      const idx = p.findIndex((s) => s.item_id === item_id && s.bodega_id === bodega_id);
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], cantidad: v }; return c; }
      return [...p, { item_id, bodega_id, cantidad: v, empresa_id: profile.empresa_id, id: "tmp-" + Date.now() }];
    });
    try {
      await upsertRow("stock", profile.empresa_id, { item_id, bodega_id, cantidad: v }, "item_id,bodega_id");
    } catch (e) {
      setStock((p) => p.map((s) => s.item_id === item_id && s.bodega_id === bodega_id ? { ...s, cantidad: previo } : s));
      setError("No se pudo guardar el stock: " + e.message);
    }
  }
  function iniciarEditStock(item_id, bodega_id) {
    setStockEdit({ item_id, bodega_id, valor: String(stockMap.get(skey(item_id, bodega_id)) || 0) });
  }
  async function confirmarStock() {
    const { item_id, bodega_id, valor } = stockEdit;
    const v = Math.max(0, +valor || 0);
    setStockEdit({ item_id: null, bodega_id: null, valor: "" });
    await setCantidad(item_id, bodega_id, v);
  }
  function cancelarStock() { setStockEdit({ item_id: null, bodega_id: null, valor: "" }); }

  // ── Mínimo crítico por bodega (stock.stock_min) ──────────────
  const minMap = useMemo(() => {
    const m = new Map();
    stock.forEach((s) => { if (s.stock_min != null) m.set(skey(s.item_id, s.bodega_id), Number(s.stock_min) || 0); });
    return m;
  }, [stock]);

  async function setMinBodega(item_id, bodega_id, v) {
    const previo = minMap.get(skey(item_id, bodega_id)) || 0;
    if (v === previo) return;
    setStock((p) => {
      const idx = p.findIndex((s) => s.item_id === item_id && s.bodega_id === bodega_id);
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], stock_min: v }; return c; }
      return [...p, { item_id, bodega_id, cantidad: 0, stock_min: v, empresa_id: profile.empresa_id, id: "tmp-" + Date.now() }];
    });
    try {
      await upsertRow("stock", profile.empresa_id, { item_id, bodega_id, stock_min: v }, "item_id,bodega_id");
    } catch (e) {
      setStock((p) => p.map((s) => s.item_id === item_id && s.bodega_id === bodega_id ? { ...s, stock_min: previo } : s));
      setError("No se pudo guardar el mínimo: " + e.message);
    }
  }

  // ── Descripción ──────────────────────────────────────────────
  function iniciarEditDesc(id, valorActual) { setDescEdit({ id, valor: valorActual }); }
  function cancelarDesc() { setDescEdit({ id: null, valor: "" }); }
  async function confirmarDesc(id) {
    const nuevo = descEdit.valor.trim();
    if (!nuevo) { setError("La descripción no puede quedar vacía."); return; }
    const previo = items.find((i) => i.id === id)?.descripcion;
    setItems((p) => p.map((i) => i.id === id ? { ...i, descripcion: nuevo } : i));
    setDescEdit({ id: null, valor: "" });
    try { await updateRow("inventario_items", id, { descripcion: nuevo }); }
    catch (e) { setItems((p) => p.map((i) => i.id === id ? { ...i, descripcion: previo } : i)); setError("No se pudo guardar: " + e.message); }
  }

  function totalItem(item_id) { return bodegas.reduce((s, b) => s + (stockMap.get(skey(item_id, b.id)) || 0), 0); }
  function valorBodega(b) { return items.reduce((s, i) => s + (stockMap.get(skey(i.id, b.id)) || 0) * (i.precio || 0), 0); }
  const valorTotal = items.reduce((s, i) => s + totalItem(i.id) * (i.precio || 0), 0);

  const btnConfirm = { background: C.green, border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", padding: "2px 6px", display: "flex", alignItems: "center" };
  const btnCancel  = { background: "none", border: `1px solid ${C.line}`, borderRadius: 5, cursor: "pointer", color: C.slate, padding: "2px 6px", display: "flex", alignItems: "center" };
  const btnEdit    = { background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2, opacity: 0.45, lineHeight: 1 };

  // ABC calculado localmente con los datos disponibles en Almacén
  const conABC = (() => {
    const enr = items.map((i) => ({ ...i, val: totalItem(i.id) * (i.precio || 0) })).sort((a, b) => b.val - a.val);
    const tot = enr.reduce((s, x) => s + x.val, 0);
    let cum = 0;
    return new Map(enr.map((x) => { cum += x.val; const p = tot ? cum / tot : 0; return [x.id, p <= 0.8 ? "A" : p <= 0.95 ? "B" : "C"]; }));
  })();

  // Estado de stock (lib/stock): total en toda la flota; sin mínimo no marca
  // "Bajo" salvo máximo = 1. Consistente con Inventario.
  const estadoStock = (i) => estadoStockOf(totalItem(i.id), i.stock_min, i.stock_max);

  const itemsFiltrados = items.filter((i) => {
    const q  = busqueda.toLowerCase();
    return (filtroSt === "all" || estadoStock(i).key === filtroSt)
      && (filtroABC === "all" || conABC.get(i.id) === filtroABC)
      && (!q || i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q) || (i.proveedor || "").toLowerCase().includes(q));
  });
  const hayFiltro = filtroSt !== "all" || filtroABC !== "all" || !!busqueda;
  const NCOLS = 7 + bodegas.length; // Código, ABC, Categoría, Descripción, [bodegas], Total, Mín, Nivel

  // ── Agrupaciones (consistente con Inventario) ────────────────
  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "";
  const toggleGrupo = (k) => setGruposCol((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const gruposCategoria = () => {
    const m = new Map();
    itemsFiltrados.forEach((i) => { const k = i.categoria || "— Sin categoría"; if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([k, its]) => ({ key: "cat:" + k, label: k, items: its }));
  };
  const itemsDeEqDirect = (eqId) => itemsFiltrados.filter((i) => destinos.some((d) => d.item_id === i.id && d.equipo_id === eqId));
  const eqById = new Map(equipos.map((e) => [e.id, e]));
  const relevante = new Set();
  itemsFiltrados.forEach((i) => destinos.filter((d) => d.item_id === i.id).forEach((d) => {
    let cur = eqById.get(d.equipo_id);
    while (cur && !relevante.has(cur.id)) { relevante.add(cur.id); cur = cur.parent_id ? eqById.get(cur.parent_id) : null; }
  }));
  const treeJerarquia = buildEquipoTree(equipos).filter((eq) => relevante.has(eq.id));
  const arbolInv = useArbolColapsable(treeJerarquia); // colapso por nodo (como Registro de Equipos)
  const sinAsignar = itemsFiltrados.filter((i) => !destinos.some((d) => d.item_id === i.id));

  if (bodegas.length === 0) return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero crea bodegas en la pestaña <strong>Bodegas</strong>.</Empty></Card>;
  if (items.length === 0)   return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero carga ítems en <strong>Inventario</strong>.</Empty></Card>;

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
          </Card>
        ))}
      </div>

      {/* ── Filtros + vista (consistente con Inventario) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {/* Fila 1: buscador + toggle de vista */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
            <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar código, descripción, categoría o proveedor…"
              style={{ ...inputStyle(), width: "100%", paddingLeft: 32, fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {[["plano", "Plano", List], ["categoria", "Categoría", FolderTree], ["jerarquia", "Jerarquía", Layers]].map(([v, lbl, Ico]) => (
              <button key={v} onClick={() => setVista(v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", borderLeft: v !== "plano" ? `1px solid ${C.line}` : "none", background: vista === v ? C.steel : "#fff", color: vista === v ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <Ico size={14} /> {lbl}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>{itemsFiltrados.length} de {items.length} ítems</span>
          {hayFiltro && (
            <button onClick={() => { setBusqueda(""); setFiltroSt("all"); setFiltroABC("all"); }}
              style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: "none", color: C.slate, fontSize: 12, cursor: "pointer" }}>
              <X size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Limpiar
            </button>
          )}
        </div>
        {/* Fila 2: ABC + estado de stock */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>ABC</span>
          {[["all", "Todos", C.slate], ["A", "A", C.red], ["B", "B", C.amber], ["C", "C", C.green]].map(([v, lbl, tone]) => {
            const active = filtroABC === v;
            return <button key={v} onClick={() => setFiltroABC(v)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${active ? tone : C.line}`, background: active ? tone : "#fff", color: active ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{lbl}</button>;
          })}
          <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 4px" }} />
          <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Stock</span>
          {[["all", "Todos"], ["bajo", "Bajo mínimo"], ["revisar", "Por revisar"], ["ok", "OK"]].map(([v, lbl]) => {
            const tone = v === "bajo" ? C.red : v === "revisar" ? C.amber : v === "ok" ? C.green : C.slate;
            const active = filtroSt === v;
            const n = v === "all" ? null : items.filter((i) => estadoStock(i).key === v).length;
            return <button key={v} onClick={() => setFiltroSt(v)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${active ? tone : C.line}`, background: active ? tone : "#fff", color: active ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{lbl}{n != null && <span style={{ opacity: 0.75, marginLeft: 4, fontSize: 11 }}>({n})</span>}</button>;
          })}
        </div>
        {/* Colapsar/expandir todo en vistas agrupadas */}
        {vista !== "plano" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { vista === "categoria" ? setGruposCol(new Set(gruposCategoria().map((x) => x.key))) : arbolInv.colapsarTodo(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronRight size={13} /> Colapsar todo</button>
            <button onClick={() => { vista === "categoria" ? setGruposCol(new Set()) : arbolInv.colapsarTodo(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronDown size={13} /> Expandir todo</button>
          </div>
        )}
      </div>

      {puedeOperar && (
        <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8 }}>
          En cada bodega: <strong style={{ color: C.ink }}>número grande</strong> = stock actual ·
          {" "}<span style={{ border: `1px solid ${C.line}`, borderRadius: 4, padding: "0 4px" }}>número pequeño</span> = mínimo crítico de esa bodega (ej. 2-3 a bordo, 1-2 en tierra). La celda se marca en rojo si el stock cae bajo ese mínimo.
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead><tr>
              <th style={thStyle}>Código</th>
              <th style={{ ...thStyle, textAlign: "center" }}>ABC</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Descripción</th>
              {bodegas.map((b) => <th key={b.id} style={{ ...thStyle, textAlign: "center" }}>{b.codigo.replace("BOD-", "")}</th>)}
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Mín</th>
              <th style={thStyle}>Nivel de Stock</th>
            </tr></thead>
            <tbody>
              {(() => {
                const filaItem = (i, indent = 0) => {
                const t = totalItem(i.id);
                const st = estadoStock(i);
                return (
                  <tr key={i.id}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", color: C.steel, fontWeight: 600, paddingLeft: 12 + indent }}>{i.codigo}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <Pill tone={{ A: "red", B: "yellow", C: "green" }[conABC.get(i.id)]}>{conABC.get(i.id)}</Pill>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: C.slate }}>{i.categoria || <span style={{ opacity: 0.35 }}>—</span>}</td>

                    {/* Descripción editable */}
                    <td style={{ ...tdStyle, fontSize: 12.5 }}>
                      {descEdit.id === i.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input value={descEdit.valor} autoFocus
                            onChange={(e) => setDescEdit((p) => ({ ...p, valor: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") confirmarDesc(i.id); if (e.key === "Escape") cancelarDesc(); }}
                            style={{ ...inputStyle(180), fontSize: 12.5 }} />
                          <button onClick={() => confirmarDesc(i.id)} title="Confirmar" style={btnConfirm}><Check size={12} strokeWidth={2.5} /></button>
                          <button onClick={cancelarDesc} title="Cancelar" style={btnCancel}><X size={12} /></button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{i.descripcion}</span>
                          {puedeOperar && <button onClick={() => iniciarEditDesc(i.id, i.descripcion)} title="Editar descripción" style={btnEdit}><Pencil size={12} /></button>}
                        </div>
                      )}
                    </td>

                    {/* Celdas de stock por bodega con confirmación */}
                    {bodegas.map((b) => {
                      const editando = stockEdit.item_id === i.id && stockEdit.bodega_id === b.id;
                      const cantidad = stockMap.get(skey(i.id, b.id)) || 0;
                      const minBod   = minMap.get(skey(i.id, b.id)) || 0;
                      const bajoMin  = minBod > 0 && cantidad < minBod;
                      return (
                        <td key={b.id} style={{ ...tdStyle, textAlign: "center", background: bajoMin ? tint(C.red, 8) : undefined }}>
                          {puedeOperar && editando ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                              <input type="number" value={stockEdit.valor} autoFocus
                                onChange={(e) => setStockEdit((p) => ({ ...p, valor: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") confirmarStock(); if (e.key === "Escape") cancelarStock(); }}
                                style={{ ...bluInput, width: 54, textAlign: "center" }} />
                              <button onClick={confirmarStock} title="Confirmar" style={btnConfirm}><Check size={12} strokeWidth={2.5} /></button>
                              <button onClick={cancelarStock} title="Cancelar" style={btnCancel}><X size={12} /></button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: bajoMin ? C.red : C.ink }}>{cantidad}</span>
                                {puedeOperar && <button onClick={() => iniciarEditStock(i.id, b.id)} title="Editar stock" style={btnEdit}><Pencil size={11} /></button>}
                              </div>
                              {puedeOperar && (
                                <input type="number" min={0} defaultValue={minBod}
                                  title={`Stock mínimo crítico en ${b.nombre} (${b.tipo === "a_bordo" ? "a bordo" : "tierra"})`}
                                  onBlur={(e) => setMinBodega(i.id, b.id, Math.max(0, +e.target.value || 0))}
                                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  style={{ width: 44, textAlign: "center", fontSize: 10, color: C.slate, border: `1px solid ${C.line}`, borderRadius: 4, padding: "0 2px", background: "#fff" }} />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{t}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{i.stock_min}</td>
                    <td style={{ ...tdStyle, minWidth: 140 }}>
                      <NivelBar total={t} min={i.stock_min} max={i.stock_max} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        {puedeOperar && (
                          <button onClick={() => onReponer(i)} title="Crear OC para reponer este ítem"
                            style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 4, border: `1px solid ${C.cyan}`, background: "none", color: C.cyan, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                            ↑ Reponer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                };
                const vacio = <tr><td colSpan={NCOLS} style={{ textAlign: "center", padding: 24, color: C.slate, fontSize: 13 }}>Sin ítems para los filtros seleccionados.</td></tr>;

                if (vista === "plano") return itemsFiltrados.length ? itemsFiltrados.map((i) => filaItem(i)) : vacio;

                if (vista === "categoria") {
                  const grupos = gruposCategoria();
                  if (!grupos.length) return vacio;
                  return grupos.map((g) => {
                    const col = gruposCol.has(g.key);
                    const valorG = g.items.reduce((s, i) => s + totalItem(i.id) * (i.precio || 0), 0);
                    return (
                      <React.Fragment key={g.key}>
                        <tr onClick={() => toggleGrupo(g.key)} style={{ cursor: "pointer", background: tint(C.steel, 8) }}>
                          <td colSpan={NCOLS} style={{ ...tdStyle, padding: "8px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {col ? <ChevronRight size={15} color={C.steel} /> : <ChevronDown size={15} color={C.steel} />}
                              <span style={{ fontWeight: 700, color: C.abyss }}>{g.label}</span>
                              <span style={{ fontSize: 11.5, color: C.slate }}>· {g.items.length} ítem{g.items.length > 1 ? "s" : ""}</span>
                              <span style={{ marginLeft: "auto", fontSize: 12.5, color: C.steel, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{clp(valorG)}</span>
                            </div>
                          </td>
                        </tr>
                        {!col && g.items.map((i) => filaItem(i))}
                      </React.Fragment>
                    );
                  });
                }

                // ── Vista por jerarquía (árbol anidado de equipos → repuestos) ──
                if (!treeJerarquia.length && !sinAsignar.length) return vacio;
                const filasArbol = treeJerarquia.filter((eq) => arbolInv.visible(eq)).map((eq) => {
                  const directos = itemsDeEqDirect(eq.id);
                  const expandible = arbolInv.tieneHijos(eq) || directos.length > 0;
                  const col = arbolInv.estaColapsado(eq);
                  const valorN = directos.reduce((s, i) => s + totalItem(i.id) * (i.precio || 0), 0);
                  return (
                    <React.Fragment key={eq.id}>
                      <tr onClick={() => expandible && arbolInv.toggle(eq.id)} style={{ cursor: expandible ? "pointer" : "default", background: fondoTipo(eq) }}>
                        <td colSpan={NCOLS} style={{ ...tdStyle, padding: "7px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <EquipoNodoLabel eq={eq} tieneHijos={expandible} colapsado={col} onToggle={() => arbolInv.toggle(eq.id)} nSub={0} embName={embName} showEmb={eq.depth === 0} />
                            {directos.length > 0 && <span style={{ fontSize: 11.5, color: C.cyan, fontWeight: 700, whiteSpace: "nowrap" }}>· {directos.length} repuesto{directos.length > 1 ? "s" : ""}</span>}
                            {directos.length > 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: C.steel, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{clp(valorN)}</span>}
                          </div>
                        </td>
                      </tr>
                      {!col && directos.map((i) => filaItem(i, eq.depth * 18 + 26))}
                    </React.Fragment>
                  );
                });
                const filaSin = sinAsignar.length > 0 && (() => {
                  const col = gruposCol.has("sin");
                  return (
                    <React.Fragment key="sin">
                      <tr onClick={() => toggleGrupo("sin")} style={{ cursor: "pointer", background: tint(C.amber, 10) }}>
                        <td colSpan={NCOLS} style={{ ...tdStyle, padding: "7px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {col ? <ChevronRight size={15} color={C.amber} /> : <ChevronDown size={15} color={C.amber} />}
                            <span style={{ fontWeight: 700, color: C.abyss }}>Sin asignar a equipo</span>
                            <span style={{ fontSize: 11.5, color: C.slate }}>· {sinAsignar.length} ítem{sinAsignar.length > 1 ? "s" : ""}</span>
                          </div>
                        </td>
                      </tr>
                      {!col && sinAsignar.map((i) => filaItem(i, 26))}
                    </React.Fragment>
                  );
                })();
                return <>{filasArbol}{filaSin}</>;
                })()}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Barra visual de nivel de stock ─────────────────────────── */
function NivelBar({ total, min, max }) {
  const cap    = (max > 0 && max > min) ? max : Math.max(min * 2, total * 1.2, 1);
  const pct    = Math.min(100, cap > 0 ? (total / cap) * 100 : 0);
  const minPct = Math.min(99,  cap > 0 ? (min   / cap) * 100 : 0);
  const color  = total <= min ? C.red : total <= min * 1.5 ? C.amber : C.green;
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ height: 8, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s ease" }} />
        {min > 0 && (
          <div title={`Mínimo: ${min}`}
            style={{ position: "absolute", top: -3, left: `${minPct}%`, transform: "translateX(-50%)", width: 2, height: 14, background: C.slate, borderRadius: 1, opacity: 0.55 }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, marginTop: 2 }}>
        <span style={{ color, fontWeight: 700 }}>{total}</span>
        <span style={{ color: C.slate, opacity: 0.6 }}>máx {cap}</span>
      </div>
    </div>
  );
}
