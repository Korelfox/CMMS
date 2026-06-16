import React from "react";
import { useEquiposData } from "./equiposStore";
import RepuestoPanel from "./RepuestoPanel";

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
