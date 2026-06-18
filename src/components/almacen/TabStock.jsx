import React, { useState, useMemo, useEffect } from "react";
import { Search, List, FolderTree, Layers, ChevronRight, ChevronDown, X, Check, Pencil, AlertCircle, Columns3, Table2 } from "lucide-react";
import { updateRow, upsertRow } from "../../lib/db";
import { buildEquipoTree } from "../../lib/equipTree";
import { useArbolColapsable, EquipoNodoLabel, fondoTipo } from "../../lib/arbolColapsable";
import { estadoStock as estadoStockOf } from "../../lib/stock";
import { C, archivo, clp, canOperate, tint } from "../../theme";
import { Card, Pill, FilterBtn, inputStyle, bluInput, thStyle, tdStyle, Empty, Section, EmptyState } from "../../ui";
import InventarioKanban from "../inventario/InventarioKanban";
import InventarioQueuePanel from "../inventario/InventarioQueuePanel";
import AlmacenStockDetailPanel from "./AlmacenStockDetailPanel";
import { ordenarItemsInv } from "../../lib/inventarioKanban";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { skey } from "./util";

const VISTA_KEY = "cmms-almacen-stock-vista";
const VISTA_TABLA_KEY = "cmms-almacen-stock-tabla";
const VISTAS = [
  { id: "cola", label: "Cola", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "tabla", label: "Tabla", icon: Table2 },
];

export default function TabStock({ profile, items, setItems, bodegas, stockMap, stock, setStock, setError, onReponer, equipos = [], destinos = [], embarcaciones = [] }) {
  const puedeOperar = canOperate(profile?.rol);
  const [stockEdit, setStockEdit] = useState({ item_id: null, bodega_id: null, valor: "" });
  const [descEdit, setDescEdit]   = useState({ id: null, valor: "" });
  const [filtroSt, setFiltroSt]   = useState("all");
  const [filtroABC, setFiltroABC] = useState("all");
  const [soloConStock, setSoloConStock] = useState(true);
  const [busqueda, setBusqueda]   = useState("");
  const [vista, setVista]         = useState("kanban");
  const [vistaTabla, setVistaTabla] = useState("plano");
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState("bodegas");
  const [gruposCol, setGruposCol] = useState(() => new Set());
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isTabla = vista === "tabla";

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

  const itemsConStock = items.filter((i) => totalItem(i.id) > 0).length;
  const itemsFiltrados = items.filter((i) => {
    const q  = busqueda.toLowerCase();
    return (!soloConStock || totalItem(i.id) > 0)
      && (filtroSt === "all" || estadoStock(i).key === filtroSt)
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

  useEffect(() => {
    const saved = localStorage.getItem(VISTA_KEY);
    const savedTabla = localStorage.getItem(VISTA_TABLA_KEY);
    if (saved === "plano" || saved === "categoria" || saved === "jerarquia") {
      setVista("tabla");
      setVistaTabla(saved);
    } else if (saved && VISTAS.some((v) => v.id === saved)) setVista(saved);
    if (savedTabla && ["plano", "categoria", "jerarquia"].includes(savedTabla)) setVistaTabla(savedTabla);
  }, []);

  useEffect(() => {
    localStorage.setItem(VISTA_KEY, vista);
    if (vista === "tabla") localStorage.setItem(VISTA_TABLA_KEY, vistaTabla);
  }, [vista, vistaTabla]);

  const itemsEnriquecidos = useMemo(
    () => itemsFiltrados.map((i) => ({
      ...i,
      total: totalItem(i.id),
      valor: totalItem(i.id) * (i.precio || 0),
      abc: conABC.get(i.id),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- totalItem deriva de stockMap (ya en deps)
    [itemsFiltrados, stockMap, items, conABC],
  );
  const listaOrdenada = useMemo(() => ordenarItemsInv(itemsEnriquecidos), [itemsEnriquecidos]);
  const selectedItem = useMemo(
    () => itemsEnriquecidos.find((i) => i.id === selectedId) || listaOrdenada[0] || null,
    [itemsEnriquecidos, selectedId, listaOrdenada],
  );
  useEffect(() => {
    if (selectedId && !items.some((i) => i.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  useEffect(() => {
    if (!isTabla && !selectedId && listaOrdenada.length > 0) setSelectedId(listaOrdenada[0].id);
  }, [vista, filtroSt, filtroABC, busqueda, soloConStock, listaOrdenada.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bodegas.length === 0) return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero crea bodegas en la pestaña <strong>Bodegas</strong>.</Empty></Card>;
  if (items.length === 0)   return <Card><Empty><AlertCircle size={28} color={C.amber} /><br/>Primero carga ítems en <strong>Inventario</strong>.</Empty></Card>;

  const detailProps = {
    item: selectedItem,
    abc: selectedItem ? conABC.get(selectedItem.id) : null,
    total: selectedItem ? totalItem(selectedItem.id) : 0,
    bodegas,
    stockMap,
    minMap,
    puedeOperar,
    stockEdit,
    descEdit,
    onIniciarEditStock: iniciarEditStock,
    onConfirmarStock: confirmarStock,
    onCancelarStock: cancelarStock,
    onStockEditChange: (v) => setStockEdit((p) => ({ ...p, valor: v })),
    onIniciarEditDesc: iniciarEditDesc,
    onConfirmarDesc: confirmarDesc,
    onCancelarDesc: cancelarDesc,
    onDescEditChange: (v) => setDescEdit((p) => ({ ...p, valor: v })),
    onSetMinBodega: setMinBodega,
    onReponer,
    activeTab: detailTab,
    onTabChange: setDetailTab,
  };

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

      {/* ── Filtros + vista ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
            <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar código, descripción, categoría o proveedor…"
              style={{ ...inputStyle(), width: "100%", paddingLeft: 32, fontSize: 13 }} />
          </div>
          {VISTAS.map((v) => {
            const Icon = v.icon;
            return (
              <FilterBtn key={v.id} active={vista === v.id} onClick={() => setVista(v.id)}>
                <Icon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                {v.label}
              </FilterBtn>
            );
          })}
          {isTabla && (
            <>
              <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 4px" }} />
              {[["plano", "Plano", List], ["categoria", "Categoría", FolderTree], ["jerarquia", "Jerarquía", Layers]].map(([v, lbl, Ico]) => (
                <FilterBtn key={v} active={vistaTabla === v} onClick={() => setVistaTabla(v)}>
                  <Ico size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  {lbl}
                </FilterBtn>
              ))}
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>
            {itemsFiltrados.length} de {soloConStock ? itemsConStock : items.length} {soloConStock ? "en stock" : "en catálogo"}
          </span>
          {hayFiltro && (
            <button onClick={() => { setBusqueda(""); setFiltroSt("all"); setFiltroABC("all"); }}
              style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: "none", color: C.slate, fontSize: 12, cursor: "pointer" }}>
              <X size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Limpiar
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setSoloConStock((v) => !v)} style={{ padding: "5px 13px", borderRadius: 7, border: `1px solid ${soloConStock ? C.cyan : C.line}`, background: soloConStock ? tint(C.cyan, 14) : "#fff", color: soloConStock ? C.cyan : C.slate, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: soloConStock ? C.cyan : C.line, display: "inline-block" }} />
            {soloConStock ? "En stock" : "Catálogo completo"}
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 2px" }} />
          <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>ABC</span>
          {[["all", "Todos", C.slate], ["A", "A", C.red], ["B", "B", C.amber], ["C", "C", C.green]].map(([v, lbl, tone]) => {
            const active = filtroABC === v;
            return <FilterBtn key={v} active={active} color={active ? tone : undefined} onClick={() => setFiltroABC(v)}>{lbl}</FilterBtn>;
          })}
          <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 4px" }} />
          <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Stock</span>
          {[["all", "Todos"], ["bajo", "Bajo mínimo"], ["revisar", "Por revisar"], ["ok", "OK"]].map(([v, lbl]) => {
            const active = filtroSt === v;
            const n = v === "all" ? null : items.filter((i) => estadoStock(i).key === v).length;
            return <FilterBtn key={v} active={active} onClick={() => setFiltroSt(v)}>{lbl}{n != null && n > 0 ? ` (${n})` : ""}</FilterBtn>;
          })}
        </div>
        {isTabla && vistaTabla !== "plano" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { vistaTabla === "categoria" ? setGruposCol(new Set(gruposCategoria().map((x) => x.key))) : arbolInv.colapsarTodo(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronRight size={13} /> Colapsar todo</button>
            <button onClick={() => { vistaTabla === "categoria" ? setGruposCol(new Set()) : arbolInv.colapsarTodo(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronDown size={13} /> Expandir todo</button>
          </div>
        )}
      </div>

      {!isTabla ? (
        <Section
          title={vista === "kanban" ? "Tablero kanban" : "Cola y detalle"}
          description={vista === "kanban" ? "Columnas por estado de stock · click en tarjeta para gestionar por bodega" : isMobile ? "Selecciona un ítem · detalle debajo" : "Cola a la izquierda · stock por bodega a la derecha"}
          padding={0}
          style={{ marginBottom: 0 }}
        >
          {listaOrdenada.length === 0 ? (
            <EmptyState icon={AlertCircle} title="Sin ítems en este filtro" description="Prueba otro filtro ABC/stock o limpia la búsqueda." />
          ) : vista === "kanban" ? (
            <div className={`inv-kanban-with-detail${selectedItem ? " has-detail" : ""}`}>
              <InventarioKanban lista={listaOrdenada} selectedId={selectedItem?.id} onSelect={(id) => { setSelectedId(id); setDetailTab("bodegas"); }} />
              {selectedItem && (
                <div style={{ padding: 16, borderLeft: isMobile ? "none" : `1px solid ${C.foam}`, borderTop: isMobile ? `1px solid ${C.foam}` : "none", minHeight: 420 }}>
                  <AlmacenStockDetailPanel {...detailProps} />
                </div>
              )}
            </div>
          ) : (
            <div className={`inv-split-container${isMobile ? " inv-split-stack" : ""}`}>
              <InventarioQueuePanel lista={listaOrdenada} selectedId={selectedItem?.id} onSelect={(id) => { setSelectedId(id); setDetailTab("bodegas"); }} busqueda={busqueda} setBusqueda={setBusqueda} panelHeight={isMobile ? "auto" : "calc(100vh - 320px)"} />
              {(!isMobile || selectedItem) && <AlmacenStockDetailPanel {...detailProps} />}
            </div>
          )}
        </Section>
      ) : (
        <>
      {puedeOperar && (
        <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8 }}>
          En cada bodega: <strong style={{ color: C.ink }}>número grande</strong> = stock actual ·
          {" "}<span style={{ border: `1px solid ${C.line}`, borderRadius: 4, padding: "0 4px" }}>número pequeño</span> = mínimo crítico de esa bodega.
        </div>
      )}

      <Section title="Tabla completa" description="Stock por bodega · plano, por categoría o jerarquía de equipos" padding={0}>
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
                                onFocus={(e) => e.target.select()} onChange={(e) => setStockEdit((p) => ({ ...p, valor: e.target.value }))}
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

                if (vistaTabla === "plano") return itemsFiltrados.length ? itemsFiltrados.map((i) => filaItem(i)) : vacio;

                if (vistaTabla === "categoria") {
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
      </Section>
        </>
      )}
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
