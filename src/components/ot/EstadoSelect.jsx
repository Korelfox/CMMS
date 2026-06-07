import React from "react";
import { ChevronDown } from "lucide-react";
import { C, tint, tn, ESTADOS_OT } from "../../theme";

// Selector de estado de una OT (Solicitada → … → Cerrada). Píldora con el
// color del estado. Sin dependencias de red: testeable de forma aislada.
export default function EstadoSelect({ estado, onChange }) {
  const map = {
    green: [C.green, C.greenBg], yellow: [C.yellow, C.yellowBg], slate: [C.slate, C.foam],
    steel: [C.steel, tint(C.steel, 14)], purple: [C.purple, C.purpleBg], red: [C.red, C.redBg],
  };
  const [fg, bg] = map[tn(ESTADOS_OT, estado)] || map.slate;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={estado}
        onChange={(e) => onChange(e.target.value)}
        title="Cambiar estado de la orden"
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          background: bg, color: fg, border: `1px solid ${fg}40`, borderRadius: 20,
          padding: "4px 26px 4px 11px", fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {ESTADOS_OT.map((s) => (
          <option key={s.value} value={s.value} style={{ background: C.surface, color: C.ink }}>{s.label}</option>
        ))}
      </select>
      <ChevronDown size={13} color={fg} style={{ position: "absolute", right: 8, pointerEvents: "none" }} />
    </div>
  );
}
