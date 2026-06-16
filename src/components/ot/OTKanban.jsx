import React from "react";
import { C, lk, tn, tint, ESTADOS_OT, PRIORIDADES, TIPOS_OT } from "../../theme";
import { Pill } from "../../ui";
import { sinValorizar } from "../../lib/ot";

function KanbanCard({ ot, selected, onSelect, embName, embColor }) {
  const prioridadAlta = ot.prioridad === "critica" || ot.prioridad === "alta";
  return (
    <button
      type="button"
      data-testid={`ot-kanban-${ot.folio}`}
      onClick={() => onSelect(ot.id)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 11px",
        marginBottom: 8,
        borderRadius: 9,
        border: `1px solid ${selected ? tint(C.sky, 40) : C.line}`,
        background: selected ? tint(C.sky, 8) : ot._pending ? tint(C.amber, 8) : C.surface,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: selected ? `0 0 0 1px ${tint(C.sky, 20)}` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 12, color: C.steel }}>{ot.folio}</span>
        {prioridadAlta && ot.estado !== "cerrada" && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
        )}
        {sinValorizar(ot) && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#7a5b00", marginLeft: "auto" }}>$</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ot.sistema || "—"}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ot.descripcion || "—"}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <Pill tone={tn(PRIORIDADES, ot.prioridad)}>{lk(PRIORIDADES, ot.prioridad)}</Pill>
        <Pill tone={tn(TIPOS_OT, ot.tipo)}>{lk(TIPOS_OT, ot.tipo)}</Pill>
        {embColor && (
          <span style={{ fontSize: 10.5, color: C.slate, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: embColor }} />
            {embName?.(ot.embarcacion_id)}
          </span>
        )}
      </div>
    </button>
  );
}

export default function OTKanban({ lista, selectedId, onSelect, embName, embarcaciones }) {
  const embColor = (id) => embarcaciones?.find((e) => e.id === id)?.color;

  return (
    <div
      data-testid="ot-kanban"
      className="ot-kanban-board"
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "16px 16px 20px",
        alignItems: "flex-start",
        minHeight: 420,
      }}
    >
      {ESTADOS_OT.map((col) => {
        const items = lista.filter((o) => o.estado === col.value);
        const toneMap = { green: C.green, yellow: C.amber, slate: C.slate, steel: C.steel, purple: C.purple, red: C.red };
        const headerColor = toneMap[tn(ESTADOS_OT, col.value)] || C.steel;
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
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{items.length} orden{items.length !== 1 ? "es" : ""}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", padding: "8px 4px" }}>Vacío</div>
              ) : (
                items.map((o) => (
                  <KanbanCard
                    key={o.id}
                    ot={o}
                    selected={selectedId === o.id}
                    onSelect={onSelect}
                    embName={embName}
                    embColor={embColor(o.embarcacion_id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
