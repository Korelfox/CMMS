import React from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { C, clp, tint } from "../../theme";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";

export default function ComprasQueuePanel({
  lista,
  selectedId,
  onSelect,
  busqueda,
  setBusqueda,
  ocTotal,
  ocLinesCount,
  etaSemaforo,
  panelHeight = "calc(100vh - 320px)",
}) {
  const ESTADO_TONE = { solicitada: "slate", aprobada: "purple", enviada: "steel", recibida: "green", cancelada: "red" };

  return (
    <Card style={{ padding: 16, height: panelHeight, minHeight: 440, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input data-testid="oc-busqueda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar folio, proveedor…" style={{ ...inputStyle(), padding: "8px 12px 8px 34px", fontSize: 13, width: "100%" }} />
        </div>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} style={{ ...ghostBtn, padding: "8px 10px" }} aria-label="Limpiar"><X size={14} /></button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8, fontWeight: 600 }}>
        {lista.length} OC{lista.length !== 1 ? "s" : ""} en alcance
      </div>
      <div data-testid="oc-queue" style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>Sin coincidencias.</div>
        ) : (
          lista.map((o) => {
            const isSelected = selectedId === o.id;
            const urgente = o.urgencia === "critico" || o.urgencia === "urgente";
            const eta = etaSemaforo?.(o);
            return (
              <button key={o.id} type="button" onClick={() => onSelect(o.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, borderRadius: 10,
                  border: `1px solid ${isSelected ? tint(C.sky, 35) : C.line}`,
                  background: isSelected ? tint(C.sky, 8) : C.surface, cursor: "pointer", fontFamily: "inherit",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 13, color: isSelected ? C.sky : C.steel }}>{o.folio}</span>
                  <Pill tone={ESTADO_TONE[o.estado] || "slate"}>{o.estado}</Pill>
                  {urgente && <AlertTriangle size={13} color={C.red} />}
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.gold }}>{clp(ocTotal(o))}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{o.proveedor}</div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
                  {ocLinesCount(o)} ítem{ocLinesCount(o) !== 1 ? "s" : ""} · {o.fecha}
                  {eta && <span style={{ marginLeft: 8, color: eta.color, fontWeight: 600 }}>{eta.label}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
