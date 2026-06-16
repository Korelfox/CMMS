import { describe, it, expect } from "vitest";
import { kanbanStockKey, ordenarItemsInv, INV_KANBAN_COLS } from "../src/lib/inventarioKanban.js";

describe("inventarioKanban", () => {
  it("clasifica sin mínimo aparte de OK", () => {
    expect(kanbanStockKey({ total: 5, stock_min: 0, stock_max: 0 })).toBe("sin_min");
    expect(kanbanStockKey({ total: 10, stock_min: 2, stock_max: 20 })).toBe("ok");
    expect(kanbanStockKey({ total: 1, stock_min: 5, stock_max: 20 })).toBe("bajo");
    expect(kanbanStockKey({ total: 6, stock_min: 5, stock_max: 20 })).toBe("revisar");
  });

  it("ordena críticos primero", () => {
    const lista = [
      { id: "1", codigo: "B", abc: "C", total: 10, stock_min: 2, stock_max: 20 },
      { id: "2", codigo: "A", abc: "A", total: 0, stock_min: 5, stock_max: 20 },
    ];
    expect(ordenarItemsInv(lista).map((i) => i.id)).toEqual(["2", "1"]);
  });

  it("expone cuatro columnas kanban", () => {
    expect(INV_KANBAN_COLS.map((c) => c.value)).toEqual(["bajo", "revisar", "ok", "sin_min"]);
  });
});
