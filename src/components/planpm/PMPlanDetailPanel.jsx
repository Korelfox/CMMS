import React from "react";
import { CalendarClock, Check, Trash2, ClipboardList, Edit3 } from "lucide-react";
import { C, num, tint } from "../../theme";
import { Pill, primaryBtn, ghostBtn, inputStyle, Field } from "../../ui";
import { labelIntervaloCalendario } from "../../lib/pm";
import { CritBadge } from "../equipos/arbolUI";
import { PMBar, PMBarCalendario } from "./PMBars";

export default function PMPlanDetailPanel({
  item,
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
  onRegistrar,
  onGuardarHito,
  onAbrirEditHito,
  onEliminar,
  onVerEquipo,
}) {
  const panelHeight = "calc(100vh - 320px)";

  if (!item) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, color: C.slate, minHeight: 440, background: C.surface, borderRadius: 12, border: `1px solid ${C.line}` }}>
        <CalendarClock size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Selecciona una tarea PM</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>Gestiona intervalos, registra mantenimientos y crea OT de cierre.</p>
      </div>
    );
  }

  const { plan, equipo, esCalendario, elapsed, tone, label } = item;
  const isReg = registrando === plan.id;
  const isHito = editHitoId === plan.id;
  const barColor = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;

  return (
    <div data-testid="pm-plan-detail" style={{ display: "flex", flexDirection: "column", height: panelHeight, minHeight: 440, overflow: "hidden", background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, borderLeft: `4px solid ${barColor}` }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Pill tone={tone}>{label}</Pill>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: C.steel }}>
                {esCalendario
                  ? `Cada ${labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)}`
                  : `Cada ${plan.intervalo_horas}h`}
              </span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.abyss, marginTop: 6 }}>{plan.descripcion}</div>
            {equipo && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{equipo.sistema}</span>
                <CritBadge crit={equipo.criticidad} />
                <span style={{ fontSize: 11, fontFamily: "monospace", color: C.slate }}>{equipo.id_visible}</span>
                <span style={{ fontSize: 11, color: C.slate }}>{embName?.(equipo.embarcacion_id)}</span>
                {!esCalendario && (
                  <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: C.steel }}>{num(equipo.horas_actual || 0, 0)} h</span>
                )}
              </div>
            )}
          </div>
          {onVerEquipo && equipo && (
            <button type="button" onClick={() => onVerEquipo(equipo.id)} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12 }}>
              Ver equipo
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          {esCalendario ? (
            <PMBarCalendario diasElapsed={elapsed} unidad={plan.unidad_calendario} intervalo={plan.intervalo_calendario ?? 1} />
          ) : (
            <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />
          )}
          <div style={{ fontSize: 10.5, color: C.slate, marginTop: 6 }}>
            {plan.fecha_ult_pm
              ? `Último PM: ${new Date(plan.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")}${!esCalendario ? ` (${num(plan.horas_ult_pm || 0)}h)` : ""}`
              : "Nunca realizado"}
          </div>
        </div>

        {puedeOperar && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button"
              onClick={() => { setRegistrando(isReg ? null : plan.id); setRegForm({ realizado_por: profile?.nombre || "", notas: "", crearOT: false }); }}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12, background: isReg ? C.slate : C.green, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Check size={13} /> {isReg ? "Cancelar" : "Registrar PM"}
            </button>
            {tone === "red" && !isReg && (
              <button type="button"
                onClick={() => { setRegistrando(plan.id); setRegForm({ realizado_por: profile?.nombre || "", notas: "", crearOT: true }); }}
                style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12, borderColor: C.red, color: C.red, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ClipboardList size={13} /> Crear OT
              </button>
            )}
            <button type="button"
              onClick={() => isHito ? setEditHitoId(null) : onAbrirEditHito(plan)}
              style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Edit3 size={13} /> Ajustar hito
            </button>
            {puedeBorrar && (
              <button type="button" onClick={() => onEliminar(plan.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, marginLeft: "auto" }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {isReg && (
          <div style={{ marginBottom: 12, padding: 14, background: tint(C.green, 8), border: `1px solid ${C.green}40`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>Registrar realización</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
              <Field label="Realizado por">
                <input value={regForm.realizado_por} onChange={(e) => setRegForm((p) => ({ ...p, realizado_por: e.target.value }))} style={inputStyle()} />
              </Field>
              <Field label="Notas">
                <input value={regForm.notas} onChange={(e) => setRegForm((p) => ({ ...p, notas: e.target.value }))} placeholder="Detalles del trabajo…" style={inputStyle()} />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={regForm.crearOT} onChange={(e) => setRegForm((p) => ({ ...p, crearOT: e.target.checked }))} style={{ width: 14, height: 14, accentColor: C.steel }} />
                Generar OT de cierre
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={async () => { await onRegistrar(plan, regForm); setRegistrando(null); setRegForm({ realizado_por: "", notas: "", crearOT: false }); }}
                  style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}>Confirmar</button>
                <button type="button" onClick={() => setRegistrando(null)} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {isHito && (
          <div style={{ padding: 14, background: tint(C.steel, 8), border: `1px solid ${C.steel}40`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>Ajustar hito inicial</div>
            <div style={{ display: "grid", gridTemplateColumns: plan.tipo_disparador === "calendario" ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
              {plan.tipo_disparador !== "calendario" && (
                <Field label="Último PM a (h)">
                  <input type="number" value={hitoForm.horas} onFocus={(e) => e.target.select()} onChange={(e) => setHitoForm((p) => ({ ...p, horas: e.target.value }))} style={{ ...inputStyle(), fontFamily: "monospace" }} />
                </Field>
              )}
              <Field label="Fecha último PM">
                <input type="date" value={hitoForm.fecha} onChange={(e) => setHitoForm((p) => ({ ...p, fecha: e.target.value }))} style={inputStyle()} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button type="button" onClick={async () => { await onGuardarHito(plan, hitoForm); setEditHitoId(null); }} style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}>Guardar</button>
              <button type="button" onClick={() => setEditHitoId(null)} style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12 }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
