import { estadoStock } from "./stock";

/** Columnas del tablero kanban de inventario (estado de stock). */
export const INV_KANBAN_COLS = [
  { value: "bajo", label: "Bajo mínimo", tone: "red" },
  { value: "revisar", label: "Por revisar", tone: "yellow" },
  { value: "ok", label: "OK", tone: "green" },
  { value: "sin_min", label: "Sin mínimo", tone: "slate" },
];

export function kanbanStockKey(item) {
  const st = estadoStock(item.total, item.stock_min, item.stock_max);
  if (st.key === "ok" && st.label === "Sin mín") return "sin_min";
  return st.key;
}

export function ordenarItemsInv(lista) {
  const prio = { bajo: 0, revisar: 1, ok: 2, sin_min: 3 };
  return [...lista].sort((a, b) => {
    const pa = prio[kanbanStockKey(a)] ?? 9;
    const pb = prio[kanbanStockKey(b)] ?? 9;
    if (pa !== pb) return pa - pb;
    const abc = { A: 0, B: 1, C: 2 };
    const da = abc[a.abc] ?? 9;
    const db = abc[b.abc] ?? 9;
    if (da !== db) return da - db;
    return (a.codigo || "").localeCompare(b.codigo || "", "es");
  });
}
