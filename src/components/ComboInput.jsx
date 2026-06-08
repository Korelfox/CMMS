import React, { useState, useMemo, useRef } from "react";
import { Search } from "lucide-react";
import { C, tint } from "../theme";
import { inputStyle } from "../ui";

// Combobox de texto buscable y "creable": filtra un catálogo de sugerencias
// mientras escribes (↑/↓ + Enter) pero permite cualquier texto propio.
// value/onChange son strings (el valor final es texto libre).
export default function ComboInput({ value, onChange, options = [], placeholder, allowCustom = true, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const blurT = useRef(null);

  const q = (value || "").trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [q, options]);
  const exact = options.some((o) => o.toLowerCase() === q);
  const lista = (allowCustom && q && !exact)
    ? [{ custom: true, label: value }, ...filtered.map((o) => ({ label: o }))]
    : filtered.map((o) => ({ label: o }));

  const pick = (item) => { onChange(item.label); setOpen(false); };
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, lista.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { if (open && lista[hi]) { e.preventDefault(); pick(lista[hi]); } }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div style={{ position: "relative" }}>
      <Search size={14} color={C.slate} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input
        value={value || ""}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        onBlur={() => { blurT.current = setTimeout(() => setOpen(false), 150); }}
        style={{ ...inputStyle(), paddingLeft: 30, width: "100%" }}
      />
      {open && lista.length > 0 && (
        <div onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 4, maxHeight: 280, overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 10px 28px rgba(8,20,32,.18)" }}>
          {lista.map((item, i) => (
            <div key={i} onClick={() => pick(item)} onMouseEnter={() => setHi(i)}
              style={{ padding: "7px 11px", cursor: "pointer", fontSize: 12.5, color: item.custom ? C.cyan : C.ink, background: i === hi ? tint(C.steel, 12) : "transparent", borderBottom: `1px solid ${C.foam}` }}>
              {item.custom ? <>Usar: “{item.label}”</> : item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
