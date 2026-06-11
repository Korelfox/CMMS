import React from "react";
import { C, archivo, tint } from "../../theme";
import { Card, inputStyle, bluInput } from "../../ui";

export function StepperRef({ label, unidad, icon, ini, value, onChange, step }) {
  return (
    <div>
      <Stepper label={label} unidad={unidad} icon={icon} value={value} onChange={onChange} step={step} />
      {ini !== undefined && ini !== null && <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4, paddingLeft: 4 }}>Al zarpar: {ini} {unidad}</div>}
    </div>
  );
}

// ---------- Pantalla: retorno por falla ----------

export function Bloque({ titulo, icon: Icon, extra, children }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon size={17} color={C.steel} />
          <span style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>{titulo}</span>
        </div>
        {extra}
      </div>
      {children}
    </Card>
  );
}

export function Semaforo({ activo, tone, onClick, children }) {
  const col = tone === "green" ? C.green : C.red;
  const bg = tone === "green" ? C.greenBg : C.redBg;
  return (
    <button onClick={onClick} style={{ width: 40, height: 36, borderRadius: 9, border: `1.5px solid ${activo ? col : C.line}`, background: activo ? col : bg, color: activo ? "#fff" : col, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

export function NivelItem({ label, estado, onSet }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.slate, minWidth: 96 }}>{label}</span>
      <button onClick={() => onSet("ok")} style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "ok" ? C.green : C.line}`, background: estado === "ok" ? C.green : C.greenBg, color: estado === "ok" ? "#fff" : C.green, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Normal</button>
      <button onClick={() => onSet("bajo")} style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "bajo" ? C.amber : C.line}`, background: estado === "bajo" ? C.amber : C.yellowBg, color: estado === "bajo" ? "#fff" : "#7a5b00", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Bajo</button>
    </div>
  );
}

export function Stepper({ label, unidad, icon: Icon, value, onChange, step = 1 }) {
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Icon size={15} color={C.steel} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => onChange(Math.max(0, value - step))} style={stepBtn}>−</button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, background: tint(C.sky, 9), border: "1px solid #CFE3F2", borderRadius: 8, padding: "4px 8px" }}>
          <input type="number" value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: C.steel, outline: "none" }} />
          <span style={{ fontSize: 11, color: C.slate }}>{unidad}</span>
        </div>
        <button onClick={() => onChange(value + step)} style={stepBtn}>+</button>
      </div>
    </div>
  );
}

const stepBtn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.mist, color: C.steel, fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1 };
