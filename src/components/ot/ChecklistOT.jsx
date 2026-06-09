import React, { useState } from "react";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { C, tint } from "../../theme";
import { inputStyle } from "../../ui";

// Checklist de tareas DENTRO de la OT: el ejecutor marca paso a paso lo
// realizado (con su nombre y fecha por ítem). Hace la OT ejecutable en
// terreno en vez de solo descriptiva.
export default function ChecklistOT({ ot, puedeOperar, usuario, onSave }) {
  const [nuevo, setNuevo] = useState("");
  const items = Array.isArray(ot.checklist) ? ot.checklist : [];
  const hechos = items.filter((i) => i.ok).length;

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
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <ListChecks size={14} color={C.steel} />
        <span style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Checklist de {ot.folio}
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: hechos === items.length ? C.green : C.steel }}>
            {hechos}/{items.length}
          </span>
        )}
        {items.length > 0 && (
          <div style={{ flex: 1, maxWidth: 180, height: 5, background: tint(C.steel, 12), borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${items.length ? (hechos / items.length) * 100 : 0}%`, height: "100%", background: hechos === items.length ? C.green : C.steel, transition: "width .2s" }} />
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic", marginBottom: 8 }}>
          Sin tareas aún. Agrega los pasos del trabajo (ej: "Drenar aceite", "Cambiar filtro", "Probar en marcha").
        </div>
      )}

      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${C.foam}` }}>
          <input type="checkbox" checked={!!it.ok} disabled={!puedeOperar}
            onChange={() => toggle(i)} style={{ width: 15, height: 15, accentColor: C.green, cursor: puedeOperar ? "pointer" : "default", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, color: it.ok ? C.slate : C.ink, textDecoration: it.ok ? "line-through" : "none" }}>{it.t}</span>
          {it.ok && it.por && (
            <span style={{ fontSize: 10.5, color: C.green, fontWeight: 600, whiteSpace: "nowrap" }}>
              ✓ {it.por}{it.fecha ? ` · ${new Date(it.fecha).toLocaleDateString("es-CL")}` : ""}
            </span>
          )}
          {puedeOperar && (
            <button onClick={() => quitar(i)} title="Quitar tarea" style={{ background: "none", border: "none", cursor: "pointer", color: C.line, padding: 2, display: "flex" }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}

      {puedeOperar && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={nuevo} placeholder="Nueva tarea del checklist…"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            style={{ ...inputStyle(), maxWidth: 380, padding: "6px 10px", fontSize: 12.5 }} />
          <button onClick={agregar} disabled={!nuevo.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.steel}`, background: "none", color: C.steel, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: nuevo.trim() ? 1 : 0.5 }}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      )}
    </div>
  );
}
