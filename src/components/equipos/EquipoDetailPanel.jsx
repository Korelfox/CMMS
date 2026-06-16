import React, { useState, useEffect, useMemo } from "react";
import {
  GitBranch, Wrench, Cpu, Plus, ChevronRight, ChevronUp, ChevronDown,
  FileText, Settings2, Package, AlertCircle, Clock, Gauge, Layers,
} from "lucide-react";
import { C, tint, estadoLabel, estadoTone, ESTADOS_EQUIPO, num } from "../../theme";
import { Pill, Empty } from "../../ui";
import { TIPO_NODO_META } from "../../lib/plantillaPesquera";
import { TipoChip, CritBadge, TIPO_NODOS, CRITICIDADES } from "./arbolUI";
import { useEquiposData } from "./equiposStore";
import RepuestoPanel from "./RepuestoPanel";
import { FichaBody } from "./FichaEquipo";
import { PropOpBody } from "./PropOpModal";

const TABS = [
  { id: "identidad", label: "Identidad", icon: Layers },
  { id: "operacional", label: "Operacional", icon: Settings2 },
  { id: "ficha", label: "Ficha", icon: FileText },
  { id: "repuestos", label: "Repuestos", icon: Package },
  { id: "estructura", label: "Estructura", icon: GitBranch },
];

const ADD_TIPOS = [
  ["subsistema", "Subsistema", GitBranch],
  ["componente", "Componente", Wrench],
  ["instrumento", "Instrumento", Cpu],
];

function ordenarHijos(arr) {
  return [...arr].sort((a, b) => {
    const oa = a.orden == null ? Infinity : Number(a.orden);
    const ob = b.orden == null ? Infinity : Number(b.orden);
    if (oa !== ob) return oa - ob;
    return (a.id_visible || "").localeCompare(b.id_visible || "", "es");
  });
}

export default function EquipoDetailPanel({
  nodeId,
  handlers,
  puedeOperar,
  puedeBorrar,
  eqDirty,
  posInfo,
  onSelectNode,
  embedded = true,
}) {
  const { equipos, items, destinos, embarcaciones } = useEquiposData();
  const node = equipos.find((e) => e.id === nodeId);
  const [tab, setTab] = useState("identidad");
  const [sysName, setSysName] = useState("");

  const esAgrupador = node?.tipo_nodo === "sistema";
  const esComponente = node && (node.tipo_nodo === "componente" || node.tipo_nodo === "instrumento" || node.tipo_nodo === "equipo");

  const tabsVisibles = useMemo(() => TABS.filter((t) => {
    if (t.id === "operacional" && esAgrupador) return false;
    if (t.id === "ficha" && esAgrupador) return false;
    if (t.id === "repuestos" && !esComponente) return false;
    return true;
  }), [esAgrupador, esComponente]);

  useEffect(() => { if (node) setSysName(node.sistema || ""); }, [node?.id, node?.sistema]);

  useEffect(() => {
    if (!tabsVisibles.some((t) => t.id === tab)) setTab(tabsVisibles[0]?.id || "identidad");
  }, [nodeId, tabsVisibles, tab]);

  if (!nodeId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, color: C.slate, minHeight: 320 }}>
        <Layers size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Selecciona un equipo</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>
          Elige un nodo en el árbol para gestionar identidad, configuración operacional, ficha y repuestos.
        </p>
      </div>
    );
  }

  if (!node) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: C.slate, padding: 40 }}>
        <AlertCircle size={28} color={C.line} />
        <span style={{ fontSize: 13 }}>Este elemento ya no existe.</span>
      </div>
    );
  }

  const h = handlers || {};
  const hijos = ordenarHijos(equipos.filter((e) => e.parent_id === node.id));
  const nReps = destinos.filter((d) => d.equipo_id === node.id).length;
  const pos = posInfo?.get(node.id) || { first: true, last: true };

  const set = (campo, valor) => {
    h.editar?.(node.id, campo, valor);
    if (campo === "embarcacion_id") h.editar?.(node.id, "parent_id", null);
  };

  const descendientes = new Set();
  (function marca(id) { equipos.filter((e) => e.parent_id === id).forEach((e) => { descendientes.add(e.id); marca(e.id); }); })(node.id);
  const padres = equipos.filter((e) => e.embarcacion_id === node.embarcacion_id && e.id !== node.id && !descendientes.has(e.id));

  const repuestos = destinos
    .filter((d) => d.equipo_id === node.id)
    .map((d) => ({ destino: d, item: items.find((i) => i.id === d.item_id) }))
    .filter((r) => r.item);

  const labelStyle = { fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4, display: "block" };
  const fieldInput = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, padding: "8px 10px", fontSize: 13, color: C.ink, outline: "none", fontFamily: "inherit" };

  const horasTile = node.horometro !== "no";
  const tiles = [
    horasTile && { label: node.horometro === "propio" ? "Horómetro propio" : "Horas (heredadas)", value: `${num(node.horas_actual || 0)} h`, icon: Clock },
    { label: "Subequipos", value: hijos.length, icon: GitBranch },
    esComponente && { label: "Repuestos", value: nReps, icon: Package },
    node.mtbf_objetivo != null && { label: "MTBF objetivo", value: `${num(node.mtbf_objetivo)} h`, icon: Gauge },
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: embedded ? "calc(100vh - 280px)" : "100%", minHeight: embedded ? 420 : 0, overflow: "hidden", background: C.surface, borderRadius: embedded ? 12 : 0, border: embedded ? `1px solid ${C.line}` : "none" }}>
      <div style={{ padding: embedded ? "16px 20px 0" : "14px 20px 0", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <TipoChip tipo={node.tipo_nodo} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.sistema || "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.slate }}>{node.id_visible}</span>
              <CritBadge crit={node.criticidad} />
              {!esAgrupador && node.estado && <Pill tone={estadoTone(node.estado)}>{estadoLabel(node.estado)}</Pill>}
              {eqDirty?.(node) && <Pill tone="yellow">Sin guardar</Pill>}
            </div>
            {(node.marca || node.modelo) && (
              <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{[node.marca, node.modelo].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        </div>

        {tab === "identidad" && tiles.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 12 }}>
            {tiles.map((t) => (
              <div key={t.label} style={{ background: C.surface2, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: C.slate, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <t.icon size={12} /> {t.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.abyss, marginTop: 2 }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingBottom: 10 }}>
          {tabsVisibles.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
                  border: `1px solid ${active ? tint(C.sky, 40) : C.line}`,
                  background: active ? tint(C.sky, 10) : C.surface,
                  color: active ? C.sky : C.slate,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Icon size={14} /> {t.label}
                {t.id === "repuestos" && nReps > 0 && <span style={{ fontSize: 10.5, opacity: 0.85 }}>({nReps})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? "16px 20px 20px" : "14px 20px 18px" }}>
        {tab === "identidad" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nombre</label>
              <input value={sysName} disabled={!puedeOperar} onChange={(e) => setSysName(e.target.value)}
                onBlur={() => set("sistema", sysName.trim() || node.sistema)}
                style={fieldInput} />
            </div>
            <div>
              <label style={labelStyle}>ID visible</label>
              <input value={node.id_visible || ""} disabled={!puedeOperar} onChange={(e) => set("id_visible", e.target.value)}
                style={{ ...fieldInput, fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
            <div>
              <label style={labelStyle}>Nave</label>
              <select value={node.embarcacion_id || ""} disabled={!puedeOperar} onChange={(e) => set("embarcacion_id", e.target.value)} style={fieldInput}>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo (nivel ISO)</label>
              <select value={node.tipo_nodo || "equipo"} disabled={!puedeOperar} onChange={(e) => set("tipo_nodo", e.target.value)} style={fieldInput}>
                {TIPO_NODOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Criticidad</label>
              <select value={node.criticidad || ""} disabled={!puedeOperar} onChange={(e) => set("criticidad", e.target.value)} style={fieldInput}>
                {CRITICIDADES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Subsistema de (padre)</label>
              <select value={node.parent_id || ""} disabled={!puedeOperar} onChange={(e) => set("parent_id", e.target.value || null)} style={fieldInput}>
                <option value="">— Raíz (sistema) —</option>
                {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
              </select>
            </div>
            {!esAgrupador && (
              <>
                <div>
                  <label style={labelStyle}>Marca</label>
                  <input value={node.marca || ""} disabled={!puedeOperar} onChange={(e) => set("marca", e.target.value)} style={fieldInput} />
                </div>
                <div>
                  <label style={labelStyle}>Modelo</label>
                  <input value={node.modelo || ""} disabled={!puedeOperar} onChange={(e) => set("modelo", e.target.value)} style={fieldInput} />
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <select value={node.estado || "operativo"} disabled={!puedeOperar} onChange={(e) => set("estado", e.target.value)} style={fieldInput}>
                    {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>MTBF objetivo (h)</label>
                  <input type="number" value={node.mtbf_objetivo ?? ""} disabled={!puedeOperar} placeholder="—"
                    onChange={(e) => set("mtbf_objetivo", e.target.value === "" ? null : +e.target.value)} style={fieldInput} />
                </div>
                <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, cursor: puedeOperar ? "pointer" : "default" }}>
                  <input type="checkbox" checked={!!node.prezarpe} disabled={!puedeOperar} onChange={(e) => set("prezarpe", e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: C.steel }} />
                  Incluir en inspección de prezarpe
                </label>
              </>
            )}
            {puedeOperar && (
              <p style={{ gridColumn: "1 / -1", fontSize: 11.5, color: C.slate, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={13} /> Usa <strong>Guardar cambios</strong> en la barra superior para persistir identidad y estado.
              </p>
            )}
          </div>
        )}

        {tab === "operacional" && !esAgrupador && (
          <PropOpBody node={node} onSave={h.guardarPropOp} onDone={() => {}} />
        )}

        {tab === "ficha" && !esAgrupador && (
          <FichaBody node={node} puedeOperar={puedeOperar} onSave={(ficha) => h.guardarFicha?.(node.id, ficha)} onDone={() => {}} />
        )}

        {tab === "repuestos" && esComponente && (
          <RepuestoPanel
            node={node}
            repuestos={repuestos}
            items={items}
            destinos={destinos}
            puedeBorrar={puedeBorrar}
            onEnlazar={(itemId) => h.enlazarRepuesto?.(node.id, itemId)}
            onDesenlazar={h.desenlazarRepuesto}
            onCrear={(datos) => h.crearYEnlazarRepuesto?.(node.id, datos)}
          />
        )}

        {tab === "estructura" && (
          <>
            {puedeOperar && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: hijos.length ? 14 : 8 }}>
                {ADD_TIPOS.map(([tipo, label, Ico]) => (
                  <button key={tipo} type="button" onClick={() => h.agregarHijo?.(node, tipo)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: `1px solid ${tint(C.cyan, 40)}`, background: tint(C.cyan, 7), color: C.cyan, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    <Plus size={13} /> <Ico size={13} /> {label}
                  </button>
                ))}
              </div>
            )}

            {puedeOperar && hijos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button type="button" disabled={pos.first} onClick={() => h.moverNodo?.(node, "up")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: pos.first ? "default" : "pointer", opacity: pos.first ? 0.4 : 1, fontSize: 12, fontFamily: "inherit" }}>
                  <ChevronUp size={14} /> Subir orden
                </button>
                <button type="button" disabled={pos.last} onClick={() => h.moverNodo?.(node, "down")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: pos.last ? "default" : "pointer", opacity: pos.last ? 0.4 : 1, fontSize: 12, fontFamily: "inherit" }}>
                  <ChevronDown size={14} /> Bajar orden
                </button>
              </div>
            )}

            {hijos.length === 0 ? (
              <Empty>
                {esComponente ? "Componente terminal — sin elementos internos." : "Aún no hay elementos dentro. Agrega uno arriba."}
              </Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hijos.map((c) => {
                  const nietos = equipos.filter((e) => e.parent_id === c.id).length;
                  return (
                    <button key={c.id} type="button" onClick={() => onSelectNode?.(c.id)}
                      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontFamily: "inherit" }}>
                      <TipoChip tipo={c.tipo_nodo} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sistema || "—"}</div>
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
          </>
        )}
      </div>
    </div>
  );
}
