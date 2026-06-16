import React from "react";
import { C, clp, tint } from "../../theme";
import { Pill } from "../../ui";
import { estadoStock } from "../../lib/stock";
import { INV_KANBAN_COLS, kanbanStockKey } from "../../lib/inventarioKanban";

function KanbanCard({ item, selected, onSelect }) {
  const st = estadoStock(item.total, item.stock_min, item.stock_max);
  const abcTone = { A: "red", B: "yellow", C: "green" }[item.abc];
  const critico = kanbanStockKey(item) === "bajo";
  return (
    <button
      type="button"
      data-testid={`inv-kanban-${item.codigo}`}
      onClick={() => onSelect(item.id)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 11px",
        marginBottom: 8,
        borderRadius: 9,
        border: `1px solid ${selected ? tint(C.sky, 40) : critico ? tint(C.red, 35) : C.line}`,
        background: selected ? tint(C.sky, 8) : critico ? tint(C.red, 6) : C.surface,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: selected ? `0 0 0 1px ${tint(C.sky, 20)}` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 12, color: C.steel }}>{item.codigo}</span>
        {critico && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0 }} />}
        <span style={{ marginLeft: "auto" }}><Pill tone={abcTone}>{item.abc}</Pill></span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.descripcion || "—"}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.categoria || "Sin categoría"}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <Pill tone={st.tone}>{st.label}</Pill>
        <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, fontWeight: 700 }}>
          {item.total} {item.unidad}
        </span>
        {item.valor > 0 && (
          <span style={{ fontSize: 10.5, color: C.gold, marginLeft: "auto", fontWeight: 700 }}>{clp(item.valor)}</span>
        )}
      </div>
    </button>
  );
}

export default function InventarioKanban({ lista, selectedId, onSelect }) {
  const toneMap = { red: C.red, yellow: C.amber, green: C.green, slate: C.slate };

  return (
    <div
      data-testid="inv-kanban"
      className="inv-kanban-board"
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "16px 16px 20px",
        alignItems: "flex-start",
        minHeight: 420,
      }}
    >
      {INV_KANBAN_COLS.map((col) => {
        const items = lista.filter((i) => kanbanStockKey(i) === col.value);
        const headerColor = toneMap[col.tone] || C.steel;
        return (
          <div
            key={col.value}
            style={{
              flex: "0 0 272px",
              minWidth: 272,
              maxHeight: "calc(100vh - 340px)",
              display: "flex",
              flexDirection: "column",
              background: tint(headerColor, 4),
              border: `1px solid ${tint(headerColor, 22)}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${tint(headerColor, 18)}`,
              background: tint(headerColor, 8),
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: headerColor, letterSpacing: 0.3 }}>{col.label}</div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{items.length} ítem{items.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", padding: "8px 4px" }}>Vacío</div>
              ) : (
                items.map((i) => (
                  <KanbanCard key={i.id} item={i} selected={selectedId === i.id} onSelect={onSelect} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
