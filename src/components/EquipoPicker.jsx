import React, { useState, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";
import { C, tint } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { inputStyle } from "../ui";

// Selector de equipo tipo combobox para ingreso rápido de OT:
// se escribe y filtra por código (id_visible), sistema o ruta jerárquica;
// se navega con ↑/↓ y se elige con Enter. Es opcional (permite "Ninguno").
export default function EquipoPicker({ equipos = [], value, onChange, disabled, placeholder = "Buscar equipo, código o sistema…", testId }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const blurT = useRef(null);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const tree = useMemo(() => buildEquipoTree(equipos), [equipos]);
  const pathOf = (eq) => {
    const parts = []; let cur = eq, g = 0;
    while (cur && g++ < 12) { parts.unshift(cur.sistema); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
    return parts.join(" › ");
  };
  const seleccionado = value ? byId.get(value) : null;

  const ql = q.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!ql) return tree.slice(0, 100);
    return tree.filter((e) =>
      (e.id_visible || "").toLowerCase().includes(ql) ||
      (e.sistema || "").toLowerCase().includes(ql) ||
      pathOf(e).toLowerCase().includes(ql)
    ).slice(0, 50);
  }, [ql, tree]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrir() { if (!disabled) { setOpen(true); setHi(0); } }
  function elegir(eq) { onChange(eq); setQ(""); setOpen(false); }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtrados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtrados[hi]) elegir(filtrados[hi]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  // Vista compacta del seleccionado (se puede limpiar o reabrir).
  if (seleccionado && !open) {
    return (
      <div data-testid={testId} onClick={abrir}
        style={{ ...inputStyle(), display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "default" : "pointer", overflow: "hidden" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel, flexShrink: 0 }}>{seleccionado.id_visible}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seleccionado.sistema}</span>
        {!disabled && (
          <button onClick={(e) => { e.stopPropagation(); onChange(null); }} title="Quitar equipo"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0, display: "flex", flexShrink: 0 }}>
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <Search size={14} color={C.slate} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input
        data-testid={testId}
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={abrir}
        onKeyDown={onKey}
        onBlur={() => { blurT.current = setTimeout(() => setOpen(false), 150); }}
        style={{ ...inputStyle(), paddingLeft: 30, width: "100%" }}
      />
      {open && !disabled && (
        <div onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 4, maxHeight: 300, overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 10px 28px rgba(8,20,32,.18)" }}>
          <div onClick={() => elegir(null)}
            style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5, color: C.slate, borderBottom: `1px solid ${C.foam}` }}>
            — Ninguno —
          </div>
          {filtrados.length === 0 ? (
            <div style={{ padding: "10px", fontSize: 12.5, color: C.slate, fontStyle: "italic" }}>Sin coincidencias</div>
          ) : filtrados.map((eq, i) => (
            <div key={eq.id} onClick={() => elegir(eq)} onMouseEnter={() => setHi(i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", paddingLeft: 10 + eq.depth * 14, cursor: "pointer", background: i === hi ? tint(C.steel, 12) : "transparent", borderBottom: `1px solid ${C.foam}` }}>
              {eq.depth > 0 && <span style={{ color: C.slate, fontSize: 12, flexShrink: 0 }}>└─</span>}
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel, flexShrink: 0 }}>{eq.id_visible}</span>
              <span style={{ fontSize: 12.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eq.sistema}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
