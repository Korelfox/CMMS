import React from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { C, num, tint, estadoLabel, estadoTone } from "../../theme";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";
import { TipoChip, CritBadge, RegistroBadge } from "./arbolUI";

export default function EquipoQueuePanel({
  lista,
  selectedId,
  onSelect,
  busqueda,
  setBusqueda,
  embName,
  panelHeight = "calc(100vh - 320px)",
}) {
  return (
    <Card style={{ padding: 16, height: panelHeight, minHeight: 440, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input data-testid="eq-busqueda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo, ID, marca…" style={{ ...inputStyle(), padding: "8px 12px 8px 34px", fontSize: 13, width: "100%" }} />
        </div>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} style={{ ...ghostBtn, padding: "8px 10px" }} aria-label="Limpiar"><X size={14} /></button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8, fontWeight: 600 }}>
        {lista.length} equipo{lista.length !== 1 ? "s" : ""} en alcance
      </div>
      <div data-testid="eq-queue" style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>Sin coincidencias.</div>
        ) : (
          lista.map(({ equipo, brecha, nReps }) => {
            const isSelected = selectedId === equipo.id;
            const urgente = equipo.estado === "fuera_servicio" || brecha?.tone === "red";
            return (
              <button key={equipo.id} type="button" onClick={() => onSelect(equipo.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, borderRadius: 10,
                  border: `1px solid ${isSelected ? tint(C.sky, 35) : C.line}`,
                  background: isSelected ? tint(C.sky, 8) : C.surface, cursor: "pointer", fontFamily: "inherit",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <TipoChip tipo={equipo.tipo_nodo} size={24} />
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 12, color: isSelected ? C.sky : C.steel }}>{equipo.id_visible}</span>
                  <CritBadge crit={equipo.criticidad} />
                  <RegistroBadge equipo={equipo} compact />
                  {urgente && <AlertTriangle size={13} color={C.red} />}
                  <span style={{ marginLeft: "auto" }}>
                    <Pill tone={estadoTone(equipo.estado || "operativo")}>{estadoLabel(equipo.estado || "operativo")}</Pill>
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{equipo.sistema}</div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
                  {embName?.(equipo.embarcacion_id)}
                  {equipo.horometro !== "no" && <span style={{ marginLeft: 8, fontFamily: "monospace", fontWeight: 700 }}>{num(equipo.horas_actual || 0, 0)} h</span>}
                  {nReps > 0 && <span style={{ marginLeft: 8, color: C.cyan }}>{nReps} rep.</span>}
                  {brecha && <span style={{ marginLeft: 8, color: brecha.tone === "red" ? C.red : C.amber, fontWeight: 600 }}>{brecha.label}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
