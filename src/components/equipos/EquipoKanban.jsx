import React from "react";
import { AlertTriangle } from "lucide-react";
import { C, num, tint, estadoLabel, estadoTone } from "../../theme";
import { Pill } from "../../ui";
import { TipoChip, CritBadge } from "./arbolUI";
import { EQ_KANBAN_COLS, kanbanEstadoKey } from "../../lib/equiposKanban";

function KanbanCard({ item, selected, onSelect, embName }) {
  const { equipo, brecha, nReps } = item;
  const estado = kanbanEstadoKey(equipo);
  const critico = estado === "fuera_servicio" || brecha?.tone === "red";
  return (
    <button
      type="button"
      data-testid={`eq-kanban-${equipo.id_visible}`}
      onClick={() => onSelect(equipo.id)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "10px 11px", marginBottom: 8,
        borderRadius: 9, border: `1px solid ${selected ? tint(C.sky, 40) : critico ? tint(C.red, 35) : C.line}`,
        background: selected ? tint(C.sky, 8) : critico ? tint(C.red, 6) : C.surface,
        cursor: "pointer", fontFamily: "inherit",
        boxShadow: selected ? `0 0 0 1px ${tint(C.sky, 20)}` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <TipoChip tipo={equipo.tipo_nodo} size={22} />
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 11.5, color: C.steel }}>{equipo.id_visible}</span>
        {critico && <AlertTriangle size={12} color={C.red} />}
        <CritBadge crit={equipo.criticidad} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {equipo.sistema}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3 }}>
        {embName?.(equipo.embarcacion_id)}
        {equipo.marca && <span> · {equipo.marca}</span>}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <Pill tone={estadoTone(estado)}>{estadoLabel(estado)}</Pill>
        {nReps > 0 && <span style={{ fontSize: 10.5, color: C.cyan, fontWeight: 700 }}>{nReps} rep.</span>}
        {equipo.horometro !== "no" && (
          <span style={{ fontSize: 11, fontFamily: "monospace", marginLeft: "auto", fontWeight: 700 }}>{num(equipo.horas_actual || 0, 0)} h</span>
        )}
        {brecha && <span style={{ fontSize: 10, color: brecha.tone === "red" ? C.red : C.amber, fontWeight: 700 }}>{brecha.label}</span>}
      </div>
    </button>
  );
}

export default function EquipoKanban({ lista, selectedId, onSelect, embName }) {
  const toneMap = { red: C.red, yellow: C.amber, green: C.green, steel: C.steel };

  return (
    <div data-testid="eq-kanban" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "16px 16px 20px", alignItems: "flex-start", minHeight: 420 }}>
      {EQ_KANBAN_COLS.map((col) => {
        const items = lista.filter((x) => kanbanEstadoKey(x.equipo) === col.value);
        const headerColor = toneMap[col.tone] || C.steel;
        return (
          <div key={col.value} style={{ flex: "0 0 272px", minWidth: 272, maxHeight: "calc(100vh - 340px)", display: "flex", flexDirection: "column", background: tint(headerColor, 4), border: `1px solid ${tint(headerColor, 22)}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${tint(headerColor, 18)}`, background: tint(headerColor, 8), flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: headerColor }}>{col.label}</div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{items.length} equipo{items.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", padding: "8px 4px" }}>Vacío</div>
              ) : (
                items.map((item) => (
                  <KanbanCard key={item.equipo.id} item={item} selected={selectedId === item.equipo.id} onSelect={onSelect} embName={embName} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
