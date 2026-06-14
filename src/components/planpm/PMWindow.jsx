import React, { useState } from "react";
import {
  Check, Plus, Trash2, Edit3, X, ClipboardList, History, AlertCircle,
} from "lucide-react";
import { C, tint, num } from "../../theme";
import { Pill, primaryBtn, ghostBtn, inputStyle, bluInput, Field } from "../../ui";
import ComboInput from "../ComboInput";
import { TAREAS_PM } from "../../lib/tareasPM";
import {
  statusPlan, statusPlanCalendario, diasDesde,
  DIAS_POR_UNIDAD, labelIntervaloCalendario,
} from "../../lib/pm";
import { usePlanPMData } from "./planpmStore";

const INTERVALOS_COMUNES = [50, 100, 250, 500, 1000, 2000, 4000, 8000];
const UNIDADES_CAL = ["diario", "semanal", "mensual", "trimestral", "semestral", "anual"];
const NUEVO_PLAN_DEFECTO = {
  descripcion: "", tipo_disparador: "horas", intervalo_horas: 250,
  unidad_calendario: "mensual", intervalo_calendario: 1,
  horas_ult_pm: "", fecha_ult_pm: "",
};

// ── Barras de progreso (misma lógica que en PlanPM) ──────────────
function PMBar({ elapsed, intervalo }) {
  const pct = Math.min(100, intervalo > 0 ? (elapsed / intervalo) * 100 : 0);
  const [tone] = statusPlan(elapsed, intervalo);
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.3, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 96, textAlign: "right" }}>
        {num(elapsed, 0)}h / {intervalo}h
      </span>
    </div>
  );
}

function PMBarCal({ diasElapsed, unidad, intervalo = 1 }) {
  const total = (DIAS_POR_UNIDAD[unidad] || 1) * (intervalo || 1);
  const safe = Number.isFinite(diasElapsed) ? diasElapsed : total;
  const pct = Math.min(100, total > 0 ? (safe / total) * 100 : 0);
  const [tone] = statusPlanCalendario(safe, unidad, intervalo);
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.3, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 96, textAlign: "right" }}>
        {Number.isFinite(diasElapsed) ? diasElapsed : "—"}d / {total}d
      </span>
    </div>
  );
}

function StatChip({ label, val, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: tint(color, 10) }}>
      <span style={{ fontSize: 17, fontWeight: 800, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{val}</span>
      <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    </div>
  );
}

// ── Cuerpo de la ventana de Plan PM de un equipo ─────────────────
// handlersRef.current trae: { registrarPM, guardarHito, agregarPlan, eliminarPlan, nombreUsuario }
export default function PMWindow({ equipoId, handlersRef, puedeOperar, puedeBorrar }) {
  const { planes, historial, equipos, embarcaciones } = usePlanPMData();
  const h = handlersRef.current;

  const [registrando, setRegistrando] = useState(null);
  const [regForm, setRegForm] = useState({ realizado_por: "", notas: "", crearOT: false });
  const [editHitoId, setEditHitoId] = useState(null);
  const [hitoForm, setHitoForm] = useState({ horas: "", fecha: "" });
  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState(NUEVO_PLAN_DEFECTO);
  const [guardando, setGuardando] = useState(false);

  const eq = equipos.find((e) => e.id === equipoId);

  if (!eq) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, padding: 40, color: C.slate }}>
        <AlertCircle size={28} color={C.line} />
        <span style={{ fontSize: 13 }}>Equipo no encontrado.</span>
      </div>
    );
  }

  const nave      = embarcaciones.find((v) => v.id === eq.embarcacion_id);
  const planesEq  = planes.filter((p) => p.equipo_id === eq.id && p.activo);
  const histEq    = historial.filter((r) => r.equipo_id === eq.id).slice(0, 8);

  let vencidos = 0, proximos = 0;
  planesEq.forEach((p) => {
    const esC = p.tipo_disparador === "calendario";
    const elapsed = esC ? diasDesde(p.fecha_ult_pm) : (eq.horas_actual || 0) - (p.horas_ult_pm || 0);
    const [tone] = esC
      ? statusPlanCalendario(elapsed, p.unidad_calendario, p.intervalo_calendario ?? 1)
      : statusPlan(elapsed, p.intervalo_horas);
    if (tone === "red")    vencidos++;
    if (tone === "yellow") proximos++;
  });

  // ── Handlers ────────────────────────────────────────────────────

  async function handleRegistrar(plan) {
    setGuardando(true);
    try {
      await h.registrarPM(plan, regForm);
      setRegistrando(null);
      setRegForm({ realizado_por: h.nombreUsuario || "", notas: "", crearOT: false });
    } catch { /* error ya mostrado por el handler */ }
    finally { setGuardando(false); }
  }

  async function handleGuardarHito(plan) {
    setGuardando(true);
    try {
      await h.guardarHito(plan, hitoForm);
      setEditHitoId(null);
    } catch { /* error ya mostrado por el handler */ }
    finally { setGuardando(false); }
  }

  async function handleAgregarPlan() {
    if (!newPlan.descripcion.trim()) return;
    setGuardando(true);
    try {
      await h.agregarPlan(eq.id, newPlan);
      setAddingPlan(false);
      setNewPlan(NUEVO_PLAN_DEFECTO);
    } catch { /* error ya mostrado por el handler */ }
    finally { setGuardando(false); }
  }

  function abrirRegistrar(plan) {
    setRegistrando(plan.id);
    setRegForm({ realizado_por: h.nombreUsuario || "", notas: "", crearOT: false });
    setEditHitoId(null);
  }

  function abrirHito(plan) {
    setEditHitoId(plan.id);
    setHitoForm({
      horas: plan.horas_ult_pm != null && plan.horas_ult_pm > 0 ? String(plan.horas_ult_pm) : "",
      fecha: plan.fecha_ult_pm || "",
    });
    setRegistrando(null);
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>

      {/* ── Cabecera del equipo ── */}
      <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.foam}`, background: C.mist }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>
              {eq.id_visible}{nave ? ` · ${nave.nombre || nave.codigo}` : ""}
            </div>
            {eq.estado && eq.estado !== "operativo" && (
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 4 }}>
                Estado: {eq.estado}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.abyss, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
              {num(eq.horas_actual || 0, 0)}
              <span style={{ fontSize: 13, color: C.slate, fontWeight: 400 }}> h</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>Horas actuales</div>
          </div>
        </div>

        {/* Mini KPIs */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <StatChip label="Planes" val={planesEq.length} color={C.steel} />
          {vencidos > 0 && <StatChip label="Vencidos" val={vencidos} color={C.red} />}
          {proximos > 0 && <StatChip label="Próximos" val={proximos} color={C.amber} />}
          {planesEq.length - vencidos - proximos > 0 && (
            <StatChip label="Al día" val={planesEq.length - vencidos - proximos} color={C.green} />
          )}
        </div>
      </div>

      {/* ── Planes ── */}
      <div style={{ padding: "16px 22px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 0.7, textTransform: "uppercase", color: C.steel, fontWeight: 700 }}>
            Planes de mantenimiento{planesEq.length > 0 ? ` · ${planesEq.length}` : ""}
          </div>
          {puedeOperar && (
            <button onClick={() => { setAddingPlan(!addingPlan); setRegistrando(null); setEditHitoId(null); }}
              style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>
              <Plus size={13} /> Plan
            </button>
          )}
        </div>

        {planesEq.length === 0 && !addingPlan && (
          <div style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic", padding: "8px 0 16px" }}>
            Sin planes de PM — agrega el primero con el botón "+ Plan"
          </div>
        )}

        {planesEq.map((plan) => {
          const esC = plan.tipo_disparador === "calendario";
          const elapsed = esC
            ? diasDesde(plan.fecha_ult_pm)
            : (eq.horas_actual || 0) - (plan.horas_ult_pm || 0);
          const [tone, label] = esC
            ? statusPlanCalendario(elapsed, plan.unidad_calendario, plan.intervalo_calendario ?? 1)
            : statusPlan(elapsed, plan.intervalo_horas);
          const isReg  = registrando === plan.id;
          const isHito = editHitoId === plan.id;
          const borderColor = tone === "red" ? C.red + "50" : tone === "yellow" ? C.amber + "50" : C.line;

          return (
            <div key={plan.id} style={{ marginBottom: 12, borderRadius: 10, border: `1px solid ${borderColor}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>

              {/* Plan info + barra */}
              <div style={{ padding: "12px 16px", background: tone === "red" ? tint(C.red, 6) : tone === "yellow" ? tint(C.amber, 7) : tint(C.steel, 5) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Pill tone={tone}>{label}</Pill>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {plan.descripcion}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>
                      {esC
                        ? `Cada ${labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)}`
                        : `Cada ${plan.intervalo_horas}h`}
                      {plan.fecha_ult_pm
                        ? ` · Último: ${new Date(plan.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")}${!esC ? ` (${num(plan.horas_ult_pm || 0)}h)` : ""}`
                        : " · Nunca realizado"}
                    </div>
                  </div>
                </div>
                {esC
                  ? <PMBarCal diasElapsed={elapsed} unidad={plan.unidad_calendario} intervalo={plan.intervalo_calendario ?? 1} />
                  : <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />}
              </div>

              {/* Botones de acción */}
              {puedeOperar && (
                <div style={{ padding: "8px 14px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", background: C.surface, borderTop: `1px solid ${C.foam}` }}>
                  <button
                    onClick={() => isReg ? setRegistrando(null) : abrirRegistrar(plan)}
                    style={{ ...primaryBtn, padding: "5px 12px", fontSize: 12, background: isReg ? C.slate : C.green, borderColor: isReg ? C.slate : C.green }}>
                    <Check size={13} /> {isReg ? "Cancelar" : "Registrar PM"}
                  </button>
                  {tone === "red" && !isReg && (
                    <button onClick={() => { abrirRegistrar(plan); setRegForm((f) => ({ ...f, crearOT: true })); }}
                      style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12, borderColor: C.red, color: C.red }}>
                      <ClipboardList size={13} /> Crear OT
                    </button>
                  )}
                  <button onClick={() => isHito ? setEditHitoId(null) : abrirHito(plan)}
                    title="Ajustar hito inicial"
                    style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12, color: isHito ? C.steel : C.slate, borderColor: isHito ? C.steel : C.line }}>
                    <Edit3 size={13} /> Hito
                  </button>
                  {puedeBorrar && (
                    <button onClick={() => h.eliminarPlan(plan.id)}
                      style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: C.slate, padding: "5px 6px", display: "flex", alignItems: "center" }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* ── Formulario Registrar PM ── */}
              {isReg && (
                <div style={{ padding: "16px 16px 14px", background: tint(C.green, 8), borderTop: `1px solid ${C.green}30` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss, marginBottom: 14 }}>
                    Registrar PM — {plan.descripcion}
                    <span style={{ fontWeight: 400, color: C.slate, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                      a las {num(eq.horas_actual || 0, 0)}h · hoy
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
                    <Field label="Realizado por">
                      <input value={regForm.realizado_por}
                        onChange={(e) => setRegForm((p) => ({ ...p, realizado_por: e.target.value }))}
                        style={inputStyle()} />
                    </Field>
                    <Field label="Notas (opcional)">
                      <input value={regForm.notas}
                        onChange={(e) => setRegForm((p) => ({ ...p, notas: e.target.value }))}
                        placeholder="Qué se revisó, observaciones, repuestos usados…"
                        style={inputStyle()} />
                    </Field>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer", marginBottom: 14 }}>
                    <input type="checkbox" checked={regForm.crearOT}
                      onChange={(e) => setRegForm((p) => ({ ...p, crearOT: e.target.checked }))}
                      style={{ width: 15, height: 15, accentColor: C.steel }} />
                    Generar OT de cierre vinculada a este PM
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleRegistrar(plan)} disabled={guardando}
                      style={{ ...primaryBtn, minWidth: 160 }}>
                      <Check size={14} />
                      {guardando ? "Guardando…" : `Confirmar PM${regForm.crearOT ? " + OT" : ""}`}
                    </button>
                    <button onClick={() => setRegistrando(null)} style={ghostBtn}>
                      <X size={13} /> Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Formulario Hito ── */}
              {isHito && (
                <div style={{ padding: "16px 16px 14px", background: tint(C.steel, 7), borderTop: `1px solid ${C.steel}25` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss, marginBottom: 4 }}>
                    Ajustar hito · <em style={{ fontWeight: 400 }}>{plan.descripcion}</em>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 12, lineHeight: 1.5 }}>
                    Corrige el punto de partida del semáforo. <strong>No registra un PM nuevo</strong>, solo ajusta la referencia.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: plan.tipo_disparador === "calendario" ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    {plan.tipo_disparador !== "calendario" && (
                      <Field label="Último servicio a (h)">
                        <input type="number" value={hitoForm.horas}
                          onFocus={(e) => e.target.select()}
                          onChange={(ev) => setHitoForm((p) => ({ ...p, horas: ev.target.value }))}
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleGuardarHito(plan)} disabled={guardando} style={primaryBtn}>
                      <Check size={14} /> {guardando ? "Guardando…" : "Guardar hito"}
                    </button>
                    <button onClick={() => setEditHitoId(null)} style={ghostBtn}><X size={13} /> Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Formulario agregar plan ── */}
        {addingPlan && (
          <div style={{ marginTop: 4, marginBottom: 16, padding: "16px 16px 14px", background: C.mist, borderRadius: 10, border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 10.5, letterSpacing: 0.7, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 14 }}>
              Nuevo plan de mantenimiento
            </div>

            {/* Tipo disparador */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>Disparador:</span>
              {[["horas", "Por Horas"], ["calendario", "Calendario"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setNewPlan((p) => ({ ...p, tipo_disparador: val }))}
                  style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${newPlan.tipo_disparador === val ? C.steel : C.line}`, background: newPlan.tipo_disparador === val ? C.steel : "transparent", color: newPlan.tipo_disparador === val ? "#fff" : C.slate, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="Tarea de mantenimiento">
                <ComboInput value={newPlan.descripcion}
                  onChange={(v) => setNewPlan((p) => ({ ...p, descripcion: v }))}
                  options={TAREAS_PM}
                  placeholder="Buscar tarea… (Cambio de aceite, Análisis…)"
                  autoFocus />
              </Field>
              {newPlan.tipo_disparador === "horas" ? (
                <Field label="Intervalo (horas)">
                  <input type="number" value={newPlan.intervalo_horas} list="pm-win-intervalos"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_horas: +e.target.value }))}
                    style={{ ...bluInput, width: "100%" }} />
                  <datalist id="pm-win-intervalos">
                    {INTERVALOS_COMUNES.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </Field>
              ) : (
                <div>
                  <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginBottom: 4 }}>Intervalo calendario</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" min={1} value={newPlan.intervalo_calendario}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_calendario: +e.target.value }))}
                      style={{ ...bluInput, width: 52 }} />
                    <select value={newPlan.unidad_calendario}
                      onChange={(e) => setNewPlan((p) => ({ ...p, unidad_calendario: e.target.value }))}
                      style={{ ...inputStyle(), flex: 1 }}>
                      {UNIDADES_CAL.map((u) => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Hito inicial */}
            <div style={{ display: "grid", gridTemplateColumns: newPlan.tipo_disparador === "horas" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14, paddingTop: 12, borderTop: `1px dashed ${C.line}` }}>
              {newPlan.tipo_disparador === "horas" && (
                <Field label="Último servicio a (h) · opcional">
                  <input type="number" value={newPlan.horas_ult_pm}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewPlan((p) => ({ ...p, horas_ult_pm: e.target.value }))}
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
            <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
              Si el equipo ya fue serviciado, ingresa el hito para que el semáforo arranque desde el valor correcto.
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAgregarPlan} disabled={guardando || !newPlan.descripcion.trim()} style={primaryBtn}>
                {guardando ? "Guardando…" : "Guardar plan"}
              </button>
              <button onClick={() => { setAddingPlan(false); setNewPlan(NUEVO_PLAN_DEFECTO); }} style={ghostBtn}>
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Historial reciente ── */}
      {histEq.length > 0 && (
        <div style={{ padding: "4px 22px 24px" }}>
          <div style={{ fontSize: 10.5, letterSpacing: 0.7, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <History size={13} /> Historial reciente
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {histEq.map((r) => {
              const p = planes.find((x) => x.id === r.plan_pm_id);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: tint(C.steel, 5), fontSize: 12 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.slate, flexShrink: 0, minWidth: 86 }}>
                    {r.fecha_realizacion}
                  </span>
                  <span style={{ flex: 1, color: C.abyss, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p?.descripcion || "—"}
                  </span>
                  {r.horas_realizacion != null && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel, flexShrink: 0 }}>
                      {num(r.horas_realizacion, 0)}h
                    </span>
                  )}
                  {r.realizado_por && (
                    <span style={{ fontSize: 11, color: C.slate, flexShrink: 0, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.realizado_por}
                    </span>
                  )}
                  {r.ot_id && <Pill tone="green" style={{ flexShrink: 0 }}>OT</Pill>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
