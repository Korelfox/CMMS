import React from "react";
import EquipoDetailPanel from "./EquipoDetailPanel";
import { RepuestosWindowBody } from "./RepuestosWindowBody";

export default function EquipoWindow({ nodeId, handlersRef, puedeOperar, puedeBorrar, posInfo }) {
  return (
    <EquipoDetailPanel
      nodeId={nodeId}
      handlers={handlersRef.current}
      puedeOperar={puedeOperar}
      puedeBorrar={puedeBorrar}
      posInfo={posInfo}
      onSelectNode={(id) => handlersRef.current?.abrirEquipoWindow?.(id)}
      embedded={false}
    />
  );
}

export { RepuestosWindowBody };
