import React from "react";
import { Search, X, Clock, AlertTriangle } from "lucide-react";
import { C, clp, lk, tn, tint, TIPOS_OT, PRIORIDADES, ESTADOS_OT } from "../../theme";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";
import { costoOT, sinValorizar } from "../../lib/ot";

export default function OTQueuePanel({
  lista,
  selectedId,
  onSelect,
  busqueda,
  setBusqueda,
  embName,
  showEmb,
  embarcaciones,
}) {
  const embColor = (id) => embarcaciones?.find((e) => e.id === id)?.color || C.steel;

  return (
    <Card style={{ padding: 16, height: "calc(100vh - 320px)", minHeight: 440, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            data-testid="ot-busqueda"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar folio, sistema, descripción…"
            style={{ ...inputStyle(), padding: "8px 12px 8px 34px", fontSize: 13, width: "100%" }}
          />
        </div>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} style={{ ...ghostBtn, padding: "8px 10px" }} aria-label="Limpiar búsqueda">
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8, fontWeight: 600 }}>
        {lista.length} orden{lista.length !== 1 ? "es" : ""} en alcance
      </div>

      <div data-testid="ot-queue" style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginRight: -4 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>
            {busqueda.trim() ? "Sin coincidencias para la búsqueda." : "Sin órdenes en este filtro."}
          </div>
        ) : (
          lista.map((o) => {
            const isSelected = selectedId === o.id;
            const prioridadAlta = o.prioridad === "critica" || o.prioridad === "alta";
            const abierta = o.estado !== "cerrada";
            return (
              <button
                key={o.id}
                type="button"
                data-testid={`ot-row-${o.folio}`}
                onClick={() => onSelect(o.id)}
                className={`ot-queue-item${isSelected ? " ot-queue-item-selected" : ""}`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  marginBottom: 6,
                  borderRadius: 10,
                  border: `1px solid ${isSelected ? tint(C.sky, 35) : C.line}`,
                  background: isSelected ? tint(C.sky, 8) : o._pending ? tint(C.amber, 8) : C.surface,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 13, color: isSelected ? C.sky : C.steel }}>
                    {o.folio}
                  </span>
                  {o._pending && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 700, color: "#7a5b00", background: tint(C.amber, 25), padding: "1px 6px", borderRadius: 20 }}>
                      <Clock size={9} /> Sync
                    </span>
                  )}
                  {sinValorizar(o) && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "#7a5b00", background: tint(C.amber, 18), border: `1px solid ${C.amber}`, borderRadius: 20, padding: "1px 6px" }}>
                      $ pendiente
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
                    <Pill tone={tn(PRIORIDADES, o.prioridad)}>{lk(PRIORIDADES, o.prioridad)}</Pill>
                  </span>
                </div>

                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.sistema || "—"}
                </div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.descripcion || "Sin descripción"}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <Pill tone={tn(ESTADOS_OT, o.estado)}>{lk(ESTADOS_OT, o.estado)}</Pill>
                  <Pill tone={tn(TIPOS_OT, o.tipo)}>{lk(TIPOS_OT, o.tipo)}</Pill>
                  {showEmb && (
                    <span style={{ fontSize: 11, color: C.slate, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: embColor(o.embarcacion_id) }} />
                      {embName(o.embarcacion_id)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.slate, marginLeft: "auto" }}>
                    {o.fecha}
                  </span>
                  {costoOT(o) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{clp(costoOT(o))}</span>
                  )}
                  {prioridadAlta && abierta && (
                    <AlertTriangle size={13} color={C.red} title="Prioridad alta — requiere seguimiento" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
