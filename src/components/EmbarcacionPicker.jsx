import React from "react";
import { Sailboat, ChevronDown } from "lucide-react";
import { C, tint } from "../theme";
import { Card } from "../ui";

export default function EmbarcacionPicker({ embarcaciones, onSelect, empresaNombre }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="emb-picker-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(8,20,32,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Card style={{ width: "100%", maxWidth: 420, padding: "24px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(C.steel, 12), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sailboat size={22} color={C.steel} />
          </div>
          <div>
            <div id="emb-picker-title" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
              Selecciona embarcación
            </div>
            <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
              Obligatorio para filtrar OTs, alertas e inventario{empresaNombre ? ` · ${empresaNombre}` : ""}.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {embarcaciones.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                background: C.surface,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{e.codigo}</div>
                <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{e.nombre || "—"}</div>
              </div>
              <ChevronDown size={16} color={C.slate} style={{ transform: "rotate(-90deg)" }} />
            </button>
          ))}
        </div>
        {embarcaciones.length === 0 && (
          <p style={{ fontSize: 13, color: C.slate, margin: "16px 0 0", lineHeight: 1.5 }}>
            No hay embarcaciones registradas. Contacta al administrador de la flota.
          </p>
        )}
      </Card>
    </div>
  );
}
