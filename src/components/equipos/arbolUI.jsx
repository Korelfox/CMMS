// ============================================================
//  Primitivos visuales compartidos del árbol de equipos.
//  Lenguaje único para Registro de Equipos y Plan Preventivo:
//  chip de tipo (icono + color por nivel ISO 14224), insignia de
//  criticidad y opciones de tipo/criticidad. Respeta tokens del tema.
// ============================================================
import React from "react";
import { Layers, GitBranch, Wrench, Cpu, Box } from "lucide-react";
import { C, tint } from "../../theme";
import { TIPO_NODO_META } from "../../lib/plantillaPesquera";

export const TIPO_ICON = { sistema: Layers, subsistema: GitBranch, componente: Wrench, instrumento: Cpu, equipo: Box };
export const tipoMeta = (t) => TIPO_NODO_META[t] || TIPO_NODO_META.equipo;

export const CRIT_COLOR = { A: C.red, B: C.amber, C: C.green };

// Opciones de edición (fuente única para el formulario del panel y el alta).
export const TIPO_NODOS = [
  { value: "equipo",      label: "Equipo (genérico)" },
  { value: "sistema",     label: "Sistema (nivel 3)" },
  { value: "subsistema",  label: "Subsistema (nivel 4)" },
  { value: "componente",  label: "Componente (nivel 5)" },
  { value: "instrumento", label: "Instrumento / Sensor (nivel 7)" },
];
export const CRITICIDADES = [
  { value: "",  label: "— Sin clasificar" },
  { value: "A", label: "A · Crítico" },
  { value: "B", label: "B · Importante" },
  { value: "C", label: "C · Menor" },
];

// Chip de tipo: icono en cuadro redondeado, coloreado por tipo de nodo.
export function TipoChip({ tipo, size = 28, title }) {
  const meta = tipoMeta(tipo);
  const Ico  = TIPO_ICON[tipo] || Box;
  return (
    <span title={title ?? meta.label}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: tint(meta.color, 14),
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Ico size={Math.round(size * 0.54)} color={meta.color} />
    </span>
  );
}

// Insignia compacta de criticidad (A / B / C). Vacío si no está clasificada.
export function CritBadge({ crit }) {
  if (!crit) return null;
  const col = CRIT_COLOR[crit] || C.slate;
  return (
    <span title={`Criticidad ${crit}`}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, padding: "1px 7px",
        borderRadius: 999, background: tint(col, 14), color: col, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
      {crit}
    </span>
  );
}
