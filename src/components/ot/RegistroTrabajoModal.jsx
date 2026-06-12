import React, { useState } from "react";
import { ClipboardList, X, AlertTriangle } from "lucide-react";
import { C, tint } from "../../theme";
import { primaryBtn, ghostBtn, inputStyle, bluInput, Field } from "../../ui";
import { MODOS_FALLA_ISO, CAUSAS_FALLA_ISO, MECANISMOS_FALLA_ISO } from "../../lib/fallasISO";

// Formatea "2026-06-11" → "11 Jun 2026"
function fmtFecha(s) {
  if (!s) return "";
  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const [y, m, d] = s.split("-");
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`;
}

// Modal para registrar trabajo ejecutado sin OT previa.
// Crea una OT cerrada para que el trabajo quede en estadísticas, costos y
// Pareto — cumplimiento ISO 14224 (trazabilidad de todo mantenimiento).
// Props:
//   item          — ítem de programacion (sistema, tipo, hh, fecha_programada, embarcacion_id)
//   embName       — nombre de la embarcación
//   onRegistrar({ descripcion, mttr_horas, costo_mo, costo_mat, modo_falla, … })
//   onSaltarRegistro() — marca hecha sin registro (escape con advertencia)
//   onClose()     — cancela sin ningún cambio
export default function RegistroTrabajoModal({ item, embName, onRegistrar, onSaltarRegistro, onClose }) {
  const esReactiva = item.tipo === "Reactiva";

  const [descripcion, setDescripcion] = useState(item.sistema || "");
  const [mttr,        setMttr]        = useState(item.hh || 0);
  const [costoMO,     setCostoMO]     = useState(0);
  const [costoMat,    setCostoMat]    = useState(0);
  const [modo,        setModo]        = useState("");
  const [causa,       setCausa]       = useState("");
  const [mecanismo,   setMecanismo]   = useState("");

  const puedeRegistrar = descripcion.trim() && (!esReactiva || modo);

  function confirmar() {
    if (!puedeRegistrar) return;
    onRegistrar({
      descripcion: descripcion.trim(),
      mttr_horas:      mttr    || null,
      costo_mo:        costoMO || null,
      costo_mat:       costoMat || null,
      modo_falla:      esReactiva ? modo      || null : null,
      causa_falla:     esReactiva ? causa     || null : null,
      mecanismo_falla: esReactiva ? mecanismo || null : null,
    });
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 540, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        {/* Cabecera */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(C.green, 14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ClipboardList size={20} color={C.green} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: C.abyss }}>Registrar trabajo ejecutado</div>
            <div style={{ fontSize: 12, color: C.slate }}>
              {item.sistema} · {embName} · {fmtFecha(item.fecha_programada)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: "18px 22px", display: "grid", gap: 14 }}>

          <div style={{ fontSize: 12, color: C.slate, background: C.mist, borderRadius: 8, padding: "8px 12px", lineHeight: 1.6 }}>
            Esta tarea se ejecutó sin OT previa. Se creará una <strong>OT cerrada</strong> para
            que el trabajo quede registrado en estadísticas, costos y análisis Pareto
            (ISO 14224 / ISO 55000).
          </div>

          <Field label="Descripción del trabajo realizado *">
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              style={inputStyle()} placeholder="¿Qué se hizo exactamente?" autoFocus />
          </Field>

          {/* Costos y tiempo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="HH reales">
              <input type="number" step={0.5} min={0} value={mttr}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMttr(+e.target.value)}
                style={bluInput} />
            </Field>
            <Field label="Costo MO ($)">
              <input type="number" step={1000} min={0} value={costoMO}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCostoMO(+e.target.value)}
                style={bluInput} placeholder="0" />
            </Field>
            <Field label="Costo Materiales ($)">
              <input type="number" step={1000} min={0} value={costoMat}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCostoMat(+e.target.value)}
                style={bluInput} placeholder="0" />
            </Field>
          </div>

          {/* ISO 14224 — solo para correctivas */}
          {esReactiva && (
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: C.abyss }}>
                Codificación de falla ISO 14224
              </div>
              <Field label="Modo de falla (qué se observó) *">
                <select value={modo} onChange={(e) => setModo(e.target.value)} style={inputStyle()} autoFocus>
                  <option value="">— Selecciona —</option>
                  {MODOS_FALLA_ISO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Causa raíz">
                  <select value={causa} onChange={(e) => setCausa(e.target.value)} style={inputStyle()}>
                    <option value="">— Selecciona —</option>
                    {CAUSAS_FALLA_ISO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
                <Field label="Mecanismo de deterioro">
                  <select value={mecanismo} onChange={(e) => setMecanismo(e.target.value)} style={inputStyle()}>
                    <option value="">— Selecciona —</option>
                    {MECANISMOS_FALLA_ISO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Pie */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button onClick={onSaltarRegistro}
            style={{ ...ghostBtn, fontSize: 12, display: "flex", alignItems: "center", gap: 5, color: C.amber }}
            title="El trabajo no quedará en estadísticas, costos ni análisis de fallas">
            <AlertTriangle size={13} /> Solo marcar hecho
          </button>
          <button onClick={confirmar}
            disabled={!puedeRegistrar}
            style={{ ...primaryBtn, opacity: puedeRegistrar ? 1 : 0.5 }}>
            Registrar y cerrar OT →
          </button>
        </div>
      </div>
    </div>
  );
}
