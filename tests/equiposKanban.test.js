import { describe, it, expect } from "vitest";
import { ordenarEquipos, EQ_KANBAN_COLS, kanbanEstadoKey } from "../src/lib/equiposKanban.js";

describe("equiposKanban", () => {
  it("define columnas por estado operacional", () => {
    expect(EQ_KANBAN_COLS.map((c) => c.value)).toEqual(["operativo", "en_reparacion", "desgaste", "fuera_servicio"]);
  });

  it("normaliza estado desconocido a operativo", () => {
    expect(kanbanEstadoKey({ estado: "foo" })).toBe("operativo");
  });

  it("ordena por estado y criticidad", () => {
    const lista = [
      { equipo: { id: "1", id_visible: "B", estado: "operativo", criticidad: "C" } },
      { equipo: { id: "2", id_visible: "A", estado: "fuera_servicio", criticidad: "A" } },
    ];
    const sorted = ordenarEquipos(lista);
    expect(sorted.map((x) => x.equipo.id)).toEqual(["2", "1"]);
  });
});
