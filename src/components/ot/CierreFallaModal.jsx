import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { C, tint } from "../../theme";
import { primaryBtn, ghostBtn, inputStyle, Field } from "../../ui";
import { FALLA_TAXONOMIA, modoMeta, CAUSAS_FALLA_ISO, MECANISMOS_FALLA_ISO } from "../../lib/fallasISO";

// Modal de cierre de OT correctiva: codifica la falla según ISO 14224
// (modo / causa / mecanismo) para que Pareto, Weibull y MTBF trabajen con
// datos comparables. Permite cerrar sin codificar (no bloquea la operación),
// pero deja el dato pendiente visible para completarlo después.
export default function CierreFallaModal({ ot, onGuardar, onCerrarSinCodificar, onClose }) {
  const [modo, setModo]           = useState(ot.modo_falla || "");
  const [causa, setCausa]         = useState(ot.causa_falla || "");
  const [mecanismo, setMecanismo] = useState(ot.mecanismo_falla || "");
  const yaCerrada = ot.estado === "cerrada";

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(C.red, 14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={20} color={C.red} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: C.abyss }}>
              {yaCerrada ? "Codificar falla" : "Cerrar OT correctiva"} · {ot.folio}
            </div>
            <div style={{ fontSize: 12, color: C.slate }}>¿Cómo falló y por qué? (codificación ISO 14224)</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ padding: "18px 22px", display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: C.slate, background: C.mist, borderRadius: 8, padding: "8px 12px" }}>{ot.descripcion}</div>
          <Field label="Modo de falla (qué se observó) *">
            <select value={modo} onChange={(e) => setModo(e.target.value)} style={inputStyle()} autoFocus>
              <option value="">— Selecciona —</option>
              {FALLA_TAXONOMIA.map((c) => (
                <optgroup key={c.clase} label={c.clase}>
                  {c.grupos.flatMap((g) => g.modos.map((m) => (
                    <option key={m.value} value={m.value}>{g.grupo} · {m.label} [{m.codigo}]</option>
                  )))}
                </optgroup>
              ))}
            </select>
            {modo && (() => {
              const me = modoMeta(modo);
              return (
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
                  ISO 14224: <strong style={{ color: C.steel }}>{me.clase}</strong> › {me.grupo} ›{" "}
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>{me.codigo}</span>
                </div>
              );
            })()}
          </Field>
          <Field label="Causa raíz (por qué ocurrió)">
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

        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          {!yaCerrada
            ? <button onClick={onCerrarSinCodificar} style={{ ...ghostBtn, fontSize: 12.5 }} title="Cierra la OT sin códigos; podrás codificarla después">Cerrar sin codificar</button>
            : <span />}
          <button onClick={() => onGuardar({ modo_falla: modo, modo_falla_codigo: modo ? modoMeta(modo).codigo : null, causa_falla: causa || null, mecanismo_falla: mecanismo || null })}
            disabled={!modo} style={{ ...primaryBtn, opacity: modo ? 1 : 0.5 }}>
            {yaCerrada ? "Guardar códigos" : "Codificar y cerrar OT"}
          </button>
        </div>
      </div>
    </div>
  );
}
