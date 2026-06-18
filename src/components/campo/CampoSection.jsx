import React from "react";
import { C } from "../../theme";

/** Encabezado de sección para vistas Campo (limpio, mobile-first). */
export default function CampoSection({ title, sub, style = {} }) {
  return (
    <div style={{ marginBottom: 10, marginTop: 20, ...style }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.9,
        textTransform: "uppercase",
        color: C.slate,
      }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: 12.5, color: C.steel, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  );
}
