import React, { useState } from "react";
import { GitBranch } from "lucide-react";
import { C } from "../../theme";

const EJEMPLOS_JERARQUIA = [
  {
    sistema: "Propulsión",
    color: "#2563EB",
    hijos: ["Motor Principal", "Reductora / Caja de cambios", "Eje y bocina", "Hélice"],
  },
  {
    sistema: "Generación Eléctrica",
    color: "#D97706",
    hijos: ["Generador Principal", "Generador de Emergencia", "Tablero eléctrico"],
  },
  {
    sistema: "Hidráulico",
    color: "#059669",
    hijos: ["Bomba Hidráulica", "Cilindros (popa / proa)", "Válvulas de control"],
  },
  {
    sistema: "Enfriamiento",
    color: "#0891B2",
    hijos: ["Bomba agua de mar", "Bomba agua dulce", "Intercambiador de calor"],
  },
];

export default function NotaJerarquia({ compacta = false }) {
  const [abierta, setAbierta] = useState(false);

  if (compacta) {
    return (
      <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <button onClick={() => setAbierta((p) => !p)}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: C.steel, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
          <GitBranch size={14} />
          {abierta ? "▲ Ocultar ejemplo de jerarquía" : "▼ Ver ejemplo: cómo estructurar sistemas y subsistemas"}
        </button>
        {abierta && <EjemploArbol />}
      </div>
    );
  }

  // Versión completa para lista vacía
  return (
    <div style={{ textAlign: "left", padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <GitBranch size={20} color={C.cyan} />
        <span style={{ fontWeight: 700, fontSize: 15, color: C.abyss }}>Nueva funcionalidad: Jerarquía de sistemas</span>
      </div>
      <p style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.6 }}>
        Ahora puedes crear <strong>subsistemas</strong> asignando un "Sistema padre" al registrar un equipo.
        Esto te permite organizar la flota como un árbol funcional, igual que IBM Maximo o SAP PM.
      </p>
      <EjemploArbol />
      <div style={{ marginTop: 14, padding: "10px 14px", background: `${C.cyan}12`, borderRadius: 8, fontSize: 12.5, color: C.steel, lineHeight: 1.6 }}>
        <strong>¿Cómo empezar?</strong> Crea primero los sistemas raíz (ej. <em>Propulsión</em>) sin padre.
        Luego crea los subsistemas (ej. <em>Motor Principal</em>) seleccionando el sistema raíz como padre.
        En las Órdenes de Trabajo, Plan PM y Análisis verás los equipos en este orden jerárquico.
      </div>
    </div>
  );
}

function EjemploArbol() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
      {EJEMPLOS_JERARQUIA.map((ej) => (
        <div key={ej.sistema} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: "12px 14px" }}>
          {/* Sistema raíz */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: ej.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: C.abyss }}>{ej.sistema}</span>
            <span style={{ fontSize: 10.5, color: C.slate, background: C.foam, borderRadius: 4, padding: "1px 6px" }}>sistema raíz</span>
          </div>
          {/* Hijos */}
          {ej.hijos.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6, marginBottom: 4 }}>
              <span style={{ color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
              <span style={{ fontSize: 12.5, color: C.slate }}>{h}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Panel inline de repuestos de un componente (enlazar/crear SKU sin ir a Inventario) ──
