import { describe, it, expect } from "vitest";
import { ordenarOtsCampo, agruparProgramacion, labelProgFecha } from "../src/lib/campoHoy.js";

describe("campoHoy", () => {
  it("prioriza OT en ejecución y programada", () => {
    const sorted = ordenarOtsCampo([
      { id: "1", estado: "planificada", prioridad: "critica" },
      { id: "2", estado: "programada", prioridad: "baja" },
      { id: "3", estado: "en_ejecucion", prioridad: "media" },
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["3", "2", "1"]);
  });

  it("agrupa programación en hoy, atrasadas y próximas", () => {
    const g = agruparProgramacion([
      { id: "a", done: false, fecha_programada: "2026-06-15" },
      { id: "b", done: false, fecha_programada: "2026-06-17" },
      { id: "c", done: true, fecha_programada: "2026-06-17" },
      { id: "d", done: false, fecha_programada: "2026-06-18" },
    ], "2026-06-17");
    expect(g.hoy.map((x) => x.id)).toEqual(["b"]);
    expect(g.atrasadas.map((x) => x.id)).toEqual(["a"]);
    expect(g.proximas.map((x) => x.id)).toEqual(["d"]);
  });

  it("etiqueta fechas de programación", () => {
    expect(labelProgFecha("2026-06-17", "2026-06-17")).toBe("Hoy");
    expect(labelProgFecha("2026-06-16", "2026-06-17")).toBe("Atrasada");
  });
});
