import React from "react";
import { Search, X, ChevronDown, ChevronRight, ChevronUp, PlusCircle, MinusCircle, MoreHorizontal, PanelRightOpen, Trash2, AlertTriangle } from "lucide-react";
import { C, estadoLabel, estadoTone, num } from "../../theme";
import { BRECHA_META } from "../../lib/equipoBrechas";
import { Card, Pill, ghostBtn, inputStyle } from "../../ui";
import { TipoChip, CritBadge, RegistroBadge } from "./arbolUI";

export default function EquipoTreePanel({
  busqueda, setBusqueda, arbol, listaVisible, selectedId, onSelect,
  showEmb, embName, repsPorEquipo, eqDirty, esAgrupador,
  onColapsarTodo, onExpandirTodo, onPopOut, onEliminar, puedeBorrar,
  puedeOperar = false, posInfo, onMoverNodo,
  brechaPorEquipo,
}) {
  const [menuId, setMenuId] = React.useState(null);

  return (
    <Card style={{ padding: 16, height: "calc(100vh - 280px)", minHeight: 420, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo, ID…"
            style={{ ...inputStyle(), padding: "8px 12px 8px 34px", fontSize: 13, width: "100%" }}
          />
        </div>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} style={{ ...ghostBtn, padding: "8px 10px" }} aria-label="Limpiar búsqueda">
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button type="button" onClick={onColapsarTodo} style={{ ...ghostBtn, fontSize: 11.5, padding: "5px 10px", flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <ChevronRight size={13} /> Colapsar
        </button>
        <button type="button" onClick={onExpandirTodo} style={{ ...ghostBtn, fontSize: 11.5, padding: "5px 10px", flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <ChevronDown size={13} /> Expandir
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginRight: -4 }}>
        {listaVisible.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate, padding: "24px 8px", textAlign: "center" }}>
            {busqueda.trim() ? "Sin coincidencias para la búsqueda." : "Sin equipos en este alcance."}
          </div>
        ) : (
          listaVisible.map((eq) => {
            const isSelected = selectedId === eq.id;
            const tieneHijos = arbol.tieneHijos(eq);
            const colapsado = arbol.estaColapsado(eq);
            const nSub = arbol.nSubDe(eq);
            const nReps = repsPorEquipo.get(eq.id) || 0;
            const agrup = esAgrupador(eq);
            const brecha = brechaPorEquipo?.get(eq.id);
            const pos = posInfo?.get(eq.id);
            const puedeReordenar = puedeOperar && pos && (!pos.first || !pos.last);

            return (
              <div
                key={eq.id}
                className={`eq-tree-node${isSelected ? " eq-tree-node-selected" : ""}${brecha ? " eq-tree-node-brecha" : ""}`}
                onClick={() => onSelect(eq.id)}
                style={{ paddingLeft: eq.depth * 16 + 8 }}
              >
                {tieneHijos ? (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); arbol.toggle(eq.id); }}
                    title={colapsado ? "Expandir" : "Colapsar"}
                    aria-label={colapsado ? "Expandir" : "Colapsar"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 3, borderRadius: 6, display: "flex", flexShrink: 0 }}
                  >
                    {colapsado ? <PlusCircle size={22} /> : <MinusCircle size={22} />}
                  </button>
                ) : (
                  <span style={{ width: 28, flexShrink: 0 }} />
                )}

                <TipoChip tipo={eq.tipo_nodo} size={26} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                    <span className="eq-tree-name" style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {eq.sistema || "—"}
                    </span>
                    <CritBadge crit={eq.criticidad} />
                    <RegistroBadge equipo={eq} compact />
                    {brecha && (
                      <span title={BRECHA_META[brecha.tipo]?.label || "Brecha"} style={{ display: "inline-flex", flexShrink: 0 }}>
                        <AlertTriangle size={12} color={brecha.tone === "red" ? C.red : C.amber} />
                      </span>
                    )}
                    {eqDirty?.(eq) && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, flexShrink: 0 }} title="Cambios sin guardar" />}
                  </div>
                  <div style={{ fontSize: 11, color: C.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
                    {showEmb && <span> · {embName(eq.embarcacion_id)}</span>}
                    {colapsado && nSub > 0 && <span style={{ fontWeight: 600, color: C.steel }}> ▸ {nSub}</span>}
                  </div>
                </div>

                {!agrup && eq.estado && eq.estado !== "operativo" && (
                  <Pill tone={estadoTone(eq.estado)}>{estadoLabel(eq.estado)}</Pill>
                )}

                {!agrup && eq.horometro !== "no" && (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: C.steel, flexShrink: 0 }}>
                    {num(eq.horas_actual || 0)}h
                  </span>
                )}

                {nReps > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.cyan, flexShrink: 0 }}>{nReps}↗</span>
                )}

                <span style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); setMenuId(menuId === eq.id ? null : eq.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, display: "flex", borderRadius: 6 }}
                    aria-label="Más acciones"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {menuId === eq.id && (
                    <>
                      <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 41, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)", overflow: "hidden", minWidth: 160 }}>
                        {puedeReordenar && (
                          <>
                            <button type="button" disabled={pos.first} onClick={(ev) => { ev.stopPropagation(); setMenuId(null); onMoverNodo?.(eq, "up"); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: pos.first ? "default" : "pointer", fontSize: 12.5, color: pos.first ? C.slate : C.ink, opacity: pos.first ? 0.45 : 1, fontFamily: "inherit" }}>
                              <ChevronUp size={14} /> Subir orden
                            </button>
                            <button type="button" disabled={pos.last} onClick={(ev) => { ev.stopPropagation(); setMenuId(null); onMoverNodo?.(eq, "down"); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: pos.last ? "default" : "pointer", fontSize: 12.5, color: pos.last ? C.slate : C.ink, opacity: pos.last ? 0.45 : 1, fontFamily: "inherit" }}>
                              <ChevronDown size={14} /> Bajar orden
                            </button>
                          </>
                        )}
                        <button type="button" onClick={(ev) => { ev.stopPropagation(); setMenuId(null); onPopOut?.(eq); }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: C.ink, fontFamily: "inherit" }}>
                          <PanelRightOpen size={14} /> Ventana flotante
                        </button>
                        {puedeBorrar && (
                          <button type="button" onClick={(ev) => { ev.stopPropagation(); setMenuId(null); onEliminar?.(eq.id); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: C.red, fontFamily: "inherit" }}>
                            <Trash2 size={14} /> Eliminar
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
