import React, { useState, useEffect, useCallback } from "react";
import { Package, CheckCircle2 } from "lucide-react";
import { C, lk, tint } from "../../theme";
import { ESTADOS_OT, PRIORIDADES } from "../../theme";
import { primaryBtn, ghostBtn, Pill, Empty } from "../../ui";
import { fetchAll } from "../../lib/db";
import { repuestosDeEquipo } from "../../lib/diagnostico";
import DetailShell from "../detail/DetailShell";
import ChecklistOT from "./ChecklistOT";
import { FotoGaleria } from "../Fotos";
import {
  CAMPO_WIZARD_STEPS, stepIndex, nextCampoStep, prevCampoStep,
} from "../../lib/otCampoFlow";

function OTCampoRepuestos({ ot, onSkip }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [its, dests, stock] = await Promise.all([
          fetchAll("inventario_items"),
          fetchAll("inventario_item_destinos"),
          fetchAll("stock"),
        ]);
        if (vivo) {
          setItems(ot?.equipo_id ? repuestosDeEquipo(its, dests, stock, ot.equipo_id) : []);
        }
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [ot?.equipo_id]);

  if (!ot?.equipo_id) {
    return (
      <Empty>Sin equipo vinculado — puedes omitir este paso.</Empty>
    );
  }

  if (loading) return <Empty>Cargando repuestos…</Empty>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Package size={18} color={C.steel} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Repuestos consumidos</span>
        <Pill tone="steel">opcional</Pill>
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: C.slate, margin: "0 0 12px" }}>No hay repuestos enlazados a este equipo.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {items.map((r) => (
            <div
              key={r.codigo}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${r.stock > 0 ? C.line : tint(C.red, 30)}`,
                background: r.stock > 0 ? C.surface : C.redBg,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{r.codigo}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 2, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{r.descripcion}</div>
              <div style={{ fontSize: 11.5, marginTop: 4, color: r.stock > 0 ? C.green : C.red, fontWeight: 600 }}>
                Stock: {r.stock} {r.unidad}
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onSkip} className="cmms-campo-touch" style={{ ...ghostBtn, width: "100%", justifyContent: "center" }}>
        Omitir paso
      </button>
    </div>
  );
}

export default function OTCampoWizard({
  ot,
  onBack,
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
      title={ot.folio}
      subtitle={ot.sistema || undefined}
      subtitleClamp={1}
      onBack={onBack}
      backLabel="Lista"
      progress={progress}
      footer={footer}
      campo
    >
      {ot.descripcion && (
        <div style={{
          fontSize: 13,
          color: C.slate,
          lineHeight: 1.45,
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${C.line}`,
          background: C.surface,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflowWrap: "anywhere",
        }}>
          {ot.descripcion}
        </div>
      )}

      <div className="cmms-campo-wizard-steps" style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
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
