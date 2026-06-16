import React from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { C, clp, tint } from "../../theme";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";
import { estadoStock } from "../../lib/stock";
import { kanbanStockKey } from "../../lib/inventarioKanban";

export default function InventarioQueuePanel({
  lista,
  selectedId,
  onSelect,
  busqueda,
  setBusqueda,
  panelHeight = "calc(100vh - 320px)",
}) {
  return (
    <Card style={{ padding: 16, height: panelHeight, minHeight: 440, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            data-testid="inv-busqueda"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar código, descripción…"
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
        {lista.length} ítem{lista.length !== 1 ? "s" : ""} en alcance
      </div>

      <div data-testid="inv-queue" style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginRight: -4 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>
            {busqueda.trim() ? "Sin coincidencias para la búsqueda." : "Sin ítems en este filtro."}
          </div>
        ) : (
          lista.map((i) => {
            const isSelected = selectedId === i.id;
            const st = estadoStock(i.total, i.stock_min, i.stock_max);
            const abcTone = { A: "red", B: "yellow", C: "green" }[i.abc];
            const critico = kanbanStockKey(i) === "bajo";
            return (
              <button
                key={i.id}
                type="button"
                data-testid={`inv-row-${i.codigo}`}
                onClick={() => onSelect(i.id)}
                className={`inv-queue-item${isSelected ? " inv-queue-item-selected" : ""}`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  marginBottom: 6,
                  borderRadius: 10,
                  border: `1px solid ${isSelected ? tint(C.sky, 35) : critico ? tint(C.red, 30) : C.line}`,
                  background: isSelected ? tint(C.sky, 8) : critico ? tint(C.red, 5) : C.surface,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 13, color: isSelected ? C.sky : C.steel }}>
                    {i.codigo}
                  </span>
                  <Pill tone={abcTone}>{i.abc}</Pill>
                  {critico && <AlertTriangle size={13} color={C.red} title="Bajo mínimo" />}
                  <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, fontWeight: 700 }}>
                    {i.total} {i.unidad}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.descripcion || "—"}
                </div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.categoria || "Sin categoría"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {i.valor > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, marginLeft: "auto" }}>{clp(i.valor)}</span>
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
