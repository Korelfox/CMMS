import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, num, canOperate, isAdmin, tint, ESTADOS_OT, lk } from "../theme";
import CierreFallaModal from "./ot/CierreFallaModal";
import RegistroTrabajoModal from "./ot/RegistroTrabajoModal";
import { MODOS_FALLA_ISO, requiereCodigoFalla } from "../lib/fallasISO";
import { folioOT } from "../lib/ot";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, bluInput,
  Field, ErrorBanner, InlineSpinner,
} from "../ui";
import EquipoPicker from "./EquipoPicker";

const TIPOS = ["Proactiva", "Reactiva", "Inspección", "Predictiva"];
const TIPO_OT_A_PROG  = { preventivo: "Proactiva", correctivo: "Reactiva", modificativo: "Proactiva", predictivo: "Predictiva" };
const PROG_A_OT_TIPO  = { Proactiva: "preventivo", Reactiva: "correctivo", "Inspección": "preventivo", Predictiva: "predictivo" };
const RANK_ESTADO = { solicitada: 0, planificada: 1, programada: 2, en_ejecucion: 3 };

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRE_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function getMondayISO(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function addDias(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function diaNombre(dateStr) {
  return NOMBRE_DIA[new Date(dateStr + "T12:00:00").getDay()];
}
function diaCorto(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return NOMBRE_DIA[d.getDay()];
}
function diaNumMes(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()} ${NOMBRE_MES[d.getMonth()]}`;
}
function diaFechaLarga(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return `${NOMBRE_DIA[d.getDay()]} ${d.getDate()} ${NOMBRE_MES[d.getMonth()]}`;
}

export default function Programacion() {
  const { profile } = useAuth();
  const hoy = new Date().toISOString().slice(0, 10);
  const lunesHoy = getMondayISO(hoy);

  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [semanaLunes, setSemanaLunes] = useState(lunesHoy);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => blank(hoy));
  const [cierreOT, setCierreOT] = useState(null);
  const [registroItem, setRegistroItem] = useState(null);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank(fecha) {
    return { embarcacion_id: "", ot_id: "", ot_folio: "", equipo_id: "", sistema: "", tipo: "Proactiva", hh: 2, fecha: fecha || hoy };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, prog, eqs, otsAll] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("programacion", { order: { col: "created_at", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setItems(prog); setEquipos(eqs); setOts(otsAll);
    } catch (e) { setError("No se pudo cargar la programación. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const embName  = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const embColor = (id) => embarcaciones.find((e) => e.id === id)?.color  || C.steel;
  const estadoLabel = (v) => ESTADOS_OT.find((s) => s.value === v)?.label || v;

  const equiposDeNave = form.embarcacion_id
    ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id)
    : [];

  const otsAbiertas = ots
    .filter((o) => o.estado !== "cerrada")
    .sort((a, b) => (RANK_ESTADO[a.estado] ?? 9) - (RANK_ESTADO[b.estado] ?? 9)
                 || (b.fecha || "").localeCompare(a.fecha || ""));

  // ── Semana visualizada ────────────────────────────────────────────────
  const semaDom   = addDias(semanaLunes, 6);
  const diasSemana = Array.from({ length: 7 }, (_, i) => addDias(semanaLunes, i));
  const esSemanaActual = semanaLunes === lunesHoy;

  const fechaValida = (f) => typeof f === "string" && f.length >= 10;

  // Solo ítems de la semana visualizada
  const itemsSemana = items.filter((i) => {
    const f = (i.fecha_programada || "").slice(0, 10);
    return fechaValida(f) && f >= semanaLunes && f <= semaDom;
  });

  // Atrasadas: no hechas, de semanas anteriores a la semana real de hoy
  const vencidas = items.filter((i) => {
    const f = (i.fecha_programada || "").slice(0, 10);
    return !i.done && fechaValida(f) && f < lunesHoy;
  });

  // KPIs de la semana visualizada
  const totalHH      = itemsSemana.reduce((s, i) => s + (i.hh || 0), 0);
  const totalDone    = itemsSemana.filter((i) => i.done).length;
  const cumplimiento = itemsSemana.length ? (totalDone / itemsSemana.length) * 100 : 0;

  const itemsPorFecha = (f) => itemsSemana.filter((i) => (i.fecha_programada || "").slice(0, 10) === f);
  const hhPorFecha    = (f) => itemsPorFecha(f).reduce((s, i) => s + (i.hh || 0), 0);

  // ── Acciones ──────────────────────────────────────────────────────────
  function seleccionarOT(otId) {
    const ot = ots.find((o) => o.id === otId);
    if (!ot) { setForm((f) => ({ ...f, ot_id: "", ot_folio: "" })); return; }
    setForm((f) => ({
      ...f,
      ot_id: ot.id, ot_folio: ot.folio || "",
      embarcacion_id: ot.embarcacion_id || f.embarcacion_id,
      equipo_id: ot.equipo_id || "",
      sistema:   ot.sistema   || f.sistema,
      tipo: TIPO_OT_A_PROG[ot.tipo] || f.tipo,
    }));
  }

  async function crear() {
    if (!form.embarcacion_id || !form.sistema.trim()) { setError("Indica embarcación y sistema."); return; }
    let nuevo;
    try {
      nuevo = await insertRow("programacion", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id,
        ot_folio:       form.ot_folio.trim(),
        sistema:        form.sistema.trim(),
        tipo:           form.tipo,
        hh:             form.hh,
        fecha_programada: form.fecha,
        dia:            diaNombre(form.fecha),
        done:           false,
        created_by:     profile.id,
      });
      setItems((p) => [...p, nuevo]);
      logActivity(profile, "Programar tarea", `${diaFechaLarga(form.fecha)} · ${nuevo.sistema} (${nuevo.hh}h)`);
      setForm(blank(hoy)); setShowForm(false);
    } catch (e) { setError("No se pudo programar: " + e.message); return; }

    const ot = form.ot_id ? ots.find((o) => o.id === form.ot_id) : null;
    if (ot && ["solicitada", "planificada"].includes(ot.estado)) {
      try {
        await updateRow("ordenes_trabajo", ot.id, { estado: "programada" });
        setOts((p) => p.map((o) => o.id === ot.id ? { ...o, estado: "programada" } : o));
        logActivity(profile, "Programar OT", `${ot.folio} → programada (vía Programación Semanal)`);
      } catch (e) {
        setError(`La tarea quedó creada, pero no se pudo pasar la OT ${ot.folio} a programada: ` + e.message);
      }
    }
  }

  async function reagendar(item, fechaNueva) {
    const prevFecha = item.fecha_programada;
    setItems((p) => p.map((x) => x.id === item.id
      ? { ...x, fecha_programada: fechaNueva, dia: diaNombre(fechaNueva) } : x));
    try {
      await updateRow("programacion", item.id, { fecha_programada: fechaNueva, dia: diaNombre(fechaNueva) });
      logActivity(profile, "Reagendar tarea",
        `${item.sistema}: ${diaFechaLarga(prevFecha)} → ${diaFechaLarga(fechaNueva)}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id
        ? { ...x, fecha_programada: prevFecha, dia: item.dia } : x));
      setError("No se pudo reagendar: " + e.message);
    }
  }

  async function toggleDone(item) {
    const previo = item.done;
    const ahora  = !previo;

    // Al marcar hecha sin OT vinculada: pedir registro ISO (estadísticas + costos)
    if (ahora && !item.ot_folio) {
      setRegistroItem(item);
      return;
    }

    setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: ahora } : x));
    try {
      await updateRow("programacion", item.id, { done: ahora });
      logActivity(profile, ahora ? "Cerrar tarea" : "Reabrir tarea",
        `${diaFechaLarga(item.fecha_programada) || item.dia} · ${item.sistema}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: previo } : x));
      setError("No se pudo actualizar: " + e.message);
      return;
    }
    if (ahora && item.ot_folio) {
      const ot = ots.find((o) => o.folio === item.ot_folio);
      if (ot && ot.estado !== "cerrada") {
        if (requiereCodigoFalla(ot) && !ot.modo_falla) {
          setCierreOT(ot);
        } else {
          await cerrarOTDirecta(ot);
        }
      }
    }
  }

  // Crea una OT cerrada retroactiva y vincula la tarea programada a ella
  async function confirmarRegistro(item, datos) {
    setRegistroItem(null);
    const folio   = folioOT(ots, true);
    const firma   = { cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString() };
    const otData  = {
      embarcacion_id: item.embarcacion_id,
      equipo_id:      null,
      sistema:        item.sistema,
      tipo:           PROG_A_OT_TIPO[item.tipo] || "preventivo",
      prioridad:      "media",
      estado:         "cerrada",
      descripcion:    datos.descripcion,
      fecha:          item.fecha_programada,
      folio,
      mttr_horas:     datos.mttr_horas  || null,
      costo_mo:       datos.costo_mo    || 0,
      costo_mat:      datos.costo_mat   || 0,
      modo_falla:     datos.modo_falla  || null,
      causa_falla:    datos.causa_falla || null,
      mecanismo_falla: datos.mecanismo_falla || null,
      ...firma,
      created_by: profile.id,
    };
    let otCreada;
    try {
      otCreada = await insertRow("ordenes_trabajo", profile.empresa_id, otData);
      setOts((p) => [otCreada, ...p]);
      logActivity(profile, "Registrar trabajo vía Programación",
        `${otCreada.folio} · ${item.sistema} · ${datos.descripcion}`);
    } catch (e) {
      setError("No se pudo registrar el trabajo: " + e.message);
      return;
    }
    // Marcar tarea hecha y vincularla al folio recién creado
    const cambiosProg = { done: true, ot_folio: otCreada.folio };
    setItems((p) => p.map((x) => x.id === item.id ? { ...x, ...cambiosProg } : x));
    try {
      await updateRow("programacion", item.id, cambiosProg);
      logActivity(profile, "Cerrar tarea programada", `${item.sistema} · OT ${otCreada.folio}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: false, ot_folio: "" } : x));
      setError("OT creada, pero no se pudo cerrar la tarea: " + e.message);
    }
  }

  // Escape: marca hecha sin registro (con advertencia implícita en el botón del modal)
  async function saltarRegistro(item) {
    setRegistroItem(null);
    setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: true } : x));
    try {
      await updateRow("programacion", item.id, { done: true });
      logActivity(profile, "Cerrar tarea (sin registro OT)", `${item.sistema}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: false } : x));
      setError("No se pudo actualizar: " + e.message);
    }
  }

  async function cerrarOTDirecta(ot) {
    const cambios = { estado: "cerrada", cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString() };
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...cambios } : o));
      logActivity(profile, "Cerrar OT vía Programación", `${ot.folio} → cerrada`);
    } catch (e) {
      setError(`Tarea marcada, pero no se pudo cerrar la OT ${ot.folio}: ` + e.message);
    }
  }

  async function cerrarOTConCodigos(ot, codigos) {
    const previo = { estado: ot.estado, modo_falla: ot.modo_falla ?? null, causa_falla: ot.causa_falla ?? null, mecanismo_falla: ot.mecanismo_falla ?? null, cerrada_por: ot.cerrada_por ?? null, cerrada_fecha: ot.cerrada_fecha ?? null };
    const cambios = { estado: "cerrada", cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString(), ...(codigos || {}) };
    setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...cambios } : o));
    setCierreOT(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      const modoLbl = codigos?.modo_falla ? lk(MODOS_FALLA_ISO, codigos.modo_falla) : "sin codificar";
      logActivity(profile, "Cerrar OT correctiva vía Programación", `${ot.folio} · falla: ${modoLbl}`);
    } catch (e) {
      setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...previo } : o));
      setError("No se pudo cerrar la OT: " + e.message);
    }
  }

  async function eliminar(id) {
    if (!window.confirm("¿Eliminar esta tarea del programa?")) return;
    const respaldo = items;
    setItems((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("programacion", id); }
    catch (e) { setItems(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Plan Semanal" title="Programación Semanal" /><Card><InlineSpinner label="Cargando programa…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Plan Semanal" title="Programación Semanal"
        sub="Balance de carga semana a semana. Cada tarea con sus horas-hombre estimadas. Pulsa ✓ cuando esté cumplida."
        action={puedeOperar && (
          <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}>
            <Plus size={16} /> Nueva Tarea
          </button>
        )} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPIs de la semana visualizada */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Tareas semana" value={itemsSemana.length} />
        <KPI label="Total HH semana" value={`${num(totalHH, 1)}h`} tone={C.steel} />
        <KPI label="Cumplimiento" value={`${cumplimiento.toFixed(0)}%`}
          tone={cumplimiento >= 80 ? C.green : cumplimiento >= 50 ? C.amber : C.red}
          sub={`${totalDone} de ${itemsSemana.length}`} />
        <KPI label="Atrasadas" value={vencidas.length} tone={vencidas.length > 0 ? C.red : C.green} />
      </div>

      {/* Banner de tareas atrasadas (no realizadas de semanas anteriores) */}
      {vencidas.length > 0 && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.red}`, background: tint(C.red, 6) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} color={C.red} />
            <span style={{ fontWeight: 700, color: C.red, fontSize: 13 }}>
              {vencidas.length} tarea{vencidas.length !== 1 ? "s" : ""} atrasada{vencidas.length !== 1 ? "s" : ""} — no realizadas en semanas anteriores
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {vencidas.map((i) => (
              <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", background: C.surface, borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ width: 3, alignSelf: "stretch", background: embColor(i.embarcacion_id), borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: C.ink, fontSize: 12.5 }}>{i.sistema}</span>
                  <span style={{ fontSize: 11, color: C.slate, marginLeft: 8 }}>{embName(i.embarcacion_id)}</span>
                  <span style={{ fontSize: 10.5, color: C.red, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {diaFechaLarga(i.fecha_programada)} · {i.hh}h
                  </span>
                  {i.ot_folio && (
                    <span style={{ fontSize: 10, color: C.steel, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {i.ot_folio}
                    </span>
                  )}
                </div>
                {puedeOperar && (
                  <>
                    <button onClick={() => reagendar(i, hoy)}
                      style={{ ...ghostBtn, fontSize: 11, padding: "3px 10px" }}
                      title="Mover a hoy">→ Hoy</button>
                    <button onClick={() => toggleDone(i)}
                      style={{ ...ghostBtn, fontSize: 11, padding: "3px 10px" }}
                      title="Marcar como realizada">✓ Realizada</button>
                  </>
                )}
                {puedeBorrar && (
                  <button onClick={() => eliminar(i.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0 }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Formulario de nueva tarea */}
      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Tarea Programada</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
            <Field label="Fecha">
              <input type="date" value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                style={inputStyle()} />
            </Field>
            <Field label="Embarcación">
              <select value={form.embarcacion_id}
                onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "", sistema: "" })}
                style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema" span={2}>
              {form.embarcacion_id && equiposDeNave.length === 0 ? (
                <input value={form.sistema}
                  onChange={(e) => setForm({ ...form, sistema: e.target.value })}
                  style={inputStyle()} placeholder="Sistema (nave sin equipos registrados)" />
              ) : (
                <EquipoPicker equipos={equiposDeNave} value={form.equipo_id} disabled={!form.embarcacion_id}
                  placeholder={form.embarcacion_id ? "Buscar sistema o código…" : "Elige embarcación primero"}
                  onChange={(eq) => setForm({ ...form, equipo_id: eq?.id || "", sistema: eq?.sistema || "" })} />
              )}
            </Field>
            <Field label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="HH">
              <input type="number" step={0.5} value={form.hh}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, hh: +e.target.value })}
                style={bluInput} />
            </Field>
            <Field label="OT por programar (opcional) — al guardar, la OT pasa a estado Programada" span={6}>
              <select value={form.ot_id} onChange={(e) => seleccionarOT(e.target.value)} style={inputStyle()}>
                <option value="">— Sin OT asociada —</option>
                {otsAbiertas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.folio} · {embName(o.embarcacion_id)} · {o.sistema || "—"}
                    {o.descripcion ? ` — ${o.descripcion.slice(0, 50)}` : ""} ({estadoLabel(o.estado)})
                  </option>
                ))}
              </select>
              {form.ot_id && (
                <div style={{ fontSize: 11, color: C.steel, marginTop: 5 }}>
                  ✓ Embarcación, sistema y tipo se completaron desde la OT. Al guardar, {form.ot_folio} quedará <strong>Programada</strong>.
                </div>
              )}
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Agregar al programa</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {/* Navegación semanal */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => setSemanaLunes(addDias(semanaLunes, -7))}
          style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={15} /> Sem. anterior
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...archivo, fontWeight: 700, color: C.abyss, fontSize: 14.5 }}>
            {diaFechaLarga(semanaLunes)} — {diaFechaLarga(semaDom)}
          </div>
          {!esSemanaActual && (
            <button onClick={() => setSemanaLunes(lunesHoy)}
              style={{ fontSize: 11.5, color: C.cyan, background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>
              → Esta semana
            </button>
          )}
        </div>
        <button onClick={() => setSemanaLunes(addDias(semanaLunes, 7))}
          style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 4 }}>
          Sem. siguiente <ChevronRight size={15} />
        </button>
      </div>

      {/* Grilla semanal de 7 columnas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}>
        {diasSemana.map((fechaStr) => {
          const esHoy      = fechaStr === hoy;
          const esPasado   = fechaStr < hoy;
          const dayItems   = itemsPorFecha(fechaStr);
          const hhDia      = hhPorFecha(fechaStr);
          const doneDia    = dayItems.filter((i) => i.done).length;
          const hayPendiente = esPasado && !esHoy && dayItems.some((i) => !i.done);
          return (
            <div key={fechaStr} style={{
              background: C.surface,
              border: `1px solid ${esHoy ? C.cyan : hayPendiente ? C.amber : C.line}`,
              borderRadius: 10, overflow: "hidden", minHeight: 200,
              display: "flex", flexDirection: "column",
            }}>
              {/* Cabecera del día */}
              <div style={{
                padding: "10px 12px",
                background: esHoy ? tint(C.cyan, 10) : C.mist,
                borderBottom: `1px solid ${esHoy ? C.cyan : hayPendiente ? tint(C.amber, 30) : C.line}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ ...archivo, fontWeight: 800, color: esHoy ? C.cyan : C.abyss, fontSize: 14 }}>
                    {diaCorto(fechaStr)}
                  </div>
                  <div style={{ fontSize: 10.5, color: esHoy ? C.cyan : C.slate }}>
                    {diaNumMes(fechaStr)}
                  </div>
                  <div style={{ fontSize: 10, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", marginTop: 1 }}>
                    {num(hhDia, 1)}h · {doneDia}/{dayItems.length}{hayPendiente ? " ⚠" : ""}
                  </div>
                </div>
                {puedeOperar && (
                  <button
                    onClick={() => { setForm(blank(fechaStr)); setShowForm(true); }}
                    title={`Añadir tarea el ${diaFechaLarga(fechaStr)}`}
                    style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface, color: C.slate, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={13} />
                  </button>
                )}
              </div>

              {/* Tareas del día */}
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {dayItems.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.line, textAlign: "center", padding: "20px 0" }}>Sin tareas</div>
                ) : dayItems.map((i) => {
                  const otAsociada = i.ot_folio ? ots.find((o) => o.folio === i.ot_folio) : null;
                  const otTono     = otAsociada?.estado === "cerrada" ? C.green : C.amber;
                  const atrasada   = esPasado && !i.done;
                  return (
                    <div key={i.id} style={{
                      background: i.done ? tint(C.green, 8) : atrasada ? tint(C.amber, 10) : C.foam,
                      borderLeft: `3px solid ${embColor(i.embarcacion_id)}`,
                      borderRadius: 6, padding: "7px 9px", fontSize: 11.5,
                      opacity: i.done ? 0.65 : 1,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: C.ink, textDecoration: i.done ? "line-through" : "none" }}>
                            {i.sistema}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>{embName(i.embarcacion_id)}</div>
                          {i.ot_folio && (
                            <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2, color: C.steel }}>
                              {i.ot_folio}
                              {otAsociada && (
                                <span style={{ marginLeft: 4, color: otTono }}>· {estadoLabel(otAsociada.estado)}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>
                            {i.hh}h
                          </span>
                          <div style={{ display: "flex", gap: 3 }}>
                            {puedeOperar && (
                              <button onClick={() => toggleDone(i)} title={i.done ? "Reabrir" : "Marcar hecho"}
                                style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${i.done ? C.green : C.line}`, background: i.done ? C.green : "#fff", color: i.done ? "#fff" : C.slate, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                {i.done && <Check size={10} />}
                              </button>
                            )}
                            {puedeBorrar && (
                              <button onClick={() => eliminar(i.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0 }}>
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Pill tone={i.tipo === "Reactiva" ? "red" : i.tipo === "Predictiva" ? "cyan" : "green"}>
                          {i.tipo}
                        </Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo usarlo:</strong> usa el botón <strong>+</strong> de cada día para agregar una tarea a esa fecha.
          Si asocias una <strong>OT</strong>, sus datos se pre-llenan y la orden pasa a estado <strong>Programada</strong>.
          Pulsa <strong>✓</strong> cuando esté ejecutada — si la OT es correctiva, se pedirá la codificación ISO 14224.
          Las tareas no realizadas de semanas anteriores aparecen en el banner rojo <strong>Atrasadas</strong>; puedes reagendarlas a hoy o cerrarlas directamente.
        </div>
      </Card>

      {cierreOT && (
        <CierreFallaModal
          ot={cierreOT}
          onGuardar={(codigos) => cerrarOTConCodigos(cierreOT, codigos)}
          onCerrarSinCodificar={() => cerrarOTConCodigos(cierreOT, null)}
          onClose={() => setCierreOT(null)}
        />
      )}

      {registroItem && (
        <RegistroTrabajoModal
          item={registroItem}
          embName={embName(registroItem.embarcacion_id)}
          onRegistrar={(datos) => confirmarRegistro(registroItem, datos)}
          onSaltarRegistro={() => saltarRegistro(registroItem)}
          onClose={() => setRegistroItem(null)}
        />
      )}
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
