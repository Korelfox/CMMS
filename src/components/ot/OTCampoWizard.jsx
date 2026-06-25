import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Package, CheckCircle2, AlertTriangle, Check } from "lucide-react";
import { C, lk, tint } from "../../theme";
import { ESTADOS_OT, PRIORIDADES } from "../../theme";
import { primaryBtn, ghostBtn, Pill, Empty, bluInput } from "../../ui";
import { fetchAll, rpcCall } from "../../lib/db";
import { useAuth } from "../../lib/auth";
import { useOnline } from "../../lib/offline";
import { useShellOptional } from "../../context/ShellContext";
import DetailShell from "../detail/DetailShell";
import ChecklistOT from "./ChecklistOT";
import { FotoGaleria } from "../Fotos";
import {
  CAMPO_WIZARD_STEPS, stepIndex, nextCampoStep, prevCampoStep,
} from "../../lib/otCampoFlow";
import { describeOtCampo } from "../../lib/campoHoy";
import { hoyLocal } from "../../lib/fechas";

// ── Paso "Repuestos": lista interactiva de items vinculados al equipo ────────
function OTCampoRepuestos({ ot, onSkip }) {
  const { profile } = useAuth();
  const shell = useShellOptional();
  const embarcacionId = shell?.embarcacionId ?? null;
  const online = useOnline();

  const [rawItems, setRawItems] = useState([]);
  const [dests, setDests] = useState([]);
  const [stockData, setStockData] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(null);
  const [consumido, setConsumo] = useState({});

  useEffect(() => {
    let vivo = true;
    setConsumo({});
    setListo(false);
    setError(null);
    (async () => {
      try {
        const [its, destsData, stockRaw, bodsData] = await Promise.all([
          fetchAll("inventario_items"),
          fetchAll("inventario_item_destinos"),
          fetchAll("stock"),
          fetchAll("bodegas"),
        ]);
        if (!vivo) return;
        setRawItems(its);
        setDests(destsData);
        setStockData(stockRaw);
        setBodegas(bodsData);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [ot?.id]);

  const panolActivo = useMemo(
    () => bodegas.find((b) => b.tipo === "a_bordo" && b.embarcacion_id === embarcacionId) ?? null,
    [bodegas, embarcacionId],
  );

  const stockEnPanol = useCallback(
    (itemId) => {
      if (!panolActivo) return 0;
      const e = stockData.find((s) => s.item_id === itemId && s.bodega_id === panolActivo.id);
      return e ? Number(e.cantidad) || 0 : 0;
    },
    [panolActivo, stockData],
  );

  const items = useMemo(() => {
    if (!ot?.equipo_id || !rawItems.length) return [];
    const itemIds = new Set(dests.filter((d) => d.equipo_id === ot.equipo_id).map((d) => d.item_id));
    if (!itemIds.size) return [];
    return rawItems
      .filter((it) => itemIds.has(it.id))
      .map((it) => ({ ...it, stockPanol: stockEnPanol(it.id) }));
  }, [rawItems, dests, stockEnPanol, ot?.equipo_id]);

  async function registrarConsumo() {
    const lineas = Object.entries(consumido).filter(([, q]) => Number(q) > 0);
    if (!lineas.length) { onSkip(); return; }
    if (!panolActivo) { setError("No hay pañol configurado para esta nave."); return; }
    setGuardando(true);
    setError(null);
    try {
      const fecha = hoyLocal();
      for (const [itemId, rawQty] of lineas) {
        const qty = Number(rawQty);
        if (!qty) continue;
        const item = rawItems.find((i) => i.id === itemId);
        if (!item) continue;
        // RPC atómico: stock + movimiento + cargo OT en una transacción
        await rpcCall("fn_registrar_movimiento", {
          p_empresa_id: profile.empresa_id,
          p_tipo: "salida",
          p_item_id: itemId,
          p_bodega_from: panolActivo.id,
          p_bodega_to: null,
          p_cantidad: qty,
          p_ot_id: ot.id,
          p_responsable: profile.nombre,
          p_motivo: `Consumo OT ${ot.folio}`,
          p_fecha: fecha,
          p_created_by: profile.id,
        });
      }
      setListo(true);
    } catch (e) {
      setError("Error al registrar: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!ot?.equipo_id) return <Empty>Sin equipo vinculado — puedes omitir este paso.</Empty>;
  if (loading) return <Empty>Cargando repuestos…</Empty>;

  if (listo) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <Check size={32} color={C.green} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Consumo registrado</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 16 }}>Stock del pañol actualizado.</div>
        <button type="button" className="cmms-campo-touch" onClick={onSkip}
          style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>
          Continuar al cierre
        </button>
      </div>
    );
  }

  // Sin conexión: mostrar aviso y omitir — el stock se registra desde Almacén al regresar a puerto
  if (!online) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Package size={18} color={C.steel} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Repuestos consumidos</span>
          <Pill tone="steel">opcional</Pill>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: tint(C.amber, 10), border: `1px solid ${tint(C.amber, 35)}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12.5 }}>
          <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Sin conexión: el descuento de stock no está disponible. Registra el consumo desde <strong>Almacén → Movimientos</strong> al recuperar señal.</span>
        </div>
        <button type="button" className="cmms-campo-touch" onClick={onSkip}
          style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>
          Continuar sin registrar consumo
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Package size={18} color={C.steel} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Repuestos consumidos</span>
        <Pill tone="steel">opcional</Pill>
      </div>

      {!panolActivo && embarcacionId && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: tint(C.amber, 10), border: `1px solid ${tint(C.amber, 35)}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5 }}>
          <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Esta nave no tiene pañol — el consumo no descuenta stock.</span>
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: C.redBg }}>{error}</div>
      )}

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: C.slate, margin: "0 0 12px" }}>No hay repuestos enlazados a este equipo.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {items.map((r) => {
            const qty = consumido[r.id] ?? "";
            const bajo = r.stock_min > 0 && r.stockPanol <= r.stock_min;
            return (
              <div key={r.id} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${bajo ? tint(C.red, 30) : C.line}`, background: bajo ? C.redBg : C.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{r.codigo}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 1, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
                      {r.descripcion}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: bajo ? C.red : C.green }}>
                      Pañol: {r.stockPanol} {r.unidad}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: C.slate, fontWeight: 600 }}>Usado</span>
                    <input
                      type="number" min="0" max={r.stockPanol} value={qty}
                      onChange={(e) => setConsumo((p) => ({ ...p, [r.id]: e.target.value }))}
                      disabled={!panolActivo}
                      className="cmms-campo-touch"
                      style={{ ...bluInput, width: 64, textAlign: "right", minHeight: 40, fontSize: 15 }}
                    />
                    <span style={{ fontSize: 10, color: C.slate }}>{r.unidad}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="cmms-campo-touch" onClick={registrarConsumo} disabled={guardando}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginBottom: 8 }}>
        {guardando ? "Registrando…" : "Registrar consumo"}
      </button>
      <button type="button" onClick={onSkip} className="cmms-campo-touch"
        style={{ ...ghostBtn, width: "100%", justifyContent: "center" }}>
        Omitir paso
      </button>
    </div>
  );
}

// ── Wizard principal ─────────────────────────────────────────────────────────
export default function OTCampoWizard({
  ot,
  equipo = null,
  equipoPorId = null,
  onBack,
  onHome,
  puedeOperar,
  online,
  usuario,
  onGuardarChecklist,
  onCambiarEstado,
  initialStep = "checklist",
}) {
  const [step, setStep] = useState(initialStep);
  const idx = stepIndex(step);
  const progress = ((idx + 1) / CAMPO_WIZARD_STEPS.length) * 100;
  const d = useMemo(
    () => describeOtCampo(ot, equipo, equipoPorId || new Map()),
    [ot, equipo, equipoPorId],
  );

  useEffect(() => {
    setStep(initialStep);
  }, [ot?.id, initialStep]);

  const irSiguiente = useCallback((skipRep = false) => {
    setStep((s) => nextCampoStep(s, { skipRepuestos: skipRep }));
  }, []);

  const footer = (
    <>
      {idx > 0 && (
        <button type="button" className="cmms-campo-touch" onClick={() => setStep((s) => prevCampoStep(s))} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>
          Anterior
        </button>
      )}
      {step === "repuestos" && (
        <button type="button" className="cmms-campo-touch" onClick={() => irSiguiente(true)} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>
          Omitir paso
        </button>
      )}
      {step !== "cierre" && (
        <button
          type="button"
          className="cmms-campo-touch"
          onClick={() => irSiguiente(step === "fotos")}
          style={{ ...primaryBtn, flex: 1, justifyContent: "center" }}
        >
          Siguiente
        </button>
      )}
    </>
  );

  return (
    <DetailShell
      title={d.titulo}
      subtitle={[ot.folio, d.lineaEquipo].filter(Boolean).join(" · ") || undefined}
      subtitleClamp={2}
      onBack={onBack}
      onHome={onHome}
      backLabel="Lista"
      progress={progress}
      footer={footer}
      campo
    >
      {d.trabajo && (
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.ink,
          lineHeight: 1.45,
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${C.line}`,
          background: C.surface,
          overflowWrap: "anywhere",
        }}>
          {d.trabajo}
        </div>
      )}

      <div className="cmms-campo-wizard-steps" data-campo-no-swipe style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
        {CAMPO_WIZARD_STEPS.map((s, i) => {
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className="cmms-campo-touch"
              onClick={() => setStep(s.id)}
              style={{
                flex: "0 0 auto",
                minWidth: 76,
                minHeight: 44,
                padding: "8px 12px",
                fontSize: 11,
                fontWeight: active ? 700 : 600,
                whiteSpace: "nowrap",
                border: `1px solid ${active ? tint(C.sky, 40) : C.line}`,
                borderRadius: 8,
                background: active ? tint(C.sky, 10) : C.surface,
                color: i <= idx ? C.ink : C.slate,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {s.label}{s.optional ? " *" : ""}
            </button>
          );
        })}
      </div>

      {step === "checklist" && (
        !ot._pending && online ? (
          <ChecklistOT ot={ot} puedeOperar={puedeOperar} usuario={usuario} campo onSave={(items) => onGuardarChecklist?.(ot, items)} />
        ) : (
          <Empty>Sin conexión o OT pendiente de sync — checklist no disponible.</Empty>
        )
      )}

      {step === "fotos" && (
        !ot._pending && online ? (
          <FotoGaleria entidad="ot" entidadId={ot.id} puedeAgregar={puedeOperar} puedeBorrar={puedeOperar} online={online} />
        ) : (
          <Empty>Fotos no disponibles sin conexión.</Empty>
        )
      )}

      {step === "repuestos" && (
        <OTCampoRepuestos ot={ot} onSkip={() => setStep("cierre")} />
      )}

      {step === "cierre" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Cierre de OT</div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 16, lineHeight: 1.5 }}>
            Estado actual: <strong>{lk(ESTADOS_OT, ot.estado)}</strong>
            {" · "}
            {lk(PRIORIDADES, ot.prioridad)}
          </div>
          {ot.estado !== "cerrada" && puedeOperar && online && !ot._pending ? (
            <button
              type="button"
              className="cmms-campo-touch"
              onClick={() => onCambiarEstado?.(ot, "cerrada")}
              style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}
            >
              <CheckCircle2 size={18} /> Completar OT
            </button>
          ) : ot.estado === "cerrada" ? (
            <Pill tone="green">OT cerrada</Pill>
          ) : (
            <Empty>No puedes cerrar esta OT en el estado actual.</Empty>
          )}
        </div>
      )}
    </DetailShell>
  );
}
