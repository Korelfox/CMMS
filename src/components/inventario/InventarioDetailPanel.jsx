import React, { useState, useEffect } from "react";
import {
  Package, Warehouse, MapPin, Trash2, Check, X, Pencil,
} from "lucide-react";
import { C, clp, tint } from "../../theme";
import { Pill, primaryBtn, ghostBtn, inputStyle, bluInput, Empty } from "../../ui";
import { estadoStock } from "../../lib/stock";
import { TIPO_REPUESTO_META } from "../../lib/plantillaPesquera";
import EquipoPicker from "../EquipoPicker";

const TABS = [
  { id: "resumen", label: "Resumen", icon: Package },
  { id: "stock", label: "Stock", icon: Warehouse },
  { id: "destinos", label: "Destinos", icon: MapPin },
];

const TIPOS_REPUESTO = [
  { value: "oem", label: "OEM" },
  { value: "alternativo", label: "Alternativo" },
  { value: "generico", label: "Genérico" },
];

export default function InventarioDetailPanel({
  item,
  puedeOperar,
  puedeBorrar,
  isDirty,
  bodegas,
  stockMap,
  skey,
  destinos,
  equipos,
  categoriasSugeridas,
  codigoEdit,
  onIniciarEditCodigo,
  onConfirmarCodigo,
  onCancelarCodigo,
  onCodigoEditChange,
  onChangeLocal,
  onMarcarDirty,
  onGuardar,
  onCancelar,
  onEliminar,
  onSetCantidad,
  onAgregarDestino,
  onQuitarDestino,
  embColor,
  embName,
  activeTab,
  onTabChange,
}) {
  const [tabInternal, setTabInternal] = useState("resumen");
  const tab = activeTab ?? tabInternal;
  const setTab = onTabChange ?? setTabInternal;

  useEffect(() => {
    if (activeTab == null) setTabInternal("resumen");
  }, [item?.id, activeTab]);

  const panelHeight = "calc(100vh - 320px)";
  const labelStyle = { fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4, display: "block" };

  if (!item) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
        gap: 12, padding: 40, color: C.slate, minHeight: 440, background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`,
      }}>
        <Package size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Selecciona un ítem</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>
          Elige un repuesto en la cola o kanban para ver stock, destinos y editar datos.
        </p>
      </div>
    );
  }

  const st = estadoStock(item.total, item.stock_min, item.stock_max);
  const abcTone = { A: "red", B: "yellow", C: "green" }[item.abc];
  const itemDests = destinos.filter((d) => d.item_id === item.id);
  const editingCodigo = codigoEdit?.id === item.id;

  return (
    <div data-testid="inv-detail" style={{
      display: "flex", flexDirection: "column", height: panelHeight, minHeight: 440, overflow: "hidden",
      background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`,
    }}>
      <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {editingCodigo ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    value={codigoEdit.valor}
                    autoFocus
                    onChange={(e) => onCodigoEditChange(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") onConfirmarCodigo(item.id); if (e.key === "Escape") onCancelarCodigo(); }}
                    style={{ ...inputStyle(120), fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 16, color: C.sky }}
                  />
                  <button type="button" onClick={() => onConfirmarCodigo(item.id)} style={{ background: C.green, border: "none", borderRadius: 6, cursor: "pointer", color: "#fff", padding: "4px 8px" }}>
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={onCancelarCodigo} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", color: C.slate, padding: "4px 8px" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 800, color: C.sky }}>{item.codigo}</span>
                  {puedeOperar && (
                    <button type="button" onClick={() => onIniciarEditCodigo(item.id, item.codigo)} title="Editar código"
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2, opacity: 0.5 }}>
                      <Pencil size={13} />
                    </button>
                  )}
                </>
              )}
              <Pill tone={abcTone}>Clase {item.abc}</Pill>
              <Pill tone={st.tone}>{st.label}</Pill>
              {isDirty && <Pill tone="cyan">Sin guardar</Pill>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.abyss, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.descripcion || "—"}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", fontSize: 12.5, color: C.slate }}>
              <span>Stock: <strong style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{item.total}</strong> {item.unidad}</span>
              <span>Valor: <strong style={{ color: C.gold }}>{clp(item.valor)}</strong></span>
            </div>
          </div>
          {puedeBorrar && (
            <button type="button" onClick={() => onEliminar(item.id)} title="Eliminar ítem"
              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: C.red, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "inherit" }}>
              <Trash2 size={14} /> Eliminar
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingBottom: 10 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
                  border: `1px solid ${active ? C.steel : C.line}`, background: active ? tint(C.steel, 10) : "transparent",
                  color: active ? C.steel : C.slate, fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        {tab === "resumen" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Descripción</label>
              <input value={item.descripcion} disabled={!puedeOperar}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "descripcion", e.target.value); }}
                style={{ ...inputStyle(), width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Categoría</label>
              <input value={item.categoria || ""} list="inv-categorias-detail" disabled={!puedeOperar}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "categoria", e.target.value); }}
                style={{ ...inputStyle(), width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Tipo repuesto</label>
              {puedeOperar ? (
                <select value={item.tipo_repuesto || "oem"}
                  onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "tipo_repuesto", e.target.value); }}
                  style={{ ...inputStyle(), width: "100%" }}>
                  {TIPOS_REPUESTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                  {(TIPO_REPUESTO_META[item.tipo_repuesto] || TIPO_REPUESTO_META.oem).label}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Stock mínimo</label>
              <input type="number" value={item.stock_min} disabled={!puedeOperar}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "stock_min", +e.target.value); }}
                style={{ ...bluInput, width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Stock máximo</label>
              <input type="number" value={item.stock_max} disabled={!puedeOperar}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "stock_max", +e.target.value); }}
                style={{ ...bluInput, width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Precio unitario</label>
              <input type="number" value={item.precio} disabled={!puedeOperar}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "precio", +e.target.value); }}
                style={{ ...bluInput, width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Proveedor</label>
              <input value={item.proveedor || ""} disabled={!puedeOperar}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "proveedor", e.target.value); }}
                style={{ ...inputStyle(), width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>Lead time (días)</label>
              <input type="number" value={item.lead_dias} disabled={!puedeOperar}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { onMarcarDirty(item); onChangeLocal(item.id, "lead_dias", +e.target.value); }}
                style={{ ...bluInput, width: "100%" }} />
            </div>
            {isDirty && puedeOperar && (
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => onGuardar(item.id)} style={primaryBtn}><Check size={14} /> Guardar</button>
                <button type="button" onClick={() => onCancelar(item.id)} style={ghostBtn}>Descartar</button>
              </div>
            )}
          </div>
        )}

        {tab === "stock" && (
          <>
            {bodegas.length === 0 ? (
              <Empty>
                <div style={{ fontSize: 13, color: C.amber, lineHeight: 1.5 }}>
                  No hay bodegas configuradas. Crea bodegas en <strong>Almacén & Compras → Bodegas</strong>.
                </div>
              </Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bodegas.map((b) => {
                  const cant = stockMap.get(skey(item.id, b.id)) || 0;
                  return (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.mist, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.line}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{b.nombre}</div>
                        <div style={{ fontSize: 11, color: b.tipo === "a_bordo" ? C.cyan : C.steel, marginTop: 2 }}>{b.tipo === "a_bordo" ? "A bordo" : "Tierra"}</div>
                      </div>
                      {puedeOperar ? (
                        <input key={`${item.id}-${b.id}-${cant}`} type="number" min="0" defaultValue={cant}
                          onBlur={(e) => onSetCantidad(item.id, b.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                          style={{ ...bluInput, width: 72, textAlign: "right" }} />
                      ) : (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>{cant}</span>
                      )}
                      <span style={{ fontSize: 12, color: C.slate, minWidth: 24 }}>{item.unidad}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "destinos" && (
          <>
            <p style={{ fontSize: 12.5, color: C.slate, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              Equipos a los que está destinado este repuesto.
            </p>
            {puedeOperar && equipos.length > 0 && (
              <div style={{ maxWidth: 440, marginBottom: 12 }}>
                <EquipoPicker equipos={equipos} value={null}
                  placeholder="Buscar equipo para asignar…"
                  onChange={(eq) => { if (eq) onAgregarDestino(item.id, eq.id); }} />
              </div>
            )}
            {itemDests.length === 0 ? (
              <div style={{ fontSize: 13, color: C.slate, fontStyle: "italic" }}>Sin destinos asignados.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {itemDests.map((d) => {
                  const eq = equipos.find((e) => e.id === d.equipo_id);
                  const color = embColor(eq?.embarcacion_id);
                  return (
                    <span key={d.id} style={{
                      display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                      background: tint(color, 12), color, border: `1px solid ${tint(color, 35)}`,
                      borderRadius: 8, padding: "6px 10px", fontWeight: 600,
                    }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{eq?.id_visible || "?"}</span>
                      <span style={{ color: C.ink }}>{embName(eq?.embarcacion_id)} · {eq?.sistema || ""}</span>
                      {puedeOperar && (
                        <button type="button" onClick={() => onQuitarDestino(d.id)} title="Quitar"
                          style={{ background: "none", border: "none", cursor: "pointer", color, padding: 0, display: "flex" }}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {categoriasSugeridas?.length > 0 && (
        <datalist id="inv-categorias-detail">
          {categoriasSugeridas.map((c) => <option key={c} value={c} />)}
        </datalist>
      )}
    </div>
  );
}
