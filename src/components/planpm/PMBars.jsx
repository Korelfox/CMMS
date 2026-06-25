import React from "react";
import { C, num, tint } from "../../theme";
import { statusPlan, statusPlanCalendario, DIAS_POR_UNIDAD } from "../../lib/pm";

export function PMBar({ elapsed, intervalo }) {
  const pct = Math.min(100, intervalo > 0 ? (elapsed / intervalo) * 100 : 0);
  const [tone] = statusPlan(elapsed, intervalo);
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div title="90% del intervalo" style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.35, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
        {num(elapsed, 0)}h / {intervalo}h
      </span>
    </div>
  );
}

export function PMBarCalendario({ diasElapsed, unidad, intervalo = 1 }) {
  const total = (DIAS_POR_UNIDAD[unidad] || 1) * (intervalo || 1);
  if (!Number.isFinite(diasElapsed)) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4 }} />
        <span style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
          — / {total}d
        </span>
      </div>
    );
  }
  const pct = Math.min(100, total > 0 ? (diasElapsed / total) * 100 : 0);
  const [tone] = statusPlanCalendario(diasElapsed, unidad, intervalo);
  const color = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div title="90% del intervalo" style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.35, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
        {diasElapsed}d / {total}d
      </span>
    </div>
  );
}
