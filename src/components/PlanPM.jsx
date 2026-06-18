import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CalendarClock, Check, AlertCircle, Plus, Trash2, Download, Printer, History, ClipboardList, X, ChevronDown, ChevronRight, Edit3, AlertTriangle, CheckCircle2, Gauge, Info, Bell, RefreshCw, List, Columns3, Table2, FolderTree, Search } from "lucide-react";
import { planpmStore } from "./planpm/planpmStore";
import { TipoChip, CritBadge } from "./equipos/arbolUI";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar } from "../lib/arbolColapsable";
import { C, archivo, num, canOperate, isAdmin, tint, shadow } from "../theme";
import {
  Card, Pill, FilterBtn, primaryBtn, ghostBtn, exportBtn,
  inputStyle, bluInput, thStyle, tdStyle, Field, Empty, InlineSpinner, GuiaColapsable,
  ModuleShell, StatGrid, HeroStat, Toolbar, Section, EmptyState, ErrorBanner,
} from "../ui";
import ComboInput from "./ComboInput";
import { TAREAS_PM } from "../lib/tareasPM";
import { statusPlan, statusPlanCalendario, diasDesde, DIAS_POR_UNIDAD, LABEL_UNIDAD, labelIntervaloCalendario, scheduleComplianceCombinado, evaluarPlanes } from "../lib/pm";
import { ordenarPlanesPM } from "../lib/planpmKanban";
import { useMediaQuery } from "../lib/useMediaQuery";
import PMKanban from "./planpm/PMKanban";
import SavedViewsBar from "./SavedViewsBar";
import SplitDetailLayout from "./detail/SplitDetailLayout";
import {
  loadSavedViews, addSavedView, removeSavedView, mergeViews, PM_BUILTIN_VIEWS,
} from "../lib/savedViews";

const PM_SAVED_VIEWS_KEY = "cmms-pm-saved-views";
import PMQueuePanel from "./planpm/PMQueuePanel";
import PMPlanDetailPanel from "./planpm/PMPlanDetailPanel";
import { PMBar, PMBarCalendario } from "./planpm/PMBars";
import { folioOT } from "../lib/ot";
import DetailShell from "./detail/DetailShell";
import TaskCard from "./campo/TaskCard";
import { useShellOptional } from "../context/ShellContext";

const HOY = () => new Date().toISOString().slice(0, 10);
const INTERVALOS_COMUNES = [50, 100, 250, 500, 1000, 2000, 4000, 8000];
const UNIDADES_CAL = ["diario", "semanal", "mensual", "trimestral", "semestral", "anual"];
const VISTA_KEY = "cmms-planpm-vista";
const VISTA_TABLA_KEY = "cmms-planpm-vista-tabla";
const VISTAS = [
  { id: "cola", label: "Cola", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "tabla", label: "Tabla", icon: Table2 },
];

export default function PlanPM({ onNavigate, navParams }) {
  const { profile } = useAuth();
  const shell = useShellOptional();
  const isCampo = !!navParams?.campo;
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos,    setEquipos]    = useState([]);
  const [planes,     setPlanes]     = useState([]);
  const [historial,  setHistorial]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [filtro,     setFiltro]     = useState("all");
  const [savedViews, setSavedViews] = useState(() => loadSavedViews(PM_SAVED_VIEWS_KEY));
  const [activeViewId, setActiveViewId] = useState(null);
  const [viewFilters, setViewFilters] = useState(null);
  const [tab,        setTab]        = useState("plan"); // "plan" | "historial"
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const handlersRef = useRef({});

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, pls, hist] = await Promise.all([
        fetchAll("embarcaciones",  { order: { col: "codigo",      asc: true  } }),
        fetchAll("equipos",        { order: { col: "id_visible",  asc: true  } }),
        fetchAll("planes_pm",      { order: { col: "descripcion",     asc: true } }),
        fetchAll("historial_pm",   { order: { col: "created_at",  asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setPlanes(pls); setHistorial(hist);
    } catch (e) { setError("No se pudo cargar el plan PM. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (navParams?.filtro) setFiltro(navParams.filtro);
    if (navParams?.tab === "plan" || navParams?.tab === "historial") setTab(navParams.tab);
    if (navParams?.fEstado) setViewFilters((f) => ({ ...(f || {}), fEstado: navParams.fEstado }));
    if (navParams?.planId) setTab("plan");
    if (isCampo && (navParams?.embFiltro || shell?.embarcacionId)) {
      setFiltro(navParams?.embFiltro || shell.embarcacionId);
    }
  }, [navParams?.filtro, navParams?.tab, navParams?.fEstado, navParams?.planId, navParams?.embFiltro, isCampo, shell?.embarcacionId]);

  useEffect(() => {
    planpmStore.set({ planes, historial, equipos, embarcaciones });
  }, [planes, historial, equipos, embarcaciones]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  const pmViews = useMemo(() => {
    const embPresets = embarcaciones.map((e) => ({
      id: `__emb-${e.id}`,
      name: e.nombre,
      builtin: true,
      filters: { filtro: e.id },
    }));
    return mergeViews([...PM_BUILTIN_VIEWS, ...embPresets], savedViews);
  }, [embarcaciones, savedViews]);

  function aplicarVistaPm(view) {
    if (view?.filters?.filtro != null) setFiltro(view.filters.filtro);
    setViewFilters(view?.filters || null);
    setActiveViewId(view.id);
  }

  function guardarVistaPm(name) {
    const entry = addSavedView(PM_SAVED_VIEWS_KEY, { name, filters: { filtro, ...(viewFilters?.fEstado ? { fEstado: viewFilters.fEstado } : {}) } });
    if (entry) {
      setSavedViews(loadSavedViews(PM_SAVED_VIEWS_KEY));
      setActiveViewId(entry.id);
    }
  }

  function eliminarVistaPm(id) {
    setSavedViews(removeSavedView(PM_SAVED_VIEWS_KEY, id));
    if (activeViewId === id) setActiveViewId(null);
  }

  // Ids de equipos de la nave en foco (o toda la flota). El filtro por nave
  // aplica a TODO el módulo: árbol del plan, KPIs e historial.
  const idsNave = useMemo(
    () => new Set((filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro)).map((e) => e.id)),
    [equipos, filtro]
  );
  const lista   = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));
  const historialNave = filtro === "all" ? historial : historial.filter((h) => idsNave.has(h.equipo_id));

  // KPIs (respetan el filtro por nave)
  const kpis = useMemo(() => {
    let total = 0, vencidos = 0, proximos = 0;
    planes.filter((p) => p.activo && idsNave.has(p.equipo_id)).forEach((p) => {
      const eq = equipos.find((e) => e.id === p.equipo_id);
      if (!eq) return;
      let tone;
      if (p.tipo_disparador === "calendario") {
        [tone] = statusPlanCalendario(diasDesde(p.fecha_ult_pm), p.unidad_calendario, p.intervalo_calendario ?? 1);
      } else {
        [tone] = statusPlan((eq.horas_actual || 0) - (p.horas_ult_pm || 0), p.intervalo_horas);
      }
      total++;
      if (tone === "red")    vencidos++;
      if (tone === "yellow") proximos++;
    });
    const cumpl = scheduleComplianceCombinado(
      historial.filter((h) => idsNave.has(h.equipo_id)),
      planes.filter((p) => idsNave.has(p.equipo_id))
    );
    return { total, vencidos, proximos, ok: total - vencidos - proximos, cumplPct: cumpl.pct };
  }, [planes, equipos, historial, idsNave]);

  if (loading) {
    return isCampo
      ? <InlineSpinner label="Cargando plan PM…" />
      : <ModuleShell kicker="Mantenimiento preventivo" title="Plan Preventivo" loading />;
  }

  if (isCampo) {
    return (
      <div className="cmms-campo-polish" style={{ padding: "4px 0" }}>
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <TabPlan
          lista={lista} equipos={equipos} setEquipos={setEquipos}
          planes={planes} setPlanes={setPlanes}
          historial={historial} setHistorial={setHistorial}
          embarcaciones={embarcaciones} embName={embName}
          profile={profile} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          setError={setError} onNavigate={onNavigate}
          handlersRef={handlersRef}
          kpis={kpis}
          navParams={navParams}
          viewFilters={viewFilters}
          isCampo
        />
      </div>
    );
  }

  const heroVariant = kpis.vencidos > 0 ? "critical" : kpis.proximos > 0 ? "warn" : "ok";

  return (
    <ModuleShell
      kicker="Mantenimiento preventivo · ISO 14224"
      title="Plan Preventivo"
      sub="Kanban por semáforo de vencimiento · cola y detalle inline · árbol por equipo para configurar tareas."
      error={error}
      onRetry={cargar}
      action={
        <button type="button" onClick={cargar} title="Actualizar" data-nofx style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
          <RefreshCw size={15} />
        </button>
      }
      toolbar={
        <>
          <SavedViewsBar
            views={pmViews}
            activeViewId={activeViewId}
            onApply={aplicarVistaPm}
            onSave={guardarVistaPm}
            onDelete={eliminarVistaPm}
            saveLabel="Guardar filtro de nave"
          />
          <Toolbar
          left={
            <>
              {[["plan", CalendarClock, "Plan de mantenimiento"], ["historial", History, "Historial PM"]].map(([id, Icon, lbl]) => (
                <FilterBtn key={id} active={tab === id} onClick={() => setTab(id)} color={tab === id ? C.cyan : undefined}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon size={14} /> {lbl}
                  </span>
                </FilterBtn>
              ))}
            </>
          }
          right={
            <>
              {embarcaciones.map((v) => (
                <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(filtro === v.id ? "all" : v.id)} color={v.color}>
                  {v.nombre}
                </FilterBtn>
              ))}
              {filtro !== "all" && <FilterBtn active={false} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>}
            </>
          }
        />
        </>
      }
    >
      {tab === "plan" && (
        <>
          <StatGrid
            hero={
              <HeroStat
                variant={heroVariant}
                icon={kpis.vencidos > 0 ? AlertTriangle : CalendarClock}
                label="Estado del plan PM"
                value={kpis.vencidos > 0 ? `${kpis.vencidos} vencido${kpis.vencidos !== 1 ? "s" : ""}` : "Al día"}
                sub={`${kpis.total} planes activos · ${kpis.proximos} próximos · cumplimiento ${kpis.cumplPct != null ? Math.round(kpis.cumplPct) : "—"}%`}
              />
            }
            stats={[
              { label: "Próximos", value: kpis.proximos, sub: "urgencia media", icon: Bell, tone: kpis.proximos ? C.amber : C.green },
              { label: "Al día", value: kpis.ok, sub: "dentro de intervalo", icon: CheckCircle2, tone: C.green },
            ]}
          />
          <StatGrid
            stats={[
              { label: "Planes activos", value: kpis.total, sub: "tareas programadas", icon: CalendarClock, tone: C.steel },
              { label: "Cumplimiento", value: kpis.cumplPct != null ? `${Math.round(kpis.cumplPct)}%` : "—", sub: "meta SMRP ≥ 90%", icon: Gauge, tone: kpis.cumplPct >= 90 ? C.green : kpis.cumplPct >= 70 ? C.amber : C.red },
            ]}
          />
          <TabPlan
            lista={lista} equipos={equipos} setEquipos={setEquipos}
            planes={planes} setPlanes={setPlanes}
            historial={historial} setHistorial={setHistorial}
            embarcaciones={embarcaciones} embName={embName}
            profile={profile} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
            setError={setError} onNavigate={onNavigate}
            handlersRef={handlersRef}
            kpis={kpis}
            navParams={navParams}
            viewFilters={viewFilters}
          />
        </>
      )}
      {tab === "historial" && (
        <TabHistorial historial={historialNave} planes={planes} equipos={equipos} embName={embName} />
      )}
    </ModuleShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB PLAN
// ─────────────────────────────────────────────────────────────────
function TabPlan({ lista, equipos, setEquipos, planes, setPlanes, historial, setHistorial, embName, profile, puedeOperar, puedeBorrar, setError, onNavigate, handlersRef, navParams, viewFilters, isCampo = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [showCampoDetail, setShowCampoDetail] = useState(false);
  const [vista, setVista] = useState(isCampo ? "cola" : "kanban");
  const [vistaTabla, setVistaTabla] = useState("arbol");
  const [fEstado, setFEstado] = useState("all");
  const [rightTab, setRightTab] = useState("planes");
  const [addingPlan, setAddingPlan] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [newPlan, setNewPlan] = useState({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, unidad_calendario: "mensual", intervalo_calendario: 1, horas_ult_pm: "", fecha_ult_pm: "" });
  const [registrando, setRegistrando] = useState(null); // plan_pm_id
  const [regForm, setRegForm] = useState({ realizado_por: "", notas: "", crearOT: false });
  const [editHitoId, setEditHitoId] = useState(null); // plan_pm_id
  const [hitoForm, setHitoForm] = useState({ horas: "", fecha: "" });
  const [editandoPlan, setEditandoPlan] = useState(null); // plan_pm_id en edición
  const [editPlanForm, setEditPlanForm] = useState({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, intervalo_calendario: 1, unidad_calendario: "mensual" });

  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isTabla = vista === "tabla";

  const arbol = useArbolColapsable(lista);
  const busq = busqueda.trim().toLowerCase();

  useEffect(() => {
    if (viewFilters?.fEstado) setFEstado(viewFilters.fEstado);
  }, [viewFilters?.fEstado]);

  useEffect(() => {
    if (navParams?.planId) {
      setSelectedPlanId(navParams.planId);
      setVista("cola");
      setDetailOpen(true);
      if (isCampo) setShowCampoDetail(true);
    }
    if (navParams?.equipoId) {
      setSelectedId(navParams.equipoId);
      setVista("tabla");
      setVistaTabla("arbol");
    }
    if (navParams?.fEstado) setFEstado(navParams.fEstado);
  }, [navParams?.planId, navParams?.equipoId, navParams?.fEstado, isCampo]);

  useEffect(() => {
    const saved = localStorage.getItem(VISTA_KEY);
    const savedTabla = localStorage.getItem(VISTA_TABLA_KEY);
    if (saved && VISTAS.some((v) => v.id === saved)) setVista(saved);
    if (savedTabla && ["arbol", "plano"].includes(savedTabla)) setVistaTabla(savedTabla);
  }, []);

  useEffect(() => {
    localStorage.setItem(VISTA_KEY, vista);
    if (vista === "tabla") localStorage.setItem(VISTA_TABLA_KEY, vistaTabla);
  }, [vista, vistaTabla]);

  const idsEnLista = useMemo(() => new Set(lista.map((e) => e.id)), [lista]);
  const planesActivos = useMemo(
    () => planes.filter((p) => p.activo && idsEnLista.has(p.equipo_id)),
    [planes, idsEnLista],
  );
  const evaluados = useMemo(
    () => ordenarPlanesPM(evaluarPlanes(planesActivos, equipos)),
    [planesActivos, equipos],
  );
  const evaluadosFiltrados = useMemo(() => {
    let list = evaluados;
    if (fEstado !== "all") list = list.filter((x) => x.tone === fEstado);
    if (busq) {
      list = list.filter(({ plan, equipo }) =>
        plan.descripcion?.toLowerCase().includes(busq) ||
        equipo?.sistema?.toLowerCase().includes(busq) ||
        equipo?.id_visible?.toLowerCase().includes(busq),
      );
    }
    return list;
  }, [evaluados, fEstado, busq]);

  const selectedEval = useMemo(
    () => evaluadosFiltrados.find((x) => x.plan.id === selectedPlanId) || evaluadosFiltrados[0] || null,
    [evaluadosFiltrados, selectedPlanId],
  );

  useEffect(() => {
    if (selectedPlanId && !evaluados.some((x) => x.plan.id === selectedPlanId)) setSelectedPlanId(null);
  }, [evaluados, selectedPlanId]);

  useEffect(() => {
    if (!isTabla && !selectedPlanId && evaluadosFiltrados.length > 0) setSelectedPlanId(evaluadosFiltrados[0].plan.id);
  }, [vista, fEstado, busqueda, evaluadosFiltrados.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand tree when search query is typed
  useEffect(() => {
    if (busq && arbol.colapsarTodo) {
      arbol.colapsarTodo(false);
    }
  }, [busq]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reacciona a busq; arbol se redefine cada render

  const listaVisible = lista.filter((eq) => {
    if (!arbol.visible(eq)) return false;
    if (!busq) return true;
    if (eq.sistema?.toLowerCase().includes(busq)) return true;
    if (eq.id_visible?.toLowerCase().includes(busq)) return true;
    return planes.some((p) => p.equipo_id === eq.id && p.activo && p.descripcion?.toLowerCase().includes(busq));
  });

  const eqSeleccionado = selectedId ? equipos.find((e) => e.id === selectedId) : null;
  const planesEq = eqSeleccionado ? planes.filter((p) => p.equipo_id === eqSeleccionado.id && p.activo) : [];
  const historialEq = eqSeleccionado ? historial.filter((h) => h.equipo_id === eqSeleccionado.id) : [];

  if (lista.length === 0) return (
    <Card><Empty>
      <AlertCircle size={28} color={C.amber} style={{ marginBottom: 8 }} /><br />
      No hay equipos. Ve a <strong>Equipos</strong> y carga la maquinaria de tu flota.
    </Empty></Card>
  );

  const obtenerBreadcrumbs = (eq) => {
    const crumbs = [];
    let cur = eq.parent_id ? equipos.find((e) => e.id === eq.parent_id) : null;
    while (cur) {
      crumbs.unshift(cur.sistema);
      cur = cur.parent_id ? equipos.find((e) => e.id === cur.parent_id) : null;
    }
    return crumbs.join(" > ");
  };

  async function agregarPlan(equipoId, planData) {
    if (!planData.descripcion.trim()) return;
    const eq = equipos.find((e) => e.id === equipoId);
    const esCalendario = planData.tipo_disparador === "calendario";
    try {
      const nuevo = await insertRow("planes_pm", profile.empresa_id, {
        equipo_id:            equipoId,
        descripcion:          planData.descripcion.trim(),
        tipo_disparador:      planData.tipo_disparador,
        intervalo_horas:      esCalendario ? null : +planData.intervalo_horas,
        unidad_calendario:    esCalendario ? planData.unidad_calendario : null,
        intervalo_calendario: esCalendario ? +planData.intervalo_calendario : null,
        activo:               true,
        horas_ult_pm:         esCalendario ? null : (planData.horas_ult_pm !== "" ? +planData.horas_ult_pm : 0),
        fecha_ult_pm:         planData.fecha_ult_pm || null,
      });
      setPlanes((p) => [...p, nuevo]);
      const cadaLabel = esCalendario
        ? `cada ${nuevo.intervalo_calendario} ${LABEL_UNIDAD[nuevo.unidad_calendario] || nuevo.unidad_calendario}`
        : `cada ${nuevo.intervalo_horas}h`;
      logActivity(profile, "Crear plan PM", `${eq?.sistema} · ${cadaLabel}`);
    } catch (e) { setError("No se pudo crear el plan: " + e.message); throw e; }
  }

  function abrirEditHito(plan) {
    setEditHitoId(plan.id);
    setHitoForm({
      horas: plan.horas_ult_pm != null && plan.horas_ult_pm > 0 ? String(plan.horas_ult_pm) : "",
      fecha: plan.fecha_ult_pm || "",
    });
  }

  async function guardarHito(plan, form) {
    const esCalendario = plan.tipo_disparador === "calendario";
    const horas  = !esCalendario ? (form.horas !== "" ? +form.horas : 0) : null;
    const fecha  = form.fecha || null;
    const prev   = { horas_ult_pm: plan.horas_ult_pm, fecha_ult_pm: plan.fecha_ult_pm };
    const update = esCalendario ? { fecha_ult_pm: fecha } : { horas_ult_pm: horas, fecha_ult_pm: fecha };
    setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...update } : x));
    try {
      await updateRow("planes_pm", plan.id, update);
      const logLabel = esCalendario
        ? `${plan.descripcion} · ${fecha || "sin fecha"}`
        : `${plan.descripcion} · ${horas}h · ${fecha || "sin fecha"}`;
      logActivity(profile, "Ajustar hito PM", logLabel);
    } catch (e) {
      setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...prev } : x));
      setError("No se pudo guardar el hito: " + e.message);
      throw e;
    }
  }

  async function updatePlan(plan, form) {
    const esCalendario = form.tipo_disparador === "calendario";
    const update = {
      descripcion:          form.descripcion.trim(),
      tipo_disparador:      form.tipo_disparador,
      intervalo_horas:      esCalendario ? null : +form.intervalo_horas,
      intervalo_calendario: esCalendario ? +form.intervalo_calendario : null,
      unidad_calendario:    esCalendario ? form.unidad_calendario : null,
    };
    const prev = { descripcion: plan.descripcion, tipo_disparador: plan.tipo_disparador, intervalo_horas: plan.intervalo_horas, intervalo_calendario: plan.intervalo_calendario, unidad_calendario: plan.unidad_calendario };
    setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...update } : x));
    try {
      await updateRow("planes_pm", plan.id, update);
      const cadaLabel = esCalendario
        ? `cada ${update.intervalo_calendario} ${LABEL_UNIDAD[update.unidad_calendario] || update.unidad_calendario}`
        : `cada ${update.intervalo_horas}h`;
      logActivity(profile, "Editar plan PM", `${update.descripcion} · ${cadaLabel}`);
    } catch (e) {
      setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...prev } : x));
      setError("No se pudo actualizar el plan: " + e.message);
      throw e;
    }
  }

  async function eliminarPlan(planId) {
    const plan = planes.find((p) => p.id === planId);
    if (!window.confirm(`¿Eliminar el plan "${plan?.descripcion}"? Se borrará también su historial.`)) return;
    setPlanes((p) => p.filter((x) => x.id !== planId));
    try { await deleteRow("planes_pm", planId); }
    catch (e) { setPlanes((p) => [...p, plan]); setError("No se pudo eliminar: " + e.message); }
  }

  async function registrarPM(plan, form) {
    const eq           = equipos.find((e) => e.id === plan.equipo_id);
    const horas        = eq?.horas_actual || 0;
    const fecha        = HOY();
    const esCalendario = plan.tipo_disparador === "calendario";
    const elapsed      = esCalendario
      ? diasDesde(plan.fecha_ult_pm)
      : horas - (plan.horas_ult_pm || 0);
    let otId = null;

    try {
      if (form.crearOT && eq) {
        const [tone] = esCalendario
          ? statusPlanCalendario(elapsed, plan.unidad_calendario, plan.intervalo_calendario ?? 1)
          : statusPlan(elapsed, plan.intervalo_horas);
        const prio = tone === "red" ? "alta" : tone === "yellow" ? "media" : "baja";
        const otsActuales = await fetchAll("ordenes_trabajo");
        const folio = folioOT(otsActuales, true);
        const ot = await insertRow("ordenes_trabajo", profile.empresa_id, {
          folio, embarcacion_id: eq.embarcacion_id, equipo_id: eq.id,
          sistema: eq.sistema, tipo: "preventivo",
          descripcion: esCalendario
            ? `PM Cal · ${plan.descripcion}`
            : `PM ${plan.intervalo_horas}h · ${plan.descripcion}`,
          prioridad: prio, fecha, estado: "planificada", created_by: profile.id,
        });
        otId = ot.id;
      }
      const pmUpdate = esCalendario ? { fecha_ult_pm: fecha } : { horas_ult_pm: horas, fecha_ult_pm: fecha };
      await updateRow("planes_pm", plan.id, pmUpdate);
      setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...pmUpdate } : x));
      if (eq) {
        await updateRow("equipos", eq.id, { horas_ult_pm: horas, fecha_ult_pm: fecha });
        setEquipos((p) => p.map((e) => e.id === eq.id ? { ...e, horas_ult_pm: horas, fecha_ult_pm: fecha } : e));
      }
      const registro = await insertRow("historial_pm", profile.empresa_id, {
        plan_pm_id: plan.id, equipo_id: plan.equipo_id,
        horas_realizacion: horas, fecha_realizacion: fecha,
        realizado_por: (form.realizado_por || "").trim() || profile.nombre || "",
        notas: (form.notas || "").trim() || null,
        ot_id: otId, created_by: profile.id,
      });
      setHistorial((p) => [registro, ...p]);
      logActivity(profile, "Registrar PM", `${eq?.sistema} · ${plan.descripcion} · ${num(horas)}h`);
      if (otId && form.crearOT) onNavigate?.("ots", { otId });
    } catch (e) { setError("No se pudo registrar el PM: " + e.message); throw e; }
  }

  function exportarPlan() {
    const filas = [
      ["Equipo", "ID visible", "Disparador", "Tarea PM", "Intervalo", "Último PM (h)", "Última fecha PM", "Estado"],
      ...planes.filter((p) => p.activo).map((p) => {
        const eq  = equipos.find((e) => e.id === p.equipo_id);
        const esCal = p.tipo_disparador === "calendario";
        let estado = "";
        if (esCal) {
          const [, label] = statusPlanCalendario(diasDesde(p.fecha_ult_pm), p.unidad_calendario, p.intervalo_calendario ?? 1);
          estado = label;
        } else {
          const elapsed = (eq?.horas_actual || 0) - (p.horas_ult_pm || 0);
          const [, label] = statusPlan(elapsed, p.intervalo_horas);
          estado = label;
        }
        return [
          eq?.sistema || "—",
          eq?.id_visible || "—",
          esCal ? "Calendario" : "Horas",
          p.descripcion,
          esCal ? labelIntervaloCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1) : `${p.intervalo_horas}h`,
          esCal ? "" : (p.horas_ult_pm || 0),
          p.fecha_ult_pm || "Nunca",
          estado,
        ];
      }),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "plan_pm.csv"; a.click();
  }

  function imprimirPlan() {
    const fechaHoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
    const SC = { red: "#ef4444", yellow: "#f59e0b", green: "#22c55e" };
    const SB = { red: "#fef2f2", yellow: "#fffbeb", green: "#f0fdf4" };

    const planActivos = planes.filter((p) => p.activo);
    let nVenc = 0, nProx = 0;

    const filasPDF = planActivos.map((p) => {
      const eq      = equipos.find((e) => e.id === p.equipo_id);
      const esCal   = p.tipo_disparador === "calendario";
      const elapsed = esCal ? diasDesde(p.fecha_ult_pm) : (eq?.horas_actual || 0) - (p.horas_ult_pm || 0);
      const [tone, label] = esCal
        ? statusPlanCalendario(elapsed, p.unidad_calendario, p.intervalo_calendario ?? 1)
        : statusPlan(elapsed, p.intervalo_horas);
      if (tone === "red")    nVenc++;
      if (tone === "yellow") nProx++;
      const intervalo = esCal
        ? labelIntervaloCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1)
        : `${p.intervalo_horas}h`;
      const ultimoPM = p.fecha_ult_pm
        ? new Date(p.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")
        : "Nunca";
      return `<tr style="background:${SB[tone]};border-bottom:1px solid #e2e8f0">
        <td>${eq?.id_visible || "—"}</td>
        <td style="font-weight:600">${eq?.sistema || "—"}</td>
        <td>${p.descripcion}</td>
        <td style="text-align:center;color:#64748b">${esCal ? "Cal" : "H"}</td>
        <td style="text-align:right;font-family:monospace">${intervalo}</td>
        <td style="text-align:center">${ultimoPM}</td>
        <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${SC[tone]}22;color:${SC[tone]};font-weight:700;font-size:10px">${label}</span></td>
      </tr>`;
    }).join("");

    const kpiBar = [
      ["Planes activos", planActivos.length, "#0369a1"],
      ["Vencidos",       nVenc,              "#ef4444"],
      ["Próximos",       nProx,              "#f59e0b"],
      ["Al día",         planActivos.length - nVenc - nProx, "#22c55e"],
    ].map(([l, v, c]) =>
      `<div style="margin-right:32px"><div style="font-size:22px;font-weight:800;color:${c}">${v}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b">${l}</div></div>`
    ).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Plan PM · ${fechaHoy}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;background:#fff;padding:0}
@media print{@page{size:A4 landscape;margin:14mm 12mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
.hdr{padding:14px 0 10px;border-bottom:2.5px solid #0f172a;margin-bottom:14px}
.hdr h1{font-size:17px;font-weight:800;letter-spacing:-.3px}
.hdr .sub{font-size:11px;color:#64748b;margin-top:3px}
.kpis{display:flex;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{background:#0f172a;color:#fff}
thead th{padding:6px 8px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;text-align:left}
thead th:nth-child(4),thead th:nth-child(5),thead th:nth-child(6),thead th:nth-child(7){text-align:center}
tbody td{padding:5px 8px;vertical-align:middle}
.ftr{margin-top:14px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:6px}
</style></head><body>
<div class="hdr">
  <h1>Plan de Mantenimiento Preventivo</h1>
  <div class="sub">Generado el ${fechaHoy}${profile?.nombre ? " · " + profile.nombre : ""}</div>
</div>
<div class="kpis">${kpiBar}</div>
<table>
  <thead><tr><th>ID visible</th><th>Equipo / Componente</th><th>Tarea PM</th><th>Tipo</th><th>Intervalo</th><th>Último PM</th><th>Estado</th></tr></thead>
  <tbody>${filasPDF}</tbody>
</table>
<div class="ftr"><span>Korelfox CMMS · Plan Preventivo</span><span>${fechaHoy}</span></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) { setError("El navegador bloqueó la ventana emergente. Permite pop-ups para esta página."); return; }
    w.document.write(html);
    w.document.close();
  }

  handlersRef.current = {
    registrarPM, guardarHito, agregarPlan, eliminarPlan,
    nombreUsuario: profile?.nombre || "",
  };

  const planDetailProps = {
    item: selectedEval,
    embName,
    profile,
    puedeOperar,
    puedeBorrar,
    registrando,
    regForm,
    setRegForm,
    setRegistrando,
    editHitoId,
    hitoForm,
    setHitoForm,
    setEditHitoId,
    onRegistrar: registrarPM,
    onGuardarHito: guardarHito,
    onAbrirEditHito: abrirEditHito,
    onEliminar: eliminarPlan,
    onVerEquipo: (eqId) => { setSelectedId(eqId); setVista("tabla"); setVistaTabla("arbol"); },
  };

  if (isCampo) {
    if (showCampoDetail && selectedEval) {
      return (
        <DetailShell
          title={selectedEval.plan.descripcion}
          subtitle={selectedEval.equipo?.sistema || selectedEval.equipo?.id_visible}
          onBack={() => setShowCampoDetail(false)}
          campo
          backLabel="Plan PM"
        >
          <PMPlanDetailPanel {...planDetailProps} />
        </DetailShell>
      );
    }

    return (
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Plan preventivo</div>
        <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
          {evaluadosFiltrados.length} tarea{evaluadosFiltrados.length !== 1 ? "s" : ""} · toca para registrar PM
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={18} color={C.slate} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar tarea o equipo…"
            className="cmms-campo-touch"
            style={{ ...inputStyle(), width: "100%", paddingLeft: 42, fontSize: 16, minHeight: 48 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[["all", "Todos"], ["red", "Vencido"], ["yellow", "Próximo"], ["green", "OK"]].map(([v, lbl]) => {
            const n = v === "all" ? null : evaluados.filter((x) => x.tone === v).length;
            const tone = v === "red" ? C.red : v === "yellow" ? C.amber : v === "green" ? C.green : C.slate;
            return (
              <FilterBtn key={v} active={fEstado === v} color={fEstado === v ? tone : undefined} onClick={() => setFEstado(v)}>
                {lbl}{n != null && n > 0 ? ` (${n})` : ""}
              </FilterBtn>
            );
          })}
        </div>

        {evaluadosFiltrados.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin tareas PM" description="No hay mantenimientos pendientes en este filtro." />
        ) : (
          evaluadosFiltrados.map(({ plan, equipo, tone, label }) => (
            <TaskCard
              key={plan.id}
              tone={tone === "red" ? "red" : tone === "yellow" ? "amber" : tone === "green" ? "green" : "steel"}
              badge={equipo?.id_visible}
              badgeLabel={label}
              title={plan.descripcion}
              subtitle={equipo?.sistema || undefined}
              meta={embName(equipo?.embarcacion_id)}
              cta="Registrar PM"
              onClick={() => { setSelectedPlanId(plan.id); setShowCampoDetail(true); }}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
            <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tarea o equipo…"
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" onClick={exportarPlan} style={exportBtn}><Download size={14} /> Exportar</button>
            <button type="button" onClick={imprimirPlan} style={ghostBtn}><Printer size={14} /> Imprimir</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Estado</span>
          {[["all", "Todos", C.slate], ["green", "OK", C.green], ["yellow", "Próximo", C.amber], ["red", "Vencido", C.red]].map(([v, lbl, tone]) => {
            const n = v === "all" ? null : evaluados.filter((x) => x.tone === v).length;
            return (
              <FilterBtn key={v} active={fEstado === v} color={fEstado === v ? tone : undefined} onClick={() => setFEstado(v)}>
                {lbl}{n != null && n > 0 ? ` (${n})` : ""}
              </FilterBtn>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>{evaluadosFiltrados.length} de {evaluados.length} tareas PM</span>
        </div>
      </div>

      {!isTabla ? (
        <Section
          title={vista === "kanban" ? "Tablero kanban" : "Cola y detalle"}
          description={vista === "kanban" ? "Columnas por semáforo · click en tarjeta para registrar PM" : isMobile ? "Selecciona una tarea · detalle debajo" : "Cola a la izquierda · acciones a la derecha"}
          padding={0}
          style={{ marginBottom: 0 }}
        >
          {evaluadosFiltrados.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sin tareas PM en este filtro" description="Prueba otro filtro de estado o limpia la búsqueda." />
          ) : vista === "kanban" ? (
            <div className={`inv-kanban-with-detail${selectedEval ? " has-detail" : ""}`}>
              <PMKanban lista={evaluadosFiltrados} selectedId={selectedEval?.plan.id} onSelect={setSelectedPlanId} embName={embName} />
              {selectedEval && (
                <div style={{ padding: 16, borderLeft: isMobile ? "none" : `1px solid ${C.foam}`, borderTop: isMobile ? `1px solid ${C.foam}` : "none", minHeight: 420 }}>
                  <PMPlanDetailPanel {...planDetailProps} />
                </div>
              )}
            </div>
          ) : (
            <SplitDetailLayout
              variant="queue-wide"
              stack={isMobile}
              hasSelection={!!selectedEval}
              selectionKey={selectedEval?.plan.id}
              detailOpen={detailOpen}
              onDetailOpenChange={setDetailOpen}
              queue={
                <PMQueuePanel lista={evaluadosFiltrados} selectedId={selectedEval?.plan.id} onSelect={setSelectedPlanId}
                  busqueda={busqueda} setBusqueda={setBusqueda} embName={embName} panelHeight={isMobile ? "auto" : "calc(100vh - 320px)"} />
              }
              detail={selectedEval ? <PMPlanDetailPanel {...planDetailProps} /> : null}
            />
          )}
        </Section>
      ) : vistaTabla === "plano" ? (
        <Section title="Tabla completa" description="Todas las tareas PM · click en fila para ver detalle" padding={0}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1536 }}>
              <thead><tr>
                <th style={thStyle}>Estado</th>
                <th style={{ ...thStyle, minWidth: 288 }}>Tarea PM</th>
                <th style={{ ...thStyle, minWidth: 288 }}>Equipo</th>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Intervalo</th>
                <th style={thStyle}>Último PM</th>
                <th style={thStyle}>Progreso</th>
              </tr></thead>
              <tbody>
                {evaluadosFiltrados.length === 0 ? (
                  <tr><td colSpan={8}><Empty>Sin tareas para los filtros seleccionados.</Empty></td></tr>
                ) : evaluadosFiltrados.map(({ plan, equipo, esCalendario, elapsed, tone, label }) => (
                  <tr key={plan.id} onClick={() => setSelectedPlanId(plan.id)}
                    style={{ cursor: "pointer", background: selectedPlanId === plan.id ? tint(C.sky, 8) : undefined }}>
                    <td style={tdStyle}><Pill tone={tone}>{label}</Pill></td>
                    <td style={{ ...tdStyle, fontWeight: 700, minWidth: 288 }}>{plan.descripcion}</td>
                    <td style={{ ...tdStyle, minWidth: 288 }}>{equipo?.sistema || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{equipo?.id_visible || "—"}</td>
                    <td style={tdStyle}>{esCalendario ? "Calendario" : "Horas"}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>
                      {esCalendario ? labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1) : `${plan.intervalo_horas}h`}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{plan.fecha_ult_pm || "Nunca"}</td>
                    <td style={tdStyle}>
                      {esCalendario
                        ? <PMBarCalendario diasElapsed={elapsed} unidad={plan.unidad_calendario} intervalo={plan.intervalo_calendario ?? 1} />
                        : <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedEval && (
            <div style={{ padding: 16, borderTop: `1px solid ${C.foam}` }}>
              <PMPlanDetailPanel {...planDetailProps} />
            </div>
          )}
        </Section>
      ) : (
        <Section title="Por equipo" description="Árbol de equipos · configura tareas PM por componente" padding={0}>
    <div className="pm-split-container eq-split-container inv-split-container inv-split-table-wide">
      {/* Estilos locales del rediseño */}
      <style>{`
        .pm-split-container.pm-split-container {
          margin-top: 0;
        }
        .pm-tree-node {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin-bottom: 4px;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          background: transparent;
          transition: all 0.2s ease;
        }
        .pm-tree-node:hover {
          background: color-mix(in srgb, ${C.sky} 4%, transparent);
          border-color: color-mix(in srgb, ${C.line} 50%, transparent);
        }
        .pm-tree-node-selected {
          background: color-mix(in srgb, ${C.sky} 8%, transparent) !important;
          border-color: color-mix(in srgb, ${C.sky} 35%, transparent) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .pm-tree-node-selected .pm-tree-name {
          color: ${C.sky} !important;
          font-weight: 700;
        }
        .pm-tree-line-v {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          border-left: 1px dashed ${C.line};
          opacity: 0.55;
        }
        .pm-tree-line-h {
          position: absolute;
          top: 18px;
          height: 1px;
          border-bottom: 1px dashed ${C.line};
          opacity: 0.55;
        }
        .pm-preset-chip {
          padding: 5px 11px;
          border-radius: 20px;
          border: 1px solid ${C.line};
          background: ${C.surface};
          color: ${C.slate};
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pm-preset-chip:hover {
          border-color: ${C.sky};
          background: color-mix(in srgb, ${C.sky} 6%, transparent);
          color: ${C.sky};
        }
        .pm-preset-chip-active {
          border-color: ${C.sky};
          background: ${C.sky};
          color: #fff;
        }
        .pm-slider-toggle {
          display: flex;
          background: ${C.surface2};
          border: 1px solid ${C.line};
          border-radius: 10px;
          padding: 3px;
          gap: 2px;
        }
        .pm-slider-btn {
          flex: 1;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: ${C.slate};
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .pm-slider-btn-active {
          background: ${C.surface};
          color: ${C.abyss};
          box-shadow: ${shadow.sm};
        }
        .pm-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: ${C.red};
          box-shadow: 0 0 0 2px rgba(216, 68, 60, 0.3);
          animation: pm-pulse 1.6s infinite;
        }
        @keyframes pm-pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(216, 68, 60, 0.5); }
          70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(216, 68, 60, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(216, 68, 60, 0); }
        }
      `}</style>

      {/* PANEL IZQUIERDO: ÁRBOLES Y BÚSQUEDA */}
      <Card style={{ padding: 16, height: "calc(100vh - 230px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo o tarea…"
            style={{ ...inputStyle(), padding: "8px 12px", fontSize: 13, flex: 1 }} />
          {busqueda && (
            <button onClick={() => setBusqueda("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => arbol.colapsarTodo(true)}
            style={{ ...ghostBtn, padding: "5px 10px", fontSize: 11.5, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <ChevronRight size={13} /> Colapsar todo
          </button>
          <button onClick={() => arbol.colapsarTodo(false)}
            style={{ ...ghostBtn, padding: "5px 10px", fontSize: 11.5, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <ChevronDown size={13} /> Expandir todo
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginTop: 4 }}>
          {listaVisible.map((eq) => {
            const isSelected = selectedId === eq.id;
            const tieneHijos = arbol.tieneHijos(eq);
            const colapsado = arbol.estaColapsado(eq);
            const nSub = arbol.nSubDe(eq);
            const esAgrupador = eq.tipo_nodo === "sistema";

            // Calculo de planes vencidos de este equipo
            const planesEqCount = planes.filter((p) => p.equipo_id === eq.id && p.activo);
            const vencidosEq = planesEqCount.filter((p) => {
              if (p.tipo_disparador === "calendario") {
                return statusPlanCalendario(diasDesde(p.fecha_ult_pm), p.unidad_calendario, p.intervalo_calendario ?? 1)[0] === "red";
              }
              return statusPlan((eq.horas_actual || 0) - (p.horas_ult_pm || 0), p.intervalo_horas)[0] === "red";
            }).length;

            return (
              <div
                key={eq.id}
                className={`pm-tree-node${isSelected ? " pm-tree-node-selected" : ""}`}
                onClick={() => setSelectedId(eq.id)}
                style={{
                  paddingLeft: eq.depth * 20 + 12,
                  minHeight: 40,
                }}
              >
                {/* Conectores visuales del árbol */}
                {Array.from({ length: eq.depth }).map((_, idx) => (
                  <div
                    key={idx}
                    className="pm-tree-line-v"
                    style={{ left: idx * 20 + 10 }}
                  />
                ))}
                {eq.depth > 0 && (
                  <div
                    className="pm-tree-line-h"
                    style={{
                      left: (eq.depth - 1) * 20 + 10,
                      width: 10,
                    }}
                  />
                )}

                {/* Chevron para colapso */}
                {tieneHijos ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); arbol.toggle(eq.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0, display: "flex", alignItems: "center", zIndex: 5 }}
                  >
                    {colapsado ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                ) : (
                  <span style={{ width: 15 }} />
                )}

                {/* Tipo de Nodo */}
                <TipoChip tipo={eq.tipo_nodo} size={22} style={{ flexShrink: 0 }} />

                {/* Nombre y datos del equipo */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="pm-tree-name" style={{ fontSize: 13, fontWeight: 600, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {eq.sistema}
                    </span>
                    <CritBadge crit={eq.criticidad} />
                  </div>
                  <span style={{ fontSize: 10.5, color: C.slate, fontFamily: "monospace" }}>
                    {eq.id_visible} {!esAgrupador && `· ${num(eq.horas_actual || 0, 0)}h`}
                  </span>
                </div>

                {/* Alertas */}
                {vencidosEq > 0 && <div className="pm-pulse-dot" title={`${vencidosEq} planes vencidos`} />}
                {colapsado && nSub > 0 && (
                  <span style={{ fontSize: 10, color: C.steel, fontWeight: 700 }}>▸{nSub}</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* PANEL DERECHO: DETALLE DE TRABAJO O RESUMEN GLOBAL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        {!eqSeleccionado ? (
          /* MODO RESUMEN GLOBAL (NADA SELECCIONADO) */
          <Card style={{ padding: 24, minHeight: "calc(100vh - 230px)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: tint(C.steel, 10), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CalendarClock size={24} color={C.steel} />
                </div>
                <div>
                  <h2 style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss, margin: 0 }}>Planificación Preventiva Flota</h2>
                  <p style={{ fontSize: 12.5, color: C.slate, margin: "2px 0 0" }}>Selecciona un equipo en el árbol para configurar tareas y registrar mantenimientos.</p>
            </div>
          </div>

              {/* Guía de Intervalos */}
              <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 20 }}>
                <h3 style={{ ...archivo, fontSize: 14, fontWeight: 700, color: C.abyss, marginBottom: 12 }}>Guía Práctica de Intervalos PM (ISO 14224)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { h: "250 horas", d: "Sistemas críticos con uso intensivo (hidráulico de pesca, combustible, generadores principales)." },
                    { h: "500 horas", d: "Motor principal y reductores: cambio de aceite, filtros y chequeo general de tolerancias." },
                    { h: "1000 horas", d: "Análisis espectrométrico de aceites, calibración de válvulas e inspección de intercambiador." },
                    { h: "2000+ horas", d: "Revisión mayor de componentes rotativos pesados (turboalimentador, bombas de agua salada, gobierno)." },
                  ].map((x, i) => (
                    <div key={i} style={{ padding: 12, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10 }}>
                      <strong style={{ display: "block", fontSize: 12.5, color: C.steel, fontFamily: "monospace", marginBottom: 3 }}>{x.h}</strong>
                      <span style={{ fontSize: 12, color: C.slate, lineHeight: 1.4 }}>{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: tint(C.cyan, 5), border: `1px solid ${tint(C.cyan, 20)}`, borderRadius: 10, padding: 12, display: "flex", gap: 10, alignItems: "center", marginTop: 20 }}>
              <Info size={16} color={C.cyan} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.ink, lineHeight: 1.4 }}>
                <strong>Tip:</strong> Puedes filtrar los equipos de la izquierda por embarcación usando las cápsulas de colores arriba, o buscar directamente por nombre o tarea de mantenimiento preventivo.
              </span>
            </div>
          </Card>
        ) : (
          /* MODO EQUIPO SELECCIONADO */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Cabecera del Ficha del Equipo */}
            <Card style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                <div>
                  {/* Breadcrumbs */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: C.slate, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                    <span>Flota</span>
                    <span>/</span>
                    <span>{embName(eqSeleccionado.embarcacion_id)}</span>
                    {eqSeleccionado.parent_id && (
                      <>
                        <span>/</span>
                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {obtenerBreadcrumbs(eqSeleccionado)}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.abyss, margin: 0 }}>
                      {eqSeleccionado.sistema}
                    </h2>
                    <CritBadge crit={eqSeleccionado.criticidad} />
                    <Pill tone={eqSeleccionado.estado === "operativo" ? "green" : eqSeleccionado.estado === "desgaste" ? "yellow" : "red"}>
                      {eqSeleccionado.estado || "Operativo"}
                    </Pill>
                  </div>
                  <div style={{ fontSize: 12, color: C.slate, marginTop: 4, fontFamily: "monospace" }}>
                    ID: {eqSeleccionado.id_visible}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ ...archivo, fontSize: 26, fontWeight: 900, color: C.abyss, fontFamily: "monospace", lineHeight: 1 }}>
                      {num(eqSeleccionado.horas_actual || 0, 0)}
                      <span style={{ fontSize: 13, color: C.slate, fontWeight: 400 }}> h</span>
                    </div>
                    <span style={{ fontSize: 10.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>Horómetro actual</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Sub-Tabs de Ficha */}
            <div style={{ display: "flex", gap: 2, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: 3, width: "fit-content" }}>
              <button
                onClick={() => setRightTab("planes")}
                style={{
                  border: "none",
                  background: rightTab === "planes" ? tint(C.sky, 10) : "transparent",
                  color: rightTab === "planes" ? C.sky : C.slate,
                  padding: "6px 16px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                Tareas Preventivas ({planesEq.length})
              </button>
              <button
                onClick={() => setRightTab("historial")}
                style={{
                  border: "none",
                  background: rightTab === "historial" ? tint(C.sky, 10) : "transparent",
                  color: rightTab === "historial" ? C.sky : C.slate,
                  padding: "6px 16px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                Historial de Servicio ({historialEq.length})
              </button>
            </div>

            {/* CONTENIDO SUB-TABS */}
            {rightTab === "planes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {planesEq.length === 0 ? (
                  <Card style={{ padding: 20, textAlign: "center" }}>
                    <div style={{ color: C.slate, fontSize: 13, fontStyle: "italic" }}>
                      Este equipo no tiene planes preventivos programados.
                    </div>
                  </Card>
                ) : (
                  planesEq.map((plan) => {
                    const esCalendario = plan.tipo_disparador === "calendario";
                    const elapsed = esCalendario
                      ? diasDesde(plan.fecha_ult_pm)
                      : (eqSeleccionado.horas_actual || 0) - (plan.horas_ult_pm || 0);
                    const [tone, label] = esCalendario
                      ? statusPlanCalendario(elapsed, plan.unidad_calendario, plan.intervalo_calendario ?? 1)
                      : statusPlan(elapsed, plan.intervalo_horas);
                    const isReg = registrando === plan.id;
                    const isHito = editHitoId === plan.id;

                    const barColor = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;

                    return (
                      <Card
                        key={plan.id}
                        style={{
                          padding: 16,
                          borderLeft: `4px solid ${barColor}`,
                          position: "relative",
                          transition: "box-shadow 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Pill tone={tone}>{label}</Pill>
                            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.abyss }}>{plan.descripcion}</span>
                          </div>
                          <span style={{ fontSize: 11, color: C.slate, fontFamily: "monospace" }}>
                            {esCalendario
                              ? `Cada ${labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)}`
                              : `Cada ${plan.intervalo_horas}h`}
                          </span>
                        </div>

                        {/* Barra de progreso */}
                        <div style={{ marginBottom: 12 }}>
                          {esCalendario ? (
                            <PMBarCalendario diasElapsed={elapsed} unidad={plan.unidad_calendario} intervalo={plan.intervalo_calendario ?? 1} />
                          ) : (
                            <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />
                          )}
                          <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                            <span>
                              {plan.fecha_ult_pm
                                ? `Último PM: ${new Date(plan.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")}${!esCalendario ? ` (${num(plan.horas_ult_pm || 0)}h)` : ""}`
                                : "Nunca realizado"}
                            </span>
                          </div>
                        </div>

                        {/* Botones de acción del plan */}
                        {puedeOperar && (
                          <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${C.foam}`, paddingTop: 10, marginTop: 10 }}>
                            <button
                              onClick={() => { setRegistrando(isReg ? null : plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: false }); }}
                              style={{
                                ...primaryBtn,
                                padding: "6px 12px",
                                fontSize: 12,
                                background: isReg ? C.slate : C.green,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4
                              }}
                            >
                              <Check size={13} /> {isReg ? "Cancelar" : "Registrar PM"}
                            </button>
                            {tone === "red" && !isReg && (
                              <button
                                onClick={() => { setRegistrando(plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: true }); }}
                                style={{
                                  ...ghostBtn,
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  borderColor: C.red,
                                  color: C.red,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4
                                }}
                              >
                                <ClipboardList size={13} /> Crear OT
                              </button>
                            )}
                            <button
                              onClick={() => isHito ? setEditHitoId(null) : abrirEditHito(plan)}
                              style={{
                                ...ghostBtn,
                                padding: "6px 12px",
                                fontSize: 12,
                                color: isHito ? C.steel : C.slate,
                                borderColor: isHito ? C.steel : C.line,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4
                              }}
                            >
                              <Edit3 size={13} /> Ajustar Hito
                            </button>
                            <button
                              onClick={() => {
                                if (editandoPlan === plan.id) {
                                  setEditandoPlan(null);
                                } else {
                                  setEditandoPlan(plan.id);
                                  setEditHitoId(null);
                                  setRegistrando(null);
                                  setEditPlanForm({
                                    descripcion:          plan.descripcion,
                                    tipo_disparador:      plan.tipo_disparador,
                                    intervalo_horas:      plan.intervalo_horas || 250,
                                    intervalo_calendario: plan.intervalo_calendario || 1,
                                    unidad_calendario:    plan.unidad_calendario || "mensual",
                                  });
                                }
                              }}
                              style={{
                                ...ghostBtn,
                                padding: "6px 12px",
                                fontSize: 12,
                                color: editandoPlan === plan.id ? C.sky : C.slate,
                                borderColor: editandoPlan === plan.id ? C.sky : C.line,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4
                              }}
                            >
                              <Edit3 size={13} /> {editandoPlan === plan.id ? "Cancelar" : "Editar plan"}
                            </button>
                            {puedeBorrar && (
                              <button
                                onClick={() => eliminarPlan(plan.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, marginLeft: "auto" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}

                        {/* FORMULARIO REGISTRO PM IN-PLACE */}
                        {isReg && (
                          <div style={{ marginTop: 12, padding: 14, background: tint(C.green, 8), border: `1px solid ${C.green}40`, borderRadius: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>
                              Registrar realización de: <em>{plan.descripcion}</em>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
                              <Field label="Realizado por">
                                <input value={regForm.realizado_por}
                                  onChange={(e) => setRegForm((p) => ({ ...p, realizado_por: e.target.value }))}
                                  style={inputStyle()} />
                              </Field>
                              <Field label="Notas y observaciones">
                                <input value={regForm.notas}
                                  onChange={(e) => setRegForm((p) => ({ ...p, notas: e.target.value }))}
                                  placeholder="Detalles del trabajo..."
                                  style={inputStyle()} />
                              </Field>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                <input type="checkbox" checked={regForm.crearOT}
                                  onChange={(e) => setRegForm((p) => ({ ...p, crearOT: e.target.checked }))}
                                  style={{ width: 14, height: 14, accentColor: C.steel }} />
                                Generar OT de cierre
                              </label>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      await registrarPM(plan, regForm);
                                      setRegistrando(null);
                                      setRegForm({ realizado_por: "", notas: "", crearOT: false });
                                    } catch { /* error manejado */ }
                                  }}
                                  style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}
                                >
                                  Confirmar Registro
                                </button>
                                <button onClick={() => setRegistrando(null)} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* FORMULARIO EDITAR PLAN IN-PLACE */}
                        {editandoPlan === plan.id && (
                          <div style={{ marginTop: 12, padding: 14, background: tint(C.sky, 8), border: `1px solid ${C.sky}40`, borderRadius: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>
                              Editar plan · <em>{plan.descripcion}</em>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                              {["horas", "calendario"].map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setEditPlanForm((p) => ({ ...p, tipo_disparador: t }))}
                                  style={{ ...ghostBtn, padding: "4px 10px", fontSize: 11, background: editPlanForm.tipo_disparador === t ? tint(C.sky, 15) : undefined, borderColor: editPlanForm.tipo_disparador === t ? C.sky : C.line, color: editPlanForm.tipo_disparador === t ? C.sky : C.slate }}
                                >
                                  {t === "horas" ? "Por horas" : "Calendario"}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
                              <Field label="Descripción de tarea">
                                <input
                                  value={editPlanForm.descripcion}
                                  onChange={(e) => setEditPlanForm((p) => ({ ...p, descripcion: e.target.value }))}
                                  style={inputStyle()}
                                />
                              </Field>
                              {editPlanForm.tipo_disparador === "horas" ? (
                                <Field label="Intervalo (horas)">
                                  <input
                                    type="number"
                                    value={editPlanForm.intervalo_horas}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setEditPlanForm((p) => ({ ...p, intervalo_horas: +e.target.value }))}
                                    style={{ ...inputStyle(), fontFamily: "monospace" }}
                                  />
                                </Field>
                              ) : (
                                <Field label="Intervalo">
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <input
                                      type="number"
                                      value={editPlanForm.intervalo_calendario}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setEditPlanForm((p) => ({ ...p, intervalo_calendario: +e.target.value }))}
                                      style={{ ...inputStyle(), width: 60, fontFamily: "monospace" }}
                                    />
                                    <select
                                      value={editPlanForm.unidad_calendario}
                                      onChange={(e) => setEditPlanForm((p) => ({ ...p, unidad_calendario: e.target.value }))}
                                      style={inputStyle()}
                                    >
                                      {UNIDADES_CAL.map((u) => <option key={u} value={u}>{LABEL_UNIDAD[u] || u}</option>)}
                                    </select>
                                  </div>
                                </Field>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                onClick={async () => {
                                  try {
                                    await updatePlan(plan, editPlanForm);
                                    setEditandoPlan(null);
                                  } catch { /* error manejado */ }
                                }}
                                style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}
                              >
                                Guardar cambios
                              </button>
                              <button onClick={() => setEditandoPlan(null)} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* FORMULARIO HITO IN-PLACE */}
                        {isHito && (
                          <div style={{ marginTop: 12, padding: 14, background: tint(C.steel, 8), border: `1px solid ${C.steel}40`, borderRadius: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 4 }}>
                              Ajustar hito inicial · <em>{plan.descripcion}</em>
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>
                              Ajusta el punto de partida del semáforo. No genera un registro histórico.
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: plan.tipo_disparador === "calendario" ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                              {plan.tipo_disparador !== "calendario" && (
                                <Field label="Último PM registrado a (h)">
                                  <input type="number" value={hitoForm.horas}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(ev) => setHitoForm((p) => ({ ...p, horas: ev.target.value }))}
                                    style={{ ...inputStyle(), fontFamily: "monospace" }} />
                                </Field>
                              )}
                              <Field label="Fecha del último PM">
                                <input type="date" value={hitoForm.fecha}
                                  onChange={(ev) => setHitoForm((p) => ({ ...p, fecha: ev.target.value }))}
                                  style={inputStyle()} />
                              </Field>
                            </div>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                onClick={async () => {
                                  try {
                                    await guardarHito(plan, hitoForm);
                                    setEditHitoId(null);
                                  } catch { /* error manejado */ }
                                }}
                                style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}
                              >
                                Guardar Hito
                              </button>
                              <button onClick={() => setEditHitoId(null)} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}

                {/* FORMULARIO AGREGAR TAREA PM */}
                {puedeOperar && (
                  <Card style={{ padding: 18, marginTop: 8, background: C.surface2, borderStyle: "dashed", borderWidth: 1.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: C.steel }}>
                        + Agregar Tarea Preventiva
                      </span>
                      {addingPlan ? (
                        <button onClick={() => setAddingPlan(false)} style={{ background: "none", border: "none", color: C.slate, cursor: "pointer" }}>
                          <X size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setAddingPlan(true)}
                          style={{ ...primaryBtn, padding: "5px 12px", fontSize: 11.5, background: C.steel }}
                        >
                          Configurar Tarea
                        </button>
                      )}
                    </div>

                    {addingPlan && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Selector de tipo de disparador (Slider style) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, textTransform: "uppercase" }}>Tipo de Disparador</span>
                          <div className="pm-slider-toggle" style={{ maxWidth: 280 }}>
                            <button
                              type="button"
                              className={`pm-slider-btn${newPlan.tipo_disparador === "horas" ? " pm-slider-btn-active" : ""}`}
                              onClick={() => setNewPlan((p) => ({ ...p, tipo_disparador: "horas" }))}
                            >
                              Por Horas
                            </button>
                            <button
                              type="button"
                              className={`pm-slider-btn${newPlan.tipo_disparador === "calendario" ? " pm-slider-btn-active" : ""}`}
                              onClick={() => setNewPlan((p) => ({ ...p, tipo_disparador: "calendario" }))}
                            >
                              Calendario
                            </button>
                          </div>
                        </div>

                        {/* Descripción de Tarea */}
                        <Field label="Tarea PM a Programar">
                          <ComboInput
                            value={newPlan.descripcion}
                            onChange={(v) => setNewPlan((p) => ({ ...p, descripcion: v }))}
                            options={TAREAS_PM}
                            placeholder="Ej. Cambio de aceite, Limpieza de inyectores..."
                          />
                        </Field>

                        {/* Inputs de Intervalo */}
                        {newPlan.tipo_disparador === "horas" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <Field label="Intervalo de horas">
                              <input
                                type="number"
                                value={newPlan.intervalo_horas}
                                onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_horas: +e.target.value }))}
                                style={{ ...bluInput, width: "100%" }}
                              />
                            </Field>
                            {/* Chips con accesos directos */}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                              {[100, 250, 500, 1000, 2000].map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  className={`pm-preset-chip${newPlan.intervalo_horas === h ? " pm-preset-chip-active" : ""}`}
                                  onClick={() => setNewPlan((p) => ({ ...p, intervalo_horas: h }))}
                                >
                                  {h}h
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
                            <Field label="Cada (N)">
                              <input
                                type="number"
                                min={1}
                                value={newPlan.intervalo_calendario}
                                onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_calendario: +e.target.value }))}
                                style={{ ...bluInput, width: "100%" }}
                              />
                            </Field>
                            <Field label="Frecuencia">
                              <select
                                value={newPlan.unidad_calendario}
                                onChange={(e) => setNewPlan((p) => ({ ...p, unidad_calendario: e.target.value }))}
                                style={inputStyle()}
                              >
                                {UNIDADES_CAL.map((u) => (
                                  <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                                ))}
                              </select>
                            </Field>
                          </div>
                        )}

                        {/* Hito Inicial */}
                        <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12, marginTop: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                            Hito inicial (Opcional - Historial previo)
                          </span>
                          <div style={{ display: "grid", gridTemplateColumns: newPlan.tipo_disparador === "horas" ? "1fr 1fr" : "1fr", gap: 10 }}>
                            {newPlan.tipo_disparador === "horas" && (
                              <Field label="Último PM a las (h)">
                                <input
                                  type="number"
                                  placeholder="0h"
                                  value={newPlan.horas_ult_pm}
                                  onChange={(e) => setNewPlan((p) => ({ ...p, horas_ult_pm: e.target.value }))}
                                  style={{ ...inputStyle(), fontFamily: "monospace" }}
                                />
                              </Field>
                            )}
                            <Field label="Fecha del último PM">
                              <input
                                type="date"
                                value={newPlan.fecha_ult_pm}
                                onChange={(e) => setNewPlan((p) => ({ ...p, fecha_ult_pm: e.target.value }))}
                                style={inputStyle()}
                              />
                            </Field>
                          </div>
                          <p style={{ fontSize: 11, color: C.slate, margin: "6px 0 0", lineHeight: 1.4 }}>
                            Registra esto si el equipo ya fue serviciado anteriormente. El semáforo partirá de la fecha/horas correctas en lugar de comenzar de cero.
                          </p>
                        </div>

                        {/* Botones de guardar plan */}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await agregarPlan(eqSeleccionado.id, newPlan);
                                setNewPlan({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, unidad_calendario: "mensual", intervalo_calendario: 1, horas_ult_pm: "", fecha_ult_pm: "" });
                                setAddingPlan(false);
                              } catch { /* error manejado */ }
                            }}
                            disabled={!newPlan.descripcion.trim()}
                            style={{ ...primaryBtn, padding: "8px 16px", fontSize: 13 }}
                          >
                            Guardar Tarea PM
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddingPlan(false); setNewPlan({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, unidad_calendario: "mensual", intervalo_calendario: 1, horas_ult_pm: "", fecha_ult_pm: "" }); }}
                            style={ghostBtn}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {rightTab === "historial" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {historialEq.length === 0 ? (
                  <Card style={{ padding: 20, textAlign: "center" }}>
                    <div style={{ color: C.slate, fontSize: 13, fontStyle: "italic" }}>
                      Este equipo aún no registra eventos de mantenimiento preventivo.
                    </div>
                  </Card>
                ) : (
                  historialEq.map((hLog) => {
                    const p = planes.find((x) => x.id === hLog.plan_pm_id);
                    const intLabel = p
                      ? p.tipo_disparador === "calendario"
                        ? labelIntervaloCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1)
                        : `${p.intervalo_horas}h`
                      : "";

                    return (
                      <Card key={hLog.id} style={{ padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>
                              {p?.descripcion || "Tarea PM"}
                            </span>
                            {intLabel && (
                              <span style={{ fontSize: 10.5, color: C.slate, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 6px", marginLeft: 8, fontFamily: "monospace" }}>
                                {intLabel}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 11, color: C.slate, fontFamily: "monospace", display: "block" }}>
                              {hLog.fecha_realizacion}
                            </span>
                            {hLog.horas_realizacion != null && (
                              <span style={{ fontSize: 11, color: C.steel, fontFamily: "monospace", fontWeight: 700 }}>
                                {num(hLog.horas_realizacion, 0)}h
                              </span>
                            )}
                          </div>
                        </div>

                        {hLog.notas && (
                          <p style={{ fontSize: 12.5, color: C.ink, margin: "6px 0", lineHeight: 1.4, padding: "8px 10px", background: C.surface2, borderRadius: 6, borderLeft: `3px solid ${C.line}` }}>
                            {hLog.notas}
                          </p>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11, color: C.slate }}>
                          <span>Realizado por: <strong>{hLog.realizado_por || "—"}</strong></span>
                          {hLog.ot_id && <Pill tone="green">Vía OT</Pill>}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
        </Section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB HISTORIAL
// ─────────────────────────────────────────────────────────────────
function TabHistorial({ historial, planes, equipos }) {
  function eqNombre(id) { const e = equipos.find((x) => x.id === id); return e ? `${e.sistema} (${e.id_visible})` : "—"; }
  function planDesc(id) {
    const p = planes.find((x) => x.id === id);
    if (!p) return "—";
    const intervalo = p.tipo_disparador === "calendario"
      ? labelIntervaloCalendario(p.unidad_calendario, p.intervalo_calendario ?? 1)
      : `${p.intervalo_horas}h`;
    return `${intervalo} · ${p.descripcion}`;
  }

  function exportar() {
    const filas = [
      ["Fecha", "Equipo", "Plan PM", "Tipo", "Horas realización", "Realizado por", "Notas", "OT vinculada"],
      ...historial.map((h) => {
        const p = planes.find((x) => x.id === h.plan_pm_id);
        return [h.fecha_realizacion, eqNombre(h.equipo_id), planDesc(h.plan_pm_id), p?.tipo_disparador || "horas", h.horas_realizacion ?? "", h.realizado_por || "", h.notas || "", h.ot_id ? "Sí" : "No"];
      }),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "historial_pm.csv"; a.click();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{historial.length} PM registrado{historial.length !== 1 && "s"}</div>
        <button onClick={exportar} style={exportBtn}><Download size={14} /> Exportar CSV</button>
      </div>
      {historial.length === 0 ? (
        <Card><Empty>Sin historial aún. Registra el primer PM desde la pestaña <strong>Plan de Mantenimiento</strong>.</Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Equipo</th>
              <th style={thStyle}>Tarea PM</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
              <th style={thStyle}>Realizado por</th>
              <th style={thStyle}>Notas</th>
              <th style={{ ...thStyle, textAlign: "center" }}>OT</th>
            </tr></thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{h.fecha_realizacion}</td>
                  <td style={tdStyle}><div style={{ fontSize: 13, fontWeight: 600 }}>{eqNombre(h.equipo_id)}</div></td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: C.slate }}>{planDesc(h.plan_pm_id)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{num(h.horas_realizacion, 0)}h</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{h.realizado_por || "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: C.slate, maxWidth: 200 }}>{h.notas || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {h.ot_id ? <Pill tone="green">Sí</Pill> : <span style={{ color: C.line }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
