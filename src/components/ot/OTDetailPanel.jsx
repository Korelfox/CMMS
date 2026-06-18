import React, { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, Settings2, DollarSign, Camera, FileText, Trash2, AlertTriangle, Check,
} from "lucide-react";
import { C, clp, lk, tn, tint } from "../../theme";
import { Pill, Empty, primaryBtn, ghostBtn, bluInput } from "../../ui";
import { TIPOS_OT, PRIORIDADES, ESTADOS_OT } from "../../theme";
import { costoOT, sinValorizar } from "../../lib/ot";
import { MODOS_FALLA_ISO, requiereCodigoFalla } from "../../lib/fallasISO";
import EstadoSelect from "./EstadoSelect";
import ChecklistOT from "./ChecklistOT";
import { FotoGaleria } from "../Fotos";
import { useOTData } from "./otStore";

const TABS = [
  { id: "resumen", label: "Resumen", icon: ClipboardList },
  { id: "ejecucion", label: "Ejecución", icon: Settings2 },
  { id: "costos", label: "Costos", icon: DollarSign },
  { id: "fotos", label: "Fotos", icon: Camera },
  { id: "trazabilidad", label: "Trazabilidad", icon: FileText },
];

export default function OTDetailPanel({
  ot: otProp,
  otId,
  embName,
  embColor,
  puedeOperar,
  puedeBorrar,
  puedeCostos,
  online,
  modoCostos,
  costoOk,
  activeTab,
  onTabChange,
  onCambiarEstado,
  onGuardarChecklist,
  onEditarCosto,
  onGuardarCosto,
  onCodificarFalla,
  onEliminar,
  usuario,
  embedded = true,
  valorizarMode = false,
}) {
  const { ots } = useOTData();
  const ot = otProp ?? (otId ? ots.find((o) => o.id === otId) : null);
  const [tabInternal, setTabInternal] = useState("resumen");
  const tab = activeTab ?? tabInternal;
  const setTab = onTabChange ?? setTabInternal;

  useEffect(() => {
    if (activeTab == null) setTabInternal("resumen");
  }, [ot?.id, activeTab]);

  useEffect(() => {
    if (valorizarMode && ot) setTab("costos");
  }, [valorizarMode, ot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const panelHeight = embedded ? "calc(100vh - 320px)" : "calc(100vh - 148px)";
  const minH = embedded ? 440 : 0;

  const checklistItems = useMemo(() => (Array.isArray(ot?.checklist) ? ot.checklist : []), [ot?.checklist]);
  const checklistHechos = checklistItems.filter((i) => i.ok).length;

  if (!ot) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, color: C.slate, minHeight: minH || 320, background: C.surface, borderRadius: embedded ? 12 : 0, border: embedded ? `1px solid ${C.line}` : "none" }}>
        <ClipboardList size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Selecciona una orden</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>
          Elige una OT en la cola para ver resumen, ejecutar checklist, valorizar costos y revisar trazabilidad.
        </p>
      </div>
    );
  }

  const labelStyle = { fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4, display: "block" };
  const fieldValue = { fontSize: 13.5, color: C.ink, fontWeight: 600 };

  return (
    <div data-testid="ot-detail" style={{ display: "flex", flexDirection: "column", height: panelHeight, minHeight: minH, overflow: "hidden", background: C.surface, borderRadius: embedded ? 12 : 0, border: embedded ? `1px solid ${C.line}` : "none" }}>
      <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 800, color: C.sky }}>{ot.folio}</span>
              {ot._pending && <Pill tone="yellow">Pendiente sync</Pill>}
              {sinValorizar(ot) && <Pill tone="yellow">Sin valorizar</Pill>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.abyss, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ot.sistema || "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <Pill tone={tn(ESTADOS_OT, ot.estado)}>{lk(ESTADOS_OT, ot.estado)}</Pill>
              <Pill tone={tn(PRIORIDADES, ot.prioridad)}>{lk(PRIORIDADES, ot.prioridad)}</Pill>
              <Pill tone={tn(TIPOS_OT, ot.tipo)}>{lk(TIPOS_OT, ot.tipo)}</Pill>
              {embColor && (
                <span style={{ fontSize: 12, color: C.slate, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: embColor }} />
                  {embName?.(ot.embarcacion_id)}
                </span>
              )}
            </div>
          </div>
          {puedeBorrar && !ot._pending && (
            <button type="button" onClick={() => onEliminar?.(ot.id)} title="Eliminar OT"
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
                {t.id === "ejecucion" && checklistItems.length > 0 && (
                  <span style={{ fontSize: 10.5, opacity: 0.85 }}>({checklistHechos}/{checklistItems.length})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        {tab === "resumen" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <span style={labelStyle}>Fecha</span>
              <div style={{ ...fieldValue, fontFamily: "'IBM Plex Mono', monospace" }}>{ot.fecha}</div>
            </div>
            <div>
              <span style={labelStyle}>Embarcación</span>
              <div style={fieldValue}>{embName?.(ot.embarcacion_id) || "—"}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={labelStyle}>Descripción del trabajo</span>
              <div style={{ ...fieldValue, fontWeight: 500, lineHeight: 1.5 }}>{ot.descripcion || "—"}</div>
            </div>
            <div>
              <span style={labelStyle}>MTTR (hrs paro)</span>
              <div style={fieldValue}>{ot.mttr_horas ?? 0} h</div>
            </div>
            <div>
              <span style={labelStyle}>Costo total</span>
              <div style={{ ...fieldValue, color: C.gold }}>{clp(costoOT(ot))}</div>
            </div>
            {ot.modo_falla && (
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", background: tint(C.red, 6), borderRadius: 8, border: `1px solid ${tint(C.red, 25)}` }}>
                <span style={{ ...labelStyle, color: C.red }}>Codificación ISO 14224</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {lk(MODOS_FALLA_ISO, ot.modo_falla)}
                  {ot.causa_falla && ` · ${ot.causa_falla}`}
                  {ot.mecanismo_falla && ` · ${ot.mecanismo_falla}`}
                </div>
              </div>
            )}
            {requiereCodigoFalla(ot) && ot.estado === "cerrada" && !ot.modo_falla && (
              <div style={{ gridColumn: "1 / -1" }}>
                <button type="button" onClick={() => onCodificarFalla?.(ot)} style={{ ...primaryBtn, background: C.amber, borderColor: C.amber, color: "#7a5b00" }}>
                  <AlertTriangle size={15} /> Codificar falla ISO 14224
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "ejecucion" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <span style={labelStyle}>Estado del flujo</span>
              {puedeOperar && !ot._pending && online ? (
                <EstadoSelect estado={ot.estado} onChange={(nuevo) => onCambiarEstado?.(ot, nuevo)} />
              ) : (
                <Pill tone={tn(ESTADOS_OT, ot.estado)}>{lk(ESTADOS_OT, ot.estado)}</Pill>
              )}
              {ot.estado === "cerrada" && ot.cerrada_por && (
                <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>
                  Cerrada por <strong>{ot.cerrada_por}</strong>
                  {ot.cerrada_fecha && ` · ${new Date(ot.cerrada_fecha).toLocaleString("es-CL")}`}
                </div>
              )}
            </div>
            {!ot._pending && online ? (
              <ChecklistOT ot={ot} puedeOperar={puedeOperar} usuario={usuario} onSave={(items) => onGuardarChecklist?.(ot, items)} />
            ) : (
              <Empty>Sin conexión o OT pendiente de sync — checklist no disponible.</Empty>
            )}
          </>
        )}

        {tab === "costos" && (
          <>
            {(modoCostos || valorizarMode) && puedeCostos && (
              <p style={{ fontSize: 12, color: C.slate, margin: "0 0 12px", padding: "8px 10px", background: tint(C.gold, 10), borderRadius: 8 }}>
                Valorización activa — los costos se guardan al salir del campo con tu firma.
              </p>
            )}
            {puedeCostos && !ot._pending && online ? (
              <div style={{ maxWidth: 360 }}>
                <p style={{ fontSize: 12.5, color: C.slate, margin: "0 0 14px" }}>
                  Mano de obra y materiales. Se guarda al salir del campo con tu firma de valorización.
                </p>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={labelStyle}>Costo MO ($)</span>
                  <input type="number" step={1000} value={ot.costo_mo || 0}
                    onFocus={(e) => e.target.select()} onChange={(e) => onEditarCosto?.(ot.id, "costo_mo", +e.target.value)} onBlur={() => onGuardarCosto?.(ot)}
                    style={{ ...bluInput, width: "100%" }} />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={labelStyle}>Costo materiales ($)</span>
                  <input type="number" step={1000} value={ot.costo_mat || 0}
                    onFocus={(e) => e.target.select()} onChange={(e) => onEditarCosto?.(ot.id, "costo_mat", +e.target.value)} onBlur={() => onGuardarCosto?.(ot)}
                    style={{ ...bluInput, width: "100%" }} />
                </label>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.gold, marginTop: 8 }}>Total: {clp(costoOT(ot))}</div>
                {costoOk === ot.id && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.green, fontWeight: 600, marginTop: 8 }}>
                    <Check size={14} /> Guardado
                  </span>
                )}
                {ot.costos_por && costoOT(ot) > 0 && (
                  <div style={{ fontSize: 12, color: C.slate, marginTop: 12 }}>
                    Valorizado por <strong>{ot.costos_por}</strong>
                    {ot.costos_fecha && ` · ${new Date(ot.costos_fecha).toLocaleDateString("es-CL")}`}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.gold, marginBottom: 8 }}>{clp(costoOT(ot))}</div>
                {sinValorizar(ot) && <Pill tone="yellow">Pendiente de valorización</Pill>}
                {!puedeCostos && <p style={{ fontSize: 12.5, color: C.slate, marginTop: 10 }}>Solo Jefe de Mantención puede editar costos.</p>}
              </div>
            )}
          </>
        )}

        {tab === "fotos" && (
          !ot._pending && online ? (
            <FotoGaleria entidad="ot" entidadId={ot.id} puedeAgregar={puedeOperar} puedeBorrar={puedeBorrar} online={online} />
          ) : (
            <Empty>Fotos no disponibles sin conexión o mientras la OT está en cola.</Empty>
          )
        )}

        {tab === "trazabilidad" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ot.cerrada_por && (
              <div style={{ padding: "10px 12px", background: C.surface2, borderRadius: 8 }}>
                <span style={labelStyle}>Cierre</span>
                <div style={fieldValue}>{ot.cerrada_por}</div>
                {ot.cerrada_fecha && <div style={{ fontSize: 12, color: C.slate }}>{new Date(ot.cerrada_fecha).toLocaleString("es-CL")}</div>}
              </div>
            )}
            {ot.costos_por && (
              <div style={{ padding: "10px 12px", background: C.surface2, borderRadius: 8 }}>
                <span style={labelStyle}>Valorización de costos</span>
                <div style={fieldValue}>{ot.costos_por}</div>
                {ot.costos_fecha && <div style={{ fontSize: 12, color: C.slate }}>{new Date(ot.costos_fecha).toLocaleString("es-CL")}</div>}
              </div>
            )}
            {ot._pending && (
              <div style={{ padding: "10px 12px", background: tint(C.amber, 10), borderRadius: 8, border: `1px solid ${C.amber}` }}>
                <span style={{ ...labelStyle, color: "#7a5b00" }}>Sincronización</span>
                <div style={{ fontSize: 13, color: "#7a5b00" }}>Esta OT se creó offline y está pendiente de subir al servidor.</div>
              </div>
            )}
            {!ot.cerrada_por && !ot.costos_por && !ot._pending && (
              <Empty>Sin eventos de trazabilidad registrados aún.</Empty>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
