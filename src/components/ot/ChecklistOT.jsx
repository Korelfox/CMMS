import React, { useState } from "react";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { C, tint } from "../../theme";
import { inputStyle } from "../../ui";

const textWrap = {
  minWidth: 0,
  flex: 1,
  lineHeight: 1.45,
  overflowWrap: "break-word",
  wordBreak: "normal",
};

// Checklist de tareas DENTRO de la OT: el ejecutor marca paso a paso lo
// realizado (con su nombre y fecha por ítem). Hace la OT ejecutable en
// terreno en vez de solo descriptiva.
export default function ChecklistOT({ ot, puedeOperar, usuario, onSave, campo = false }) {
  const [nuevo, setNuevo] = useState("");
  const items = Array.isArray(ot.checklist) ? ot.checklist : [];
  const hechos = items.filter((i) => i.ok).length;
  const textSize = campo ? 15 : 12.5;

  const persistir = (arr) => onSave(arr);

  function toggle(idx) {
    persistir(items.map((it, i) => i === idx
      ? (it.ok ? { ...it, ok: false, por: null, fecha: null }
               : { ...it, ok: true, por: usuario || "", fecha: new Date().toISOString() })
      : it));
  }
  function agregar() {
    const t = nuevo.trim();
    if (!t) return;
    persistir([...items, { t, ok: false, por: null, fecha: null }]);
    setNuevo("");
  }
  function quitar(idx) { persistir(items.filter((_, i) => i !== idx)); }

  return (
    <div className={campo ? "cmms-checklist-campo" : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: campo ? 12 : 8, flexWrap: "wrap" }}>
        <ListChecks size={campo ? 16 : 14} color={C.steel} />
        <span style={{ fontSize: campo ? 12 : 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Checklist de {ot.folio}
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: hechos === items.length ? C.green : C.steel }}>
            {hechos}/{items.length}
          </span>
        )}
        {items.length > 0 && (
          <div style={{ flex: 1, maxWidth: 180, minWidth: 80, height: 5, background: tint(C.steel, 12), borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${items.length ? (hechos / items.length) * 100 : 0}%`, height: "100%", background: hechos === items.length ? C.green : C.steel, transition: "width .2s" }} />
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ fontSize: campo ? 13 : 12, color: C.slate, fontStyle: "italic", marginBottom: 8, lineHeight: 1.45 }}>
          Sin tareas aún. Agrega los pasos del trabajo (ej: "Drenar aceite", "Cambiar filtro", "Probar en marcha").
        </div>
      )}

      {items.map((it, i) => (
        <div
          key={i}
          className={campo ? "cmms-checklist-row" : undefined}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: campo ? 10 : 8,
            padding: campo ? "12px 10px" : "4px 0",
            marginBottom: campo ? 8 : 0,
            borderRadius: campo ? 10 : 0,
            border: campo ? `1px solid ${C.line}` : "none",
            background: campo ? C.surface : "transparent",
            borderBottom: campo ? undefined : `1px solid ${C.foam}`,
          }}
        >
          <input
            type="checkbox"
            checked={!!it.ok}
            disabled={!puedeOperar}
            onChange={() => toggle(i)}
            style={{
              width: campo ? 20 : 15,
              height: campo ? 20 : 15,
              marginTop: campo ? 2 : 1,
              accentColor: C.green,
              cursor: puedeOperar ? "pointer" : "default",
              flexShrink: 0,
            }}
          />
          <div style={{ ...textWrap, minWidth: 0 }}>
            <span style={{
              ...textWrap,
              display: "block",
              fontSize: textSize,
              color: it.ok ? C.slate : C.ink,
              textDecoration: it.ok ? "line-through" : "none",
            }}>{it.t}</span>
            {it.ok && it.por && (
              <span style={{ display: "block", fontSize: 11, color: C.green, fontWeight: 600, marginTop: 4 }}>
                ✓ {it.por}{it.fecha ? ` · ${new Date(it.fecha).toLocaleDateString("es-CL")}` : ""}
              </span>
            )}
          </div>
          {puedeOperar && (
            <button
              type="button"
              onClick={() => quitar(i)}
              title="Quitar tarea"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.line, padding: 4, display: "flex", flexShrink: 0, marginTop: campo ? 0 : 0 }}
            >
              <Trash2 size={campo ? 16 : 13} />
            </button>
          )}
        </div>
      ))}

      {puedeOperar && (
        <div style={{ display: "flex", flexDirection: campo ? "column" : "row", gap: 8, marginTop: campo ? 14 : 10 }}>
          <input
            value={nuevo}
            placeholder="Nueva tarea del checklist…"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            style={{
              ...inputStyle(),
              width: "100%",
              maxWidth: campo ? "none" : 380,
              padding: campo ? "12px 12px" : "6px 10px",
              fontSize: campo ? 15 : 12.5,
            }}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={!nuevo.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: campo ? "12px 14px" : "6px 12px",
              borderRadius: campo ? 10 : 7,
              border: `1px solid ${C.steel}`,
              background: "none",
              color: C.steel,
              fontSize: campo ? 14 : 12,
              fontWeight: 600,
              cursor: "pointer",
              opacity: nuevo.trim() ? 1 : 0.5,
              flexShrink: 0,
            }}
          >
            <Plus size={campo ? 16 : 13} /> Agregar
          </button>
        </div>
      )}
    </div>
  );
}
