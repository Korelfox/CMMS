import React, { useEffect, useState, useCallback, useRef } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle, GitBranch, Layers, Cpu, Wrench, Box, Hash, ChevronDown, ChevronRight, ChevronUp, Check, Package, X, Rows3, FileText, Settings2, PanelRightOpen } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, ESTADOS_EQUIPO, estadoLabel, tint, shadow } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { fondoTipo, colorTipo } from "../lib/arbolColapsable";
import { PLANTILLA_PESQUERA, nodoIncluido, contarNodosPlantilla, contarRepuestosPlantilla, contarPlanesPMPlantilla, TIPO_NODO_META, CRITICIDAD_TONE } from "../lib/plantillaPesquera";

import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle,
  FilterBtn, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";
import NotaJerarquia from "./equipos/NotaJerarquia";
import RepuestoPanel from "./equipos/RepuestoPanel";
import { FichaBody, fichaTieneDatos } from "./equipos/FichaEquipo";
import { PropOpBody } from "./equipos/PropOpModal";
import { useWindows } from "./windows/WindowManager";
import EquipoWindow, { RepuestosWindowBody } from "./equipos/EquipoWindow";
import { equiposStore } from "./equipos/equiposStore";

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

// Encabezado de tabla (compacto, estático).
const thE = { textAlign: "left", padding: "7px 7px", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: C.slate, fontWeight: 600, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap" };
// Presets de densidad: la ALTURA DE FILA es ajustable por el usuario (se recuerda
// en localStorage). cell = padding de celda; inp = padding de inputs; font = fuente.
const DENSIDADES = {
  compacta: { label: "Compacta", cell: "1px 7px", inp: "2px 8px",  font: 12 },
  media:    { label: "Media",    cell: "3px 7px", inp: "4px 8px",  font: 12.5 },
  amplia:   { label: "Amplia",   cell: "7px 8px", inp: "8px 10px", font: 13.5 },
};


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
  const [menuHijo, setMenuHijo] = useState(null);     // equipo id con el menú "agregar (tipo)" abierto
  const { open } = useWindows();
  const handlersRef = useRef({}); // callbacks vivos que consumen las ventanas

  // Espeja el estado a la fuente viva que leen las ventanas (drill-down).
  useEffect(() => {
    equiposStore.set({ equipos, items, destinos, embarcaciones });
  }, [equipos, items, destinos, embarcaciones]);
  const [densidad, setDensidad] = useState(() => {
    try { return localStorage.getItem("equipos_densidad") || "media"; } catch { return "media"; }
  });
  function cambiarDensidad(d) {
    setDensidad(d);
    try { localStorage.setItem("equipos_densidad", d); } catch { /* sin persistencia */ }
  }
  const D = DENSIDADES[densidad] || DENSIDADES.media;
  // Estilos de celda/input dependientes de la densidad elegida (altura de fila).
  const tdE  = { padding: D.cell, fontSize: D.font, borderBottom: `1px solid ${C.foam}`, color: C.ink };
  const bluC = { width: "100%", border: `1px solid ${tint(C.sky, 28)}`, borderRadius: 7, background: tint(C.sky, 9), outline: "none", padding: D.inp, fontSize: D.font, color: C.steel, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" };
  const inC  = (w) => ({ width: w || "100%", border: `1px solid ${C.line}`, borderRadius: 7, background: C.surface, outline: "none", padding: D.inp, fontSize: D.font, color: C.ink });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const hasActions  = puedeOperar || puedeBorrar;
  // Nº de columnas (para colSpan de filas vacías y del panel de repuestos):
  // 13 base + Orden (si puede operar) + Acción (si hay acciones).
  const NCOLS = 11 + (puedeOperar ? 1 : 0) + (hasActions ? 1 : 0);

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
  async function agregarHijo(parent, tipoElegido) {
    setMenuHijo(null);
    // Tipo del hijo: el elegido por el usuario, o el sugerido según el padre.
    const childTipo = tipoElegido || TIPO_HIJO[parent.tipo_nodo] || "componente";
    const nombreNuevo = { subsistema: "Nuevo subsistema", componente: "Nuevo componente", instrumento: "Nuevo instrumento" }[childTipo] || "Nuevo componente";
    // Código auto: ruta del padre (sin la secuencia final) + correlativo único.
    const base   = String(parent.id_visible || "EQ").replace(/-\d+$/, "");
    const usados = new Set(equipos.map((e) => e.id_visible));
    let i = 1, idVis;
    do { idVis = `${base}-${String(i).padStart(2, "0")}`; i++; } while (usados.has(idVis));
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: parent.embarcacion_id,
        id_visible:     idVis,
        sistema:        nombreNuevo,
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
  async function precargarPlantilla(modo = "completo") {
    // Nave objetivo: la del filtro; si está en "Todas" y solo hay una nave, esa.
    const targetId = filtro !== "all" ? filtro : (embarcaciones.length === 1 ? embarcaciones[0].id : null);
    const emb = embarcaciones.find((e) => e.id === targetId);
    if (!emb) { setError("Selecciona primero una embarcación en los filtros para precargar la plantilla."); return; }
    const totalNodos = contarNodosPlantilla(modo);
    const totalReps  = contarRepuestosPlantilla(modo);
    const totalPM    = contarPlanesPMPlantilla(modo);
    const etiqueta = modo === "basico" ? "ESENCIAL (solo componentes básicos)" : "COMPLETA (incluye overhaul y mecánica profunda)";
    if (!window.confirm(`¿Precargar la plantilla ${etiqueta} (ISO 14224) en "${emb.nombre}"?\n\nSe crearán hasta ${totalNodos} nodos de equipos (sistemas → subsistemas → componentes → sensores), hasta ${totalReps} repuestos (SKU OEM/Alternativo/Genérico) en el Inventario y hasta ${totalPM} planes preventivos precargados, todo enlazado a su componente.\n\nLos nodos que ya existan en esta nave NO se duplican: puedes ejecutarla otra vez (incluso cambiando a Completa) para completar lo que falte. Puedes borrar después lo que no aplique.`)) return;

    setPrecargando(true); setError(null);
    const creados = [];        // equipos nuevos creados en esta corrida
    const itemsCreados = [];   // inventario_items nuevos
    const planesCreados = [];  // planes_pm nuevos

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

    // Crea los planes preventivos precargados del componente (campo `pm`).
    // Formato: [descripcion, horas]  →  disparador horas
    //          [descripcion, null, unidad_cal]  →  disparador calendario
    async function crearPlanes(nodo, equipoId) {
      for (const [descripcion, intervalo, unidad] of nodo.pm || []) {
        const esCalendario = unidad != null;
        try {
          const plan = await insertRow("planes_pm", profile.empresa_id, {
            equipo_id:            equipoId,
            descripcion,
            tipo_disparador:      esCalendario ? "calendario" : "horas",
            intervalo_horas:      esCalendario ? null : (intervalo || 0),
            intervalo_calendario: esCalendario ? 1 : null,
            unidad_calendario:    esCalendario ? unidad : null,
            activo:               true,
            horas_ult_pm:         esCalendario ? null : 0,
          });
          planesCreados.push(plan);
        } catch { /* plan duplicado u otra carrera: ignorar */ }
      }
    }

    // Inserta un nodo y, recursivamente, todos sus descendientes (cualquier profundidad).
    // rootNom = nombre del sistema raíz (se usa como categoría del repuesto).
    // En modo "basico" se omiten los componentes avanzados (basico:false) y los
    // subsistemas que queden sin descendientes incluidos.
    async function insertarNodo(nodo, parentId, rootNom) {
      if (!nodoIncluido(nodo, modo)) return;
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
        if (nodo.pm?.length) await crearPlanes(nodo, nodeId);
      }
      for (const hijo of nodo.hijos || []) await insertarNodo(hijo, nodeId, rootNom);
    }
    const sincOriginal = () => setOriginal((o) => { const n = { ...o }; creados.forEach((c) => { n[c.id] = { ...c }; }); return n; });
    try {
      for (const sis of PLANTILLA_PESQUERA) await insertarNodo(sis, null, sis.nom);
      setEquipos((p) => [...p, ...creados]); sincOriginal();
      logActivity(profile, "Precargar plantilla pesquera", `${emb.nombre} · modo ${modo} · ${creados.length} nodos · ${itemsCreados.length} repuestos · ${planesCreados.length} planes PM`);
    } catch (e) {
      setError("Se interrumpió la precarga: " + e.message + ". Recarga la página para ver lo que sí se creó.");
      setEquipos((p) => [...p, ...creados]); sincOriginal();
    } finally { setPrecargando(false); }
  }

  // Guarda la ficha técnica (JSONB) de un equipo de inmediato (no espera al
  // botón "Guardar cambios", que es para los campos de la fila).
  async function guardarFicha(id, ficha) {
    const eq = equipos.find((x) => x.id === id);
    await updateRow("equipos", id, { ficha });
    setEquipos((p) => p.map((x) => x.id === id ? { ...x, ficha } : x));
    setOriginal((o) => (o[id] ? { ...o, [id]: { ...o[id], ficha } } : o));
    logActivity(profile, "Editar ficha técnica", `${eq?.id_visible} · ${eq?.sistema}`);
  }

  // Abre la configuración operacional como ventana apilable.
  function abrirPropOp(e) {
    open({
      id: `propop-${e.id}`,
      title: "Configuración operacional",
      subtitle: `${e.id_visible} · ${e.sistema}`,
      icon: Settings2,
      width: 460,
      render: ({ close }) => <PropOpBody node={e} onSave={guardarPropOp} onDone={close} />,
    });
  }
  // Abre la ficha técnica como ventana apilable.
  function abrirFicha(e) {
    const meta = TIPO_NODO_META[e.tipo_nodo] || TIPO_NODO_META.equipo;
    open({
      id: `ficha-${e.id}`,
      title: e.sistema,
      subtitle: `${e.id_visible} · ${meta.label}`,
      icon: FileText,
      iconColor: meta.color,
      width: 720,
      render: ({ close }) => (
        <FichaBody node={e} puedeOperar={puedeOperar} onSave={(ficha) => guardarFicha(e.id, ficha)} onDone={close} />
      ),
    });
  }
  // Abre la ventana de navegación/estructura de un nodo (drill-down apilable).
  function abrirEquipoWindow(node) {
    const meta = TIPO_NODO_META[node.tipo_nodo] || TIPO_NODO_META.equipo;
    const nave = embarcaciones.find((v) => v.id === node.embarcacion_id);
    open({
      id: `eq-${node.id}`,
      title: node.sistema || node.id_visible,
      subtitle: nave ? `${node.id_visible} · ${nave.nombre || nave.codigo}` : node.id_visible,
      icon: ICONO_TIPO[node.tipo_nodo] || ICONO_TIPO.equipo,
      iconColor: meta.color,
      width: 600,
      render: () => <EquipoWindow nodeId={node.id} handlersRef={handlersRef} puedeOperar={puedeOperar} />,
    });
  }
  // Abre la ventana de repuestos de un componente (apilada).
  function abrirRepuestos(node) {
    open({
      id: `rep-${node.id}`,
      title: node.sistema || node.id_visible,
      subtitle: `Repuestos · ${node.id_visible}`,
      icon: Package,
      width: 560,
      render: ({ close }) => (
        <RepuestosWindowBody nodeId={node.id} handlersRef={handlersRef} puedeBorrar={puedeBorrar} onDone={close} />
      ),
    });
  }

  // Ref vivo con los callbacks que consumen las ventanas (evita closures viejas).
  handlersRef.current = {
    agregarHijo, abrirEquipoWindow, abrirFicha, abrirPropOp, abrirRepuestos,
    enlazarRepuesto, desenlazarRepuesto, crearYEnlazarRepuesto,
  };

  // Guarda inmediatamente los atributos operacionales (horómetro / consume aceite / nivel).
  // PropOpModal llama directamente aquí; los cambios NO pasan por la barra "Guardar cambios".
  async function guardarPropOp(id, cambios) {
    const eq = equipos.find((x) => x.id === id);
    // Avisa si se quita el horómetro propio de una máquina que tiene componentes heredando.
    if (eq?.horometro === "propio" && cambios.horometro !== "propio") {
      const heredando = equipos.filter((x) => {
        if (x.id === id || x.horometro !== "hereda") return false;
        let cur = x;
        while (cur?.parent_id) {
          const p = equipos.find((e) => e.id === cur.parent_id);
          if (!p) break;
          if (p.id === id) return true;
          if (p.horometro === "propio") return false;
          cur = p;
        }
        return false;
      });
      if (heredando.length > 0 && !window.confirm(
        `⚠️ "${eq.sistema}" tiene ${heredando.length} componente(s) que heredan sus horas.\n\nAl cambiar el modo quedarán sin horómetro hasta que se reconfiguren individualmente.\n\n¿Continuar?`
      )) return;
    }
    setEquipos((p) => p.map((x) => x.id === id ? { ...x, ...cambios } : x));
    setOriginal((o) => o[id] ? { ...o, [id]: { ...o[id], ...cambios } } : o);
    try {
      await updateRow("equipos", id, cambios);
      logActivity(profile, "Config. operacional", `${eq?.id_visible} · hor:${cambios.horometro}`);
    } catch (e) {
      setEquipos((p) => p.map((x) => x.id === id ? { ...x, ...eq } : x));
      setOriginal((o) => o[id] ? { ...o, [id]: { ...o[id], ...eq } } : o);
      setError("No se pudo guardar la configuración: " + e.message);
      throw e;
    }
  }

  function onChangeLocal(id, campo, valor) { setEquipos((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }
  // Edición LOCAL — no persiste hasta pulsar "Guardar cambios"
  const commit = onChangeLocal;

  // horas_ult_pm ya no se edita aquí: lo escribe Plan Preventivo al registrar
  // cada PM (el hito real por plan vive en planes_pm.horas_ult_pm).
  const CAMPOS_EDIT = ["id_visible", "sistema", "marca", "modelo", "horas_actual", "mtbf_objetivo", "estado", "embarcacion_id", "parent_id", "tipo_nodo", "criticidad", "prezarpe"];
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
        {/* Altura de fila ajustable (se recuerda en el navegador) */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }} title="Ajusta la altura de las filas de la tabla">
          <Rows3 size={14} color={C.slate} style={{ marginRight: 2 }} />
          <span style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginRight: 4 }}>Altura de fila</span>
          {Object.entries(DENSIDADES).map(([k, v]) => (
            <button key={k} onClick={() => cambiarDensidad(k)} title={`Filas ${v.label.toLowerCase()}`}
              style={{ fontSize: 11.5, padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontWeight: 600,
                border: `1px solid ${densidad === k ? C.steel : C.line}`,
                background: densidad === k ? tint(C.steel, 14) : C.surface,
                color: densidad === k ? C.steel : C.slate }}>
              {v.label}
            </button>
          ))}
        </div>
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
                  : <>Genera el árbol estándar (motores diésel marinos desglosados en 10 subsistemas ISO 14224) con repuestos OEM/Alt./Genérico y planes PM para <strong>{embName(navePrecarga)}</strong>. <strong>Esencial</strong> ≈ {contarNodosPlantilla("basico")} nodos (lo del día a día); <strong>Completa</strong> ≈ {contarNodosPlantilla("completo")} nodos (incluye overhaul y mecánica profunda). No duplica lo que ya exista; puedes pasar de Esencial a Completa cuando quieras.</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <button onClick={() => precargarPlantilla("basico")} disabled={precargando || lista}
                title="Carga solo los componentes esenciales (filtros, aceite, impeller, ánodos, inyectores, baterías…), ideal para empezar rápido sin abrumar."
                style={{ ...ghostBtn, fontSize: 12.5, padding: "8px 14px", opacity: lista ? 0.5 : 1 }}>
                {precargando ? "Precargando…" : <><Layers size={14} /> Precargar esencial</>}
              </button>
              <button onClick={() => precargarPlantilla("completo")} disabled={precargando || lista}
                title="Carga la jerarquía completa, incluyendo ítems de overhaul y mecánica profunda (cigüeñal, cojinetes, camisas, turbo…)."
                style={{ ...primaryBtn, background: C.cyan, borderColor: C.cyan, opacity: lista ? 0.5 : 1 }}>
                {precargando ? "Precargando…" : <><Layers size={15} /> Precargar completa</>}
              </button>
            </div>
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280 }}>
            <thead><tr>
              {puedeOperar && <th style={{ ...thE, textAlign: "center" }} title="Reordenar por prioridad">Orden</th>}
              <th style={thE}>ID</th>
              <th style={thE}>Nave</th>
              <th style={thE}>Sistema / Equipo</th>
              <th style={thE}>Subsistema de</th>
              <th style={thE}>Marca</th>
              <th style={thE}>Modelo</th>
              <th style={{ ...thE, textAlign: "right" }}>Horas</th>
              <th style={{ ...thE, textAlign: "right" }} title="Horas del último PM registrado — lo actualiza Plan Preventivo, no se edita aquí">Últ. PM</th>
              <th style={{ ...thE, textAlign: "right" }} title="MTBF objetivo (horas)">MTBF</th>
              <th style={thE}>Estado</th>
              <th style={{ ...thE, textAlign: "center" }}>Prezarpe</th>
              {hasActions && <th style={{ ...thE, textAlign: "center" }}>Acción</th>}
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
                  const esAgrupador = e.tipo_nodo === "sistema";
                  return ([
                    <tr key={e.id} style={{ background: eqDirty(e) ? tint(C.gold, 14) : fondoTipo(e) }}>

                      {/* Orden (reordenar entre hermanos) */}
                      {puedeOperar && (
                        <td style={{ ...tdE, textAlign: "center", whiteSpace: "nowrap", padding: "4px 6px" }}>
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
                      <td style={tdE}>
                        <input value={e.id_visible} disabled={!puedeOperar} title={e.id_visible}
                          onChange={(ev) => onChangeLocal(e.id, "id_visible", ev.target.value)}
                          onBlur={(ev) => commit(e.id, "id_visible", ev.target.value)}
                          style={{ ...bluC, width: 150 }} />
                      </td>

                      {/* Nave */}
                      <td style={tdE}>
                        <select value={e.embarcacion_id} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "embarcacion_id", ev.target.value)}
                          style={{ ...inC(125), fontWeight: 600, color: embColor(e.embarcacion_id) }}>
                          {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      </td>

                      {/* Sistema — colapsable + indentación de árbol + tipo + criticidad */}
                      <td style={tdE}>
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
                            return (
                              <button onClick={() => abrirEquipoWindow(e)} title={`Abrir ventana · ${meta.label}`}
                                style={{ background: "none", border: "none", padding: 0, marginRight: 5, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                                <Ico size={13} color={meta.color} />
                              </button>
                            );
                          })()}
                          <input value={e.sistema} disabled={!puedeOperar} title={e.sistema}
                            onChange={(ev) => onChangeLocal(e.id, "sistema", ev.target.value)}
                            onBlur={(ev) => commit(e.id, "sistema", ev.target.value)}
                            style={{ ...bluC, width: Math.max(172, 262 - e.depth * 12), fontFamily: "inherit", color: e.depth === 0 ? C.abyss : C.ink, fontWeight: e.depth === 0 ? 700 : 400 }} />
                          {puedeOperar && (
                            <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                              <button onClick={() => setMenuHijo(menuHijo === e.id ? null : e.id)} title={`Agregar dentro de "${e.sistema}"`}
                                style={{ marginLeft: 6, background: menuHijo === e.id ? C.cyan : "none", border: `1px solid ${tint(C.cyan, 45)}`, borderRadius: 6, cursor: "pointer", color: menuHijo === e.id ? "#fff" : C.cyan, padding: "1px 4px", display: "flex", alignItems: "center" }}>
                                <Plus size={13} strokeWidth={2.5} />
                              </button>
                              {menuHijo === e.id && (
                                <>
                                  <div onClick={() => setMenuHijo(null)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                                  <div style={{ position: "absolute", top: "100%", left: 6, marginTop: 4, zIndex: 31, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(8,20,32,.18)", overflow: "hidden", minWidth: 150 }}>
                                    <div style={{ padding: "6px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 700, borderBottom: `1px solid ${C.foam}` }}>Agregar dentro</div>
                                    {[["subsistema", "Subsistema", GitBranch], ["componente", "Componente", Wrench], ["instrumento", "Instrumento / sensor", Cpu]].map(([tipo, label, Ico]) => (
                                      <button key={tipo} onClick={() => agregarHijo(e, tipo)}
                                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "8px 11px", fontSize: 12.5, color: C.ink }}
                                        onMouseEnter={(ev) => (ev.currentTarget.style.background = tint(C.cyan, 10))}
                                        onMouseLeave={(ev) => (ev.currentTarget.style.background = "none")}>
                                        <Ico size={14} color={colorTipo({ tipo_nodo: tipo })} /> {label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </span>
                          )}
                          {e.criticidad && <span style={{ marginLeft: 6, flexShrink: 0 }}><Pill tone={CRITICIDAD_TONE[e.criticidad]}>{e.criticidad}</Pill></span>}
                          {colapsado && nDesc > 0 && <span style={{ marginLeft: 8, fontSize: 11.5, color: C.steel, fontWeight: 600, flexShrink: 0 }} title={`${nDesc} elemento(s) ocultos`}>▸ {nDesc}</span>}
                          {/* Indicadores operacionales: punto propio (azul), sin horómetro (gris), aceite (dorado), nivel (verde) */}
                          {!esAgrupador && (e.horometro === "propio" || e.horometro === "no" || e.consume_aceite || (e.nivel_tipo && e.nivel_tipo !== "ninguno")) && (
                            <span style={{ display: "inline-flex", gap: 2, marginLeft: 5, flexShrink: 0, alignItems: "center" }}>
                              {e.horometro === "propio" && <span title="Horómetro propio"    style={{ width: 6, height: 6, borderRadius: "50%", background: C.steel, display: "inline-block" }} />}
                              {e.horometro === "no"     && <span title="Sin horómetro"       style={{ width: 6, height: 6, borderRadius: "50%", background: C.slate, display: "inline-block" }} />}
                              {e.consume_aceite         && <span title="Consume aceite"      style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold,  display: "inline-block" }} />}
                              {e.nivel_tipo && e.nivel_tipo !== "ninguno" && <span title={`Nivel prezarpe: ${e.nivel_tipo === "aceite" ? "Solo aceite" : "Aceite + agua"}`} style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Subsistema de (padre inline editable) */}
                      <td style={tdE}>
                        <select value={e.parent_id || ""} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "parent_id", ev.target.value || null)}
                          style={{ ...inC(205), color: e.parent_id ? C.steel : C.line }}>
                          <option value="">— Raíz —</option>
                          {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
                        </select>
                      </td>

                      {/* Marca / Modelo */}
                      {esAgrupador ? <td style={tdE} /> : <td style={tdE}><input value={e.marca || ""} disabled={!puedeOperar} title={e.marca || ""} onChange={(ev) => onChangeLocal(e.id, "marca", ev.target.value)} onBlur={(ev) => commit(e.id, "marca", ev.target.value)} style={inC(90)} /></td>}
                      {esAgrupador ? <td style={tdE} /> : <td style={tdE}><input value={e.modelo || ""} disabled={!puedeOperar} title={e.modelo || ""} onChange={(ev) => onChangeLocal(e.id, "modelo", ev.target.value)} onBlur={(ev) => commit(e.id, "modelo", ev.target.value)} style={inC(90)} /></td>}

                      {/* Horas */}
                      {esAgrupador
                        ? <td style={{ ...tdE, textAlign: "right" }}><span style={{ color: C.line }}>—</span></td>
                        : <td style={{ ...tdE, textAlign: "right" }}>
                            <input type="number" value={e.horas_actual} disabled={!puedeOperar}
                              onFocus={(ev) => ev.target.select()} onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)}
                              onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)}
                              style={{ ...bluC, width: 62, textAlign: "right" }} />
                          </td>}
                      {/* Último PM: solo lectura — lo escribe Plan Preventivo al registrar */}
                      {esAgrupador
                        ? <td style={{ ...tdE, textAlign: "right" }}><span style={{ color: C.line }}>—</span></td>
                        : <td style={{ ...tdE, textAlign: "right" }} title="Se actualiza al registrar un PM en Plan Preventivo">
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.slate }}>
                              {e.horas_ult_pm ? `${e.horas_ult_pm}h` : "—"}
                            </span>
                          </td>}

                      {/* MTBF objetivo (horas) */}
                      {esAgrupador
                        ? <td style={{ ...tdE, textAlign: "right" }}><span style={{ color: C.line }}>—</span></td>
                        : <td style={{ ...tdE, textAlign: "right" }}>
                            <input type="number" value={e.mtbf_objetivo ?? ""} disabled={!puedeOperar}
                              placeholder="—"
                              onFocus={(ev) => ev.target.select()} onChange={(ev) => onChangeLocal(e.id, "mtbf_objetivo", ev.target.value === "" ? null : +ev.target.value)}
                              onBlur={(ev) => commit(e.id, "mtbf_objetivo", ev.target.value === "" ? null : +ev.target.value)}
                              style={{ ...bluC, width: 62, textAlign: "right" }} />
                          </td>}

                      {/* Estado */}
                      {esAgrupador
                        ? <td style={tdE} />
                        : <td style={tdE}>
                            <select value={e.estado} disabled={!puedeOperar}
                              onChange={(ev) => commit(e.id, "estado", ev.target.value)}
                              style={inC(104)}>
                              {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </td>}

                      {/* Prezarpe */}
                      {esAgrupador
                        ? <td style={{ ...tdE, textAlign: "center" }} />
                        : <td style={{ ...tdE, textAlign: "center" }}>
                            <input type="checkbox" checked={!!e.prezarpe} disabled={!puedeOperar}
                              onChange={(ev) => commit(e.id, "prezarpe", ev.target.checked)}
                              title="Incluir en inspección de prezarpe"
                              style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                          </td>}

                      {hasActions && (
                        <td style={tdE}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <button onClick={() => abrirEquipoWindow(e)} title={`Abrir ventana de "${e.sistema}"`}
                              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", color: C.steel, padding: "2px 5px", display: "flex", alignItems: "center", flexShrink: 0 }}>
                              <PanelRightOpen size={14} />
                            </button>
                            {puedeOperar && !esAgrupador && (
                              <button onClick={() => abrirPropOp(e)}
                                title={`Config. operacional de "${e.sistema}"`}
                                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", color: C.slate, padding: "2px 5px", display: "flex", alignItems: "center", flexShrink: 0 }}>
                                <Settings2 size={14} />
                              </button>
                            )}
                            {!esAgrupador && (() => {
                              const conFicha = fichaTieneDatos(e.ficha);
                              return (
                                <button onClick={() => abrirFicha(e)}
                                  title={`Ficha técnica de "${e.sistema}"${conFicha ? " (con datos)" : ""}`}
                                  style={{ background: conFicha ? tint(C.steel, 14) : "none", border: `1px solid ${conFicha ? C.steel : C.line}`, borderRadius: 6, cursor: "pointer", color: C.steel, padding: "2px 5px", display: "flex", alignItems: "center", flexShrink: 0 }}>
                                  <FileText size={14} />
                                </button>
                              );
                            })()}
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
