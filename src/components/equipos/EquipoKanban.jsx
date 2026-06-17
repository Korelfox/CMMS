import React from "react";
import { AlertTriangle } from "lucide-react";
import { C, num, tint, estadoLabel, estadoTone } from "../../theme";
import { Pill } from "../../ui";
import { TipoChip, CritBadge, RegistroBadge } from "./arbolUI";
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
        <RegistroBadge equipo={equipo} compact />
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
    <div
      data-testid="eq-kanban"
      style={{
        display: "flex", gap: 10, overflowX: "auto", width: "100%",
        padding: "14px 16px 18px", alignItems: "stretch", minHeight: 440,
      }}
    >
      {EQ_KANBAN_COLS.map((col) => {
        const items = lista.filter((x) => kanbanEstadoKey(x.equipo) === col.value);
        const headerColor = toneMap[col.tone] || C.steel;
        const esPrincipal = col.value === "operativo";
        return (
          <div
            key={col.value}
            style={{
              flex: col.flex || "0 0 230px",
              minWidth: col.minWidth || 230,
              maxHeight: "calc(100vh - 320px)",
              display: "flex",
              flexDirection: "column",
              background: tint(headerColor, esPrincipal ? 5 : 4),
              border: `1px solid ${tint(headerColor, esPrincipal ? 28 : 22)}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: esPrincipal ? `0 1px 0 ${tint(headerColor, 12)}` : "none",
            }}
          >
            <div style={{
              padding: "11px 13px", borderBottom: `1px solid ${tint(headerColor, 18)}`,
              background: tint(headerColor, esPrincipal ? 10 : 8), flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: headerColor, letterSpacing: 0.2 }}>{col.label}</div>
                <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                  {items.length} equipo{items.length !== 1 ? "s" : ""}
                </div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800, color: headerColor, fontFamily: "'IBM Plex Mono', monospace",
                background: tint(headerColor, 14), borderRadius: 8, padding: "3px 8px", minWidth: 28, textAlign: "center",
              }}>
                {items.length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px 10px" }}>
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
