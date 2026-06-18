import React, { useState } from "react";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { C, tint } from "../theme";
import { FilterBtn, ghostBtn } from "../ui";

/** Barra compacta de vistas guardadas + presets (Fase 4). */
export default function SavedViewsBar({
  views = [],
  activeViewId = null,
  onApply,
  onSave,
  onDelete,
  saveLabel = "Guardar vista actual",
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");

  function submitSave() {
    const name = draft.trim();
    if (!name) return;
    onSave?.(name);
    setDraft("");
    setSaving(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        width: "100%",
        marginBottom: 10,
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${C.line}`,
        background: tint(C.steel, 4),
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginRight: 4 }}>
        <Bookmark size={13} /> Vistas
      </span>
      {views.map((v) => {
        const active = activeViewId === v.id;
        return (
          <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <FilterBtn active={active} onClick={() => onApply?.(v)}>
              {v.name}
            </FilterBtn>
            {!v.builtin && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(v.id)}
                title={`Eliminar "${v.name}"`}
                aria-label={`Eliminar vista ${v.name}`}
                style={{ ...ghostBtn, padding: "4px 6px", color: C.slate, opacity: 0.7 }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </span>
        );
      })}
      {!saving ? (
        <button type="button" onClick={() => setSaving(true)} style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12, marginLeft: "auto" }}>
          <BookmarkPlus size={14} /> {saveLabel}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitSave(); if (e.key === "Escape") { setSaving(false); setDraft(""); } }}
            placeholder="Nombre de la vista…"
            autoFocus
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              fontSize: 12.5,
              fontFamily: "inherit",
              minWidth: 160,
            }}
          />
          <button type="button" onClick={submitSave} style={{ ...ghostBtn, padding: "5px 10px", fontWeight: 700, color: C.sky }}>Guardar</button>
          <button type="button" onClick={() => { setSaving(false); setDraft(""); }} style={{ ...ghostBtn, padding: "5px 10px" }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
