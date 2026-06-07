// ============================================================
//  Agrupación colapsable de equipos — colapso POR NODO a cualquier
//  nivel (mismo comportamiento que Registro de Equipos):
//  - todo nodo con hijos (sistema, subsistema, componente…) es colapsable
//  - colapsados por defecto: se ve el nivel raíz y se abre nivel a nivel
//  - un nodo se oculta si cualquier ancestro está colapsado
//  - indentación por profundidad y "└─" en los nodos hoja
//  Reutilizado por Plan Preventivo, Criticidad, CGM y Optimización.
// ============================================================
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C } from "../theme";
import { Pill } from "../ui";

// Hook: recibe la lista ya en orden de árbol (buildEquipoTree) y maneja el colapso.
export function useArbolColapsable(treeList) {
  const [colapsados, setColapsados] = useState(() => new Set());
  const [initColapso, setInitColapso] = useState(false);

  // Nodos con al menos un hijo (a cualquier nivel) — muestran chevron.
  const conHijos = new Set();
  treeList.forEach((e) => { if (e.parent_id) conHijos.add(e.parent_id); });

  // Total de descendientes por nodo (para el badge "▸ N" al colapsar).
  const descCount = new Map();
  {
    const pila = [];
    for (const e of treeList) {
      while (pila.length && pila[pila.length - 1].depth >= e.depth) pila.pop();
      pila.forEach((a) => descCount.set(a.id, (descCount.get(a.id) || 0) + 1));
      pila.push(e);
    }
  }

  // Contraer TODOS los nodos con hijos por defecto (una sola vez).
  useEffect(() => {
    if (!initColapso && conHijos.size > 0) {
      setColapsados(new Set([...conHijos]));
      setInitColapso(true);
    }
  }, [treeList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Visibilidad: un nodo se oculta si cualquier ancestro está colapsado.
  // Pre-orden (padre antes que hijos) llevando la profundidad del colapso activo.
  const visibles = new Set();
  {
    let colapsadoEnDepth = null;
    for (const e of treeList) {
      if (colapsadoEnDepth !== null && e.depth > colapsadoEnDepth) continue;
      colapsadoEnDepth = null;
      visibles.add(e.id);
      if (colapsados.has(e.id)) colapsadoEnDepth = e.depth;
    }
  }

  const visible       = (eq) => visibles.has(eq.id);
  const tieneHijos    = (eq) => conHijos.has(eq.id);
  const estaColapsado = (eq) => colapsados.has(eq.id);
  const nSubDe        = (eq) => descCount.get(eq.id) || 0;
  const toggle = (nodeId) => setColapsados((prev) => {
    const n = new Set(prev);
    n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId);
    return n;
  });
  const colapsarTodo = (v) => setColapsados(v ? new Set([...conHijos]) : new Set());

  // `esRaizConHijos` se mantiene como alias de `tieneHijos` por compatibilidad.
  return { conHijos, colapsados, visible, tieneHijos, esRaizConHijos: tieneHijos, estaColapsado, nSubDe, toggle, colapsarTodo };
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

// Etiqueta de un nodo: chevron de colapso (si tiene hijos, a cualquier nivel),
// indentación por profundidad, nombre, criticidad, código y nave. Sirve en
// celdas de tabla y en cards. `onToggle` hace stopPropagation para no disparar
// otros clicks de la fila.
export function EquipoNodoLabel({ eq, tieneHijos, colapsado, onToggle, nSub = 0, embName, showEmb = true }) {
  const critTone = { A: "red", B: "yellow", C: "green" }[eq.criticidad];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: eq.depth * 16, minWidth: 0 }}>
      {tieneHijos ? (
        <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} title={colapsado ? "Expandir" : "Colapsar"}
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
        {colapsado && nSub > 0 && <span style={{ fontSize: 11.5, color: C.steel, marginLeft: 8, fontWeight: 600 }} title={`${nSub} elemento(s) ocultos`}>▸ {nSub}</span>}
      </div>
    </div>
  );
}
