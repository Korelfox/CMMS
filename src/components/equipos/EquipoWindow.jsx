import React, { useState, useEffect } from "react";
import {
  GitBranch, Wrench, Cpu, Plus, ChevronRight,
  FileText, Settings2, Package, AlertCircle, Pencil, Check, Clock, Gauge,
} from "lucide-react";
import { C, tint, estadoLabel, estadoTone, ESTADOS_EQUIPO, num } from "../../theme";
import { Pill } from "../../ui";
import { TIPO_NODO_META, CRITICIDAD_TONE } from "../../lib/plantillaPesquera";
import { TipoChip, CritBadge, TIPO_NODOS, CRITICIDADES } from "./arbolUI";
import { useEquiposData } from "./equiposStore";
import RepuestoPanel from "./RepuestoPanel";

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

// ── Ventana de un nodo: identidad + métricas + edición + estructura (hijos) ──
// handlersRef.current trae los callbacks vivos de Equipos:
//   { agregarHijo, abrirEquipoWindow, abrirFicha, abrirPropOp, abrirRepuestos, editar }
export default function EquipoWindow({ nodeId, handlersRef, puedeOperar, setTitle }) {
  const { equipos, destinos, embarcaciones } = useEquiposData();
  const node = equipos.find((e) => e.id === nodeId);
  const h = handlersRef.current;

  const [editando, setEditando] = useState(false);
  const [sysName, setSysName] = useState(node?.sistema || "");
  useEffect(() => { if (node) setSysName(node.sistema || ""); }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const esAgrupador  = node.tipo_nodo === "sistema";
  const esComponente = node.tipo_nodo === "componente" || node.tipo_nodo === "instrumento" || node.tipo_nodo === "equipo";

  // Edición local (fluye por la barra "Guardar cambios" de Equipos).
  const set = (campo, valor) => {
    h.editar?.(node.id, campo, valor);
    if (campo === "sistema") setTitle?.(valor || node.id_visible);
    if (campo === "embarcacion_id") h.editar?.(node.id, "parent_id", null); // nave nueva → reinicia padre
  };

  // Candidatos a padre: mismo armador-nave, sin ser el propio nodo ni un descendiente.
  const descendientes = new Set();
  (function marca(id) { equipos.filter((e) => e.parent_id === id).forEach((e) => { descendientes.add(e.id); marca(e.id); }); })(node.id);
  const padres = equipos.filter((e) => e.embarcacion_id === node.embarcacion_id && e.id !== node.id && !descendientes.has(e.id));

  const horasTile = node.horometro !== "no";
  const tiles = [
    horasTile && { label: node.horometro === "propio" ? "Horómetro propio" : "Horas (heredadas)", value: `${num(node.horas_actual || 0)} h`, icon: Clock, color: C.steel },
    { label: "Subequipos", value: hijos.length, icon: GitBranch, color: meta.color },
    esComponente && { label: "Repuestos", value: nReps, icon: Package, color: C.cyan },
    node.mtbf_objetivo != null && { label: "MTBF objetivo", value: `${num(node.mtbf_objetivo)} h`, icon: Gauge, color: C.purple },
  ].filter(Boolean);

  const labelStyle = { fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4, display: "block" };
  const fieldInput = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, padding: "8px 10px", fontSize: 13, color: C.ink, outline: "none", fontFamily: "inherit" };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* ── Banda de identidad: tipo + estado + criticidad + editar ── */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.foam}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: meta.color, background: tint(meta.color, 12), borderRadius: 6, padding: "2px 9px" }}>
            {meta.label}
          </span>
          {node.criticidad && <Pill tone={CRITICIDAD_TONE[node.criticidad]}>Crit. {node.criticidad}</Pill>}
          {!esAgrupador && node.estado && <Pill tone={estadoTone(node.estado)}>{estadoLabel(node.estado)}</Pill>}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.slate }}>{node.id_visible}</span>
          <div style={{ flex: 1 }} />
          {puedeOperar && (
            <button onClick={() => setEditando((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 8,
                border: `1px solid ${editando ? C.steel : C.line}`, background: editando ? tint(C.steel, 12) : C.surface,
                color: editando ? C.steel : C.slate, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {editando ? <><Check size={13} /> Listo</> : <><Pencil size={13} /> Editar</>}
            </button>
          )}
        </div>
        {(node.marca || node.modelo) && !editando && (
          <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>
            {[node.marca, node.modelo].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* ── Edición de identidad (panel) ── */}
      {editando ? (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.foam}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Nombre</label>
            <input value={sysName} onChange={(e) => setSysName(e.target.value)}
              onBlur={() => set("sistema", sysName.trim() || node.sistema)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} style={fieldInput} />
          </div>
          <div>
            <label style={labelStyle}>ID visible</label>
            <input value={node.id_visible || ""} onChange={(e) => set("id_visible", e.target.value)}
              style={{ ...fieldInput, fontFamily: "'IBM Plex Mono', monospace" }} />
          </div>
          <div>
            <label style={labelStyle}>Nave</label>
            <select value={node.embarcacion_id || ""} onChange={(e) => set("embarcacion_id", e.target.value)} style={fieldInput}>
              {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo (nivel ISO)</label>
            <select value={node.tipo_nodo || "equipo"} onChange={(e) => set("tipo_nodo", e.target.value)} style={fieldInput}>
              {TIPO_NODOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Criticidad</label>
            <select value={node.criticidad || ""} onChange={(e) => set("criticidad", e.target.value)} style={fieldInput}>
              {CRITICIDADES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Subsistema de (padre)</label>
            <select value={node.parent_id || ""} onChange={(e) => set("parent_id", e.target.value || null)} style={fieldInput}>
              <option value="">— Raíz (sistema) —</option>
              {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
            </select>
          </div>
          {!esAgrupador && (
            <>
              <div>
                <label style={labelStyle}>Marca</label>
                <input value={node.marca || ""} onChange={(e) => set("marca", e.target.value)} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>Modelo</label>
                <input value={node.modelo || ""} onChange={(e) => set("modelo", e.target.value)} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={node.estado || "operativo"} onChange={(e) => set("estado", e.target.value)} style={fieldInput}>
                  {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>MTBF objetivo (h)</label>
                <input type="number" value={node.mtbf_objetivo ?? ""} placeholder="—"
                  onChange={(e) => set("mtbf_objetivo", e.target.value === "" ? null : +e.target.value)} style={fieldInput} />
              </div>
              <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={!!node.prezarpe} onChange={(e) => set("prezarpe", e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.steel, cursor: "pointer" }} />
                Incluir en inspección de prezarpe
              </label>
            </>
          )}
          <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={13} color={C.slate} /> Los cambios se guardan con el botón <strong style={{ color: C.steel }}>Guardar cambios</strong> en Equipos.
          </div>
        </div>
      ) : (
        tiles.length > 0 && (
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.foam}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
            {tiles.map((t) => (
              <div key={t.label} style={{ background: C.surface2, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.slate, fontWeight: 600 }}>
                  <t.icon size={13} color={t.color} /> {t.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{t.value}</div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Acciones (paneles ricos) — no para nodos agrupadores ── */}
      {!esAgrupador && (
        <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${C.foam}` }}>
          <AccionBtn icon={FileText} label="Ficha técnica" onClick={() => h.abrirFicha(node)} />
          <AccionBtn icon={Settings2} label="Operacional" onClick={() => h.abrirPropOp(node)} />
          {esComponente && (
            <AccionBtn icon={Package} label={`Repuestos${nReps ? ` · ${nReps}` : ""}`} onClick={() => h.abrirRepuestos(node)} />
          )}
        </div>
      )}

      {/* ── Estructura: hijos ── */}
      <div style={{ padding: "14px 20px 18px" }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 10 }}>
          Contenido{hijos.length > 0 ? ` · ${hijos.length}` : ""}
        </div>

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
              const nietos = equipos.filter((e) => e.parent_id === c.id).length;
              return (
                <button key={c.id} onClick={() => h.abrirEquipoWindow(c)}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontFamily: "inherit" }}
                  className="cmms-clickable">
                  <TipoChip tipo={c.tipo_nodo} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sistema || "—"}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {c.id_visible}{nietos > 0 ? ` · ${nietos} dentro` : ""}
                    </div>
                  </div>
                  <CritBadge crit={c.criticidad} />
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
