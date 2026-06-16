import React from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { C, num, tint } from "../../theme";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";
import { labelIntervaloCalendario } from "../../lib/pm";

export default function PMQueuePanel({
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
          <input data-testid="pm-busqueda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar tarea, equipo…" style={{ ...inputStyle(), padding: "8px 12px 8px 34px", fontSize: 13, width: "100%" }} />
        </div>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} style={{ ...ghostBtn, padding: "8px 10px" }} aria-label="Limpiar"><X size={14} /></button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8, fontWeight: 600 }}>
        {lista.length} tarea{lista.length !== 1 ? "s" : ""} PM en alcance
      </div>
      <div data-testid="pm-queue" style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        {lista.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>Sin coincidencias.</div>
        ) : (
          lista.map(({ plan, equipo, esCalendario, tone, label }) => {
            const isSelected = selectedId === plan.id;
            const intervalo = esCalendario
              ? labelIntervaloCalendario(plan.unidad_calendario, plan.intervalo_calendario ?? 1)
              : `${plan.intervalo_horas}h`;
            return (
              <button key={plan.id} type="button" onClick={() => onSelect(plan.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, borderRadius: 10,
                  border: `1px solid ${isSelected ? tint(C.sky, 35) : C.line}`,
                  background: isSelected ? tint(C.sky, 8) : C.surface, cursor: "pointer", fontFamily: "inherit",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Pill tone={tone}>{label}</Pill>
                  {tone === "red" && <AlertTriangle size={13} color={C.red} />}
                  <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "monospace", color: C.steel }}>{intervalo}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{plan.descripcion}</div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
                  {equipo?.sistema || "—"} · {equipo?.id_visible || "—"}
                  {!esCalendario && equipo && <span style={{ marginLeft: 8, fontFamily: "monospace", fontWeight: 700 }}>{num(equipo.horas_actual || 0, 0)}h</span>}
                  {equipo && <span style={{ marginLeft: 8 }}>{embName?.(equipo.embarcacion_id)}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
