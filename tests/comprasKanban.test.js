import { describe, it, expect } from "vitest";
import { ordenarOCs, OC_KANBAN_COLS } from "../src/lib/comprasKanban.js";

describe("comprasKanban", () => {
  it("define columnas del flujo activo", () => {
    expect(OC_KANBAN_COLS.map((c) => c.value)).toEqual(["solicitada", "aprobada", "enviada", "recibida"]);
  });

  it("ordena por estado, urgencia y fecha", () => {
    const lista = [
      { id: "1", estado: "enviada", urgencia: "normal", fecha: "2026-01-01" },
      { id: "2", estado: "solicitada", urgencia: "critico", fecha: "2026-02-01" },
      { id: "3", estado: "solicitada", urgencia: "normal", fecha: "2026-03-01" },
    ];
    const sorted = ordenarOCs(lista);
    expect(sorted.map((o) => o.id)).toEqual(["2", "3", "1"]);
  });
});
