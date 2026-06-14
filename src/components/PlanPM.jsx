import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CalendarClock, Check, AlertCircle, Plus, Trash2, Download, Printer, History, ClipboardList, X, ChevronDown, ChevronRight, Edit3, PanelRightOpen, Layers } from "lucide-react";
import { useWindows } from "./windows/WindowManager";
import { planpmStore } from "./planpm/planpmStore";
import PMWindow from "./planpm/PMWindow";
import PMEstructuraWindow from "./planpm/PMEstructuraWindow";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, colorTipo, fondoTipo } from "../lib/arbolColapsable";
import { C, archivo, num, canOperate, isAdmin, tint } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn, exportBtn,
  inputStyle, bluInput, thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";
import ComboInput from "./ComboInput";
import { TAREAS_PM } from "../lib/tareasPM";
import { statusPlan, statusPlanCalendario, diasDesde, DIAS_POR_UNIDAD, LABEL_UNIDAD, labelIntervaloCalendario, scheduleComplianceCombinado } from "../lib/pm";
import { folioOT } from "../lib/ot";

const HOY = () => new Date().toISOString().slice(0, 10);
const INTERVALOS_COMUNES = [50, 100, 250, 500, 1000, 2000, 4000, 8000];
const UNIDADES_CAL = ["diario", "semanal", "mensual", "trimestral", "semestral", "anual"];

// ── Barra de progreso por plan ─────────────────────────────────
function PMBar({ elapsed, intervalo }) {
  const pct   = Math.min(100, intervalo > 0 ? (elapsed / intervalo) * 100 : 0);
  const [tone] = statusPlan(elapsed, intervalo);
  const color  = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div title="90% del intervalo" style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.35, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
        {num(elapsed, 0)}h / {intervalo}h
      </span>
    </div>
  );
}

function PMBarCalendario({ diasElapsed, unidad, intervalo = 1 }) {
  const total = (DIAS_POR_UNIDAD[unidad] || 1) * (intervalo || 1);
  const safe  = Number.isFinite(diasElapsed) ? diasElapsed : total;
  const pct   = Math.min(100, total > 0 ? (safe / total) * 100 : 0);
  const [tone] = statusPlanCalendario(safe, unidad, intervalo);
  const color  = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div title="90% del intervalo" style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.35, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
        {Number.isFinite(diasElapsed) ? diasElapsed : "—"}d / {total}d
      </span>
    </div>
  );
}

export default function PlanPM({ onNavigate }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos,    setEquipos]    = useState([]);
  const [planes,     setPlanes]     = useState([]);
  const [historial,  setHistorial]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [filtro,     setFiltro]     = useState("all");
  const [tab,        setTab]        = useState("plan"); // "plan" | "historial"
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const { open } = useWindows();
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
    planpmStore.set({ planes, historial, equipos, embarcaciones });
  }, [planes, historial, equipos, embarcaciones]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  function abrirPMWindow(eq) {
    const esAgrupador = eq.tipo_nodo === "sistema";
    if (esAgrupador) {
      open({
        id: `pm-struct-${eq.id}`,
        title: eq.sistema,
        subtitle: `${eq.id_visible} · ${embName(eq.embarcacion_id)}`,
        icon: Layers,
        iconColor: C.steel,
        width: 600,
        render: () => (
          <PMEstructuraWindow equipoId={eq.id} handlersRef={handlersRef} />
        ),
      });
    } else {
      open({
        id: `pm-${eq.id}`,
        title: eq.sistema,
        subtitle: `${eq.id_visible} · ${embName(eq.embarcacion_id)}`,
        icon: CalendarClock,
        iconColor: C.cyan,
        width: 640,
        render: () => (
          <PMWindow equipoId={eq.id} handlersRef={handlersRef} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar} />
        ),
      });
    }
  }
  const lista   = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));

  // KPIs globales
  const kpis = useMemo(() => {
    let total = 0, vencidos = 0, proximos = 0;
    planes.filter((p) => p.activo).forEach((p) => {
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
    const cumpl = scheduleComplianceCombinado(historial, planes);
    return { total, vencidos, proximos, ok: total - vencidos - proximos, cumplPct: cumpl.pct };
  }, [planes, equipos, historial]);

  if (loading) return <div><PageHead kicker="Mantenimiento Preventivo" title="Plan Preventivo" /><Card><InlineSpinner label="Cargando plan preventivo…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Mantenimiento Preventivo · ISO 14224" title="Plan Preventivo"
        sub="Plan por equipo: cada tarea con su propio intervalo e historial. Al registrar PM se genera trazabilidad completa." />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        {[[" plan", CalendarClock, "Plan de Mantenimiento"], ["historial", History, "Historial de PM"]].map(([id, Icon, lbl]) => (
          <button key={id} onClick={() => setTab(id.trim())}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${tab === id.trim() ? C.cyan : C.line}`, background: tab === id.trim() ? C.cyan : "#fff", color: tab === id.trim() ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon size={15} />{lbl}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(filtro === v.id ? "all" : v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
        {filtro !== "all" && <FilterBtn active={false} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>}
      </div>

      {/* KPIs */}
      {tab === "plan" && kpis.total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Planes activos",  kpis.total,    C.steel,  null],
            ["Vencidos",        kpis.vencidos, C.red,    "requieren atención inmediata"],
            ["Próximos",        kpis.proximos, C.amber,  "≥ 90% del intervalo"],
            ["Al día",          kpis.ok,       C.green,  null],
          ].map(([lbl, val, tone, sub]) => (
            <Card key={lbl} style={{ padding: 14 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{lbl}</div>
              <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone, marginTop: 6 }}>{val}</div>
              {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{sub}</div>}
            </Card>
          ))}
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Cumplimiento</div>
            <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: kpis.cumplPct == null ? C.slate : kpis.cumplPct >= 90 ? C.green : kpis.cumplPct >= 70 ? C.amber : C.red, marginTop: 6 }}>
              {kpis.cumplPct == null ? "—" : `${Math.round(kpis.cumplPct)}%`}
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>PMs a tiempo (SMRP)</div>
          </Card>
        </div>
      )}

      {tab === "plan" && (
        <TabPlan
          lista={lista} equipos={equipos} setEquipos={setEquipos}
          planes={planes} setPlanes={setPlanes}
          historial={historial} setHistorial={setHistorial}
          embarcaciones={embarcaciones} embName={embName}
          profile={profile} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          setError={setError} onNavigate={onNavigate}
          handlersRef={handlersRef} abrirPMWindow={abrirPMWindow} />
      )}
      {tab === "historial" && (
        <TabHistorial historial={historial} planes={planes} equipos={equipos} embName={embName} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB PLAN
// ─────────────────────────────────────────────────────────────────
function TabPlan({ lista, equipos, setEquipos, planes, setPlanes, setHistorial, embName, profile, puedeOperar, puedeBorrar, setError, onNavigate, handlersRef, abrirPMWindow }) {
  const [addingFor,   setAddingFor]   = useState(null); // equipo_id
  const [newPlan,     setNewPlan]     = useState({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, unidad_calendario: "mensual", intervalo_calendario: 1, horas_ult_pm: "", fecha_ult_pm: "" });
  const [registrando, setRegistrando] = useState(null); // plan_pm_id
  const [regForm,     setRegForm]     = useState({ realizado_por: "", notas: "", crearOT: false });
  const [editHitoId,  setEditHitoId]  = useState(null); // plan_pm_id en edición de hito
  const [hitoForm,    setHitoForm]    = useState({ horas: "", fecha: "" });
  const [busqueda,    setBusqueda]    = useState("");
  // Colapso por nodo a cualquier nivel (helper compartido en todo el CMMS).
  const arbol = useArbolColapsable(lista);
  const busq  = busqueda.trim().toLowerCase();
  const listaVisible = lista.filter((eq) => {
    if (!arbol.visible(eq)) return false;
    if (!busq) return true;
    // Mostrar nodo si él mismo, su id_visible, o alguno de sus planes coincide
    if (eq.sistema?.toLowerCase().includes(busq)) return true;
    if (eq.id_visible?.toLowerCase().includes(busq)) return true;
    return planes.some((p) => p.equipo_id === eq.id && p.activo && p.descripcion?.toLowerCase().includes(busq));
  });

  if (lista.length === 0) return (
    <Card><Empty>
      <AlertCircle size={28} color={C.amber} style={{ marginBottom: 8 }} /><br />
      No hay equipos. Ve a <strong>Equipos</strong> y carga la maquinaria de tu flota.
    </Empty></Card>
  );

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

  // Ajusta el hito (último servicio) de un plan existente sin crear un PM nuevo.
  // Se usa para corregir datos históricos o inicializar planes en onboarding de flota.
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
      // 1) Generar OT si se pidió
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
      // 2) Actualizar contador del plan
      const pmUpdate = esCalendario ? { fecha_ult_pm: fecha } : { horas_ult_pm: horas, fecha_ult_pm: fecha };
      await updateRow("planes_pm", plan.id, pmUpdate);
      setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, ...pmUpdate } : x));
      // 3) Actualizar horas_ult_pm del equipo
      if (eq) {
        await updateRow("equipos", eq.id, { horas_ult_pm: horas, fecha_ult_pm: fecha });
        setEquipos((p) => p.map((e) => e.id === eq.id ? { ...e, horas_ult_pm: horas, fecha_ult_pm: fecha } : e));
      }
      // 4) Registrar en historial
      const registro = await insertRow("historial_pm", profile.empresa_id, {
        plan_pm_id: plan.id, equipo_id: plan.equipo_id,
        horas_realizacion: horas, fecha_realizacion: fecha,
        realizado_por: (form.realizado_por || "").trim() || profile.nombre || "",
        notas: (form.notas || "").trim() || null,
        ot_id: otId, created_by: profile.id,
      });
      setHistorial((p) => [registro, ...p]);
      logActivity(profile, "Registrar PM", `${eq?.sistema} · ${plan.descripcion} · ${num(horas)}h`);
      // 5) Navegar a la OT si se creó
      if (otId && form.crearOT) onNavigate?.("ots", { otId });
    } catch (e) { setError("No se pudo registrar el PM: " + e.message); throw e; }
  }

  // ── Exportar plan PM completo a CSV ─────────────────────────────
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

  // ── Imprimir / Guardar como PDF ──────────────────────────────────
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

  // Expone handlers al ref para que PMWindow los llame desde fuera del árbol.
  handlersRef.current = {
    registrarPM, guardarHito, agregarPlan, eliminarPlan,
    nombreUsuario: profile?.nombre || "",
    abrirPMWindowAdaptado: abrirPMWindow,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar equipo o tarea…"
          style={{ ...inputStyle(), minWidth: 220, flex: 1, maxWidth: 340 }} />
        {busqueda && (
          <button onClick={() => setBusqueda("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: "0 4px", fontSize: 13 }}>
            <X size={14} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={exportarPlan} style={exportBtn}><Download size={14} /> Exportar CSV</button>
        <button onClick={imprimirPlan} style={{ ...exportBtn, marginLeft: 6 }}><Printer size={14} /> Imprimir / PDF</button>
      </div>
      {listaVisible.map((eq) => {
        const planesEq = planes.filter((p) =>
          p.equipo_id === eq.id && p.activo &&
          (!busq || p.descripcion?.toLowerCase().includes(busq) || eq.sistema?.toLowerCase().includes(busq) || eq.id_visible?.toLowerCase().includes(busq))
        );
        const vencidosEq = planesEq.filter((p) => {
          if (p.tipo_disparador === "calendario")
            return statusPlanCalendario(diasDesde(p.fecha_ult_pm), p.unidad_calendario, p.intervalo_calendario ?? 1)[0] === "red";
          return statusPlan((eq.horas_actual || 0) - (p.horas_ult_pm || 0), p.intervalo_horas)[0] === "red";
        }).length;
        const tieneHijos = arbol.tieneHijos(eq);
        const colapsado = arbol.estaColapsado(eq);
        const nSub = arbol.nSubDe(eq);
        const esAgrupador = eq.tipo_nodo === "sistema";

        return (
          <Card key={eq.id} style={{ marginBottom: 10, borderLeft: `4px solid ${vencidosEq > 0 ? C.red : colorTipo(eq)}`, background: fondoTipo(eq), paddingBottom: 8 }}>
            {/* ── Cabecera del equipo ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: planesEq.length > 0 ? 12 : 4, paddingLeft: eq.depth * 16 }}>
              {tieneHijos ? (
                <button onClick={() => arbol.toggle(eq.id)} title={colapsado ? "Expandir" : "Colapsar"}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", alignItems: "center" }}>
                  {colapsado ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                </button>
              ) : eq.depth > 0 ? <span style={{ color: C.slate, fontSize: 13 }}>└─</span> : <span style={{ width: 17 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <button onClick={() => abrirPMWindow(eq)} className="cmms-clickable"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.abyss }}>{eq.sistema}</span>
                  <PanelRightOpen size={13} color={C.slate} style={{ opacity: 0.6 }} />
                </button>
                {eq.criticidad && <span style={{ marginLeft: 7 }}><Pill tone={{ A: "red", B: "yellow", C: "green" }[eq.criticidad]}>{eq.criticidad}</Pill></span>}
                <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
                <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 6 }}>· {embName(eq.embarcacion_id)}</span>
                {colapsado && nSub > 0 && <span style={{ fontSize: 11.5, color: C.steel, marginLeft: 8, fontWeight: 600 }} title={`${nSub} elemento(s) ocultos`}>▸ {nSub}</span>}
              </div>
              {!esAgrupador && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.slate }}>
                  {num(eq.horas_actual || 0, 0)}h actuales
                </div>
              )}
              {!esAgrupador && vencidosEq > 0 && <Pill tone="red">{vencidosEq} vencido{vencidosEq > 1 && "s"}</Pill>}
              {puedeOperar && !esAgrupador && (
                <button onClick={() => setAddingFor(addingFor === eq.id ? null : eq.id)}
                  style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>
                  <Plus size={13} /> Plan
                </button>
              )}
            </div>

            {/* ── Planes del equipo / nota agrupador ── */}
            {esAgrupador ? (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.slate, paddingLeft: eq.depth * 16 + 8, paddingBottom: 2, fontStyle: "italic" }}>
                <Layers size={13} color={C.line} />
                {nSub > 0
                  ? `Sistema agrupador · ${nSub} equipo${nSub !== 1 ? "s" : ""} — haz clic en el nombre para ver su PM`
                  : "Sistema agrupador — sin equipos dentro"}
              </div>
            ) : (
              planesEq.length === 0 && addingFor !== eq.id && (
                <div style={{ fontSize: 12.5, color: C.slate, paddingLeft: eq.depth * 16 + 8, fontStyle: "italic" }}>
                  Sin planes de PM — agrega el primero con el botón "+ Plan"
                </div>
              )
            )}

            {planesEq.map((plan) => {
              const esCalendario = plan.tipo_disparador === "calendario";
              const elapsed = esCalendario
                ? diasDesde(plan.fecha_ult_pm)
                : (eq.horas_actual || 0) - (plan.horas_ult_pm || 0);
              const [tone, label] = esCalendario
                ? statusPlanCalendario(elapsed, plan.unidad_calendario, plan.intervalo_calendario ?? 1)
                : statusPlan(elapsed, plan.intervalo_horas);
              const isReg = registrando === plan.id;

              return (
                <div key={plan.id} style={{ marginLeft: eq.depth * 16 + 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: tone === "red" ? tint(C.red, 8) : tone === "yellow" ? tint(C.amber, 10) : tint(C.steel, 6), border: `1px solid ${tone === "red" ? C.red + "30" : tone === "yellow" ? C.amber + "30" : C.line}` }}>
                    <Pill tone={tone}>{label}</Pill>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.abyss }}>{plan.descripcion}</div>
                      <div style={{ fontSize: 11, color: C.slate, marginTop: 1 }}>
                        {esCalendario
                          ? <span>Cada <strong>{labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)}</strong></span>
                          : <span>Cada <strong>{plan.intervalo_horas}h</strong></span>}
                        {plan.fecha_ult_pm
                          ? <span> · Último: {new Date(plan.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")}{!esCalendario && ` (${num(plan.horas_ult_pm || 0)}h)`}</span>
                          : !esCalendario && plan.horas_ult_pm > 0
                            ? <span> · Base: {num(plan.horas_ult_pm)}h</span>
                            : <span style={{ color: C.amber }}> · Nunca realizado</span>}
                        {puedeOperar && (
                          <button onClick={() => editHitoId === plan.id ? setEditHitoId(null) : abrirEditHito(plan)}
                            title="Ajustar hito inicial (último servicio)"
                            style={{ marginLeft: 7, background: "none", border: "none", cursor: "pointer", color: editHitoId === plan.id ? C.steel : C.slate, padding: "0 2px", display: "inline-flex", verticalAlign: "middle", lineHeight: 1 }}>
                            <Edit3 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ minWidth: 240 }}>
                      {esCalendario
                        ? <PMBarCalendario diasElapsed={elapsed} unidad={plan.unidad_calendario} intervalo={plan.intervalo_calendario ?? 1} />
                        : <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />}
                    </div>
                    {puedeOperar && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setRegistrando(isReg ? null : plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: false }); }}
                          title="Registrar PM realizado"
                          style={{ ...primaryBtn, padding: "5px 10px", fontSize: 12, background: isReg ? C.slate : C.green, borderColor: isReg ? C.slate : C.green }}>
                          <Check size={13} /> {isReg ? "Cancelar" : "Registrar PM"}
                        </button>
                        {tone === "red" && !regForm.crearOT && (
                          <button onClick={() => { setRegistrando(plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: true }); }}
                            title="Crear OT y registrar PM"
                            style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12, borderColor: C.red, color: C.red }}>
                            <ClipboardList size={13} /> Crear OT
                          </button>
                        )}
                        {puedeBorrar && (
                          <button onClick={() => eliminarPlan(plan.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Ajuste de hito inicial ── */}
                  {editHitoId === plan.id && (
                    <div style={{ margin: "6px 0 4px 12px", padding: "12px 14px", background: tint(C.steel, 7), border: `1px solid ${C.steel}30`, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 4 }}>
                        Ajustar hito · <em style={{ fontWeight: 400 }}>{plan.descripcion}</em>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10, lineHeight: 1.5 }}>
                        Corrige cuándo se realizó el último servicio. <strong>No registra un PM nuevo</strong> — solo ajusta el punto de partida del semáforo y la barra de progreso.
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: plan.tipo_disparador === "calendario" ? "1fr" : "1fr 1fr", gap: 10 }}>
                        {plan.tipo_disparador !== "calendario" && (
                          <Field label="Último servicio a (h)">
                            <input type="number" value={hitoForm.horas}
                              onFocus={(e) => e.target.select()} onChange={(ev) => setHitoForm((p) => ({ ...p, horas: ev.target.value }))}
                              placeholder="0 — nunca realizado"
                              style={{ ...inputStyle(), fontFamily: "'IBM Plex Mono', monospace" }} />
                          </Field>
                        )}
                        <Field label="Fecha del último servicio">
                          <input type="date" value={hitoForm.fecha}
                            onChange={(ev) => setHitoForm((p) => ({ ...p, fecha: ev.target.value }))}
                            style={inputStyle()} />
                        </Field>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={async () => { try { await guardarHito(plan, hitoForm); setEditHitoId(null); } catch { setEditHitoId(plan.id); } }} style={primaryBtn}>
                          <Check size={14} /> Guardar hito
                        </button>
                        <button onClick={() => setEditHitoId(null)} style={ghostBtn}><X size={13} /> Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* ── Formulario de registro ── */}
                  {isReg && (
                    <div style={{ margin: "6px 0 4px 12px", padding: "12px 14px", background: tint(C.green, 9), border: `1px solid ${C.green}40`, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>
                        Registrar PM: <em style={{ fontWeight: 400 }}>{plan.descripcion}</em> a las {num(eq.horas_actual || 0, 0)}h
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
                        <Field label="Realizado por">
                          <input value={regForm.realizado_por}
                            onChange={(e) => setRegForm((p) => ({ ...p, realizado_por: e.target.value }))}
                            style={inputStyle()} />
                        </Field>
                        <Field label="Notas (opcional)">
                          <input value={regForm.notas}
                            onChange={(e) => setRegForm((p) => ({ ...p, notas: e.target.value }))}
                            placeholder="Qué se revisó, observaciones…"
                            style={inputStyle()} />
                        </Field>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", marginBottom: 2, whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={regForm.crearOT}
                            onChange={(e) => setRegForm((p) => ({ ...p, crearOT: e.target.checked }))}
                            style={{ width: 15, height: 15, accentColor: C.steel }} />
                          Crear OT de cierre
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={async () => { try { await registrarPM(plan, regForm); setRegistrando(null); setRegForm({ realizado_por: "", notas: "", crearOT: false }); } catch { /* error manejado por registrarPM */ } }} style={primaryBtn}>
                          <Check size={14} /> Confirmar PM{regForm.crearOT ? " + OT" : ""}
                        </button>
                        <button onClick={() => setRegistrando(null)} style={ghostBtn}><X size={13} /> Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Formulario nuevo plan ── */}
            {addingFor === eq.id && (
              <div style={{ marginLeft: eq.depth * 16 + 8, marginTop: 8, padding: "12px 14px", background: C.mist, borderRadius: 8, border: `1px solid ${C.line}` }}>
                {/* ── Tipo de disparador ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>Disparador:</span>
                  {[["horas", "Por Horas"], ["calendario", "Calendario"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setNewPlan((p) => ({ ...p, tipo_disparador: val }))}
                      style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${newPlan.tipo_disparador === val ? C.steel : C.line}`, background: newPlan.tipo_disparador === val ? C.steel : "transparent", color: newPlan.tipo_disparador === val ? "#fff" : C.slate, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
                  <Field label="Tarea de mantenimiento">
                    <ComboInput value={newPlan.descripcion}
                      onChange={(v) => setNewPlan((p) => ({ ...p, descripcion: v }))}
                      options={TAREAS_PM}
                      placeholder="Buscar tarea… (Cambio de aceite, Análisis de aceite…)"
                      autoFocus />
                  </Field>
                  {newPlan.tipo_disparador === "horas" ? (
                    <Field label="Intervalo (horas)">
                      <input type="number" value={newPlan.intervalo_horas} list="intervalosnums"
                        onFocus={(e) => e.target.select()} onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_horas: +e.target.value }))}
                        style={{ ...bluInput, width: "100%" }} />
                      <datalist id="intervalosnums">{INTERVALOS_COMUNES.map((v) => <option key={v} value={v} />)}</datalist>
                    </Field>
                  ) : (
                    <div>
                      <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginBottom: 4 }}>Intervalo calendario</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" min={1} value={newPlan.intervalo_calendario}
                          onFocus={(e) => e.target.select()} onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_calendario: +e.target.value }))}
                          style={{ ...bluInput, width: 56 }} />
                        <select value={newPlan.unidad_calendario}
                          onChange={(e) => setNewPlan((p) => ({ ...p, unidad_calendario: e.target.value }))}
                          style={{ ...inputStyle(), flex: 1 }}>
                          {UNIDADES_CAL.map((u) => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <button onClick={async () => { try { await agregarPlan(eq.id, newPlan); setNewPlan({ descripcion: "", tipo_disparador: "horas", intervalo_horas: 250, unidad_calendario: "mensual", intervalo_calendario: 1, horas_ult_pm: "", fecha_ult_pm: "" }); setAddingFor(null); } catch { /* error manejado por agregarPlan */ } }} style={{ ...primaryBtn, marginTop: 22 }}>Guardar</button>
                  <button onClick={() => setAddingFor(null)} style={{ ...ghostBtn, marginTop: 22 }}><X size={13} /></button>
                </div>
                {/* ── Hito inicial (opcional) ── */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {newPlan.tipo_disparador === "horas" && (
                    <Field label="Último servicio a (h) · opcional">
                      <input type="number" value={newPlan.horas_ult_pm}
                        onFocus={(e) => e.target.select()} onChange={(e) => setNewPlan((p) => ({ ...p, horas_ult_pm: e.target.value }))}
                        placeholder="0 — nunca realizado"
                        style={{ ...bluInput, width: "100%" }} />
                    </Field>
                  )}
                  <Field label="Fecha del último servicio · opcional">
                    <input type="date" value={newPlan.fecha_ult_pm}
                      onChange={(e) => setNewPlan((p) => ({ ...p, fecha_ult_pm: e.target.value }))}
                      style={inputStyle()} />
                  </Field>
                </div>
                <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
                  Rellena si el componente ya fue serviciado antes de crear este plan — el semáforo y la barra partirán del valor correcto desde el primer día.
                </div>
                <GuiaColapsable titulo="¿Cómo elegir el intervalo?" icon={CalendarClock}>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                    <tbody>
                      {[
                        ["250 h", "Sistemas críticos de uso intenso: hidráulico de pesca, generador, inyección"],
                        ["500 h", "Motor principal: cambio de aceite y filtros, revisión general"],
                        ["1000 h", "Análisis de aceite, limpieza de radiador/intercambiador, válvulas"],
                        ["2000 h", "Revisión mayor: turbo, bombas, mangueras de alta presión"],
                      ].map(([h, d]) => (
                        <tr key={h}>
                          <td style={{ padding: "4px 8px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, whiteSpace: "nowrap", verticalAlign: "top", borderBottom: `1px solid ${C.foam}` }}>{h}</td>
                          <td style={{ padding: "4px 8px", color: C.slate, borderBottom: `1px solid ${C.foam}` }}>{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ color: C.slate }}>
                    <strong style={{ color: C.abyss }}>Regla práctica:</strong> a mayor criticidad y uso, menor intervalo.
                    Para PM que dependen del <strong>calendario</strong> (ánodos, inspección de tablero, certificados, gobierno)
                    usa el toggle <em>Calendario</em> y elige la unidad: Semanal, Mensual, etc.
                  </div>
                </GuiaColapsable>
              </div>
            )}
          </Card>
        );
      })}
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
