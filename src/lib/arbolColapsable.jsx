// ============================================================
//  Agrupación colapsable de equipos por sistema raíz
//  Mismo comportamiento que el árbol de Plan Preventivo:
//  - se contraen los sistemas raíz por defecto
//  - cada sistema raíz con subsistemas tiene chevron ▸/▾
//  - los hijos se indentan y muestran "└─"
//  Reutilizado por Criticidad, CGM y Optimización (Weibull).
// ============================================================
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C } from "../theme";
import { Pill } from "../ui";

// Hook: recibe la lista ya en orden de árbol (buildEquipoTree) y maneja el colapso.
export function useArbolColapsable(treeList) {
  const [colapsados, setColapsados] = useState(() => new Set());
  const [initColapso, setInitColapso] = useState(false);

  // Sistemas raíz que tienen subsistemas (para mostrar chevron).
  const conHijos = new Set();
  treeList.forEach((eq) => { if (eq.depth > 0 && eq.rootId) conHijos.add(eq.rootId); });

  // Contraer todos los sistemas por defecto (una sola vez).
  useEffect(() => {
    if (!initColapso && conHijos.size > 0) {
      setColapsados(new Set([...conHijos]));
      setInitColapso(true);
    }
  }, [treeList]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible        = (eq) => eq.depth === 0 || !colapsados.has(eq.rootId);
  const esRaizConHijos = (eq) => eq.depth === 0 && conHijos.has(eq.id);
  const estaColapsado  = (eq) => colapsados.has(eq.id);
  const nSubDe         = (eq) => treeList.filter((x) => x.rootId === eq.id && x.depth > 0).length;
  const toggle = (rootId) => setColapsados((prev) => {
    const n = new Set(prev);
    n.has(rootId) ? n.delete(rootId) : n.add(rootId);
    return n;
  });
  const colapsarTodo = (v) => setColapsados(v ? new Set([...conHijos]) : new Set());

  return { conHijos, colapsados, visible, esRaizConHijos, estaColapsado, nSubDe, toggle, colapsarTodo };
}

// Botones "Colapsar / Expandir todo" (solo si hay sistemas con subsistemas).
export function BotonesColapsar({ conHijos, colapsarTodo }) {
  if (conHijos.size === 0) return null;
  const btn = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, cursor: "pointer", fontWeight: 600 };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button onClick={() => colapsarTodo(true)} style={btn}><ChevronRight size={13} /> Colapsar todo</button>
      <button onClick={() => colapsarTodo(false)} style={btn}><ChevronDown size={13} /> Expandir todo</button>
    </div>
  );
}

// Etiqueta de un nodo: chevron de colapso (si es raíz con hijos), indentación,
// nombre, criticidad, código y nave. Sirve en celdas de tabla y en cards.
// `onToggle` hace stopPropagation para no disparar otros clicks de la fila.
export function EquipoNodoLabel({ eq, esRaiz, colapsado, onToggle, nSub = 0, embName, showEmb = true }) {
  const critTone = { A: "red", B: "yellow", C: "green" }[eq.criticidad];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: eq.depth * 16, minWidth: 0 }}>
      {esRaiz ? (
        <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} title={colapsado ? "Expandir subsistemas" : "Colapsar"}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", alignItems: "center", flexShrink: 0 }}>
          {colapsado ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
        </button>
      ) : eq.depth > 0 ? (
        <span style={{ color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
      ) : <span style={{ width: 17, flexShrink: 0 }} />}
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: C.abyss, fontSize: 13.5 }}>{eq.sistema}</span>
        {eq.criticidad && <span style={{ marginLeft: 7 }}><Pill tone={critTone}>{eq.criticidad}</Pill></span>}
        <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
        {showEmb && <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 6 }}>· {embName(eq.embarcacion_id)}</span>}
        {colapsado && nSub > 0 && <span style={{ fontSize: 11.5, color: C.steel, marginLeft: 8, fontWeight: 600 }}>▸ {nSub} subsistema{nSub > 1 ? "s" : ""}</span>}
      </div>
    </div>
  );
}
