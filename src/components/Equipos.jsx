import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle, GitBranch, Layers, Cpu, Wrench, Box, Hash, Check, Package, FileText, Settings2, RefreshCw, Target, Compass, ListChecks, List, Columns3, Table2, FolderTree, Search } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, estadoLabel, estadoTone, num, tint, shadow } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable } from "../lib/arbolColapsable";
import {
  PLANTILLA_PESQUERA, nodoIncluido, contarNodosPlantilla, contarRepuestosPlantilla,
  contarPlanesPMPlantilla, TIPO_NODO_META, datosOperacionalesDesdeNodo, collectFuentesPlantilla,
} from "../lib/plantillaPesquera";
import { analizarBrechas } from "../lib/equipoBrechas";
import { ordenarEquipos, kanbanEstadoKey } from "../lib/equiposKanban";
import { useMediaQuery } from "../lib/useMediaQuery";
import EquipoKanban from "./equipos/EquipoKanban";
import EquipoQueuePanel from "./equipos/EquipoQueuePanel";

import {
  Card, primaryBtn, ghostBtn, exportBtn, inputStyle, thStyle, tdStyle,
  FilterBtn, Field, Empty, GuiaColapsable, Pill,
  ModuleShell, StatGrid, HeroStat, Toolbar, Section, EmptyState,
} from "../ui";
import NotaJerarquia from "./equipos/NotaJerarquia";
import { useWindows } from "./windows/WindowManager";
import EquipoWindow, { RepuestosWindowBody } from "./equipos/EquipoWindow";
import EquipoTreePanel from "./equipos/EquipoTreePanel";
import EquipoDetailPanel from "./equipos/EquipoDetailPanel";
import EquipoOptimizePanel from "./equipos/EquipoOptimizePanel";
import EquipoExplorePanel from "./equipos/EquipoExplorePanel";
import { FichaBody } from "./equipos/FichaEquipo";
import { PropOpBody } from "./equipos/PropOpModal";
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
const MODO_KEY = "cmms-equipos-modo";
const VISTA_KEY = "cmms-equipos-vista";
const VISTA_TABLA_KEY = "cmms-equipos-vista-tabla";
const VISTAS = [
  { id: "cola", label: "Cola", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "tabla", label: "Tabla", icon: Table2 },
];
const MODOS = [
  { id: "explorar", label: "Explorar", icon: Compass },
  { id: "gestionar", label: "Gestionar", icon: ListChecks },
  { id: "optimizar", label: "Optimizar", icon: Target },
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
  const [original,    setOriginal]    = useState({});
  const [guardando,   setGuardando]   = useState(false);
  const [items,       setItems]       = useState([]);
  const [destinos,    setDestinos]    = useState([]);
  const [busqueda,    setBusqueda]    = useState("");
  const [selectedId,  setSelectedId]  = useState(null);
  const [modo,        setModo]        = useState("gestionar");
  const [vista,       setVista]       = useState("kanban");
  const [vistaTabla,  setVistaTabla]  = useState("arbol");
  const [fEstado,     setFEstado]     = useState("all");
  const [filtroBrecha, setFiltroBrecha] = useState(null);
  const [detailTab,   setDetailTab]   = useState("identidad");
  const modoInicializado = useRef(false);
  const { open } = useWindows();
  const handlersRef = useRef({});
  const arbolRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isTabla = vista === "tabla";

  // Espeja el estado a la fuente viva que leen las ventanas (drill-down).
  useEffect(() => {
    equiposStore.set({ equipos, items, destinos, embarcaciones });
  }, [equipos, items, destinos, embarcaciones]);

  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

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

  const grupoKey = (e) => `${e.parent_id ?? "root"}|${e.embarcacion_id}`;
  const posInfo = useMemo(() => {
    const info = new Map();
    const grupos = new Map();
    lista.forEach((e) => { const k = grupoKey(e); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    grupos.forEach((arr) => arr.forEach((e, i) => info.set(e.id, { first: i === 0, last: i === arr.length - 1 })));
    return info;
  }, [lista]);

  const arbol = useArbolColapsable(lista);
  arbolRef.current = arbol;

  const repsPorEquipo = useMemo(() => {
    const m = new Map();
    destinos.forEach((d) => m.set(d.equipo_id, (m.get(d.equipo_id) || 0) + 1));
    return m;
  }, [destinos]);

  const busq = busqueda.trim().toLowerCase();
  useEffect(() => {
    if (busq && arbol.colapsarTodo) arbol.colapsarTodo(false);
  }, [busq]); // eslint-disable-line react-hooks/exhaustive-deps

  const listaVisible = useMemo(() => lista.filter((eq) => {
    if (!arbol.visible(eq)) return false;
    if (!busq) return true;
    return eq.sistema?.toLowerCase().includes(busq) || eq.id_visible?.toLowerCase().includes(busq)
      || eq.marca?.toLowerCase().includes(busq) || eq.modelo?.toLowerCase().includes(busq);
  }), [lista, arbol, busq]);

  useEffect(() => {
    if (selectedId && !equipos.some((e) => e.id === selectedId)) setSelectedId(null);
  }, [equipos, selectedId]);

  useEffect(() => {
    const savedV = localStorage.getItem(VISTA_KEY);
    const savedTabla = localStorage.getItem(VISTA_TABLA_KEY);
    if (savedV && VISTAS.some((v) => v.id === savedV)) setVista(savedV);
    if (savedTabla && ["arbol", "plano"].includes(savedTabla)) setVistaTabla(savedTabla);
  }, []);

  useEffect(() => {
    localStorage.setItem(VISTA_KEY, vista);
    if (vista === "tabla") localStorage.setItem(VISTA_TABLA_KEY, vistaTabla);
  }, [vista, vistaTabla]);

  const scopeEquipos = useMemo(
    () => (filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro)),
    [equipos, filtro],
  );

  useEffect(() => {
    if (!selectedId && listaVisible.length > 0 && isTabla && vistaTabla === "arbol") setSelectedId(listaVisible[0].id);
  }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const esAgrupador = (e) => e.tipo_nodo === "sistema";

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
      if (arbolRef.current?.estaColapsado?.(parent)) arbolRef.current.toggle(parent.id);
      setSelectedId(nuevo.id);
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
      logActivity(profile, "Reordenar equipo", `${node.id_visible} · ${dir === "up" ? "subir" : "bajar"}`);
    } catch (err) {
      setEquipos((p) => p.map((e) => (e.id in previo ? { ...e, orden: previo[e.id] } : e)));
      setError("No se pudo reordenar: " + err.message);
    }
  }

  // ── Repuestos enlazados a un nodo (inventario_item_destinos) ──
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
    function patchEquipoLocal(id, fields) {
      const idx = creados.findIndex((c) => c.id === id);
      if (idx >= 0) creados[idx] = { ...creados[idx], ...fields };
    }

    async function insertarNodo(nodo, parentId, rootNom) {
      if (!nodoIncluido(nodo, modo)) return;
      const idVis = `${emb.codigo}-${nodo.cod}`;
      let nodeId = existentesNave.get(idVis);
      if (!nodeId) {
        const oper = datosOperacionalesDesdeNodo(nodo);
        const row = await insertRow("equipos", profile.empresa_id, {
          embarcacion_id: emb.id, id_visible: idVis,
          sistema: nodo.nom, tipo_nodo: nodo.tipo, criticidad: nodo.crit,
          mtbf_objetivo: nodo.mtbf ?? null,
          parametros_criticos: nodo.param ?? null,
          parent_id: parentId, created_by: profile.id,
          horometro: oper.horometro,
          consume_aceite: oper.consume_aceite,
          ...(oper.ficha ? { ficha: oper.ficha } : {}),
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

      // horas_fuente_id: hermanos (PROP-RED ← PROP-MTR) y reglas (STEER/FISH-VIR ← HPU-MTR).
      for (const { cod, fuente } of collectFuentesPlantilla()) {
        const nodeId   = existentesNave.get(`${emb.codigo}-${cod}`);
        const fuenteId = existentesNave.get(`${emb.codigo}-${fuente}`);
        if (!nodeId || !fuenteId) continue;
        const cur = equipos.find((e) => e.id === nodeId) ?? creados.find((e) => e.id === nodeId);
        if (cur?.horas_fuente_id) continue;
        await updateRow("equipos", nodeId, { horas_fuente_id: fuenteId });
        patchEquipoLocal(nodeId, { horas_fuente_id: fuenteId });
      }

      setEquipos((p) => [...p, ...creados]);
      sincOriginal();
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
      render: ({ close }) => <PropOpBody node={e} puedeOperar={puedeOperar} onSave={guardarPropOp} onDone={close} />,
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
  function abrirEquipoWindow(nodeOrId) {
    const node = typeof nodeOrId === "string" ? equipos.find((e) => e.id === nodeOrId) : nodeOrId;
    if (!node) return;
    const meta = TIPO_NODO_META[node.tipo_nodo] || TIPO_NODO_META.equipo;
    const nave = embarcaciones.find((v) => v.id === node.embarcacion_id);
    open({
      id: `eq-${node.id}`,
      title: node.sistema || node.id_visible,
      subtitle: nave ? `${node.id_visible} · ${nave.nombre || nave.codigo}` : node.id_visible,
      icon: ICONO_TIPO[node.tipo_nodo] || ICONO_TIPO.equipo,
      iconColor: meta.color,
      width: 600,
      render: () => (
        <EquipoWindow nodeId={node.id} handlersRef={handlersRef} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar} posInfo={posInfo} />
      ),
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
    editar: (id, campo, valor) => onChangeLocal(id, campo, valor),
    guardarPropOp, guardarFicha, moverNodo,
  };

  // Guarda inmediatamente los atributos operacionales (horómetro / consume aceite / nivel).
  // PropOpModal llama directamente aquí; los cambios NO pasan por la barra "Guardar cambios".
  async function guardarPropOp(id, cambios) {
    const eq = equipos.find((x) => x.id === id);
    // Avisa si se quita el horómetro propio de una máquina que tiene componentes heredando.
    if (eq?.horometro === "propio" && cambios.horometro !== "propio") {
      const heredandoJerarquia = equipos.filter((x) => {
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
      const heredandoFuente = equipos.filter((x) => x.horas_fuente_id === id);
      const heredando = [...new Set([...heredandoJerarquia, ...heredandoFuente].map((x) => x.id))]
        .map((hid) => equipos.find((x) => x.id === hid))
        .filter(Boolean);
      if (heredando.length > 0 && !window.confirm(
        `⚠️ "${eq.sistema}" tiene ${heredando.length} componente(s) que heredan sus horas.\n\nAl cambiar el modo quedarán sin horómetro hasta que se reconfiguren individualmente.\n\n¿Continuar?`
      )) return;
    }

    const payload = { ...cambios };
    if (payload.horometro !== "hereda") payload.horas_fuente_id = null;
    if (payload.horometro === "hereda" && payload.horas_fuente_id) {
      const fuente = equipos.find((x) => x.id === payload.horas_fuente_id);
      if (fuente?.horometro === "propio") payload.horas_actual = fuente.horas_actual ?? 0;
    }

    setEquipos((p) => p.map((x) => x.id === id ? { ...x, ...payload } : x));
    setOriginal((o) => o[id] ? { ...o, [id]: { ...o[id], ...payload } } : o);
    try {
      await updateRow("equipos", id, payload);
      const extra = cambios.ficha?._registro ? ` · reg:${cambios.ficha._registro}` : "";
      const fuenteTxt = payload.horas_fuente_id ? " · fuente explícita" : "";
      logActivity(profile, "Config. operacional", `${eq?.id_visible} · hor:${payload.horometro}${fuenteTxt}${extra}`);
    } catch (e) {
      setEquipos((p) => p.map((x) => x.id === id ? { ...x, ...eq } : x));
      setOriginal((o) => o[id] ? { ...o, [id]: { ...o[id], ...eq } } : o);
      setError("No se pudo guardar la configuración: " + e.message);
      throw e;
    }
  }

  function onChangeLocal(id, campo, valor) { setEquipos((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }

  // horas_ult_pm ya no se edita aquí: lo escribe Plan Preventivo al registrar
  // cada PM (el hito real por plan vive en planes_pm.horas_ult_pm).
  const CAMPOS_EDIT = ["id_visible", "sistema", "marca", "modelo", "horas_actual", "mtbf_objetivo", "estado", "embarcacion_id", "parent_id", "tipo_nodo", "criticidad", "prezarpe"];
  const eqDirty = (e) => { const o = original[e.id]; return o && CAMPOS_EDIT.some((c) => (e[c] ?? null) !== (o[c] ?? null)); };
  const dirtyIds = equipos.filter(eqDirty).map((e) => e.id);

  const kpis = useMemo(() => {
    const scope = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
    const criticos = scope.filter((e) => e.criticidad === "A").length;
    const indisponibles = scope.filter((e) => e.estado === "fuera_servicio" || e.estado === "en_reparacion").length;
    const sistemas = scope.filter((e) => e.tipo_nodo === "sistema" || !e.parent_id).length;
    const analisis = analizarBrechas(scope, destinos);
    return {
      total: scope.length,
      criticos,
      indisponibles,
      sistemas,
      sinGuardar: dirtyIds.length,
      salud: analisis.salud,
      brechas: analisis.total,
      equiposConBrecha: analisis.equiposConBrecha,
      analisis,
    };
  }, [equipos, filtro, destinos, dirtyIds.length]);

  const brechaPorEquipo = useMemo(() => {
    const m = new Map();
    kpis.analisis.items.forEach((item) => {
      if (!m.has(item.equipoId)) m.set(item.equipoId, item);
    });
    return m;
  }, [kpis.analisis.items]);

  const listaEnriquecida = useMemo(() => {
    let list = scopeEquipos.map((equipo) => ({
      equipo,
      brecha: brechaPorEquipo.get(equipo.id) || null,
      nReps: repsPorEquipo.get(equipo.id) || 0,
    }));
    if (busq) {
      list = list.filter(({ equipo }) =>
        equipo.sistema?.toLowerCase().includes(busq) ||
        equipo.id_visible?.toLowerCase().includes(busq) ||
        equipo.marca?.toLowerCase().includes(busq) ||
        equipo.modelo?.toLowerCase().includes(busq),
      );
    }
    if (fEstado !== "all") list = list.filter(({ equipo }) => kanbanEstadoKey(equipo) === fEstado);
    return ordenarEquipos(list);
  }, [scopeEquipos, brechaPorEquipo, repsPorEquipo, busq, fEstado]);

  useEffect(() => {
    if (!isTabla && !selectedId && listaEnriquecida.length > 0) setSelectedId(listaEnriquecida[0].equipo.id);
  }, [vista, fEstado, busqueda, listaEnriquecida.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading || modoInicializado.current) return;
    modoInicializado.current = true;
    const saved = localStorage.getItem(MODO_KEY);
    if (saved && MODOS.some((m) => m.id === saved)) setModo(saved);
    else if (kpis.brechas > 0) setModo("optimizar");
  }, [loading, kpis.brechas]);

  useEffect(() => {
    localStorage.setItem(MODO_KEY, modo);
  }, [modo]);

  function irABrecha(equipoId, tab, tipoBrecha) {
    setSelectedId(equipoId);
    setVista("tabla");
    setVistaTabla("arbol");
    setModo("gestionar");
    setDetailTab(tab);
    if (tipoBrecha) setFiltroBrecha(tipoBrecha);
  }

  function abrirOptimizar(filtro = null) {
    setVista("tabla");
    setVistaTabla("arbol");
    setModo("optimizar");
    setFiltroBrecha(filtro);
  }

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

  if (loading) {
    return <ModuleShell kicker="Taxonomía ISO 14224" title="Registro de Equipos" loading />;
  }

  if (embarcaciones.length === 0) {
    return (
      <ModuleShell
        kicker="Taxonomía ISO 14224"
        title="Registro de Equipos"
        error={error}
        onRetry={cargar}
      >
        <Section title="Flota requerida" padding={0}>
          <EmptyState
            icon={AlertCircle}
            title="Primero registra embarcaciones"
            description="El árbol de equipos se organiza por nave. Ve al módulo Embarcaciones y agrega al menos una embarcación."
          />
        </Section>
      </ModuleShell>
    );
  }

  const heroVariant = kpis.salud < 70 ? "critical" : kpis.salud < 90 || kpis.indisponibles > 0 ? "warn" : "ok";

  // Equipos de la nave seleccionada en el form (para el select de padre)
  const candidatosPadre = equipos.filter((e) => e.embarcacion_id === form.embarcacion_id);

  return (
    <ModuleShell
      kicker="Taxonomía ISO 14224 · Jerarquía funcional"
      title="Registro de Equipos"
      sub="Kanban por estado operacional · cola y detalle inline · árbol ISO 14224 en vista Tabla."
      error={error}
      onRetry={cargar}
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={exportar} style={exportBtn}><Download size={15} /> Exportar CSV</button>
          {puedeOperar && (
            <button type="button" onClick={() => setShowForm(!showForm)} style={primaryBtn}>
              <Plus size={16} /> Agregar equipo
            </button>
          )}
          <button type="button" onClick={cargar} title="Actualizar" data-nofx style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>
      }
      toolbar={
        <Toolbar
          left={
            <>
              <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
              {embarcaciones.map((v) => (
                <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
                  {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
                </FilterBtn>
              ))}
            </>
          }
          right={
            isTabla && vistaTabla === "arbol" ? (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {MODOS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <FilterBtn key={m.id} active={modo === m.id} onClick={() => setModo(m.id)}>
                      <Icon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                      {m.label}
                      {m.id === "optimizar" && kpis.brechas > 0 && ` (${kpis.brechas})`}
                    </FilterBtn>
                  );
                })}
              </div>
            ) : null
          }
        />
      }
    >
      <StatGrid
        hero={
          <HeroStat
            variant={heroVariant}
            icon={Target}
            label="Salud del registro"
            value={`${kpis.salud}%`}
            sub={`${kpis.analisis.completos}/${kpis.analisis.evaluables} nodos completos · ${kpis.equiposConBrecha} con brechas`}
            onClick={() => abrirOptimizar()}
          />
        }
        stats={[
          { label: "Brechas abiertas", value: kpis.brechas, sub: "acciones pendientes", icon: AlertCircle, tone: kpis.brechas ? C.amber : C.green, onClick: () => abrirOptimizar() },
          { label: "Críticos (A)", value: kpis.criticos, sub: "prioridad máxima", icon: AlertCircle, tone: kpis.criticos ? C.red : C.green, onClick: () => abrirOptimizar() },
          { label: "Indisponibles", value: kpis.indisponibles, sub: "fuera de servicio", icon: Wrench, tone: kpis.indisponibles ? C.red : C.green, onClick: () => abrirOptimizar("critico_indisponible") },
          { label: "Sin guardar", value: kpis.sinGuardar, sub: "cambios pendientes", icon: Check, tone: kpis.sinGuardar ? C.amber : C.green, onClick: () => { setVista("tabla"); setVistaTabla("arbol"); setModo("gestionar"); } },
        ]}
      />

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
        <Section title="Nuevo equipo / subsistema" padding={20} style={{ marginBottom: 24 }}>
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
            <button type="button" onClick={agregar} style={primaryBtn}>Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Section>
      )}

      {equipos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
              <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar equipo, ID, marca…"
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
                {[["arbol", "Por equipo", FolderTree], ["plano", "Plano", List]].map(([v, lbl, Ico]) => (
                  <FilterBtn key={v} active={vistaTabla === v} onClick={() => setVistaTabla(v)}>
                    <Ico size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                    {lbl}
                  </FilterBtn>
                ))}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Estado</span>
            {[["all", "Todos", C.slate], ["operativo", "Operativo", C.green], ["en_reparacion", "Reparación", C.steel], ["desgaste", "Desgaste", C.amber], ["fuera_servicio", "Fuera serv.", C.red]].map(([v, lbl, tone]) => {
              const n = v === "all" ? null : scopeEquipos.filter((e) => kanbanEstadoKey(e) === v).length;
              return (
                <FilterBtn key={v} active={fEstado === v} color={fEstado === v ? tone : undefined} onClick={() => setFEstado(v)}>
                  {lbl}{n != null && n > 0 ? ` (${n})` : ""}
                </FilterBtn>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>{listaEnriquecida.length} de {scopeEquipos.length} equipos</span>
          </div>
        </div>
      )}

      {!isTabla ? (
        <Section
          title={vista === "kanban" ? "Tablero kanban" : "Cola y detalle"}
          description={vista === "kanban" ? "Columnas por estado operacional · click en tarjeta para gestionar" : isMobile ? "Selecciona un equipo · detalle debajo" : "Cola a la izquierda · ficha del equipo a la derecha"}
          padding={0}
          style={{ marginBottom: 0 }}
        >
          {listaEnriquecida.length === 0 ? (
            <EmptyState icon={Layers} title="Sin equipos en este filtro" description="Prueba otro filtro de estado o limpia la búsqueda." />
          ) : vista === "kanban" ? (
            <div className={`inv-kanban-with-detail${selectedId ? " has-detail" : ""}`}>
              <EquipoKanban lista={listaEnriquecida} selectedId={selectedId} onSelect={setSelectedId} embName={embName} />
              {selectedId && (
                <div style={{ padding: 16, borderLeft: isMobile ? "none" : `1px solid ${C.foam}`, borderTop: isMobile ? `1px solid ${C.foam}` : "none", minHeight: 420 }}>
                  <EquipoDetailPanel nodeId={selectedId} handlers={handlersRef.current} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar} eqDirty={eqDirty} posInfo={posInfo} onSelectNode={setSelectedId} activeTab={detailTab} onTabChange={setDetailTab} embedded />
                </div>
              )}
            </div>
          ) : (
            <div className={`inv-split-container inv-split-queue-wide${isMobile ? " inv-split-stack" : ""}`}>
              <EquipoQueuePanel lista={listaEnriquecida} selectedId={selectedId} onSelect={setSelectedId} busqueda={busqueda} setBusqueda={setBusqueda} embName={embName} panelHeight={isMobile ? "auto" : "calc(100vh - 320px)"} />
              {(!isMobile || selectedId) && (
                <EquipoDetailPanel nodeId={selectedId} handlers={handlersRef.current} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar} eqDirty={eqDirty} posInfo={posInfo} onSelectNode={setSelectedId} activeTab={detailTab} onTabChange={setDetailTab} embedded />
              )}
            </div>
          )}
        </Section>
      ) : vistaTabla === "plano" ? (
        <Section title="Tabla completa" description="Listado plano · click en fila para ver detalle" padding={0}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead><tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Equipo</th>
                <th style={thStyle}>Embarcación</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Criticidad</th>
                <th style={thStyle}>Estado</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                <th style={thStyle}>Brecha</th>
              </tr></thead>
              <tbody>
                {listaEnriquecida.length === 0 ? (
                  <tr><td colSpan={8}><Empty>Sin equipos para los filtros seleccionados.</Empty></td></tr>
                ) : listaEnriquecida.map(({ equipo, brecha }) => (
                  <tr key={equipo.id} onClick={() => setSelectedId(equipo.id)} style={{ cursor: "pointer", background: selectedId === equipo.id ? tint(C.sky, 8) : undefined }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: C.steel }}>{equipo.id_visible}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{equipo.sistema}</td>
                    <td style={tdStyle}>{embName(equipo.embarcacion_id)}</td>
                    <td style={tdStyle}>{equipo.tipo_nodo || "equipo"}</td>
                    <td style={tdStyle}>{equipo.criticidad || "—"}</td>
                    <td style={tdStyle}><Pill tone={estadoTone(equipo.estado || "operativo")}>{estadoLabel(equipo.estado || "operativo")}</Pill></td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{equipo.horometro !== "no" ? num(equipo.horas_actual || 0, 0) : "—"}</td>
                    <td style={tdStyle}>{brecha ? <span style={{ color: brecha.tone === "red" ? C.red : C.amber, fontSize: 12, fontWeight: 600 }}>{brecha.label}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedId && (
            <div style={{ padding: 16, borderTop: `1px solid ${C.foam}` }}>
              <EquipoDetailPanel nodeId={selectedId} handlers={handlersRef.current} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar} eqDirty={eqDirty} posInfo={posInfo} onSelectNode={setSelectedId} activeTab={detailTab} onTabChange={setDetailTab} embedded />
            </div>
          )}
        </Section>
      ) : (
      <Section
        title={modo === "optimizar" ? "Árbol y cola de brechas" : modo === "explorar" ? "Árbol y exploración" : "Árbol y gestión"}
        description={
          modo === "optimizar"
            ? "Prioriza cerrar brechas del registro · click en un ítem abre el tab correcto"
            : modo === "explorar"
              ? "Navega la jerarquía · resumen a la derecha"
              : "Selecciona un nodo a la izquierda · edita en el panel de tabs a la derecha"
        }
        padding={0}
        style={{ marginBottom: 0 }}
      >
        <style>{`
          .eq-tree-node {
            position: relative;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 10px;
            margin-bottom: 3px;
            border-radius: 8px;
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .eq-tree-node:hover {
            background: color-mix(in srgb, ${C.sky} 5%, transparent);
            border-color: color-mix(in srgb, ${C.line} 50%, transparent);
          }
          .eq-tree-node-selected {
            background: color-mix(in srgb, ${C.sky} 10%, transparent) !important;
            border-color: color-mix(in srgb, ${C.sky} 35%, transparent) !important;
          }
          .eq-tree-node-selected .eq-tree-name { color: ${C.sky}; }
          .eq-tree-node-brecha {
            border-color: color-mix(in srgb, ${C.amber} 25%, transparent);
          }
          .eq-tree-node-brecha:hover {
            background: color-mix(in srgb, ${C.amber} 6%, transparent);
          }
        `}</style>

        {equipos.length === 0 ? (
          <Empty><NotaJerarquia /></Empty>
        ) : (
          <div className="eq-split-container inv-split-container">
            <EquipoTreePanel
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              arbol={arbol}
              listaVisible={listaVisible}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showEmb={filtro === "all"}
              embName={embName}
              repsPorEquipo={repsPorEquipo}
              eqDirty={eqDirty}
              esAgrupador={esAgrupador}
              onColapsarTodo={() => arbol.colapsarTodo(true)}
              onExpandirTodo={() => arbol.colapsarTodo(false)}
              onEliminar={eliminar}
              puedeBorrar={puedeBorrar}
              puedeOperar={puedeOperar}
              posInfo={posInfo}
              onMoverNodo={moverNodo}
              brechaPorEquipo={brechaPorEquipo}
            />
            {modo === "optimizar" ? (
              <EquipoOptimizePanel
                analisis={kpis.analisis}
                filtroBrecha={filtroBrecha}
                setFiltroBrecha={setFiltroBrecha}
                onIrABrecha={irABrecha}
                embName={filtro === "all" ? embName : null}
              />
            ) : modo === "explorar" ? (
              <EquipoExplorePanel
                nodeId={selectedId}
                repsPorEquipo={repsPorEquipo}
                onGestionar={(id) => { setSelectedId(id); setModo("gestionar"); }}
                onSelectNode={setSelectedId}
              />
            ) : (
              <EquipoDetailPanel
                nodeId={selectedId}
                handlers={handlersRef.current}
                puedeOperar={puedeOperar}
                puedeBorrar={puedeBorrar}
                eqDirty={eqDirty}
                posInfo={posInfo}
                onSelectNode={setSelectedId}
                activeTab={detailTab}
                onTabChange={setDetailTab}
                embedded
              />
            )}
          </div>
        )}
      </Section>
      )}

    </ModuleShell>
  );
}
