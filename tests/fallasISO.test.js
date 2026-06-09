import { describe, it, expect } from "vitest";
import { MODOS_FALLA_ISO, CAUSAS_FALLA_ISO, MECANISMOS_FALLA_ISO, requiereCodigoFalla } from "../src/lib/fallasISO.js";

const catalogos = [
  ["MODOS_FALLA_ISO", MODOS_FALLA_ISO, 15],
  ["CAUSAS_FALLA_ISO", CAUSAS_FALLA_ISO, 10],
  ["MECANISMOS_FALLA_ISO", MECANISMOS_FALLA_ISO, 5],
];

describe("Catálogos de falla ISO 14224", () => {
  it.each(catalogos)("%s tiene entradas suficientes con value+label", (_n, cat, min) => {
    expect(cat.length).toBeGreaterThanOrEqual(min);
    for (const e of cat) {
      expect(typeof e.value).toBe("string");
      expect(e.value.length).toBeGreaterThan(0);
      expect(typeof e.label).toBe("string");
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it.each(catalogos)("%s no tiene values duplicados", (_n, cat) => {
    const values = cat.map((e) => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("requiereCodigoFalla: solo las correctivas codifican falla", () => {
    expect(requiereCodigoFalla({ tipo: "correctivo" })).toBe(true);
    expect(requiereCodigoFalla({ tipo: "preventivo" })).toBe(false);
    expect(requiereCodigoFalla({ tipo: "predictivo" })).toBe(false);
    expect(requiereCodigoFalla(null)).toBeFalsy();
  });
});
