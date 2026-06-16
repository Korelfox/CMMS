import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ClipboardList, Plus, Download, CloudOff, DollarSign, Check, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity, rpcCall } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { subirFotos } from "../lib/fotos";
import { C, clp, isAdmin, canOperate, TIPOS_OT, PRIORIDADES, ESTADOS_OT, lk, tint } from "../theme";
import {
  Card, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  FilterBtn, Field, EmptyState,
  ModuleShell, StatGrid, HeroStat, ActionQueue, Toolbar, Section,
} from "../ui";
import { FotoInput } from "./Fotos";
import { blankOT, folioOT, kpisOT, filtrarOTs, buscarOTs, sinValorizar, validarNuevaOT } from "../lib/ot";
import { MODOS_FALLA_ISO, requiereCodigoFalla } from "../lib/fallasISO";
import CierreFallaModal from "./ot/CierreFallaModal";
import EquipoPicker from "./EquipoPicker";
import OTQueuePanel from "./ot/OTQueuePanel";
import OTDetailPanel from "./ot/OTDetailPanel";

const HOY = () => new Date().toISOString().slice(0, 10);

export default function OrdenesTrabajo({ navParams }) {
  const { profile } = useAuth();
  const online = useOnline();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usandoCache, setUsandoCache] = useState(false);
  const [filtro, setFiltro] = useState("all");
  const [embFiltro, setEmbFiltro] = useState("all");  // filtro por embarcación (combinable con el de estado)
  const [otDestacadaId, setOtDestacadaId] = useState(navParams?.otId || null);  // OT abierta desde Alertas
  const [modoCostos, setModoCostos] = useState(false);  // edición de costos por fila
  const [costoOk, setCostoOk] = useState(null);          // feedback "✓ guardado" por OT
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [fotos, setFotos] = useState([]);
  const [cierreOT, setCierreOT] = useState(null);
  const [selectedId, setSelectedId] = useState(navParams?.otId || null);
  const [busqueda, setBusqueda] = useState("");
  const [detailTab, setDetailTab] = useState("resumen");
  const [auditViols, setAuditViols] = useState(null);
  const [auditAbierto, setAuditAbierto] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [ultimoLog, setUltimoLog] = useState(null);  // último chequeo automático (cron)
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const puedeCostos = isAdmin(profile?.rol);  // valorizar costos: Jefe Mantención y superiores

  function blank() { return blankOT(HOY()); }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, o] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o);
      setUsandoCache(false);
      // Guarda copia local para poder trabajar sin señal
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("ordenes_trabajo", o);
    } catch {
      // Sin señal o error de red → trabajamos con la última copia local
      const [embs, eqs, o] = await Promise.all([
        getCached("embarcaciones"), getCached("equipos"), getCached("ordenes_trabajo"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o); setUsandoCache(true);
      if (embs.length === 0 && o.length === 0) setError("No se pudieron cargar las órdenes y no hay copia local. Conéctate al menos una vez para guardar los datos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Último chequeo automático del supervisor de conectores (cron diario).
  useEffect(() => {
    fetchAll("ot_health_log", { order: { col: "chequeado_en", asc: false }, limit: 1 })
      .then((rows) => setUltimoLog(rows[0] ?? null))
      .catch(() => { /* tabla ausente en instancias sin migración */ });
  }, []);

  // Al llegar desde una alerta de OT resaltamos esa orden; si se navega
  // al módulo sin contexto (ej. desde el menú), se limpia la destacada.
  useEffect(() => {
    if (navParams?.otId) {
      setOtDestacadaId(navParams.otId);
      setSelectedId(navParams.otId);
      setFiltro("all");
      setDetailTab("resumen");
    } else {
      setOtDestacadaId(null);
    }
  }, [navParams]);

  // Cambiar de filtro manualmente quita el modo "OT señalada".
  function aplicarFiltro(f) { setFiltro(f); setOtDestacadaId(null); }
  function aplicarEmb(id) { setEmbFiltro(id); setOtDestacadaId(null); }

  // Cuando el outbox se vacía (volvió la señal y subió todo), recargamos del servidor.
  useEffect(() => {
    const onSynced = () => cargar();
    window.addEventListener("cmms-synced", onSynced);
    return () => window.removeEventListener("cmms-synced", onSynced);
  }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  const equiposDeNave = form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : [];

  // Si venimos de una alerta, mostramos solo esa OT; si no, el filtro normal.
  const otDestacada = otDestacadaId ? ots.find((o) => o.id === otDestacadaId) : null;
  const otsScope = embFiltro === "all" ? ots : ots.filter((o) => o.embarcacion_id === embFiltro);
  const listaBase = otDestacada ? [otDestacada] : filtrarOTs(otsScope, filtro);
  const lista = useMemo(
    () => buscarOTs(listaBase, busqueda, (id) => embarcaciones.find((e) => e.id === id)?.nombre || ""),
    [listaBase, busqueda, embarcaciones],
  );

  const selectedOT = useMemo(
    () => ots.find((o) => o.id === selectedId) || lista[0] || null,
    [ots, selectedId, lista],
  );

  useEffect(() => {
    if (selectedId && !ots.some((o) => o.id === selectedId)) setSelectedId(null);
  }, [ots, selectedId]);

  useEffect(() => {
    if (!selectedId && lista.length > 0) setSelectedId(lista[0].id);
  }, [filtro, embFiltro, lista.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const { abiertas, costoTotal, preventivas, propProactivo } = kpisOT(otsScope);
  const nSinValorizar = otsScope.filter(sinValorizar).length;
  const nSinCodificar = otsScope.filter((o) => requiereCodigoFalla(o) && o.estado === "cerrada" && !o.modo_falla).length;
  const nPendSync = otsScope.filter((o) => o._pending).length;
  const nCriticasAbiertas = otsScope.filter((o) => o.estado !== "cerrada" && (o.prioridad === "critica" || o.prioridad === "alta")).length;

  const actionItems = useMemo(() => {
    const items = [];
    otsScope
      .filter((o) => o.estado !== "cerrada" && (o.prioridad === "critica" || o.prioridad === "alta"))
      .slice(0, 4)
      .forEach((o) => items.push({
        id: `crit-${o.id}`,
        label: `${o.folio} · ${o.sistema || "OT"}`,
        detail: `${lk(PRIORIDADES, o.prioridad)} · ${lk(ESTADOS_OT, o.estado)}`,
        tone: "red",
        onClick: () => { setSelectedId(o.id); setDetailTab("ejecucion"); setOtDestacadaId(null); },
      }));
    if (nSinValorizar > 0) {
      items.push({
        id: "sin-valorizar",
        label: `${nSinValorizar} OT${nSinValorizar > 1 ? "s" : ""} sin valorizar`,
        detail: "Cerradas sin costos MO/Mat",
        tone: "amber",
        onClick: () => { aplicarFiltro("sin_valorizar"); setModoCostos(true); setDetailTab("costos"); },
      });
    }
    if (nSinCodificar > 0) {
      items.push({
        id: "sin-codificar",
        label: `${nSinCodificar} correctiva${nSinCodificar > 1 ? "s" : ""} sin codificar`,
        detail: "Falta modo de falla ISO 14224",
        tone: "amber",
        onClick: () => {
          const o = otsScope.find((x) => requiereCodigoFalla(x) && x.estado === "cerrada" && !x.modo_falla);
          if (o) { setSelectedId(o.id); setCierreOT(o); setDetailTab("resumen"); }
        },
      });
    }
    if (nPendSync > 0) {
      items.push({
        id: "pending-sync",
        label: `${nPendSync} pendiente${nPendSync > 1 ? "s" : ""} de sync`,
        detail: "Creadas offline",
        tone: "amber",
        onClick: () => {
          const o = otsScope.find((x) => x._pending);
          if (o) setSelectedId(o.id);
        },
      });
    }
    return items;
  }, [otsScope, nSinValorizar, nSinCodificar, nPendSync]);

  async function crear() {
    const err = validarNuevaOT(form);
    if (err) { setError(err); return; }
    const id = nuevoId();
    const fila = {
      id,
      folio: folioOT(ots, online),
      empresa_id: profile.empresa_id,
      embarcacion_id: form.embarcacion_id,
      equipo_id: form.equipo_id || null,
      sistema: form.sistema.trim(),
      tipo: form.tipo, prioridad: form.prioridad, estado: form.estado,
      descripcion: form.descripcion.trim(), fecha: form.fecha,
      mttr_horas: form.mttr_horas, hrs_oper_desde: form.hrs_oper_desde,
      costo_mo: form.costo_mo, costo_mat: form.costo_mat,
      created_by: profile.id,
    };

    if (online) {
      try {
        const { empresa_id: _empresaId, ...resto } = fila;
        const nueva = await insertRow("ordenes_trabajo", profile.empresa_id, resto);
        setOts((p) => [nueva, ...p]);
        logActivity(profile, "Crear OT", `${nueva.folio} · ${embName(form.embarcacion_id)} · ${lk(TIPOS_OT, form.tipo)} · ${form.descripcion}`);
        // Subir fotos opcionales asociadas a la OT recién creada
        if (fotos.length) {
          const { errores } = await subirFotos(fotos, { empresaId: profile.empresa_id, entidad: "ot", entidadId: nueva.id, profileId: profile.id });
          if (errores.length) setError("La OT se creó, pero algunas fotos no se subieron: " + errores[0]);
        }
        setForm(blank()); setFotos([]); setShowForm(false);
      } catch (e) { setError("No se pudo crear la OT: " + e.message); }
    } else {
      // Sin señal: a la cola. Sube sola al recuperar conexión.
      await queueInsert("ordenes_trabajo", fila, `OT ${embName(form.embarcacion_id)} · ${form.descripcion}`);
      setOts((p) => [{ ...fila, _pending: true }, ...p]);
      if (fotos.length) setError("La OT quedó en cola (sin conexión). Las fotos se podrán adjuntar al recuperar señal desde el botón de cámara.");
      setForm(blank()); setFotos([]); setShowForm(false);
    }
  }

  async function eliminar(id) {
    const ot = ots.find((o) => o.id === id);
    if (!window.confirm(`¿Eliminar la orden ${ot?.folio}?`)) return;
    const respaldo = ots;
    setOts((p) => p.filter((o) => o.id !== id));
    try { await deleteRow("ordenes_trabajo", id); logActivity(profile, "Eliminar OT", ot?.folio || id); }
    catch (e) { setOts(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  // ¿El checklist tiene tareas sin completar? (para avisar antes de cerrar)
  function checklistIncompleto(ot) {
    const items = Array.isArray(ot.checklist) ? ot.checklist : [];
    return items.length > 0 && items.some((i) => !i.ok);
  }

  // Firma de cierre: quién y cuándo cerró la OT (trazabilidad).
  const firmaCierre = () => ({ cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString() });

  // Avanza/cambia el estado de una OT (Solicitada → … → Cerrada).
  async function cambiarEstado(ot, nuevoEstado) {
    if (!nuevoEstado || nuevoEstado === ot.estado) return;
    if (nuevoEstado === "cerrada") {
      // Aviso si quedan tareas del checklist sin completar.
      if (checklistIncompleto(ot)) {
        const pendientes = ot.checklist.filter((i) => !i.ok).length;
        if (!window.confirm(`${ot.folio} tiene ${pendientes} tarea(s) del checklist sin completar.\n\n¿Cerrar la OT de todas formas?`)) return;
      }
      // Cierre de una correctiva sin código de falla → pedir codificación
      // ISO 14224 (modo/causa/mecanismo) antes de cerrar.
      if (requiereCodigoFalla(ot) && !ot.modo_falla) {
        setCierreOT(ot);
        return;
      }
    }
    const anterior = ot.estado;
    const cambios = nuevoEstado === "cerrada" ? { estado: nuevoEstado, ...firmaCierre() } : { estado: nuevoEstado };
    // Actualización optimista: la UI cambia al instante.
    setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, ...cambios } : o)));
    setError(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      logActivity(profile, "Cambiar estado OT", `${ot.folio}: ${lk(ESTADOS_OT, anterior)} → ${lk(ESTADOS_OT, nuevoEstado)}`);
    } catch (e) {
      // Si falla, revertimos al estado anterior.
      setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, estado: anterior, cerrada_por: ot.cerrada_por ?? null, cerrada_fecha: ot.cerrada_fecha ?? null } : o)));
      setError("No se pudo cambiar el estado: " + e.message);
    }
  }

  // Cierra (o re-codifica) una OT correctiva guardando los códigos de falla
  // ISO 14224 junto con el estado. `codigos = null` → cerrar sin codificar.
  async function cerrarConCodigos(ot, codigos) {
    const previo = { estado: ot.estado, modo_falla: ot.modo_falla ?? null, causa_falla: ot.causa_falla ?? null, mecanismo_falla: ot.mecanismo_falla ?? null, cerrada_por: ot.cerrada_por ?? null, cerrada_fecha: ot.cerrada_fecha ?? null };
    const cambios = { estado: "cerrada", ...(ot.estado !== "cerrada" ? firmaCierre() : {}), ...(codigos || {}) };
    setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, ...cambios } : o)));
    setCierreOT(null); setError(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      const modoLbl = codigos?.modo_falla ? lk(MODOS_FALLA_ISO, codigos.modo_falla) : "sin codificar";
      logActivity(profile, "Cerrar OT correctiva", `${ot.folio} · falla: ${modoLbl}`);
    } catch (e) {
      setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, ...previo } : o)));
      setError("No se pudo cerrar la OT: " + e.message);
    }
  }

  // Guarda el checklist de una OT (optimista; revierte si falla la red).
  async function guardarChecklist(ot, items) {
    const previo = ot.checklist;
    setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, checklist: items } : o)));
    try { await updateRow("ordenes_trabajo", ot.id, { checklist: items }); }
    catch (e) {
      setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, checklist: previo } : o)));
      setError("No se pudo guardar el checklist: " + e.message);
    }
  }

  // Edición de costos: actualiza en memoria (el total se recalcula al instante).
  function editarCosto(otId, campo, valor) {
    setOts((p) => p.map((o) => (o.id === otId ? { ...o, [campo]: valor } : o)));
    if (costoOk === otId) setCostoOk(null);
  }

  // Guarda los costos de una OT al salir del campo (onBlur), con firma de valorización.
  async function guardarCosto(ot) {
    setError(null);
    const tieneCostos = (ot.costo_mo || 0) > 0 || (ot.costo_mat || 0) > 0;
    const firma = tieneCostos
      ? { costos_por: profile?.nombre || profile?.email || "—", costos_fecha: new Date().toISOString() }
      : {};
    try {
      await updateRow("ordenes_trabajo", ot.id, { costo_mo: ot.costo_mo || 0, costo_mat: ot.costo_mat || 0, ...firma });
      if (tieneCostos) setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, ...firma } : o)));
      logActivity(profile, "Valorizar costos OT", `${ot.folio} · MO ${clp(ot.costo_mo || 0)} · Mat ${clp(ot.costo_mat || 0)}`);
      setCostoOk(ot.id);
      setTimeout(() => setCostoOk((c) => (c === ot.id ? null : c)), 2000);
    } catch (e) { setError("No se pudieron guardar los costos: " + e.message); cargar(); }
  }

  function exportar() {
    const filas = [["Folio", "Fecha", "Embarcación", "Sistema", "Tipo", "Prioridad", "Descripción", "MTTR", "Costo MO", "Costo Mat", "Estado"],
      ...ots.map((o) => [o.folio, o.fecha, embName(o.embarcacion_id), o.sistema, lk(TIPOS_OT, o.tipo), lk(PRIORIDADES, o.prioridad), o.descripcion, o.mttr_horas, o.costo_mo, o.costo_mat, lk(ESTADOS_OT, o.estado)])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ordenes_trabajo.csv"; a.click();
  }

  async function verificarConectores() {
    setAuditLoading(true);
    try {
      const viols = await rpcCall("fn_audit_ot", { p_empresa: profile.empresa_id });
      setAuditViols(viols);
      setAuditAbierto(true);
    } catch (e) { setError("Supervisor de OT: " + e.message); }
    finally { setAuditLoading(false); }
  }

  const AUDIT_TIPO = {
    equipo_sin_vinculo:     { label: "Sin equipo",           tone: "yellow" },
    equipo_huerfano:          { label: "Equipo huérfano",      tone: "red" },
    nave_inconsistente:       { label: "Nave inconsistente",   tone: "red" },
    varada_huerfana:          { label: "Varada huérfana",      tone: "red" },
    solicitud_huerfana:       { label: "Solicitud huérfana",   tone: "yellow" },
    correctiva_sin_mttr:      { label: "Sin MTTR",             tone: "yellow" },
    auto_sin_huella:          { label: "Auto sin huella",      tone: "yellow" },
    trabajo_varada_huerfano:  { label: "Trabajo varada huérfano", tone: "yellow" },
  };

  if (loading) {
    return (
      <ModuleShell kicker="Nivel operativo" title="Órdenes de Trabajo" loading />
    );
  }

  return (
    <ModuleShell
      kicker="Nivel operativo · Mantenimiento"
      title="Órdenes de Trabajo"
      sub="Flujo: Solicitada → Planificada → Programada → En ejecución → Cerrada. Registra costos, MTTR y trazabilidad ISO 14224."
      error={error}
      onRetry={cargar}
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {puedeCostos && (
            <button type="button" onClick={() => setModoCostos((v) => !v)}
              style={modoCostos ? { ...primaryBtn, background: C.gold } : exportBtn}>
              <DollarSign size={15} /> {modoCostos ? "Cerrar valorización" : "Valorizar costos"}
            </button>
          )}
          <button type="button" onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
          {puedeOperar && (
            <button type="button" data-testid="ot-nueva" onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}>
              <Plus size={16} /> Nueva OT
            </button>
          )}
          <button type="button" onClick={cargar} title="Actualizar" data-nofx style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>
      }
      toolbar={
        <>
          {(!online || usandoCache) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, background: C.yellowBg,
              border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px",
              borderRadius: 10, marginBottom: 12, fontSize: 13, width: "100%",
            }}>
              <CloudOff size={17} />
              <span>
                {online
                  ? "Mostrando la última copia guardada en este dispositivo."
                  : "Sin conexión. Las OTs nuevas quedan en cola y se suben al recuperar señal."}
              </span>
            </div>
          )}
          <Toolbar
            left={
              <>
                {embarcaciones.length > 1 && (
                  <>
                    <span style={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>Nave:</span>
                    <FilterBtn active={embFiltro === "all"} onClick={() => aplicarEmb("all")}>Todas</FilterBtn>
                    {embarcaciones.map((v) => (
                      <FilterBtn key={v.id} active={embFiltro === v.id} color={v.color}
                        onClick={() => aplicarEmb(embFiltro === v.id ? "all" : v.id)}>{v.nombre}</FilterBtn>
                    ))}
                  </>
                )}
                <FilterBtn active={!otDestacada && filtro === "all"} onClick={() => aplicarFiltro("all")}>Todas ({otsScope.length})</FilterBtn>
                {ESTADOS_OT.map((s) => {
                  const n = otsScope.filter((o) => o.estado === s.value).length;
                  return (
                    <FilterBtn key={s.value} active={!otDestacada && filtro === s.value} onClick={() => aplicarFiltro(s.value)}>
                      {s.label} ({n})
                    </FilterBtn>
                  );
                })}
                {(() => {
                  const n = otsScope.filter(sinValorizar).length;
                  return n > 0 ? (
                    <FilterBtn active={!otDestacada && filtro === "sin_valorizar"} onClick={() => aplicarFiltro("sin_valorizar")}>
                      $ Sin valorizar ({n})
                    </FilterBtn>
                  ) : null;
                })()}
              </>
            }
          />
        </>
      }
    >
      <div className="cmms-grid-2" style={{ marginBottom: 24 }}>
        <StatGrid
          hero={
            <HeroStat
              variant={nCriticasAbiertas > 0 ? "critical" : abiertas > 0 ? "warn" : "ok"}
              icon={nCriticasAbiertas > 0 ? AlertTriangle : ClipboardList}
              label="Backlog operativo"
              value={abiertas}
              sub={`${otsScope.length} OTs en alcance · ${nSinValorizar} sin valorizar · ${propProactivo}% proactivo`}
              onClick={() => aplicarFiltro(abiertas ? "en_ejecucion" : "all")}
            />
          }
          stats={[
            { label: "Críticas / altas", value: nCriticasAbiertas, sub: "abiertas", icon: AlertTriangle, tone: nCriticasAbiertas ? C.red : C.green, onClick: () => { aplicarFiltro("all"); setDetailTab("ejecucion"); } },
            { label: "Sin valorizar", value: nSinValorizar, sub: "cerradas sin costo", icon: DollarSign, tone: nSinValorizar ? C.amber : C.green, onClick: () => { aplicarFiltro("sin_valorizar"); setModoCostos(true); setDetailTab("costos"); } },
            { label: "Costo acumulado", value: clp(costoTotal), sub: modoCostos ? "valorización activa" : "MO + materiales", icon: DollarSign, tone: C.gold, onClick: puedeCostos ? () => { setModoCostos((v) => !v); setDetailTab("costos"); } : undefined },
          ]}
        />
        <ActionQueue
          title="Requiere atención"
          items={actionItems}
          emptyLabel="Backlog en condiciones normales"
        />
      </div>

      {(() => {
        const nViols = auditViols?.length ?? null;
        const nCrit  = auditViols?.filter((v) => v.severidad === "critico").length ?? 0;
        const sev    = nViols === null ? null : nViols === 0 ? "ok" : nCrit > 0 ? "critico" : "aviso";
        const sevColor = { ok: C.green, aviso: C.yellow, critico: C.red }[sev] ?? C.steel;
        const sevLabel = { ok: "Conectores OK", aviso: `${nViols} aviso(s)`, critico: `${nCrit} crítico(s) · ${nViols} total` }[sev];
        return (
          <Card style={{ marginBottom: 16, padding: "12px 18px", border: sev && sev !== "ok" ? `1px solid ${tint(sevColor, 40)}` : `1px solid ${C.foam}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ShieldCheck size={16} color={sev ? sevColor : C.steel} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Supervisor de conectores OT</span>
                {sev && <Pill tone={sev === "ok" ? "green" : sev === "aviso" ? "yellow" : "red"}>{sevLabel}</Pill>}
                <span style={{ fontSize: 11.5, color: C.slate }}>Equipo · nave · varada · confiabilidad</span>
                {!auditAbierto && ultimoLog && (
                  <span style={{ fontSize: 11.5, color: C.slate }}>
                    · auto {new Date(ultimoLog.chequeado_en).toLocaleDateString("es-CL")}:{" "}
                    <span style={{ fontWeight: 700, color: ultimoLog.severidad === "critico" ? C.red : ultimoLog.severidad === "aviso" ? C.amber : C.green }}>
                      {ultimoLog.severidad === "ok" ? "sin hallazgos" : `${ultimoLog.n_violaciones} aviso(s)`}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {auditAbierto && (
                  <button type="button" onClick={() => { setAuditAbierto(false); setAuditViols(null); }} style={ghostBtn}>Cerrar</button>
                )}
                <button type="button" onClick={verificarConectores} disabled={auditLoading}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8,
                    border: `1px solid ${tint(C.cyan, 40)}`, background: tint(C.cyan, 7), color: C.cyan,
                    fontSize: 12, fontWeight: 600, cursor: auditLoading ? "default" : "pointer",
                    fontFamily: "inherit", opacity: auditLoading ? 0.6 : 1 }}>
                  <ShieldCheck size={13} />{auditLoading ? "Verificando…" : "Verificar ahora"}
                </button>
              </div>
            </div>
            {auditAbierto && auditViols !== null && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${C.foam}`, paddingTop: 10 }}>
                {auditViols.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green }}>
                    <CheckCircle2 size={15} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Todas las OTs tienen conectores válidos para confiabilidad y costos.</span>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Severidad", "Tipo", "Folio", "Nave", "Equipo", "Detalle"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate, letterSpacing: 0.4 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {auditViols.map((v, i) => {
                        const meta = AUDIT_TIPO[v.tipo_violacion] || { label: v.tipo_violacion, tone: "yellow" };
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${C.foam}` }}>
                            <td style={{ padding: "6px 10px" }}><Pill tone={v.severidad === "critico" ? "red" : "yellow"}>{v.severidad}</Pill></td>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{meta.label}</td>
                            <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{v.folio || "—"}</td>
                            <td style={{ padding: "6px 10px" }}>{v.embarcacion || "—"}</td>
                            <td style={{ padding: "6px 10px" }}>{v.equipo || "—"}</td>
                            <td style={{ padding: "6px 10px", color: C.slate }}>{v.detalle}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        );
      })()}

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Orden de Trabajo</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Embarcación">
              <select data-testid="ot-form-embarcacion" value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "" })} style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Equipo (opcional)">
              <EquipoPicker equipos={equiposDeNave} value={form.equipo_id} disabled={!form.embarcacion_id}
                testId="ot-form-equipo"
                onChange={(eq) => setForm({ ...form, equipo_id: eq?.id || "", sistema: eq?.sistema || form.sistema })} />
            </Field>
            <Field label="Sistema"><input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal" /></Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>

            <Field label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>{TIPOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} style={inputStyle()}>{PRIORIDADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Estado"><select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={inputStyle()}>{ESTADOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="MTTR (hrs paro)"><input type="number" value={form.mttr_horas} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, mttr_horas: +e.target.value })} style={bluInput} /></Field>

            <Field label="Descripción" span={2}><input data-testid="ot-form-descripcion" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} placeholder="Trabajo a realizar" /></Field>
            <Field label="Costo MO ($)"><input type="number" value={form.costo_mo} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, costo_mo: +e.target.value })} style={bluInput} /></Field>
            <Field label="Costo Mat. ($)"><input type="number" value={form.costo_mat} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, costo_mat: +e.target.value })} style={bluInput} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontWeight: 600 }}>Fotos (opcional)</div>
            <FotoInput files={fotos} onChange={setFotos} max={5} disabled={!online} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button data-testid="ot-form-guardar" onClick={crear} style={primaryBtn}>Guardar OT</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {otDestacada && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.mist, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <span style={{ color: C.steel }}>Orden <strong>{otDestacada.folio}</strong> señalada desde Alertas — gestiona en el panel de detalle.</span>
          <button onClick={() => setOtDestacadaId(null)} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>Ver todas</button>
        </div>
      )}

      {modoCostos && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.goldBg || tint(C.gold, 16), border: `1px solid ${C.gold}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#7a5b00" }}>
            <DollarSign size={16} /> Modo valorización: edita costos en el tab <strong>Costos</strong> del panel derecho. Se guarda al salir del campo con tu firma.
          </span>
          <button onClick={() => setModoCostos(false)} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>Listo</button>
        </div>
      )}

      <Section title="Cola y detalle" description="Selecciona una OT a la izquierda · gestiona ejecución, costos y fotos a la derecha" padding={0} style={{ marginBottom: 0 }}>
        <style>{`
          .ot-split-container {
            display: grid;
            grid-template-columns: minmax(300px, 380px) 1fr;
            gap: 16px;
            align-items: start;
            padding: 16px;
          }
          .ot-queue-item-selected .ot-queue-item-title { color: ${C.sky}; }
          @media (max-width: 1024px) {
            .ot-split-container { grid-template-columns: 1fr; }
          }
        `}</style>

        {lista.length === 0 && !loading ? (
          <EmptyState icon={ClipboardList} title="Sin órdenes en este filtro" description="Prueba otro estado, limpia la búsqueda o crea una nueva OT." />
        ) : (
          <div className="ot-split-container">
            <OTQueuePanel
              lista={lista}
              selectedId={selectedOT?.id}
              onSelect={(id) => { setSelectedId(id); setOtDestacadaId(null); }}
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              embName={embName}
              showEmb={embFiltro === "all"}
              embarcaciones={embarcaciones}
            />
            <OTDetailPanel
              ot={selectedOT}
              embName={embName}
              embColor={embarcaciones.find((e) => e.id === selectedOT?.embarcacion_id)?.color}
              puedeOperar={puedeOperar}
              puedeBorrar={puedeBorrar}
              puedeCostos={puedeCostos}
              online={online}
              modoCostos={modoCostos}
              costoOk={costoOk}
              activeTab={detailTab}
              onTabChange={setDetailTab}
              onCambiarEstado={cambiarEstado}
              onGuardarChecklist={guardarChecklist}
              onEditarCosto={editarCosto}
              onGuardarCosto={guardarCosto}
              onCodificarFalla={setCierreOT}
              onEliminar={eliminar}
              usuario={profile?.nombre || ""}
            />
          </div>
        )}
      </Section>

      {cierreOT && (
        <CierreFallaModal
          ot={cierreOT}
          onGuardar={(codigos) => cerrarConCodigos(cierreOT, codigos)}
          onCerrarSinCodificar={() => cerrarConCodigos(cierreOT, null)}
          onClose={() => setCierreOT(null)}
        />
      )}
    </ModuleShell>
  );
}
