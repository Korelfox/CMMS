import { describe, it, expect } from "vitest";
import { ordenarPlanesPM, PM_KANBAN_COLS } from "../src/lib/planpmKanban.js";

describe("planpmKanban", () => {
  it("define columnas por semáforo (incluye slate para sin historial)", () => {
    expect(PM_KANBAN_COLS.map((c) => c.value)).toEqual(["green", "yellow", "red", "slate"]);
  });

  it("ordena vencidos primero y por ratio de avance", () => {
    const lista = [
      { plan: { id: "1", descripcion: "B" }, tone: "green", elapsed: 10, limite: 100 },
      { plan: { id: "2", descripcion: "A" }, tone: "red", elapsed: 120, limite: 100 },
      { plan: { id: "3", descripcion: "C" }, tone: "yellow", elapsed: 95, limite: 100 },
    ];
    const sorted = ordenarPlanesPM(lista);
    expect(sorted.map((x) => x.plan.id)).toEqual(["2", "3", "1"]);
  });
});
