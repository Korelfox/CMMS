import React from "react";
import { C, tint } from "../../theme";

/** Barra de progreso compacta (checklist, pasos wizard). */
export default function ProgressStrip({ current = 0, total = 0, label }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate, marginBottom: 6 }}>
          <span>{label}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{current}/{total}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        style={{
          height: 6,
          borderRadius: 999,
          background: tint(C.line, 50),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: pct >= 100 ? C.green : C.sky,
            transition: "width .25s ease",
          }}
        />
      </div>
    </div>
  );
}
