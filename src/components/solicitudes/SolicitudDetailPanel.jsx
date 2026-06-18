import React from "react";
import { ArrowRight, X, Clock, Trash2 } from "lucide-react";
import { C } from "../../theme";
import { Card, Pill, primaryBtn, ghostBtn } from "../../ui";
import { PRIORIDADES, ESTADOS_SOLICITUD, lk, tn, isAdmin } from "../../theme";

export default function SolicitudDetailPanel({
  sol,
  embName,
  sla,
  profile,
  onConvertir,
  onRechazar,
  onEliminar,
}) {
  if (!sol) {
    return (
      <Card style={{ padding: 24, textAlign: "center", color: C.slate, minHeight: 200 }}>
        Selecciona una solicitud de la cola
      </Card>
    );
  }

  const puedeBorrar = isAdmin(profile?.rol);

  return (
    <Card style={{ padding: 16, minHeight: 280 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 15, color: C.steel }}>
        {sol.folio || "—"}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 8, lineHeight: 1.4 }}>{sol.descripcion}</div>
      {sol.sistema && <div style={{ fontSize: 13, color: C.slate, marginTop: 6 }}>{sol.sistema}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <Pill tone={tn(PRIORIDADES, sol.prioridad)}>{lk(PRIORIDADES, sol.prioridad)}</Pill>
        <Pill tone={tn(ESTADOS_SOLICITUD, sol.estado)}>{lk(ESTADOS_SOLICITUD, sol.estado)}</Pill>
      </div>
      <dl style={{ margin: "16px 0 0", fontSize: 13, color: C.slate, display: "grid", gap: 8 }}>
        <div><dt style={{ fontWeight: 600, color: C.ink, display: "inline" }}>Solicitante: </dt>{sol.solicitante}</div>
        <div><dt style={{ fontWeight: 600, color: C.ink, display: "inline" }}>Embarcación: </dt>{embName(sol.embarcacion_id)}</div>
        <div><dt style={{ fontWeight: 600, color: C.ink, display: "inline" }}>Fecha: </dt>{sol.fecha}</div>
        {sla && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} color={sla.tone === "red" ? C.red : sla.tone === "yellow" ? C.amber : C.green} />
            <span>SLA {sla.transcurridas.toFixed(1)}/{sla.objetivo}h</span>
            <Pill tone={sla.tone}>{sla.label}</Pill>
          </div>
        )}
      </dl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        {sol.estado === "pendiente" && isAdmin(profile?.rol) && (
          <>
            <button type="button" onClick={() => onConvertir(sol)} style={{ ...primaryBtn, flex: 1, justifyContent: "center" }}>
              <ArrowRight size={15} /> Convertir a OT
            </button>
            <button type="button" onClick={() => onRechazar(sol)} style={{ ...ghostBtn, color: C.red, borderColor: C.red }}>
              <X size={15} /> Rechazar
            </button>
          </>
        )}
        {puedeBorrar && (
          <button type="button" onClick={() => onEliminar(sol.id)} style={{ ...ghostBtn, color: C.slate }}>
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>
    </Card>
  );
}
