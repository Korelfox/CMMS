import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Package, Plus, Trash2, Download, X, Pencil, Check, Tag, Search, ChevronDown, ChevronRight, List, FolderTree, Layers } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, clp, isAdmin, canOperate, tint } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, EquipoNodoLabel, fondoTipo } from "../lib/arbolColapsable";
import { estadoStock as estadoStockOf } from "../lib/stock";
import EquipoPicker from "./EquipoPicker";
import ComboInput from "./ComboInput";
import { PLANTILLA_PESQUERA, TIPO_REPUESTO_META } from "../lib/plantillaPesquera";

const TIPOS_REPUESTO = [
  { value: "oem",         label: "OEM" },
  { value: "alternativo", label: "Alternativo" },
  { value: "generico",    label: "Genérico" },
];
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

// Prefijos de tipo de repuesto para el código (SKU). Formato: TIPO-SUBTIPO-ESPEC
const PREFIJOS_SKU = [
  ["FLT", "Filtros", "ACE aceite · COM combustible · HID hidráulico · AIR aire · SEP separador"],
  ["BRG", "Rodamientos", "medida o código (6312-ZZ)"],
  ["SEL", "Sellos y juntas", "medida (45x60)"],
  ["COR", "Correas y fajas", "código fabricante"],
  ["MAN", "Mangueras", "diámetro/presión (25-350BAR)"],
  ["LUB", "Lubricantes y aceites", "grado (15W40)"],
  ["VAL", "Válvulas", "tipo/medida"],
  ["BMP", "Bombas", "modelo"],
  ["ELE", "Eléctrico", "voltaje/tipo"],
  ["CON", "Consumibles", "—"],
];

// Respaldo de categorías por sistema (plantilla ISO 14224). Se usa solo si la
// flota aún no tiene equipos cargados; si los hay, las categorías de sistema
// se derivan del árbol real de Equipos (ver categoriasSugeridas).
const CATEGORIAS_SISTEMA_DEFAULT = PLANTILLA_PESQUERA.map((s) => s.nom);
// Categorías por TIPO DE MATERIAL — transversales a los sistemas.
const CATEGORIAS_MATERIAL = [
  "Lubricantes y Aceites",
  "Filtros",
  "Rodamientos",
  "Correas y Fajas",
  "Sellos y Juntas",
  "Mangueras y Tuberías",
  "Consumibles",
  "Herramientas",
  "Seguridad y EPP",
  "Pintura y Anticorrosivo",
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
  const [vista, setVista] = useState("plano");        // plano | categoria | jerarquia
  const [busqueda, setBusqueda] = useState("");
  const [filtroABC, setFiltroABC] = useState("all");   // all | A | B | C
  const [filtroStock, setFiltroStock] = useState("all"); // all | bajo | revisar | ok
  const [gruposCol, setGruposCol] = useState(() => new Set()); // grupos colapsados
  const [filasEditando, setFilasEditando] = useState(new Map()); // id → snapshot campos editables
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const NCOLS = 12 + (puedeOperar ? 1 : 0) + (puedeBorrar ? 1 : 0);

  function blank() {
    return { codigo: "", descripcion: "", categoria: "", unidad: "Un", stock_min: 0, stock_max: 0, precio: 0, proveedor: "", lead_dias: 7, tipo_repuesto: "oem", grupo_intercambio: "", equipoIds: [] };
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

  // Categorías sugeridas en el datalist: SISTEMAS reales del árbol de Equipos
  // (nivel sistema/subsistema), + tipos de material, + las ya usadas. Si la flota
  // aún no tiene equipos, cae a la plantilla por defecto.
  const categoriasSugeridas = useMemo(() => {
    const sistemas = equipos
      .filter((e) => e.tipo_nodo === "sistema" || e.tipo_nodo === "subsistema")
      .map((e) => e.sistema).filter(Boolean);
    const base = sistemas.length ? sistemas : CATEGORIAS_SISTEMA_DEFAULT;
    return [...new Set([...base, ...CATEGORIAS_MATERIAL, ...categoriasUsadas])]
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [equipos, categoriasUsadas]);

  // ── Filtros combinables ──────────────────────────────────────
  // Estado de stock (lib/stock): sin mínimo no marca "Bajo" salvo máximo = 1.
  const estadoStock = (i) => estadoStockOf(i.total, i.stock_min, i.stock_max);
  const stockStatus = (i) => estadoStock(i).key;
  const q = busqueda.trim().toLowerCase();
  const lista = conABC.filter((i) =>
    (filtroCat === "all" || i.categoria === filtroCat) &&
    (filtroABC === "all" || i.abc === filtroABC) &&
    (filtroStock === "all" || stockStatus(i) === filtroStock) &&
    (!q || i.codigo.toLowerCase().includes(q) || (i.descripcion || "").toLowerCase().includes(q) || (i.proveedor || "").toLowerCase().includes(q))
  );
  const hayFiltro = filtroCat !== "all" || filtroABC !== "all" || filtroStock !== "all" || !!q;
  const limpiarFiltros = () => { setFiltroCat("all"); setFiltroABC("all"); setFiltroStock("all"); setBusqueda(""); };
  const toggleGrupo = (k) => setGruposCol((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ── Destinos ─────────────────────────────────────────────────
  function destinosDeItem(itemId) { return destinos.filter((d) => d.item_id === itemId); }
  function embColor(embId) { return embarcaciones.find((e) => e.id === embId)?.color || C.steel; }
  function embName(embId)  { return embarcaciones.find((e) => e.id === embId)?.nombre || ""; }

  // ── Vista "Por categoría": grupos planos colapsables ─────────
  function construirGruposCategoria() {
    const byCat = new Map();
    lista.forEach((i) => { const k = i.categoria || "— Sin categoría"; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(i); });
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([k, its]) => ({ key: "cat:" + k, label: k, items: its }));
  }

  // ── Vista "Por jerarquía": árbol de equipos anidado, podado a las
  //    ramas que contienen repuestos (según los filtros activos). ──
  const eqById = new Map(equipos.map((e) => [e.id, e]));
  const itemsDeEqDirect = (eqId) => lista.filter((i) => destinos.some((d) => d.item_id === i.id && d.equipo_id === eqId));
  const relevante = new Set();
  lista.forEach((i) => destinos.filter((d) => d.item_id === i.id).forEach((d) => {
    let cur = eqById.get(d.equipo_id);
    while (cur && !relevante.has(cur.id)) { relevante.add(cur.id); cur = cur.parent_id ? eqById.get(cur.parent_id) : null; }
  }));
  const treeJerarquia = buildEquipoTree(equipos).filter((eq) => relevante.has(eq.id));
  const arbolInv = useArbolColapsable(treeJerarquia); // colapso por nodo (como Registro de Equipos)
  const sinAsignar = lista.filter((i) => !destinos.some((d) => d.item_id === i.id));

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
        tipo_repuesto: form.tipo_repuesto || "oem",
        grupo_intercambio: form.grupo_intercambio.trim() || null,
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

  // ── Edición explícita (sin auto-commit) ───────────────────────
  function snapCampos(item) {
    return { descripcion: item.descripcion, categoria: item.categoria, tipo_repuesto: item.tipo_repuesto, stock_min: item.stock_min, stock_max: item.stock_max, precio: item.precio };
  }
  function marcarDirty(item) {
    setFilasEditando((prev) => prev.has(item.id) ? prev : new Map(prev).set(item.id, snapCampos(item)));
  }
  async function guardarFila(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await updateRow("inventario_items", id, snapCampos(item));
      setFilasEditando((prev) => { const n = new Map(prev); n.delete(id); return n; });
    } catch (e) {
      const snap = filasEditando.get(id);
      if (snap) setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...snap } : i));
      setFilasEditando((prev) => { const n = new Map(prev); n.delete(id); return n; });
      setError("No se pudo guardar: " + e.message);
    }
  }
  function cancelarFila(id) {
    const snap = filasEditando.get(id);
    if (snap) setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...snap } : i));
    setFilasEditando((prev) => { const n = new Map(prev); n.delete(id); return n; });
  }
  async function guardarTodo() {
    await Promise.all([...filasEditando.keys()].map((id) => guardarFila(id)));
  }
  function descartarTodo() {
    setItems((prev) => prev.map((i) => {
      const snap = filasEditando.get(i.id);
      return snap ? { ...i, ...snap } : i;
    }));
    setFilasEditando(new Map());
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
      ["Código", "ABC", "Descripción", "Categoría", "Tipo", "Grupo intercambio", "Unidad", "Stock Total", "Mín", "Máx", "Precio", "Valor", "Proveedor", "Lead días", "Destino (naves/equipos)"],
      ...conABC.map((i) => {
        const dests = destinosDeItem(i.id);
        const destinoStr = dests.map((d) => {
          const eq = equipos.find((e) => e.id === d.equipo_id);
          const emb = embarcaciones.find((e) => e.id === eq?.embarcacion_id);
          return `${emb?.nombre || "?"} / ${eq?.id_visible || "?"}`;
        }).join(" | ");
        const trLabel = (TIPO_REPUESTO_META[i.tipo_repuesto] || TIPO_REPUESTO_META.oem).label;
        return [i.codigo, i.abc, i.descripcion, i.categoria, trLabel, i.grupo_intercambio || "", i.unidad, i.total, i.stock_min, i.stock_max, i.precio, i.valor, i.proveedor, i.lead_dias, destinoStr];
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
        <MiniStat label="Bajo Mínimo" value={conABC.filter((x) => estadoStock(x).key === "bajo").length} tone={C.red} />
        <MiniStat label="Total Ítems" value={items.length} />
      </div>

      {/* ── Barra de filtros + vista ── */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {/* Fila 1: buscador + toggle de vista */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
              <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar código, descripción o proveedor…"
                style={{ ...inputStyle(), width: "100%", paddingLeft: 32, fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 0, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {[["plano", "Plano", List], ["categoria", "Categoría", FolderTree], ["jerarquia", "Jerarquía", Layers]].map(([v, lbl, Ico]) => (
                <button key={v} onClick={() => setVista(v)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", borderLeft: v !== "plano" ? `1px solid ${C.line}` : "none", background: vista === v ? C.steel : "#fff", color: vista === v ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  <Ico size={14} /> {lbl}
                </button>
              ))}
            </div>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>{lista.length} de {items.length} ítems</span>
            {hayFiltro && (
              <button onClick={limpiarFiltros} style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: "none", color: C.slate, fontSize: 12, cursor: "pointer" }}>
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
            {[["all", "Todos", C.slate], ["bajo", "Bajo mínimo", C.red], ["revisar", "Por revisar", C.amber], ["ok", "OK", C.green]].map(([v, lbl, tone]) => {
              const active = filtroStock === v;
              const n = v === "all" ? null : conABC.filter((i) => stockStatus(i) === v).length;
              return <button key={v} onClick={() => setFiltroStock(v)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${active ? tone : C.line}`, background: active ? tone : "#fff", color: active ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{lbl}{n != null && <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>({n})</span>}</button>;
            })}
          </div>

          {/* Fila 3: categorías */}
          {categoriasUsadas.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 2 }}>Categoría</span>
              <FilterBtn active={filtroCat === "all"} onClick={() => setFiltroCat("all")}>Todas</FilterBtn>
              {categoriasUsadas.map((cat) => (
                <FilterBtn key={cat} active={filtroCat === cat} onClick={() => setFiltroCat(cat)}>
                  {cat} <span style={{ opacity: 0.6, fontSize: 10.5 }}>({conABC.filter((i) => i.categoria === cat).length})</span>
                </FilterBtn>
              ))}
            </div>
          )}

          {/* Colapsar / expandir todo (solo en vistas agrupadas) */}
          {vista !== "plano" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { vista === "categoria" ? setGruposCol(new Set(construirGruposCategoria().map((x) => x.key))) : arbolInv.colapsarTodo(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronRight size={13} /> Colapsar todo</button>
              <button onClick={() => { vista === "categoria" ? setGruposCol(new Set()) : arbolInv.colapsarTodo(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 }}><ChevronDown size={13} /> Expandir todo</button>
            </div>
          )}
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
              <ComboInput value={form.categoria} onChange={(v) => setForm({ ...form, categoria: v })} options={categoriasSugeridas} placeholder="Buscar o escribir categoría…" />
            </Field>
            <Field label="Unidad"><input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Stock mín"><input type="number" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: +e.target.value })} style={bluInput} /></Field>
            <Field label="Stock máx"><input type="number" value={form.stock_max} onChange={(e) => setForm({ ...form, stock_max: +e.target.value })} style={bluInput} /></Field>
            <Field label="Precio"><input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: +e.target.value })} style={bluInput} /></Field>
            <Field label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Lead días"><input type="number" value={form.lead_dias} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} /></Field>
            <Field label="Tipo (intercambiabilidad)">
              <select value={form.tipo_repuesto} onChange={(e) => setForm({ ...form, tipo_repuesto: e.target.value })} style={inputStyle()}>
                {TIPOS_REPUESTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Grupo de intercambio">
              <input value={form.grupo_intercambio} onChange={(e) => setForm({ ...form, grupo_intercambio: e.target.value })} style={inputStyle()} placeholder="ej. PROP-MTR-COOL-RAD" />
            </Field>
          </div>

          {equipos.length > 0 && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                Destino · Equipos <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
              </div>
              <div style={{ maxWidth: 440 }}>
                <EquipoPicker equipos={equipos} value={null}
                  placeholder="Buscar equipo (código/sistema) para asignar…"
                  onChange={(eq) => { if (eq && !form.equipoIds.includes(eq.id)) setForm((f) => ({ ...f, equipoIds: [...f.equipoIds, eq.id] })); }} />
              </div>
              {form.equipoIds.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {form.equipoIds.map((eqId) => {
                    const eq = equipos.find((e) => e.id === eqId); const color = embColor(eq?.embarcacion_id);
                    return (
                      <span key={eqId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, background: `${color}18`, color, border: `1px solid ${color}50`, borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5 }}>{eq?.id_visible || "?"}</span>
                        <span style={{ color: C.ink }}>{eq?.sistema || ""}</span>
                        <button onClick={() => setForm((f) => ({ ...f, equipoIds: f.equipoIds.filter((id) => id !== eqId) }))}
                          title="Quitar" style={{ background: "none", border: "none", cursor: "pointer", color, padding: 0, display: "flex" }}><X size={12} /></button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <GuiaColapsable titulo="Guía de nomenclatura del código (SKU)" icon={Tag}>
            <div style={{ marginBottom: 10 }}>
              Formato recomendado: <code style={{ fontFamily: "'IBM Plex Mono', monospace", background: tint(C.steel, 10), padding: "1px 6px", borderRadius: 4, fontWeight: 700, color: C.steel }}>TIPO-SUBTIPO-ESPEC</code>
              {" — "}corto, buscable y ordenable. La <strong>ESPEC</strong> es el modelo del fabricante (lo que se compra).
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead><tr>
                <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, borderBottom: `1px solid ${C.line}` }}>Prefijo</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, borderBottom: `1px solid ${C.line}` }}>Tipo</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, borderBottom: `1px solid ${C.line}` }}>Subtipo / Espec</th>
              </tr></thead>
              <tbody>
                {PREFIJOS_SKU.map(([p, t, s]) => (
                  <tr key={p}>
                    <td style={{ padding: "4px 8px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.cyan, borderBottom: `1px solid ${C.foam}` }}>{p}</td>
                    <td style={{ padding: "4px 8px", fontWeight: 600, borderBottom: `1px solid ${C.foam}` }}>{t}</td>
                    <td style={{ padding: "4px 8px", color: C.slate, fontSize: 12, borderBottom: `1px solid ${C.foam}` }}>{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "8px 12px", background: tint(C.steel, 10), borderRadius: 7 }}>
              <strong>Ejemplo:</strong> filtro de aceite Mann W940/25 del motor →
              {" "}código <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>FLT-ACE-W940</code>,
              {" "}categoría <strong>Filtros</strong> o <strong>Lubricación Motor</strong>, destino <strong>Motor Principal</strong>.
              {" "}Stock mínimo ≥ 2 (cubrir 2 fallas).
            </div>
          </GuiaColapsable>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Guardar Ítem</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {/* ── Panel de destinos (editor inline) ── */}
      {itemPanel && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.steel}`, background: tint(C.steel, 8) }}>
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
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
            Busca y agrega los equipos a los que está destinado este repuesto. Los cambios se guardan al instante.
          </div>
          {embarcaciones.length === 0 ? (
            <span style={{ fontSize: 12.5, color: C.slate }}>No hay embarcaciones registradas.</span>
          ) : (
            <div>
              <div style={{ maxWidth: 440 }}>
                <EquipoPicker equipos={equipos} value={null}
                  placeholder="Buscar equipo (código/sistema) para agregar…"
                  onChange={(eq) => { if (eq) agregarDestino(destinoPanel, eq.id); }} />
              </div>
              {(() => {
                const dests = destinosDeItem(destinoPanel);
                if (!dests.length) return <div style={{ fontSize: 12, color: C.slate, marginTop: 10, fontStyle: "italic" }}>Sin destinos asignados aún.</div>;
                return (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {dests.map((d) => {
                      const eq = equipos.find((e) => e.id === d.equipo_id); const color = embColor(eq?.embarcacion_id);
                      return (
                        <span key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, background: `${color}18`, color, border: `1px solid ${color}50`, borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5 }}>{eq?.id_visible || "?"}</span>
                          <span style={{ color: C.ink }}>{eq?.sistema || ""}</span>
                          <button onClick={() => quitarDestino(d.id)} title="Quitar destino" style={{ background: "none", border: "none", cursor: "pointer", color, padding: 0, display: "flex" }}><X size={12} /></button>
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
              <thead><tr>
                <th style={thStyle}>Código</th>
                <th style={{ ...thStyle, textAlign: "center" }}>ABC</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Categoría</th>
                <th style={{ ...thStyle, textAlign: "center" }} title="Intercambiabilidad: OEM / Alternativo / Genérico">Tipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Stock</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Mín</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Máx</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Destino</th>
                {puedeOperar && <th style={thStyle}></th>}
                {puedeBorrar && <th style={thStyle}></th>}
              </tr></thead>
              <tbody>
                {(() => {
                const filaItem = (i, indent = 0) => {
                  const abcTone = { A: "red", B: "yellow", C: "green" }[i.abc];
                  const st = estadoStock(i);
                  const itemDests = destinosDeItem(i.id);
                  const isOpen = destinoPanel === i.id;
                  const isDirty = filasEditando.has(i.id);
                  return (
                    <tr key={i.id} style={{ background: isOpen ? tint(C.sky, 12) : isDirty ? tint(C.cyan, 6) : undefined }}>
                      <td style={{ ...tdStyle, paddingLeft: 12 + indent, borderLeft: isDirty ? `3px solid ${C.cyan}` : "3px solid transparent" }}>
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
                      <td style={{ ...tdStyle, minWidth: 280, width: "22%" }}>
                        <input value={i.descripcion} disabled={!puedeOperar}
                          title={i.descripcion}
                          onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "descripcion", e.target.value); }}
                          style={{ ...inputStyle(), width: "100%", minWidth: 240 }} />
                      </td>
                      <td style={{ ...tdStyle, minWidth: 220, width: "18%" }}>
                        <input value={i.categoria || ""} list="inv-categorias" disabled={!puedeOperar}
                          title={i.categoria || ""}
                          onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "categoria", e.target.value); }}
                          style={{ ...inputStyle(), width: "100%", minWidth: 180 }} />
                      </td>

                      {/* Tipo de repuesto (intercambiabilidad) + grupo */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {(() => {
                          const tr = i.tipo_repuesto || "oem";
                          const meta = TIPO_REPUESTO_META[tr] || TIPO_REPUESTO_META.oem;
                          const equiv = i.grupo_intercambio ? items.filter((x) => x.grupo_intercambio === i.grupo_intercambio) : [];
                          return (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              {puedeOperar ? (
                                <select value={tr} onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "tipo_repuesto", e.target.value); }} style={inputStyle(105)}>
                                  {TIPOS_REPUESTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              ) : <Pill tone={meta.tone}>{meta.label}</Pill>}
                              {equiv.length > 1 && (
                                <span title={`Intercambiable con ${equiv.length - 1} repuesto(s) del grupo ${i.grupo_intercambio}:\n` + equiv.map((x) => `· ${x.codigo} (${(TIPO_REPUESTO_META[x.tipo_repuesto] || TIPO_REPUESTO_META.oem).label})`).join("\n")}
                                  style={{ fontSize: 10, color: C.cyan, fontWeight: 700, cursor: "help", whiteSpace: "nowrap" }}>
                                  ⇄ {equiv.length}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{i.total}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.stock_min} disabled={!puedeOperar}
                          onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "stock_min", +e.target.value); }}
                          style={{ ...bluInput, width: 60, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.stock_max} disabled={!puedeOperar}
                          onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "stock_max", +e.target.value); }}
                          style={{ ...bluInput, width: 60, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={i.precio} disabled={!puedeOperar}
                          onChange={(e) => { marcarDirty(i); onChangeLocal(i.id, "precio", +e.target.value); }}
                          style={{ ...bluInput, width: 90, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(i.valor)}</td>
                      <td style={tdStyle}><Pill tone={st.tone}>{st.label}</Pill></td>

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

                      {puedeOperar && (
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                          {isDirty && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => guardarFila(i.id)} title="Guardar cambios"
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.green, border: "none", borderRadius: 6, cursor: "pointer", color: "#fff", padding: "4px 10px", fontSize: 11.5, fontWeight: 700 }}>
                                <Check size={12} strokeWidth={2.5} /> Guardar
                              </button>
                              <button onClick={() => cancelarFila(i.id)} title="Descartar cambios"
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", color: C.slate, padding: "4px 8px", fontSize: 11.5 }}>
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                      {puedeBorrar && (
                        <td style={tdStyle}>
                          <button onClick={() => eliminar(i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                };
                const vacio = <tr><td colSpan={NCOLS} style={{ textAlign: "center", padding: 24, color: C.slate, fontSize: 13 }}>Sin ítems para los filtros seleccionados.</td></tr>;

                // ── Vista PLANO ──
                if (vista === "plano") {
                  return lista.length ? lista.map((i) => filaItem(i)) : vacio;
                }

                // ── Vista POR CATEGORÍA (grupos planos colapsables) ──
                if (vista === "categoria") {
                  const grupos = construirGruposCategoria();
                  if (!grupos.length) return vacio;
                  return grupos.map((g) => {
                    const col = gruposCol.has(g.key);
                    const valorG = g.items.reduce((s, i) => s + i.valor, 0);
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

                // ── Vista POR JERARQUÍA (árbol anidado de equipos → repuestos) ──
                if (!treeJerarquia.length && !sinAsignar.length) return vacio;
                const filasArbol = treeJerarquia.filter((eq) => arbolInv.visible(eq)).map((eq) => {
                  const directos = itemsDeEqDirect(eq.id);
                  const expandible = arbolInv.tieneHijos(eq) || directos.length > 0;
                  const col = arbolInv.estaColapsado(eq);
                  const valorN = directos.reduce((s, i) => s + i.valor, 0);
                  return (
                    <React.Fragment key={eq.id}>
                      <tr onClick={() => expandible && arbolInv.toggle(eq.id)} style={{ cursor: expandible ? "pointer" : "default", background: fondoTipo(eq) }}>
                        <td colSpan={NCOLS} style={{ ...tdStyle, padding: "7px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <EquipoNodoLabel eq={eq} tieneHijos={expandible} colapsado={col}
                              onToggle={() => arbolInv.toggle(eq.id)} nSub={0} embName={embName} showEmb={eq.depth === 0} />
                            {directos.length > 0 && (
                              <span style={{ fontSize: 11.5, color: C.cyan, fontWeight: 700, whiteSpace: "nowrap" }}>· {directos.length} repuesto{directos.length > 1 ? "s" : ""}</span>
                            )}
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
      )}
      <datalist id="inv-categorias">
        {categoriasSugeridas.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ── Barra flotante de cambios pendientes ── */}
      {filasEditando.size > 0 && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 10,
          background: C.abyss, color: "#fff", borderRadius: 14,
          padding: "10px 18px", boxShadow: "0 8px 32px rgba(0,0,0,.35)",
          zIndex: 200, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
          border: `1px solid rgba(255,255,255,.1)`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber, display: "inline-block", flexShrink: 0 }} />
          {filasEditando.size} {filasEditando.size === 1 ? "cambio pendiente" : "cambios pendientes"}
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.15)", margin: "0 2px" }} />
          <button onClick={descartarTodo}
            style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", padding: "5px 14px", fontSize: 12.5, fontWeight: 600 }}>
            Descartar
          </button>
          <button onClick={guardarTodo}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.green, border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", padding: "5px 16px", fontSize: 12.5, fontWeight: 700 }}>
            <Check size={13} strokeWidth={2.5} /> Guardar todo
          </button>
        </div>
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
