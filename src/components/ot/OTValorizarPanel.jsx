import React, { useMemo } from "react";
import { DollarSign, CheckCircle2 } from "lucide-react";
import { C, clp, tint } from "../../theme";
import { ActionQueue } from "../../ui";
import { costoOT, sinValorizar } from "../../lib/ot";

export default function OTValorizarPanel({ lista, onSelect, embName }) {
  const pendientes = useMemo(() => lista.filter(sinValorizar), [lista]);
  const valorizadas = lista.length - pendientes.length;

  const queueItems = useMemo(() => pendientes.map((o) => ({
    id: o.id,
    label: `${o.folio} · ${o.sistema || "OT"}`,
    detail: `${embName?.(o.embarcacion_id) || "—"} · ${o.fecha} · MO/Mat pendiente`,
    tone: "amber",
    onClick: () => onSelect(o.id),
  })), [pendientes, onSelect, embName]);

  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.foam}`, background: tint(C.gold, 6) }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: pendientes.length ? 12 : 0, flexWrap: "wrap" }}>
        <DollarSign size={20} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.abyss }}>Modo valorización</div>
          <div style={{ fontSize: 12.5, color: C.slate, marginTop: 4 }}>
            {pendientes.length === 0
              ? "Todas las OTs cerradas en alcance tienen costos registrados."
              : `${pendientes.length} OT${pendientes.length !== 1 ? "s" : ""} cerrada${pendientes.length !== 1 ? "s" : ""} sin MO/Mat · selecciona una para editar en el panel derecho`}
          </div>
        </div>
        {lista.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.slate, fontWeight: 600 }}>Progreso en alcance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: pendientes.length ? C.gold : C.green }}>
              {valorizadas}/{lista.length}
            </div>
          </div>
        )}
      </div>

      {pendientes.length > 0 ? (
        <ActionQueue
          title="Pendientes de valorizar"
          items={queueItems.slice(0, 8)}
          emptyLabel=""
        />
      ) : lista.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.green, fontWeight: 600 }}>
          <CheckCircle2 size={16} /> Cierre de costos al día en este alcance ({clp(lista.reduce((s, o) => s + costoOT(o), 0))} acumulado)
        </div>
      )}
    </div>
  );
}
