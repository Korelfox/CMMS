/** Columnas kanban de órdenes de compra (flujo activo). */
export const OC_KANBAN_COLS = [
  { value: "solicitada", label: "Solicitada", tone: "slate" },
  { value: "aprobada", label: "Aprobada", tone: "purple" },
  { value: "enviada", label: "Enviada", tone: "steel" },
  { value: "recibida", label: "Recibida", tone: "green" },
];

export function ordenarOCs(lista) {
  const prio = { solicitada: 0, aprobada: 1, enviada: 2, recibida: 3, cancelada: 9 };
  const urg = { critico: 0, urgente: 1, normal: 2 };
  return [...lista].sort((a, b) => {
    const pa = prio[a.estado] ?? 8;
    const pb = prio[b.estado] ?? 8;
    if (pa !== pb) return pa - pb;
    const ua = urg[a.urgencia || "normal"] ?? 2;
    const ub = urg[b.urgencia || "normal"] ?? 2;
    if (ua !== ub) return ua - ub;
    return (b.fecha || "").localeCompare(a.fecha || "");
  });
}
