import React from "react";
import { AlertTriangle } from "lucide-react";
import { C, num, tint } from "../../theme";
import { Pill } from "../../ui";
import { PM_KANBAN_COLS } from "../../lib/planpmKanban";
import { labelIntervaloCalendario } from "../../lib/pm";

function KanbanCard({ item, selected, onSelect, embName }) {
  const { plan, equipo, esCalendario, tone, label } = item;
  const critico = tone === "red";
  const intervalo = esCalendario
    ? labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)
    : `${plan.intervalo_horas}h`;
  return (
    <button
      type="button"
      data-testid={`pm-kanban-${plan.id}`}
      onClick={() => onSelect(plan.id)}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "10px 11px", marginBottom: 8,
        borderRadius: 9, border: `1px solid ${selected ? tint(C.sky, 40) : critico ? tint(C.red, 35) : C.line}`,
        background: selected ? tint(C.sky, 8) : critico ? tint(C.red, 6) : C.surface,
        cursor: "pointer", fontFamily: "inherit",
        boxShadow: selected ? `0 0 0 1px ${tint(C.sky, 20)}` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Pill tone={tone}>{label}</Pill>
        {critico && <AlertTriangle size={12} color={C.red} />}
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontFamily: "monospace", color: C.steel }}>{intervalo}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {plan.descripcion}
      </div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {equipo?.sistema || "—"}
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: "monospace" }}>{equipo?.id_visible || "—"}</span>
        <span>{embName?.(equipo?.embarcacion_id) || ""}</span>
        {!esCalendario && equipo && (
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.ink }}>{num(equipo.horas_actual || 0, 0)}h</span>
        )}
      </div>
    </button>
  );
}

export default function PMKanban({ lista, selectedId, onSelect, embName }) {
  const toneMap = { red: C.red, yellow: C.amber, green: C.green };

  return (
    <div
      data-testid="pm-kanban"
      style={{
        display: "flex", gap: 10, overflowX: "auto", width: "100%",
        padding: "14px 16px 18px", alignItems: "stretch", minHeight: 440,
      }}
    >
      {PM_KANBAN_COLS.map((col) => {
        const items = lista.filter((x) => x.tone === col.value);
        const headerColor = toneMap[col.tone] || C.steel;
        const esPrincipal = col.value === "green";
        return (
          <div
            key={col.value}
            style={{
              flex: col.flex || "0 0 220px",
              minWidth: col.minWidth || 220,
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
                  {items.length} tarea{items.length !== 1 ? "s" : ""}
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
                  <KanbanCard key={item.plan.id} item={item} selected={selectedId === item.plan.id} onSelect={onSelect} embName={embName} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
