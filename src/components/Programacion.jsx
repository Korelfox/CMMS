import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Check, ChevronLeft, ChevronRight, AlertTriangle,
  CalendarDays, Clock, Target, CheckCircle2, ClipboardList, Calendar,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, num, canOperate, isAdmin, tint, ESTADOS_OT, lk, shadow } from "../theme";
import CierreFallaModal from "./ot/CierreFallaModal";
import RegistroTrabajoModal from "./ot/RegistroTrabajoModal";
import { MODOS_FALLA_ISO, requiereCodigoFalla } from "../lib/fallasISO";
import { folioOT } from "../lib/ot";
import {
  Card, Pill, primaryBtn, ghostBtn, inputStyle, bluInput,
  Field,
  ModuleShell, StatGrid, HeroStat, Toolbar, Section, GuiaColapsable,
} from "../ui";
import EquipoPicker from "./EquipoPicker";
import { hoyLocal } from "../lib/fechas";

const TIPOS = ["Proactiva", "Reactiva", "Inspección", "Predictiva"];
const TIPO_OT_A_PROG  = { preventivo: "Proactiva", correctivo: "Reactiva", modificativo: "Proactiva", predictivo: "Predictiva" };
const PROG_A_OT_TIPO  = { Proactiva: "preventivo", Reactiva: "correctivo", "Inspección": "preventivo", Predictiva: "predictivo" };
const RANK_ESTADO = { solicitada: 0, planificada: 1, programada: 2, en_ejecucion: 3 };
const TIPO_TONE = { Proactiva: "green", Reactiva: "red", "Inspección": "steel", Predictiva: "cyan" };

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
  return NOMBRE_DIA[new Date(dateStr + "T12:00:00").getDay()];
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

function estadoTarea(item, esPasado, hoy) {
  if (item.done) return { tone: "green", color: C.green, label: "Realizada", grad: `linear-gradient(135deg, ${tint(C.green, 14)} 0%, ${tint(C.green, 4)} 100%)` };
  if (esPasado && item.fecha_programada?.slice(0, 10) < hoy) {
    return { tone: "amber", color: C.amber, label: "Atrasada", grad: `linear-gradient(135deg, ${tint(C.amber, 16)} 0%, ${tint(C.amber, 5)} 100%)` };
  }
  return { tone: "steel", color: C.steel, label: "Programada", grad: `linear-gradient(135deg, ${tint(C.sky, 10)} 0%, transparent 100%)` };
}

function ProgTareaCard({
  item, embName, embColor, otAsociada, estadoLabel, esPasado, hoy,
  puedeOperar, puedeBorrar, onToggle, onDelete,
}) {
  const meta = estadoTarea(item, esPasado, hoy);
  const otTono = otAsociada?.estado === "cerrada" ? C.green : C.amber;

  return (
    <div
      className="prog-tarea-card"
      style={{
        position: "relative",
        borderRadius: 11,
        border: `1px solid ${item.done ? tint(C.green, 30) : tint(meta.color, 28)}`,
        background: item.done ? tint(C.green, 6) : C.surface,
        boxShadow: shadow.sm,
        overflow: "hidden",
        opacity: item.done ? 0.82 : 1,
        transition: "transform .15s, box-shadow .2s",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: embColor }} />
      <div style={{ padding: "10px 12px 10px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: C.abyss, lineHeight: 1.25,
              textDecoration: item.done ? "line-through" : "none",
            }}>
              {item.sistema}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 5 }}>
              <span style={{ fontSize: 10.5, color: C.slate }}>{embName}</span>
              {item.ot_folio && (
                <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.steel, fontWeight: 700 }}>
                  {item.ot_folio}
                  {otAsociada && (
                    <span style={{ marginLeft: 4, color: otTono }}>· {estadoLabel(otAsociada.estado)}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div style={{
            textAlign: "right", padding: "6px 10px", borderRadius: 8, background: meta.grad, flexShrink: 0,
          }}>
            <div style={{ fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>HH</div>
            <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.abyss, lineHeight: 1 }}>{num(item.hh, 1)}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <Pill tone={TIPO_TONE[item.tipo] || "steel"}>{item.tipo}</Pill>
          <div style={{ display: "flex", gap: 4 }}>
            {puedeOperar && (
              <button
                type="button"
                onClick={onToggle}
                title={item.done ? "Reabrir tarea" : "Marcar realizada"}
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  border: `1px solid ${item.done ? C.green : C.line}`,
                  background: item.done ? C.green : C.surface,
                  color: item.done ? "#fff" : C.steel,
                  cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                  boxShadow: item.done ? `0 2px 8px ${tint(C.green, 25)}` : "none",
                }}
              >
                <Check size={14} strokeWidth={2.5} />
              </button>
            )}
            {puedeBorrar && (
              <button
                type="button"
                onClick={onDelete}
                title="Eliminar del programa"
                style={{
                  width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.line}`,
                  background: C.surface, color: C.slate, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgDiaColumn({
  fechaStr, hoy, dayItems, hhDia, puedeOperar, onAddTarea,
  embName, embColor, ots, estadoLabel, puedeBorrar, onToggle, onDelete,
}) {
  const esHoy = fechaStr === hoy;
  const esPasado = fechaStr < hoy;
  const doneDia = dayItems.filter((i) => i.done).length;
  const hayPendiente = esPasado && !esHoy && dayItems.some((i) => !i.done);
  const pct = dayItems.length ? Math.round((doneDia / dayItems.length) * 100) : 0;
  const headerBg = esHoy
    ? `linear-gradient(135deg, ${tint(C.cyan, 14)} 0%, ${tint(C.cyan, 4)} 100%)`
    : hayPendiente
      ? `linear-gradient(135deg, ${tint(C.amber, 12)} 0%, ${tint(C.amber, 3)} 100%)`
      : C.mist;

  return (
    <div
      className="prog-dia-col"
      style={{
        background: C.surface,
        border: `1px solid ${esHoy ? tint(C.cyan, 45) : hayPendiente ? tint(C.amber, 40) : C.line}`,
        borderRadius: 14,
        overflow: "hidden",
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        boxShadow: esHoy ? `0 4px 20px ${tint(C.cyan, 12)}` : shadow.sm,
      }}
    >
      <div style={{
        padding: "12px 14px",
        background: headerBg,
        borderBottom: `1px solid ${esHoy ? tint(C.cyan, 30) : hayPendiente ? tint(C.amber, 25) : C.line}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{
              ...archivo, fontWeight: 800, fontSize: 15,
              color: esHoy ? C.cyan : hayPendiente ? C.amber : C.abyss,
            }}>
              {diaCorto(fechaStr)}
              {esHoy && <span style={{ fontSize: 9, marginLeft: 6, letterSpacing: 1, verticalAlign: "middle" }}>HOY</span>}
            </div>
            <div style={{ fontSize: 11, color: esHoy ? C.cyan : C.slate, marginTop: 2 }}>{diaNumMes(fechaStr)}</div>
          </div>
          {puedeOperar && (
            <button
              type="button"
              onClick={onAddTarea}
              title={`Añadir tarea el ${diaFechaLarga(fechaStr)}`}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1px solid ${esHoy ? tint(C.cyan, 40) : C.line}`,
                background: C.surface, color: esHoy ? C.cyan : C.slate,
                cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                boxShadow: shadow.sm,
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: tint(C.steel, 12), overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, width: `${pct}%`,
              background: pct === 100 ? C.green : esHoy ? C.cyan : C.steel,
              transition: "width .3s ease",
            }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.slate, whiteSpace: "nowrap" }}>
            {num(hhDia, 1)}h · {doneDia}/{dayItems.length}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {dayItems.length === 0 ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "24px 8px", color: C.line,
          }}>
            <Calendar size={22} strokeWidth={1.5} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Sin tareas</span>
          </div>
        ) : dayItems.map((i) => (
          <ProgTareaCard
            key={i.id}
            item={i}
            embName={embName(i.embarcacion_id)}
            embColor={embColor(i.embarcacion_id)}
            otAsociada={i.ot_folio ? ots.find((o) => o.folio === i.ot_folio) : null}
            estadoLabel={estadoLabel}
            esPasado={esPasado}
            hoy={hoy}
            puedeOperar={puedeOperar}
            puedeBorrar={puedeBorrar}
            onToggle={() => onToggle(i)}
            onDelete={() => onDelete(i.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function Programacion() {
  const { profile } = useAuth();
  const hoy = hoyLocal();
  const lunesHoy = getMondayISO(hoy);

  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
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

  const embName  = useCallback((id) => embarcaciones.find((e) => e.id === id)?.nombre || "—", [embarcaciones]);
  const embColor = useCallback((id) => embarcaciones.find((e) => e.id === id)?.color  || C.steel, [embarcaciones]);
  const estadoLabel = (v) => ESTADOS_OT.find((s) => s.value === v)?.label || v;

  const equiposDeNave = form.embarcacion_id
    ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id)
    : [];

  const otsAbiertas = useMemo(() => ots
    .filter((o) => o.estado !== "cerrada")
    .sort((a, b) => (RANK_ESTADO[a.estado] ?? 9) - (RANK_ESTADO[b.estado] ?? 9)
                 || (b.fecha || "").localeCompare(a.fecha || "")), [ots]);

  const semaDom   = addDias(semanaLunes, 6);
  const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(semanaLunes, i)), [semanaLunes]);
  const esSemanaActual = semanaLunes === lunesHoy;
  const fechaValida = (f) => typeof f === "string" && f.length >= 10;

  const itemsSemana = useMemo(() => items.filter((i) => {
    const f = (i.fecha_programada || "").slice(0, 10);
    return fechaValida(f) && f >= semanaLunes && f <= semaDom;
  }), [items, semanaLunes, semaDom]);

  const vencidas = useMemo(() => items.filter((i) => {
    const f = (i.fecha_programada || "").slice(0, 10);
    return !i.done && fechaValida(f) && f < lunesHoy;
  }), [items, lunesHoy]);

  const totalHH      = useMemo(() => itemsSemana.reduce((s, i) => s + (i.hh || 0), 0), [itemsSemana]);
  const totalDone    = useMemo(() => itemsSemana.filter((i) => i.done).length, [itemsSemana]);
  const cumplimiento = itemsSemana.length ? (totalDone / itemsSemana.length) * 100 : 0;

  const itemsPorFecha = useCallback((f) => itemsSemana.filter((i) => (i.fecha_programada || "").slice(0, 10) === f), [itemsSemana]);
  const hhPorFecha    = useCallback((f) => itemsPorFecha(f).reduce((s, i) => s + (i.hh || 0), 0), [itemsPorFecha]);

  const heroVariant = vencidas.length > 0 ? "critical" : cumplimiento < 80 && itemsSemana.length > 0 ? "warn" : "ok";

  function flashOk(msg) {
    setOkMsg(msg);
    setTimeout(() => setOkMsg(null), 4000);
  }

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
      flashOk(`Tarea programada · ${nuevo.sistema} · ${diaFechaLarga(form.fecha)}`);
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
      flashOk(`${item.sistema} reagendada a ${diaFechaLarga(fechaNueva)}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id
        ? { ...x, fecha_programada: prevFecha, dia: item.dia } : x));
      setError("No se pudo reagendar: " + e.message);
    }
  }

  async function toggleDone(item) {
    const previo = item.done;
    const ahora  = !previo;

    if (ahora && !item.ot_folio) {
      setRegistroItem(item);
      return;
    }

    setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: ahora } : x));
    try {
      await updateRow("programacion", item.id, { done: ahora });
      logActivity(profile, ahora ? "Cerrar tarea" : "Reabrir tarea",
        `${diaFechaLarga(item.fecha_programada) || item.dia} · ${item.sistema}`);
      if (ahora) flashOk(`${item.sistema} marcada como realizada`);
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
    const cambiosProg = { done: true, ot_folio: otCreada.folio };
    setItems((p) => p.map((x) => x.id === item.id ? { ...x, ...cambiosProg } : x));
    try {
      await updateRow("programacion", item.id, cambiosProg);
      logActivity(profile, "Cerrar tarea programada", `${item.sistema} · OT ${otCreada.folio}`);
      flashOk(`Trabajo registrado · OT ${otCreada.folio}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: false, ot_folio: "" } : x));
      setError("OT creada, pero no se pudo cerrar la tarea: " + e.message);
    }
  }

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

  return (
    <ModuleShell
      kicker="Planificación · Balance de carga"
      title="Programación Semanal"
      sub="Distribuye el trabajo de mantenimiento día a día. Cada tarea lleva sus horas-hombre estimadas y puede vincularse a una OT del backlog."
      loading={loading}
      error={error}
      onRetry={cargar}
      action={puedeOperar && (
        <button
          onClick={() => { setShowForm(!showForm); setError(null); }}
          style={{
            ...primaryBtn,
            padding: "11px 20px",
            fontSize: 14,
            background: showForm ? C.steel : C.cyan,
            borderColor: showForm ? C.steel : C.cyan,
            boxShadow: showForm ? "none" : `0 6px 20px ${tint(C.cyan, 28)}`,
          }}
        >
          <Plus size={16} />{showForm ? "Cerrar formulario" : "Nueva tarea"}
        </button>
      )}
      toolbar={(
        <Toolbar
          left={(
            <>
              <button
                type="button"
                onClick={() => setSemanaLunes(addDias(semanaLunes, -7))}
                style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px" }}
              >
                <ChevronLeft size={15} /> Anterior
              </button>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px",
                borderRadius: 10, background: tint(C.sky, 6), border: `1px solid ${tint(C.sky, 20)}`,
              }}>
                <CalendarDays size={15} color={C.cyan} />
                <span style={{ ...archivo, fontWeight: 700, color: C.abyss, fontSize: 13.5 }}>
                  {diaFechaLarga(semanaLunes)} — {diaFechaLarga(semaDom)}
                </span>
                {!esSemanaActual && (
                  <button
                    type="button"
                    onClick={() => setSemanaLunes(lunesHoy)}
                    style={{ fontSize: 11, color: C.cyan, background: "none", border: "none", cursor: "pointer", fontWeight: 700, marginLeft: 4 }}
                  >
                    → Esta semana
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSemanaLunes(addDias(semanaLunes, 7))}
                style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px" }}
              >
                Siguiente <ChevronRight size={15} />
              </button>
            </>
          )}
          right={(
            <span style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>
              {itemsSemana.length} tarea{itemsSemana.length !== 1 ? "s" : ""} · {num(totalHH, 1)} HH
            </span>
          )}
        />
      )}
    >
      <style>{`
        .prog-tarea-card:hover { transform: translateY(-1px); box-shadow: ${shadow.md}; }
        .prog-semana-scroll { overflow-x: auto; padding-bottom: 4px; margin: 0 -2px; }
        .prog-semana-grid { display: grid; grid-template-columns: repeat(7, minmax(148px, 1fr)); gap: 12px; min-width: min(100%, 1060px); }
        @media (max-width: 900px) { .prog-semana-grid { grid-template-columns: repeat(7, minmax(160px, 1fr)); } }
        .prog-form-hh:focus { outline: none; border-color: ${C.cyan} !important; box-shadow: 0 0 0 3px ${tint(C.cyan, 18)}; }
      `}</style>

      {okMsg && (
        <Card style={{
          marginBottom: 16, padding: "12px 18px",
          border: `1px solid ${tint(C.green, 40)}`, background: tint(C.green, 8),
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <CheckCircle2 size={18} color={C.green} />
          <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{okMsg}</span>
        </Card>
      )}

      <StatGrid
        hero={(
          <HeroStat
            variant={heroVariant}
            icon={Target}
            label="Cumplimiento semanal"
            value={`${cumplimiento.toFixed(0)}%`}
            sub={vencidas.length > 0
              ? `${vencidas.length} tarea(s) atrasada(s) de semanas anteriores — reagenda o cierra`
              : itemsSemana.length
                ? `${totalDone} de ${itemsSemana.length} realizadas · ${num(totalHH, 1)} HH planificadas`
                : "Sin tareas en esta semana — usa + en cada día o Nueva tarea"}
          />
        )}
        stats={[
          { label: "Tareas semana", value: itemsSemana.length, sub: "en el rango visible", icon: ClipboardList, tone: C.steel },
          { label: "Horas-hombre", value: `${num(totalHH, 1)}h`, sub: "carga estimada", icon: Clock, tone: C.cyan },
          { label: "Atrasadas", value: vencidas.length, sub: "semanas anteriores", icon: AlertTriangle, tone: vencidas.length ? C.red : C.green },
        ]}
      />

      {vencidas.length > 0 && (
        <Section
          title={`${vencidas.length} tarea${vencidas.length !== 1 ? "s" : ""} atrasada${vencidas.length !== 1 ? "s" : ""}`}
          description="No realizadas en semanas anteriores — reagenda a hoy o marca como cumplida"
          padding={16}
          style={{ marginBottom: 20 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {vencidas.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                  background: `linear-gradient(135deg, ${tint(C.red, 8)} 0%, ${C.surface} 70%)`,
                  border: `1px solid ${tint(C.red, 22)}`,
                  borderRadius: 12, padding: "12px 16px",
                  borderLeft: `4px solid ${embColor(i.embarcacion_id)}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 800, color: C.abyss, fontSize: 14 }}>{i.sistema}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.slate }}>{embName(i.embarcacion_id)}</span>
                    <span style={{ fontSize: 10.5, color: C.red, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                      {diaFechaLarga(i.fecha_programada)} · {i.hh}h
                    </span>
                    {i.ot_folio && (
                      <span style={{ fontSize: 10, color: C.steel, fontFamily: "'IBM Plex Mono', monospace" }}>{i.ot_folio}</span>
                    )}
                    <Pill tone={TIPO_TONE[i.tipo] || "steel"}>{i.tipo}</Pill>
                  </div>
                </div>
                {puedeOperar && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={() => reagendar(i, hoy)}
                      style={{ ...ghostBtn, fontSize: 12, padding: "7px 14px", color: C.cyan, borderColor: tint(C.cyan, 35) }}>
                      → Hoy
                    </button>
                    <button type="button" onClick={() => toggleDone(i)}
                      style={{ ...primaryBtn, fontSize: 12, padding: "7px 14px", background: C.green, borderColor: C.green }}>
                      <Check size={14} /> Realizada
                    </button>
                  </div>
                )}
                {puedeBorrar && (
                  <button type="button" onClick={() => eliminar(i.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {showForm && puedeOperar && (
        <Section
          title="Nueva tarea programada"
          description="Define fecha, embarcación, sistema y carga en horas-hombre. Opcionalmente vincula una OT abierta."
          padding={20}
          style={{ marginBottom: 20 }}
        >
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14,
            padding: 18, borderRadius: 12,
            background: `linear-gradient(135deg, ${tint(C.cyan, 6)} 0%, ${C.mist} 100%)`,
            border: `1px solid ${tint(C.cyan, 18)}`,
            marginBottom: 16,
          }}>
            <Field label="Fecha">
              <input type="date" value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                style={{ ...inputStyle(), fontSize: 13 }} />
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
            <Field label="Horas-hombre">
              <input
                type="number"
                step={0.5}
                value={form.hh}
                className="prog-form-hh"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, hh: +e.target.value })}
                style={{
                  ...bluInput,
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: "'IBM Plex Mono', monospace",
                  textAlign: "center",
                  padding: "12px 14px",
                }}
              />
            </Field>
          </div>

          <Field label="OT por programar (opcional)">
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
              <div style={{
                fontSize: 12, color: C.steel, marginTop: 8, padding: "10px 14px",
                borderRadius: 8, background: tint(C.green, 8), border: `1px solid ${tint(C.green, 25)}`,
              }}>
                <CheckCircle2 size={13} style={{ display: "inline", verticalAlign: -2, marginRight: 6, color: C.green }} />
                Embarcación, sistema y tipo completados desde la OT. Al guardar, <strong>{form.ot_folio}</strong> quedará <strong>Programada</strong>.
              </div>
            )}
          </Field>

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button type="button" onClick={crear} style={{
              ...primaryBtn, padding: "12px 24px", fontSize: 14,
              background: C.cyan, borderColor: C.cyan,
              boxShadow: `0 6px 18px ${tint(C.cyan, 28)}`,
            }}>
              <Plus size={16} /> Agregar al programa
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Section>
      )}

      <Section
        title="Calendario semanal"
        description="Siete columnas de carga — pulsa + en cada día para programar trabajo puntual"
        padding={16}
        style={{ marginBottom: 20 }}
      >
        <div className="prog-semana-scroll">
          <div className="prog-semana-grid">
            {diasSemana.map((fechaStr) => (
              <ProgDiaColumn
                key={fechaStr}
                fechaStr={fechaStr}
                hoy={hoy}
                dayItems={itemsPorFecha(fechaStr)}
                hhDia={hhPorFecha(fechaStr)}
                puedeOperar={puedeOperar}
                onAddTarea={() => { setForm(blank(fechaStr)); setShowForm(true); }}
                embName={embName}
                embColor={embColor}
                ots={ots}
                estadoLabel={estadoLabel}
                puedeBorrar={puedeBorrar}
                onToggle={toggleDone}
                onDelete={eliminar}
              />
            ))}
          </div>
        </div>
      </Section>

      <GuiaColapsable titulo="¿Cómo usar la programación semanal?" icon={CalendarDays}>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate, lineHeight: 1.75 }}>
          <li>Usa el botón <strong>+</strong> de cada día o <strong>Nueva tarea</strong> para agregar trabajo a una fecha concreta.</li>
          <li>Si asocias una <strong>OT</strong>, sus datos se pre-llenan y la orden pasa a estado <strong>Programada</strong>.</li>
          <li>Pulsa <strong>✓</strong> cuando esté ejecutada — si la OT es correctiva, se pedirá la codificación ISO 14224.</li>
          <li>Las tareas no realizadas de semanas anteriores aparecen en <strong>Atrasadas</strong>; reagéndalas a hoy o ciérralas directamente.</li>
          <li>El indicador de cumplimiento y la barra de progreso de cada día reflejan el avance de la semana visible.</li>
        </ul>
      </GuiaColapsable>

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
    </ModuleShell>
  );
}
