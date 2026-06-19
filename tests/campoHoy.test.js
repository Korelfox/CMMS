import { describe, it, expect } from "vitest";
import {
  ordenarOtsCampo, agruparProgramacion, labelProgFecha,
  describeEquipoCampo, describeOtCampo, rutaEquipo,
} from "../src/lib/campoHoy.js";

const ARBOL = new Map([
  ["prop", { id: "prop", tipo_nodo: "sistema", sistema: "Propulsión", id_visible: "DP-PROP" }],
  ["motor", { id: "motor", parent_id: "prop", tipo_nodo: "subsistema", sistema: "Motor principal", id_visible: "DP-PROP-MTR" }],
  ["bomba", { id: "bomba", parent_id: "motor", tipo_nodo: "componente", sistema: "Bomba agua fresca", id_visible: "DP-PROP-MTR-FW-BMP", marca: "Cat", criticidad: "A" }],
]);

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

  it("rutaEquipo incluye sistema y ancestros", () => {
    const bomba = ARBOL.get("bomba");
    expect(rutaEquipo(bomba, ARBOL)).toBe("Propulsión › Motor principal");
  });

  it("describeEquipoCampo prioriza código, ruta y criticidad", () => {
    const d = describeEquipoCampo(ARBOL.get("bomba"), ARBOL);
    expect(d.titulo).toBe("Bomba agua fresca");
    expect(d.lineaEquipo).toContain("DP-PROP-MTR-FW-BMP");
    expect(d.lineaEquipo).toContain("Propulsión › Motor principal");
    expect(d.lineaEquipo).toContain("Crit. A");
  });

  it("describeOtCampo separa equipo y trabajo", () => {
    const d = describeOtCampo(
      { folio: "OT-001", descripcion: "Cambio filtros", sistema: "Bomba" },
      ARBOL.get("bomba"),
      ARBOL,
    );
    expect(d.titulo).toBe("Bomba agua fresca");
    expect(d.trabajo).toBe("Cambio filtros");
    expect(d.lineaEquipo).toContain("DP-PROP-MTR-FW-BMP");
  });
});
