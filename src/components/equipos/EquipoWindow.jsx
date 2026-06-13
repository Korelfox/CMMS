import React from "react";
import {
  Layers, GitBranch, Wrench, Cpu, Box, Plus, ChevronRight,
  FileText, Settings2, Package, AlertCircle,
} from "lucide-react";
import { C, tint, estadoLabel } from "../../theme";
import { Pill } from "../../ui";
import { TIPO_NODO_META, CRITICIDAD_TONE } from "../../lib/plantillaPesquera";
import { useEquiposData } from "./equiposStore";
import RepuestoPanel from "./RepuestoPanel";

const ICONO_TIPO = { sistema: Layers, subsistema: GitBranch, componente: Wrench, instrumento: Cpu, equipo: Box };
const ADD_TIPOS = [
  ["subsistema", "Subsistema", GitBranch],
  ["componente", "Componente", Wrench],
  ["instrumento", "Instrumento", Cpu],
];

function metaDe(node) { return TIPO_NODO_META[node?.tipo_nodo] || TIPO_NODO_META.equipo; }
function ordenarHijos(arr) {
  return [...arr].sort((a, b) => {
    const oa = a.orden == null ? Infinity : Number(a.orden);
    const ob = b.orden == null ? Infinity : Number(b.orden);
    if (oa !== ob) return oa - ob;
    return (a.id_visible || "").localeCompare(b.id_visible || "", "es");
  });
}

// ── Ventana de un nodo: identidad + paneles ricos + estructura (hijos) ──
// handlersRef.current trae los callbacks vivos de Equipos:
//   { agregarHijo, abrirEquipoWindow, abrirFicha, abrirPropOp, abrirRepuestos }
export default function EquipoWindow({ nodeId, handlersRef, puedeOperar }) {
  const { equipos, destinos, embarcaciones } = useEquiposData();
  const node = equipos.find((e) => e.id === nodeId);
  const h = handlersRef.current;

  if (!node) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: C.slate, padding: 40 }}>
        <AlertCircle size={28} color={C.line} />
        <span style={{ fontSize: 13 }}>Este elemento ya no existe.</span>
      </div>
    );
  }

  const meta    = metaDe(node);
  const hijos   = ordenarHijos(equipos.filter((e) => e.parent_id === node.id));
  const nave    = embarcaciones.find((v) => v.id === node.embarcacion_id);
  const nReps   = destinos.filter((d) => d.equipo_id === node.id).length;
  const esComponente = node.tipo_nodo === "componente" || node.tipo_nodo === "instrumento" || node.tipo_nodo === "equipo";

  const datos = [
    nave && ["Nave", nave.nombre || nave.codigo],
    (node.marca || node.modelo) && ["Marca / Modelo", [node.marca, node.modelo].filter(Boolean).join(" ")],
    node.horometro === "propio" && ["Horas", `${Number(node.horas_actual) || 0} h`],
    node.estado && ["Estado", estadoLabel(node.estado)],
  ].filter(Boolean);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Identidad */}
      <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.foam}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: C.steel }}>{node.id_visible}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: meta.color, background: tint(meta.color, 12), borderRadius: 6, padding: "2px 8px" }}>
            {meta.label}
          </span>
          {node.criticidad && <Pill tone={CRITICIDAD_TONE[node.criticidad]}>Crit. {node.criticidad}</Pill>}
        </div>
        {datos.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 10 }}>
            {datos.map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: C.slate }}>
                <span style={{ color: C.slate }}>{k}: </span>
                <span style={{ color: C.ink, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paneles ricos (ventanas apiladas) */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${C.foam}` }}>
        <AccionBtn icon={FileText} label="Ficha técnica" onClick={() => h.abrirFicha(node)} />
        <AccionBtn icon={Settings2} label="Operacional" onClick={() => h.abrirPropOp(node)} />
        {esComponente && (
          <AccionBtn icon={Package} label={`Repuestos${nReps ? ` (${nReps})` : ""}`} onClick={() => h.abrirRepuestos(node)} />
        )}
      </div>

      {/* Estructura: hijos */}
      <div style={{ padding: "14px 20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700 }}>
            Contenido{hijos.length > 0 ? ` · ${hijos.length}` : ""}
          </div>
        </div>

        {/* Agregar dentro */}
        {puedeOperar && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: hijos.length ? 12 : 8 }}>
            {ADD_TIPOS.map(([tipo, label, Ico]) => (
              <button key={tipo} onClick={() => h.agregarHijo(node, tipo)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: `1px solid ${tint(C.cyan, 40)}`, background: tint(C.cyan, 7), color: C.cyan, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                <Plus size={13} /> <Ico size={13} /> {label}
              </button>
            ))}
          </div>
        )}

        {hijos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic", padding: "8px 0" }}>
            {esComponente ? "Componente terminal — sin elementos internos." : "Aún no hay elementos dentro. Agrega uno arriba."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hijos.map((c) => {
              const cm = metaDe(c);
              const Ico = ICONO_TIPO[c.tipo_nodo] || Box;
              const nietos = equipos.filter((e) => e.parent_id === c.id).length;
              return (
                <button key={c.id} onClick={() => h.abrirEquipoWindow(c)}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontFamily: "inherit" }}
                  className="cmms-clickable">
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(cm.color, 12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico size={15} color={cm.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sistema || "—"}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {c.id_visible}{nietos > 0 ? ` · ${nietos} dentro` : ""}
                    </div>
                  </div>
                  {c.criticidad && <Pill tone={CRITICIDAD_TONE[c.criticidad]}>{c.criticidad}</Pill>}
                  <ChevronRight size={16} color={C.slate} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AccionBtn({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, color: C.steel, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
      className="cmms-clickable">
      <Icon size={15} /> {label}
    </button>
  );
}

// ── Cuerpo de la ventana de Repuestos (lee datos vivos del store) ──
// Reutiliza RepuestoPanel; los handlers vienen del ref vivo de Equipos.
export function RepuestosWindowBody({ nodeId, handlersRef, puedeBorrar, onDone }) {
  const { equipos, items, destinos } = useEquiposData();
  const node = equipos.find((e) => e.id === nodeId);
  const h = handlersRef.current;
  if (!node) return null;
  const repuestos = destinos
    .filter((d) => d.equipo_id === node.id)
    .map((d) => ({ destino: d, item: items.find((i) => i.id === d.item_id) }))
    .filter((r) => r.item);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <RepuestoPanel
        node={node}
        repuestos={repuestos}
        items={items}
        destinos={destinos}
        puedeBorrar={puedeBorrar}
        onEnlazar={(itemId) => h.enlazarRepuesto(node.id, itemId)}
        onDesenlazar={h.desenlazarRepuesto}
        onCrear={(datos) => h.crearYEnlazarRepuesto(node.id, datos)}
        onClose={onDone}
      />
    </div>
  );
}
