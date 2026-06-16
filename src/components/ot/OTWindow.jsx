import React from "react";
import OTDetailPanel from "./OTDetailPanel";
import { useOTData } from "./otStore";

export default function OTWindow({
  otId,
  handlersRef,
  puedeOperar,
  puedeBorrar,
  puedeCostos,
  initialTab,
  valorizarMode,
}) {
  const { ots, embarcaciones, costoOk, online } = useOTData();
  const h = handlersRef.current || {};

  return (
    <OTDetailPanel
      otId={otId}
      embName={(id) => embarcaciones.find((e) => e.id === id)?.nombre || "—"}
      embColor={embarcaciones.find((e) => e.id === ots.find((o) => o.id === otId)?.embarcacion_id)?.color}
      puedeOperar={puedeOperar}
      puedeBorrar={puedeBorrar}
      puedeCostos={puedeCostos}
      online={online}
      modoCostos={valorizarMode || false}
      costoOk={costoOk}
      activeTab={initialTab}
      onTabChange={h.onTabChange}
      onCambiarEstado={h.cambiarEstado}
      onGuardarChecklist={h.guardarChecklist}
      onEditarCosto={h.editarCosto}
      onGuardarCosto={h.guardarCosto}
      onCodificarFalla={h.onCodificarFalla}
      onEliminar={h.eliminar}
      usuario={h.usuario || ""}
      embedded={false}
      valorizarMode={valorizarMode}
    />
  );
}
