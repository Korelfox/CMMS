import React, { useState } from "react";
import { Package, Plus, X, Check } from "lucide-react";
import { C, tint } from "../../theme";
import { Pill, inputStyle, primaryBtn, ghostBtn } from "../../ui";
import { TIPO_REPUESTO_META } from "../../lib/plantillaPesquera";

const TIPOS_REPUESTO = [
  { value: "oem",         label: "OEM" },
  { value: "alternativo", label: "Alternativo" },
  { value: "generico",    label: "Genérico" },
];

export default function RepuestoPanel({ node, repuestos, items, puedeBorrar, onEnlazar, onDesenlazar, onCrear, onClose }) {
  const [sel, setSel]     = useState("");
  const [nuevo, setNuevo] = useState({ codigo: "", descripcion: "", tipo: "oem" });
  const [creando, setCreando] = useState(false);

  const yaEnlazados = new Set(repuestos.map((r) => r.item.id));
  const disponibles = items.filter((i) => !yaEnlazados.has(i.id));

  async function crear() {
    if (creando) return;
    setCreando(true);
    await onCrear(nuevo);
    setNuevo({ codigo: "", descripcion: "", tipo: "oem" });
    setCreando(false);
  }

  return (
    <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Package size={16} color={C.steel} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>
            Repuestos de <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>{node.id_visible}</span> · {node.sistema}
          </span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, display: "flex" }}><X size={16} /></button>
        )}
      </div>

      {/* Lista de repuestos enlazados */}
      {repuestos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>Sin repuestos enlazados todavía.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {repuestos.map(({ destino, item }) => {
            const meta = TIPO_REPUESTO_META[item.tipo_repuesto] || TIPO_REPUESTO_META.oem;
            return (
              <div key={destino.id} style={{ display: "flex", alignItems: "center", gap: 7, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 9px" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: C.steel }}>{item.codigo}</span>
                <span style={{ fontSize: 12, color: C.ink }}>{item.descripcion}</span>
                <Pill tone={meta.tone}>{meta.label}</Pill>
                <button onClick={() => onDesenlazar(destino.id)} title="Quitar del componente"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0, display: "flex" }}>
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Acciones: enlazar existente / crear nuevo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end", borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        {/* Enlazar SKU existente */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>Enlazar repuesto existente</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...inputStyle(260), fontSize: 12.5 }}>
              <option value="">— Selecciona un SKU del inventario —</option>
              {disponibles.map((i) => <option key={i.id} value={i.id}>{i.codigo} · {i.descripcion}</option>)}
            </select>
            <button onClick={() => { if (sel) { onEnlazar(sel); setSel(""); } }} disabled={!sel} style={{ ...ghostBtn, opacity: sel ? 1 : 0.5 }}>Enlazar</button>
          </div>
        </div>

        {/* Crear nuevo SKU y enlazar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>…o crear uno nuevo</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value.toUpperCase() })} placeholder="Código (FLT-ACE-W940)" style={{ ...inputStyle(150), fontFamily: "'IBM Plex Mono', monospace" }} />
            <input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Descripción" style={inputStyle(200)} />
            <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} style={inputStyle(120)}>
              {TIPOS_REPUESTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={crear} disabled={creando || !nuevo.codigo.trim() || !nuevo.descripcion.trim()} style={primaryBtn}>
              <Plus size={14} /> {creando ? "Creando…" : "Crear y enlazar"}
            </button>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.slate }}>
        Los repuestos se guardan en <strong>Inventario</strong> y quedan enlazados a este componente. {puedeBorrar ? "" : "El stock se gestiona en Almacén."}
      </div>
    </div>
  );
}
