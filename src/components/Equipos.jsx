import React, { useEffect, useState, useCallback } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle, GitBranch, Layers, Cpu, Wrench, Box, Hash, ChevronDown, ChevronRight, ChevronUp, Check, Package, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, ESTADOS_EQUIPO, estadoLabel, tint, shadow } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { fondoTipo } from "../lib/arbolColapsable";
import { PLANTILLA_PESQUERA, contarNodosPlantilla, contarRepuestosPlantilla, TIPO_NODO_META, CRITICIDAD_TONE } from "../lib/plantillaPesquera";

import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";
import NotaJerarquia from "./equipos/NotaJerarquia";
import RepuestoPanel from "./equipos/RepuestoPanel";

const TIPO_NODOS = [
  { value: "equipo",      label: "Equipo (genérico)" },
  { value: "sistema",     label: "Sistema (nivel 3)" },
  { value: "subsistema",  label: "Subsistema (nivel 4)" },
  { value: "componente",  label: "Componente (nivel 5)" },
  { value: "instrumento", label: "Instrumento / Sensor (nivel 7)" },
];
const CRITICIDADES = [
  { value: "",  label: "— Sin clasificar" },
  { value: "A", label: "A · Crítico" },
  { value: "B", label: "B · Importante" },
  { value: "C", label: "C · Menor" },
];
const ICONO_TIPO = { sistema: Layers, subsistema: GitBranch, componente: Wrench, instrumento: Cpu, equipo: Box };

// Tipo de niveles que se revisan en el prezarpe para este equipo
const NIVEL_TIPOS = [
  { value: "ninguno", label: "— No aplica" },
  { value: "aceite",  label: "Solo aceite" },
  { value: "aceite_agua", label: "Aceite + agua chaqueta" },
];


function blankForm(embId = "") {
  return { embarcacion_id: embId, id_visible: "", sistema: "", subsistema: "", marca: "", modelo: "", parent_id: "", tipo_nodo: "equipo", criticidad: "" };
}

export default function Equipos() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filtro, setFiltro]     = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(blankForm());
  const [precargando, setPrecargando] = useState(false);
  const [colapsados,  setColapsados]  = useState(() => new Set());
  const [initColapso, setInitColapso] = useState(false);
  const [original,    setOriginal]    = useState({}); // snapshot por id para guardar/descartar
  const [guardando,   setGuardando]   = useState(false);
  const [items,       setItems]       = useState([]); // inventario_items (repuestos)
  const [destinos,    setDestinos]    = useState([]); // inventario_item_destinos (item↔equipo)
  const [repuestoPanel, setRepuestoPanel] = useState(null); // equipo id con panel de repuestos abierto
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const hasActions  = puedeOperar || puedeBorrar;
  // Nº de columnas (para colSpan de filas vacías y del panel de repuestos):
  // 13 base + Orden (si puede operar) + Acción (si hay acciones).
  const NCOLS = 13 + (puedeOperar ? 1 : 0) + (hasActions ? 1 : 0);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, its, dests] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
        fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
        fetchAll("inventario_item_destinos"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setItems(its); setDestinos(dests);
      setOriginal(Object.fromEntries(eqs.map((e) => [e.id, { ...e }]))); // snapshot para guardar/descartar
      if (embs.length && !form.embarcacion_id) setForm((f) => ({ ...f, embarcacion_id: embs[0].id }));
    } catch (e) { setError("No se pudieron cargar los equipos. " + e.message); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id)  { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function embColor(id) { return embarcaciones.find((e) => e.id === id)?.color  || C.steel; }
  function eqName(id)   { const e = equipos.find((q) => q.id === id); return e ? `${e.id_visible} · ${e.sistema}` : "—"; }

  // Lista en orden de árbol según filtro de nave
  const baseList = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
  const lista    = buildEquipoTree(baseList);

  // ── Colapso por nodo (a cualquier nivel) ──
  // conHijos: ids de nodos que tienen al menos un hijo (sistemas, subsistemas, …).
  const conHijos = new Set();
  lista.forEach((e) => { if (e.parent_id) conHijos.add(e.parent_id); });

  // descCount: total de descendientes por nodo (para el badge "▸ N" al colapsar).
  const descCount = new Map();
  {
    const pila = [];
    for (const e of lista) {
      while (pila.length && pila[pila.length - 1].depth >= e.depth) pila.pop();
      pila.forEach((a) => descCount.set(a.id, (descCount.get(a.id) || 0) + 1));
      pila.push(e);
    }
  }

  // Grupos de hermanos (mismo padre + nave) en el orden mostrado, para mover
  // arriba/abajo. posInfo: id → { first, last } dentro de su grupo.
  const grupoKey = (e) => `${e.parent_id ?? "root"}|${e.embarcacion_id}`;
  const posInfo = new Map();
  {
    const grupos = new Map();
    lista.forEach((e) => { const k = grupoKey(e); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    grupos.forEach((arr) => arr.forEach((e, i) => posInfo.set(e.id, { first: i === 0, last: i === arr.length - 1 })));
  }

  // Visibilidad: un nodo se oculta si CUALQUIER ancestro está colapsado.
  // Recorre en pre-orden (padre antes que hijos) llevando la profundidad del
  // ancestro colapsado activo; mientras esté activo, se saltan los más profundos.
  const listaVisible = [];
  {
    let colapsadoEnDepth = null;
    for (const e of lista) {
      if (colapsadoEnDepth !== null && e.depth > colapsadoEnDepth) continue; // oculto
      colapsadoEnDepth = null; // salimos del subárbol colapsado
      listaVisible.push(e);
      if (colapsados.has(e.id)) colapsadoEnDepth = e.depth; // colapsa sus descendientes
    }
  }

  // Contraer TODOS los nodos con hijos por defecto (una sola vez, al cargar):
  // se ve solo el nivel raíz y se va abriendo hacia los componentes.
  useEffect(() => {
    if (!initColapso && conHijos.size > 0) {
      setColapsados(new Set([...conHijos]));
      setInitColapso(true);
    }
  }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColapso(nodeId) {
    setColapsados((prev) => {
      const n = new Set(prev);
      n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId);
      return n;
    });
  }
  const colapsarTodo = (v) => setColapsados(v ? new Set([...conHijos]) : new Set());

  // Padres disponibles para un equipo (misma nave, no él mismo ni sus hijos)
  function padresDisponibles(eqId, embId) {
    const candidatos = equipos.filter((e) => e.embarcacion_id === embId && e.id !== eqId);
    // Excluir descendientes del equipo actual (para no crear ciclos)
    const descendants = new Set();
    function markDesc(id) { equipos.filter((c) => c.parent_id === id).forEach((c) => { descendants.add(c.id); markDesc(c.id); }); }
    if (eqId) markDesc(eqId);
    return candidatos.filter((c) => !descendants.has(c.id));
  }

  async function agregar() {
    if (!form.embarcacion_id || !form.sistema.trim()) return;
    const emb   = embarcaciones.find((e) => e.id === form.embarcacion_id);
    const idVis = form.id_visible.trim() || `${emb?.codigo || "EQ"}-${form.sistema.slice(0, 6).toUpperCase().replace(/\s/g, "")}`;
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id,
        id_visible:     idVis,
        sistema:        form.sistema.trim(),
        marca:          form.marca.trim(),
        modelo:         form.modelo.trim(),
        parent_id:      form.parent_id || null,
        tipo_nodo:      form.tipo_nodo || "equipo",
        criticidad:     form.criticidad || null,
        created_by:     profile.id,
      });
      setEquipos((p) => [...p, nuevo]);
      setOriginal((o) => ({ ...o, [nuevo.id]: { ...nuevo } }));
      logActivity(profile, "Crear equipo", `${idVis} · ${nuevo.sistema}${form.parent_id ? ` (sub de ${eqName(form.parent_id)})` : ""} (${emb?.nombre})`);
      setForm(blankForm(form.embarcacion_id));
      setShowForm(false);
    } catch (e) { setError("No se pudo crear el equipo: " + e.message); }
  }

  // Tipo de nodo sugerido para el hijo según el tipo del padre.
  const TIPO_HIJO = { sistema: "subsistema", subsistema: "componente", componente: "componente", instrumento: "componente", equipo: "componente" };

  // Agrega un hijo directamente desde el árbol (ej. un filtro extra bajo "Combustible").
  // Crea el nodo al instante (con id y padre) y queda editable inline; expande el padre.
  async function agregarHijo(parent) {
    const childTipo = TIPO_HIJO[parent.tipo_nodo] || "componente";
    // Código auto: ruta del padre (sin la secuencia final) + correlativo único.
    const base   = String(parent.id_visible || "EQ").replace(/-\d+$/, "");
    const usados = new Set(equipos.map((e) => e.id_visible));
    let i = 1, idVis;
    do { idVis = `${base}-${String(i).padStart(2, "0")}`; i++; } while (usados.has(idVis));
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: parent.embarcacion_id,
        id_visible:     idVis,
        sistema:        childTipo === "subsistema" ? "Nuevo subsistema" : "Nuevo componente",
        parent_id:      parent.id,
        tipo_nodo:      childTipo,
        criticidad:     parent.criticidad || null,
        created_by:     profile.id,
      });
      setEquipos((p) => [...p, nuevo]);
      setOriginal((o) => ({ ...o, [nuevo.id]: { ...nuevo } }));
      setColapsados((prev) => { const n = new Set(prev); n.delete(parent.id); return n; }); // expandir el padre
      logActivity(profile, "Crear equipo", `${idVis} (sub de ${parent.id_visible})`);
    } catch (e) { setError("No se pudo agregar el subnodo: " + e.message); }
  }

  // Mueve un nodo arriba/abajo entre sus hermanos (mismo padre + nave) y
  // persiste el orden. Normaliza el `orden` de todo el grupo (10, 20, 30…).
  async function moverNodo(node, dir) {
    const k = grupoKey(node);
    const sib = lista.filter((e) => grupoKey(e) === k);
    const idx = sib.findIndex((x) => x.id === node.id);
    const swap = idx + (dir === "up" ? -1 : 1);
    if (idx < 0 || swap < 0 || swap >= sib.length) return;
    const arr = [...sib];
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    const updates = arr.map((x, i) => ({ id: x.id, orden: (i + 1) * 10 }));
    const previo = Object.fromEntries(sib.map((x) => [x.id, x.orden ?? null]));
    // Optimista: actualiza estado y snapshot (orden no pasa por la barra de Guardar).
    setEquipos((p) => p.map((e) => { const u = updates.find((u) => u.id === e.id); return u ? { ...e, orden: u.orden } : e; }));
    setOriginal((o) => { const n = { ...o }; updates.forEach((u) => { if (n[u.id]) n[u.id] = { ...n[u.id], orden: u.orden }; }); return n; });
    try {
      for (const u of updates) await updateRow("equipos", u.id, { orden: u.orden });
    } catch (err) {
      setEquipos((p) => p.map((e) => (e.id in previo ? { ...e, orden: previo[e.id] } : e)));
      setError("No se pudo reordenar: " + err.message);
    }
  }

  // ── Repuestos enlazados a un nodo (inventario_item_destinos) ──
  function repuestosDe(equipoId) {
    return destinos.filter((d) => d.equipo_id === equipoId)
      .map((d) => ({ destino: d, item: items.find((i) => i.id === d.item_id) }))
      .filter((r) => r.item);
  }

  async function enlazarRepuesto(equipoId, itemId) {
    if (!itemId || destinos.some((d) => d.equipo_id === equipoId && d.item_id === itemId)) return;
    try {
      const nuevo = await insertRow("inventario_item_destinos", profile.empresa_id, { item_id: itemId, equipo_id: equipoId });
      setDestinos((p) => [...p, nuevo]);
    } catch (e) { setError("No se pudo enlazar el repuesto: " + e.message); }
  }

  async function desenlazarRepuesto(destinoId) {
    const respaldo = destinos;
    setDestinos((p) => p.filter((d) => d.id !== destinoId));
    try { await deleteRow("inventario_item_destinos", destinoId); }
    catch (e) { setDestinos(respaldo); setError("No se pudo quitar el repuesto: " + e.message); }
  }

  // Crea un SKU nuevo (o reutiliza si el código ya existe) y lo enlaza al nodo.
  async function crearYEnlazarRepuesto(equipoId, datos) {
    const codigo = String(datos.codigo || "").trim().toUpperCase();
    if (!codigo || !datos.descripcion?.trim()) { setError("El repuesto necesita código y descripción."); return; }
    const node = equipos.find((e) => e.id === equipoId);
    try {
      let item = items.find((i) => String(i.codigo).toUpperCase() === codigo);
      if (!item) {
        item = await insertRow("inventario_items", profile.empresa_id, {
          codigo, descripcion: datos.descripcion.trim(),
          categoria: node?.sistema || "", tipo_repuesto: datos.tipo || "oem",
          grupo_intercambio: node?.id_visible || null,
        });
        setItems((p) => [...p, item]);
      }
      await enlazarRepuesto(equipoId, item.id);
      logActivity(profile, "Crear+enlazar repuesto", `${codigo} → ${node?.id_visible || ""}`);
    } catch (e) {
      setError(e.message?.includes("duplicate") ? `Ya existe un repuesto con código ${codigo}.` : "No se pudo crear el repuesto: " + e.message);
    }
  }

  // Precarga el árbol estándar de sistemas pesqueros para la nave filtrada.
  async function precargarPlantilla() {
    // Nave objetivo: la del filtro; si está en "Todas" y solo hay una nave, esa.
    const targetId = filtro !== "all" ? filtro : (embarcaciones.length === 1 ? embarcaciones[0].id : null);
    const emb = embarcaciones.find((e) => e.id === targetId);
    if (!emb) { setError("Selecciona primero una embarcación en los filtros para precargar la plantilla."); return; }
    const totalNodos = contarNodosPlantilla();
    const totalReps  = contarRepuestosPlantilla();
    if (!window.confirm(`¿Precargar la plantilla de excelencia (ISO 14224) en "${emb.nombre}"?\n\nSe crearán hasta ${totalNodos} nodos de equipos (sistemas → subsistemas → componentes → sensores) y hasta ${totalReps} repuestos (SKU OEM/Alternativo/Genérico) en el Inventario, enlazados a su componente.\n\nLos nodos que ya existan en esta nave NO se duplican: puedes ejecutarla otra vez para completar lo que falte. Puedes borrar después lo que no aplique.`)) return;

    setPrecargando(true); setError(null);
    const creados = [];        // equipos nuevos creados en esta corrida
    const itemsCreados = [];   // inventario_items nuevos

    // Mapa codigo→id de repuestos existentes para no duplicar SKU (un SKU se
    // reutiliza en varios componentes: se crea una vez y se enlaza a cada uno).
    let itemMap = new Map();
    try {
      const existentes = await fetchAll("inventario_items");
      itemMap = new Map(existentes.map((i) => [String(i.codigo).toUpperCase(), i.id]));
    } catch { /* sin catálogo previo: se crean todos */ }

    // Mapa id_visible→id de equipos YA existentes en esta nave, para integrar la
    // plantilla sin duplicar (idempotente): si un nodo ya existe se reutiliza y
    // solo se crean los descendientes que falten.
    const existentesNave = new Map(
      equipos.filter((e) => e.embarcacion_id === emb.id).map((e) => [e.id_visible, e.id])
    );

    // Crea (o reutiliza) los repuestos del componente y los enlaza como destino.
    async function crearRepuestos(nodo, equipoId, rootNom) {
      for (const [sku, desc, tipoRep] of nodo.rep || []) {
        const code = String(sku).toUpperCase();
        let itemId = itemMap.get(code);
        if (!itemId) {
          try {
            const it = await insertRow("inventario_items", profile.empresa_id, {
              codigo: code, descripcion: desc, categoria: rootNom,
              tipo_repuesto: tipoRep, grupo_intercambio: nodo.cod,
            });
            itemId = it.id; itemMap.set(code, itemId); itemsCreados.push(it);
          } catch { continue; } // SKU duplicado u otra carrera: salta el enlace
        }
        try {
          await insertRow("inventario_item_destinos", profile.empresa_id, { item_id: itemId, equipo_id: equipoId });
        } catch { /* destino duplicado: ignorar */ }
      }
    }

    // Inserta un nodo y, recursivamente, todos sus descendientes (cualquier profundidad).
    // rootNom = nombre del sistema raíz (se usa como categoría del repuesto).
    async function insertarNodo(nodo, parentId, rootNom) {
      const idVis = `${emb.codigo}-${nodo.cod}`;
      let nodeId = existentesNave.get(idVis);
      if (!nodeId) {
        const row = await insertRow("equipos", profile.empresa_id, {
          embarcacion_id: emb.id, id_visible: idVis,
          sistema: nodo.nom, tipo_nodo: nodo.tipo, criticidad: nodo.crit,
          mtbf_objetivo: nodo.mtbf ?? null,
          parent_id: parentId, created_by: profile.id,
        });
        nodeId = row.id;
        creados.push(row);
        existentesNave.set(idVis, nodeId);
        if (nodo.rep?.length) await crearRepuestos(nodo, nodeId, rootNom);
      }
      for (const hijo of nodo.hijos || []) await insertarNodo(hijo, nodeId, rootNom);
    }
    const sincOriginal = () => setOriginal((o) => { const n = { ...o }; creados.forEach((c) => { n[c.id] = { ...c }; }); return n; });
    try {
      for (const sis of PLANTILLA_PESQUERA) await insertarNodo(sis, null, sis.nom);
      setEquipos((p) => [...p, ...creados]); sincOriginal();
      logActivity(profile, "Precargar plantilla pesquera", `${emb.nombre} · ${creados.length} nodos · ${itemsCreados.length} repuestos`);
    } catch (e) {
      setError("Se interrumpió la precarga: " + e.message + ". Recarga la página para ver lo que sí se creó.");
      setEquipos((p) => [...p, ...creados]); sincOriginal();
    } finally { setPrecargando(false); }
  }

  function onChangeLocal(id, campo, valor) { setEquipos((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }
  // Edición LOCAL — no persiste hasta pulsar "Guardar cambios"
  const commit = onChangeLocal;

  const CAMPOS_EDIT = ["id_visible", "sistema", "marca", "modelo", "horas_actual", "horas_ult_pm", "mtbf_objetivo", "estado", "embarcacion_id", "parent_id", "tipo_nodo", "criticidad", "prezarpe", "nivel_tipo", "consume_aceite"];
  const eqDirty = (e) => { const o = original[e.id]; return o && CAMPOS_EDIT.some((c) => (e[c] ?? null) !== (o[c] ?? null)); };
  const dirtyIds = equipos.filter(eqDirty).map((e) => e.id);

  async function guardarCambios() {
    setGuardando(true); setError(null);
    try {
      for (const id of dirtyIds) {
        const e = equipos.find((x) => x.id === id);
        const o = original[id] || {};
        const cambios = {};
        CAMPOS_EDIT.forEach((c) => { if ((e[c] ?? null) !== (o[c] ?? null)) cambios[c] = e[c]; });
        if (Object.keys(cambios).length) await updateRow("equipos", id, cambios);
      }
      setOriginal((prev) => {
        const n = { ...prev };
        dirtyIds.forEach((id) => { const e = equipos.find((x) => x.id === id); if (e) n[id] = { ...e }; });
        return n;
      });
      logActivity(profile, "Editar equipos", `${dirtyIds.length} equipo(s) actualizado(s)`);
    } catch (e) { setError("No se pudieron guardar los cambios: " + e.message); }
    finally { setGuardando(false); }
  }
  function descartarCambios() {
    setEquipos((p) => p.map((e) => original[e.id] ? { ...e, ...original[e.id] } : e));
  }

  async function eliminar(id) {
    const eq = equipos.find((e) => e.id === id);
    const hijos = equipos.filter((e) => e.parent_id === id);
    const aviso = hijos.length > 0 ? `\n⚠️ Tiene ${hijos.length} subsistema(s) que quedarán como raíz.` : "";
    if (!window.confirm(`¿Eliminar el equipo "${eq?.sistema}"? Se borrarán también su criticidad, costos y planes asociados.${aviso}`)) return;
    const respaldo = equipos;
    setEquipos((p) => p.filter((e) => e.id !== id));
    try {
      await deleteRow("equipos", id);
      logActivity(profile, "Eliminar equipo", `${eq?.id_visible} · ${eq?.sistema}`);
    } catch (e) { setEquipos(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [
      ["ID", "Embarcación", "Sistema padre", "Sistema / Equipo", "Marca", "Modelo", "Horas Actuales", "Hrs Últ PM", "Estado"],
      ...equipos.map((e) => [
        e.id_visible, embName(e.embarcacion_id),
        e.parent_id ? eqName(e.parent_id) : "",
        e.sistema, e.marca, e.modelo, e.horas_actual, e.horas_ult_pm, estadoLabel(e.estado),
      ]),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "equipos.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" /><Card><InlineSpinner label="Cargando equipos…" /></Card></div>;

  if (!loading && embarcaciones.length === 0) {
    return (
      <div>
        <PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" />
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Primero debes registrar al menos una <strong>embarcación</strong>. Ve al módulo <strong>Embarcaciones</strong> y agrega tu flota.
        </Empty></Card>
      </div>
    );
  }

  // Equipos de la nave seleccionada en el form (para el select de padre)
  const candidatosPadre = equipos.filter((e) => e.embarcacion_id === form.embarcacion_id);

  return (
    <div>
      <PageHead kicker="Taxonomía ISO 14224 · Jerarquía funcional" title="Registro de Equipos"
        sub="Estructura árbol: sistema raíz → subsistemas. Las horas alimentan el Plan Preventivo, Criticidad y Costo Global."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar CSV</button>
          {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Agregar Equipo</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Barra de guardado explícito (aparece al haber cambios sin guardar) */}
      {dirtyIds.length > 0 && (
        <div style={{ position: "sticky", top: 8, zIndex: 15, display: "flex", alignItems: "center", gap: 12, background: tint(C.gold, 16), border: `1px solid ${C.gold}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, boxShadow: shadow.md }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.abyss }}>
            {dirtyIds.length} equipo{dirtyIds.length > 1 ? "s" : ""} con cambios sin guardar
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={guardarCambios} disabled={guardando} style={primaryBtn}>
            <Check size={15} /> {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
          <button onClick={descartarCambios} disabled={guardando} style={ghostBtn}>Descartar</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
        {conHijos.size > 0 && (
          <>
            <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 2px" }} />
            <button onClick={() => colapsarTodo(true)} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px" }}><ChevronRight size={13} /> Colapsar todo</button>
            <button onClick={() => colapsarTodo(false)} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px" }}><ChevronDown size={13} /> Expandir todo</button>
          </>
        )}
      </div>

      {/* Precarga de plantilla ISO 14224. Visible al seleccionar una nave, o
          cuando aún no hay equipos (para que sea fácil de encontrar). */}
      {puedeOperar && (filtro !== "all" || equipos.length === 0) && (() => {
        const navePrecarga = filtro !== "all" ? filtro : (embarcaciones.length === 1 ? embarcaciones[0].id : "");
        const lista = !navePrecarga;
        return (
          <Card style={{ marginBottom: 16, background: `${C.cyan}0D`, border: `1px solid ${C.cyan}40`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Layers size={22} color={C.cyan} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: C.abyss }}>Plantilla de excelencia ISO 14224</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
                {lista
                  ? <>Selecciona una <strong>nave</strong> en los filtros de arriba para precargar su jerarquía.</>
                  : <>Genera el árbol estándar de hasta {contarNodosPlantilla()} nodos (sistemas → Motor Principal y Generador desglosados → componentes → sensores) y {contarRepuestosPlantilla()} repuestos en el Inventario para <strong>{embName(navePrecarga)}</strong>. No duplica lo que ya exista; borra después lo que no aplique.</>}
              </div>
            </div>
            <button onClick={precargarPlantilla} disabled={precargando || lista}
              style={{ ...primaryBtn, background: C.cyan, borderColor: C.cyan, flexShrink: 0, opacity: lista ? 0.5 : 1 }}>
              {precargando ? "Precargando…" : <><Layers size={15} /> Precargar plantilla</>}
            </button>
          </Card>
        );
      })()}

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Equipo / Subsistema</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id}
                onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, parent_id: "" })}
                style={inputStyle()}>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema padre (opcional — si es subsistema)">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} style={inputStyle()}>
                <option value="">— Ninguno (sistema raíz) —</option>
                {buildEquipoTree(candidatosPadre).map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {"　".repeat(eq.depth)}{eq.depth > 0 ? "└─ " : ""}{eq.id_visible} · {eq.sistema}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ID visible (opcional)">
              <input value={form.id_visible} onChange={(e) => setForm({ ...form, id_visible: e.target.value })} style={inputStyle()} placeholder="auto" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field label="Sistema / Equipo">
              <input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal, Bomba Hidráulica…" />
            </Field>
            <Field label="Marca">
              <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Modelo">
              <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} style={inputStyle()} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <Field label="Tipo de nodo (nivel ISO 14224)">
              <select value={form.tipo_nodo} onChange={(e) => setForm({ ...form, tipo_nodo: e.target.value })} style={inputStyle()}>
                {TIPO_NODOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Criticidad">
              <select value={form.criticidad} onChange={(e) => setForm({ ...form, criticidad: e.target.value })} style={inputStyle()}>
                {CRITICIDADES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          {form.parent_id && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${C.cyan}14`, borderRadius: 7, fontSize: 12.5, color: C.steel }}>
              <GitBranch size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
              Subsistema de: <strong>{eqName(form.parent_id)}</strong>
            </div>
          )}

          {/* ── Nota de ejemplo de jerarquía ── */}
          <NotaJerarquia compacta />

          {/* ── Guía de nomenclatura del código de equipo ── */}
          <GuiaColapsable titulo="Guía del código de equipo (ID visible)" icon={Hash} tone={C.steel}>
            <div style={{ marginBottom: 8 }}>
              Formato: <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>NAVE-SISTEMA[-SUBSISTEMA]</code>
              {" — "}el mismo que genera la plantilla pesquera, para que toda la flota sea consistente.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
              <li><strong style={{ color: C.abyss }}>Sistema raíz:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>AUR-PROP</code> (Propulsión de la nave Aurora)</li>
              <li><strong style={{ color: C.abyss }}>Subsistema:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>AUR-PROP-MTR</code> (Motor, hijo de Propulsión)</li>
              <li>Códigos de sistema sugeridos: PROP, HYD, RSW, GEN, ELEC, FUEL, NAV, SAF, FISH…</li>
              <li>Si lo dejas vacío, se genera uno automático a partir del nombre.</li>
            </ul>
          </GuiaColapsable>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={agregar} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
            <thead><tr>
              {puedeOperar && <th style={{ ...thStyle, textAlign: "center" }} title="Reordenar por prioridad">Orden</th>}
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Nave</th>
              <th style={thStyle}>Sistema / Equipo</th>
              <th style={thStyle}>Subsistema de</th>
              <th style={thStyle}>Marca</th>
              <th style={thStyle}>Modelo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs PM</th>
              <th style={{ ...thStyle, textAlign: "right" }} title="MTBF objetivo (horas)">MTBF</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Prezarpe</th>
              <th style={thStyle}>Niveles</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Aceite</th>
              {hasActions && <th style={{ ...thStyle, textAlign: "center" }}>Acción</th>}
            </tr></thead>
            <tbody>
              {lista.length === 0
                ? <tr><td colSpan={NCOLS}><Empty>{equipos.length === 0 ? <NotaJerarquia /> : "Sin equipos para este filtro."}</Empty></td></tr>
                : listaVisible.map((e) => {
                  const padres = padresDisponibles(e.id, e.embarcacion_id);
                  const tieneHijos = conHijos.has(e.id);
                  const colapsado = colapsados.has(e.id);
                  const nDesc = descCount.get(e.id) || 0;
                  // Los repuestos se enlazan a componentes/instrumentos (o nodos hoja).
                  const esComponente = e.tipo_nodo === "componente" || e.tipo_nodo === "instrumento" || !tieneHijos;
                  const nReps = destinos.filter((d) => d.equipo_id === e.id).length;
                  const panelAbierto = repuestoPanel === e.id;
                  const pos = posInfo.get(e.id) || { first: true, last: true };
                  return ([
                    <tr key={e.id} style={{ background: eqDirty(e) ? tint(C.gold, 14) : fondoTipo(e) }}>

                      {/* Orden (reordenar entre hermanos) */}
                      {puedeOperar && (
                        <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap", padding: "4px 6px" }}>
                          <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
                            <button onClick={() => moverNodo(e, "up")} disabled={pos.first} title="Subir (mayor prioridad)"
                              style={{ background: "none", border: "none", cursor: pos.first ? "default" : "pointer", color: pos.first ? C.line : C.steel, padding: 0, display: "flex", lineHeight: 1 }}>
                              <ChevronUp size={15} strokeWidth={2.5} />
                            </button>
                            <button onClick={() => moverNodo(e, "down")} disabled={pos.last} title="Bajar (menor prioridad)"
                              style={{ background: "none", border: "none", cursor: pos.last ? "default" : "pointer", color: pos.last ? C.line : C.steel, padding: 0, display: "flex", lineHeight: 1 }}>
                              <ChevronDown size={15} strokeWidth={2.5} />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* ID */}
                      <td style={tdStyle}>
                        <input value={e.id_visible} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "id_visible", ev.target.value)}
                          onBlur={(ev) => commit(e.id, "id_visible", ev.target.value)}
                          style={{ ...bluInput, width: 150 }} />
                      </td>

                      {/* Nave */}
                      <td style={tdStyle}>
                        <select value={e.embarcacion_id} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "embarcacion_id", ev.target.value)}
                          style={{ ...inputStyle(165), fontWeight: 600, color: embColor(e.embarcacion_id) }}>
                          {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      </td>

                      {/* Sistema — colapsable + indentación de árbol + tipo + criticidad */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {tieneHijos ? (
                            <button onClick={() => toggleColapso(e.id)} title={colapsado ? "Expandir" : "Colapsar"}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, marginLeft: e.depth * 14, marginRight: 4, display: "flex", alignItems: "center", flexShrink: 0 }}>
                              {colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : e.depth > 0 ? (
                            <span style={{ marginLeft: e.depth * 14, marginRight: 5, color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
                          ) : <span style={{ width: 20, flexShrink: 0 }} />}
                          {(() => {
                            const Ico = ICONO_TIPO[e.tipo_nodo] || ICONO_TIPO.equipo;
                            const meta = TIPO_NODO_META[e.tipo_nodo] || TIPO_NODO_META.equipo;
                            return <Ico size={13} color={meta.color} style={{ marginRight: 5, flexShrink: 0 }} title={meta.label} />;
                          })()}
                          <input value={e.sistema} disabled={!puedeOperar}
                            onChange={(ev) => onChangeLocal(e.id, "sistema", ev.target.value)}
                            onBlur={(ev) => commit(e.id, "sistema", ev.target.value)}
                            style={{ ...bluInput, width: Math.max(150, 230 - e.depth * 14), color: e.depth === 0 ? C.abyss : C.ink, fontWeight: e.depth === 0 ? 700 : 400 }} />
                          {e.criticidad && <span style={{ marginLeft: 6, flexShrink: 0 }}><Pill tone={CRITICIDAD_TONE[e.criticidad]}>{e.criticidad}</Pill></span>}
                          {colapsado && nDesc > 0 && <span style={{ marginLeft: 8, fontSize: 11.5, color: C.steel, fontWeight: 600, flexShrink: 0 }} title={`${nDesc} elemento(s) ocultos`}>▸ {nDesc}</span>}
                        </div>
                      </td>

                      {/* Subsistema de (padre inline editable) */}
                      <td style={tdStyle}>
                        <select value={e.parent_id || ""} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "parent_id", ev.target.value || null)}
                          style={{ ...inputStyle(210), fontSize: 12.5, color: e.parent_id ? C.steel : C.line }}>
                          <option value="">— Raíz —</option>
                          {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
                        </select>
                      </td>

                      {/* Marca / Modelo */}
                      <td style={tdStyle}><input value={e.marca || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "marca", ev.target.value)} onBlur={(ev) => commit(e.id, "marca", ev.target.value)} style={inputStyle(120)} /></td>
                      <td style={tdStyle}><input value={e.modelo || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "modelo", ev.target.value)} onBlur={(ev) => commit(e.id, "modelo", ev.target.value)} style={inputStyle(120)} /></td>

                      {/* Horas */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_actual} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_ult_pm} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_ult_pm", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_ult_pm", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>

                      {/* MTBF objetivo (horas) */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.mtbf_objetivo ?? ""} disabled={!puedeOperar}
                          placeholder="—"
                          onChange={(ev) => onChangeLocal(e.id, "mtbf_objetivo", ev.target.value === "" ? null : +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "mtbf_objetivo", ev.target.value === "" ? null : +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>

                      {/* Estado */}
                      <td style={tdStyle}>
                        <select value={e.estado} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "estado", ev.target.value)}
                          style={inputStyle(120)}>
                          {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>

                      {/* Prezarpe */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.prezarpe} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "prezarpe", ev.target.checked)}
                          title="Incluir en inspección de prezarpe"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {/* Niveles */}
                      <td style={tdStyle}>
                        <select value={e.nivel_tipo || "ninguno"} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "nivel_tipo", ev.target.value)}
                          style={inputStyle(155)}>
                          {NIVEL_TIPOS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                        </select>
                      </td>

                      {/* Consume aceite */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.consume_aceite} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "consume_aceite", ev.target.checked)}
                          title="Consume aceite del motor (para repartir consumo por horas)"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {hasActions && (
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {puedeOperar && (
                              <button onClick={() => agregarHijo(e)} title={`Agregar ${(TIPO_HIJO[e.tipo_nodo] || "componente")} dentro de "${e.sistema}"`}
                                style={{ background: "none", border: `1px solid ${C.cyan}`, borderRadius: 6, cursor: "pointer", color: C.cyan, padding: "2px 5px", display: "flex", alignItems: "center", flexShrink: 0 }}>
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                            )}
                            {puedeOperar && esComponente && (
                              <button onClick={() => setRepuestoPanel(panelAbierto ? null : e.id)}
                                title={`Repuestos de "${e.sistema}"${nReps ? ` (${nReps})` : ""}`}
                                style={{ background: panelAbierto ? C.steel : "none", border: `1px solid ${panelAbierto ? C.steel : C.line}`, borderRadius: 6, cursor: "pointer", color: panelAbierto ? "#fff" : C.steel, padding: "2px 5px", display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                                <Package size={14} />
                                {nReps > 0 && <span style={{ fontSize: 10.5, fontWeight: 700 }}>{nReps}</span>}
                              </button>
                            )}
                            {puedeBorrar && (
                              <button onClick={() => eliminar(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, display: "flex", alignItems: "center" }}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>,
                    panelAbierto && (
                      <tr key={e.id + "-rep"}>
                        <td colSpan={NCOLS} style={{ padding: 0, background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
                          <RepuestoPanel
                            node={e}
                            repuestos={repuestosDe(e.id)}
                            items={items}
                            destinos={destinos}
                            puedeBorrar={puedeBorrar}
                            onEnlazar={(itemId) => enlazarRepuesto(e.id, itemId)}
                            onDesenlazar={desenlazarRepuesto}
                            onCrear={(datos) => crearYEnlazarRepuesto(e.id, datos)}
                            onClose={() => setRepuestoPanel(null)}
                          />
                        </td>
                      </tr>
                    )
                  ]);
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Nota de ejemplo: nueva jerarquía de sistemas ──────────────────
