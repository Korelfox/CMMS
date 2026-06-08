// Estado de stock de un ítem (compartido por Inventario y Almacén).
// Sin mínimo definido (stock_min = 0) NO se marca "Bajo", salvo que el máximo
// sea 1 (repuesto crítico de 1 unidad) y el stock haya caído a 0.
export function estadoStock(total, stockMin, stockMax) {
  const min = stockMin || 0;
  if (min <= 0) {
    if ((stockMax || 0) === 1 && total < 1) return { key: "bajo", tone: "red", label: "Bajo" };
    return { key: "ok", tone: "slate", label: "Sin mín" };
  }
  if (total <= min) return { key: "bajo", tone: "red", label: "Bajo" };
  if (total <= min * 1.5) return { key: "revisar", tone: "yellow", label: "Revisar" };
  return { key: "ok", tone: "green", label: "OK" };
}
