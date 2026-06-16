import React, { useState, useEffect } from "react";
import { Package, Warehouse, ShoppingCart, Check, X, Pencil } from "lucide-react";
import { C, clp, tint } from "../../theme";
import { Pill, primaryBtn, ghostBtn, inputStyle, bluInput } from "../../ui";
import { estadoStock } from "../../lib/stock";
import { skey } from "./util";

function NivelBar({ total, min, max }) {
  const cap = (max > 0 && max > min) ? max : Math.max(min * 2, total * 1.2, 1);
  const pct = Math.min(100, cap > 0 ? (total / cap) * 100 : 0);
  const minPct = Math.min(99, cap > 0 ? (min / cap) * 100 : 0);
  const color = total <= min ? C.red : total <= min * 1.5 ? C.amber : C.green;
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ height: 8, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: color, borderRadius: 4 }} />
        {min > 0 && <div title={`Mínimo: ${min}`} style={{ position: "absolute", top: -3, left: `${minPct}%`, transform: "translateX(-50%)", width: 2, height: 14, background: C.slate, borderRadius: 1, opacity: 0.55 }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, marginTop: 2 }}>
        <span style={{ color, fontWeight: 700 }}>{total}</span>
        <span style={{ color: C.slate, opacity: 0.6 }}>máx {cap}</span>
      </div>
    </div>
  );
}

export default function AlmacenStockDetailPanel({
  item,
  abc,
  total,
  bodegas,
  stockMap,
  minMap,
  puedeOperar,
  stockEdit,
  descEdit,
  onIniciarEditStock,
  onConfirmarStock,
  onCancelarStock,
  onStockEditChange,
  onIniciarEditDesc,
  onConfirmarDesc,
  onCancelarDesc,
  onDescEditChange,
  onSetMinBodega,
  onReponer,
  activeTab,
  onTabChange,
}) {
  const [tabInternal, setTabInternal] = useState("bodegas");
  const tab = activeTab ?? tabInternal;
  const setTab = onTabChange ?? setTabInternal;

  useEffect(() => {
    if (activeTab == null) setTabInternal("bodegas");
  }, [item?.id, activeTab]);

  const panelHeight = "calc(100vh - 320px)";
  const btnConfirm = { background: C.green, border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", padding: "2px 6px", display: "flex", alignItems: "center" };
  const btnCancel = { background: "none", border: `1px solid ${C.line}`, borderRadius: 5, cursor: "pointer", color: C.slate, padding: "2px 6px", display: "flex", alignItems: "center" };
  const btnEdit = { background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2, opacity: 0.45, lineHeight: 1 };

  if (!item) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, color: C.slate, minHeight: 440, background: C.surface, borderRadius: 12, border: `1px solid ${C.line}` }}>
        <Package size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Selecciona un ítem</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>Gestiona stock por bodega, mínimos críticos y reposición.</p>
      </div>
    );
  }

  const st = estadoStock(total, item.stock_min, item.stock_max);
  const abcTone = { A: "red", B: "yellow", C: "green" }[abc];
  const TABS = [
    { id: "bodegas", label: "Por bodega", icon: Warehouse },
    { id: "resumen", label: "Resumen", icon: Package },
  ];

  return (
    <div data-testid="almacen-stock-detail" style={{ display: "flex", flexDirection: "column", height: panelHeight, minHeight: 440, overflow: "hidden", background: C.surface, borderRadius: 12, border: `1px solid ${C.line}` }}>
      <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 800, color: C.sky }}>{item.codigo}</span>
              {abc && <Pill tone={abcTone}>Clase {abc}</Pill>}
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{item.descripcion}</div>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 6 }}>
              Total flota: <strong style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>{total}</strong> {item.unidad}
              {" · "}Valor: <strong style={{ color: C.gold }}>{clp(total * (item.precio || 0))}</strong>
            </div>
          </div>
          {puedeOperar && st.key === "bajo" && (
            <button type="button" onClick={() => onReponer(item)} style={{ ...primaryBtn, padding: "8px 12px", fontSize: 12, background: C.cyan, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShoppingCart size={14} /> Reponer
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingBottom: 10 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${active ? C.steel : C.line}`, background: active ? tint(C.steel, 10) : "transparent", color: active ? C.steel : C.slate, fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        {tab === "bodegas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bodegas.map((b) => {
              const editando = stockEdit?.item_id === item.id && stockEdit?.bodega_id === b.id;
              const cantidad = stockMap.get(skey(item.id, b.id)) || 0;
              const minBod = minMap.get(skey(item.id, b.id)) || 0;
              const bajoMin = minBod > 0 && cantidad < minBod;
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${bajoMin ? tint(C.red, 35) : C.line}`, background: bajoMin ? tint(C.red, 6) : C.mist }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{b.nombre}</div>
                    <div style={{ fontSize: 11, color: b.tipo === "a_bordo" ? C.cyan : C.steel }}>{b.tipo === "a_bordo" ? "A bordo" : "Tierra"}</div>
                  </div>
                  {puedeOperar && editando ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" value={stockEdit.valor} autoFocus onChange={(e) => onStockEditChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") onConfirmarStock(); if (e.key === "Escape") onCancelarStock(); }}
                        style={{ ...bluInput, width: 64, textAlign: "center" }} />
                      <button type="button" onClick={onConfirmarStock} style={btnConfirm}><Check size={12} /></button>
                      <button type="button" onClick={onCancelarStock} style={btnCancel}><X size={12} /></button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 16, color: bajoMin ? C.red : C.ink }}>{cantidad}</span>
                      {puedeOperar && <button type="button" onClick={() => onIniciarEditStock(item.id, b.id)} style={btnEdit}><Pencil size={12} /></button>}
                    </div>
                  )}
                  {puedeOperar ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9, color: C.slate }}>Mín</span>
                      <input type="number" min={0} defaultValue={minBod} key={`${item.id}-${b.id}-${minBod}`}
                        onBlur={(e) => onSetMinBodega(item.id, b.id, Math.max(0, +e.target.value || 0))}
                        style={{ width: 44, textAlign: "center", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 4px" }} />
                    </div>
                  ) : minBod > 0 && (
                    <span style={{ fontSize: 11, color: C.slate }}>mín {minBod}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "resumen" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.slate, fontWeight: 600, display: "block", marginBottom: 4 }}>Descripción</label>
              {descEdit?.id === item.id ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input value={descEdit.valor} autoFocus onChange={(e) => onDescEditChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onConfirmarDesc(item.id); if (e.key === "Escape") onCancelarDesc(); }}
                    style={{ ...inputStyle(), flex: 1 }} />
                  <button type="button" onClick={() => onConfirmarDesc(item.id)} style={btnConfirm}><Check size={12} /></button>
                  <button type="button" onClick={onCancelarDesc} style={btnCancel}><X size={12} /></button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{item.descripcion}</span>
                  {puedeOperar && <button type="button" onClick={() => onIniciarEditDesc(item.id, item.descripcion)} style={btnEdit}><Pencil size={12} /></button>}
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><span style={{ fontSize: 11, color: C.slate }}>Categoría</span><div style={{ fontWeight: 600, marginTop: 4 }}>{item.categoria || "—"}</div></div>
              <div><span style={{ fontSize: 11, color: C.slate }}>Proveedor</span><div style={{ fontWeight: 600, marginTop: 4 }}>{item.proveedor || "—"}</div></div>
              <div><span style={{ fontSize: 11, color: C.slate }}>Mín flota</span><div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, marginTop: 4 }}>{item.stock_min}</div></div>
              <div><span style={{ fontSize: 11, color: C.slate }}>Máx flota</span><div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, marginTop: 4 }}>{item.stock_max}</div></div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: C.slate, display: "block", marginBottom: 6 }}>Nivel de stock</span>
              <NivelBar total={total} min={item.stock_min} max={item.stock_max} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
