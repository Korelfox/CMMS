import React from "react";
import { AlertTriangle } from "lucide-react";
import { C, clp, tint } from "../../theme";
import { Pill } from "../../ui";
import { OC_KANBAN_COLS } from "../../lib/comprasKanban";

const URGENCIA_COLOR = { normal: C.slate, urgente: C.amber, critico: C.red };

function KanbanCard({ oc, selected, onSelect, ocTotal, ocLinesCount, etaSemaforo }) {
  const urgCol = URGENCIA_COLOR[oc.urgencia || "normal"] || C.slate;
  const critico = oc.urgencia === "critico" || oc.urgencia === "urgente";
  const eta = etaSemaforo?.(oc);
  return (
    <button
      type="button"
      data-testid={`oc-kanban-${oc.folio}`}
      onClick={() => onSelect(oc.id)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "10px 11px", marginBottom: 8,
        borderRadius: 9, border: `1px solid ${selected ? tint(C.sky, 40) : critico ? tint(urgCol, 35) : C.line}`,
        background: selected ? tint(C.sky, 8) : critico ? tint(urgCol, 6) : C.surface,
        cursor: "pointer", fontFamily: "inherit",
        boxShadow: selected ? `0 0 0 1px ${tint(C.sky, 20)}` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 12, color: C.steel }}>{oc.folio}</span>
        {critico && <AlertTriangle size={12} color={urgCol} />}
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: urgCol }}>{oc.urgencia || "normal"}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {oc.proveedor || "—"}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3 }}>{ocLinesCount} ítem{ocLinesCount !== 1 ? "s" : ""} · {oc.fecha}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{clp(ocTotal)}</span>
        {eta && (
          <span style={{ fontSize: 10.5, color: eta.color, marginLeft: "auto", fontWeight: 700 }}>{eta.label}</span>
        )}
      </div>
    </button>
  );
}

export default function ComprasKanban({ lista, selectedId, onSelect, ocTotal, ocLinesCount, etaSemaforo }) {
  const toneMap = { red: C.red, yellow: C.amber, green: C.green, slate: C.slate, steel: C.steel, purple: C.purple };
  const activas = lista.filter((o) => o.estado !== "cancelada");

  return (
    <div data-testid="oc-kanban" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "16px 16px 20px", alignItems: "flex-start", minHeight: 420 }}>
      {OC_KANBAN_COLS.map((col) => {
        const items = activas.filter((o) => o.estado === col.value);
        const headerColor = toneMap[col.tone] || C.steel;
        return (
          <div key={col.value} style={{ flex: "0 0 272px", minWidth: 272, maxHeight: "calc(100vh - 340px)", display: "flex", flexDirection: "column", background: tint(headerColor, 4), border: `1px solid ${tint(headerColor, 22)}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${tint(headerColor, 18)}`, background: tint(headerColor, 8), flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: headerColor }}>{col.label}</div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{items.length} OC{items.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", padding: "8px 4px" }}>Vacío</div>
              ) : (
                items.map((o) => (
                  <KanbanCard key={o.id} oc={o} selected={selectedId === o.id} onSelect={onSelect}
                    ocTotal={ocTotal(o)} ocLinesCount={ocLinesCount(o)} etaSemaforo={etaSemaforo} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
