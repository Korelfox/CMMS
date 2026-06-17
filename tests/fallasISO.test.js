import { describe, it, expect } from "vitest";
import { MODOS_FALLA_ISO, CAUSAS_FALLA_ISO, MECANISMOS_FALLA_ISO, requiereCodigoFalla,
  FALLA_TAXONOMIA, modoMeta, codigoLabel, mecanismosProbables, coherenteModoMecanismo } from "../src/lib/fallasISO.js";

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

describe("Taxonomía de modos de falla ISO 14224 (3 niveles)", () => {
  it("clase → grupo → modo consistente; cada modo con value, código y label", () => {
    for (const c of FALLA_TAXONOMIA) {
      expect(c.clase).toBeTruthy();
      for (const g of c.grupos) {
        expect(g.grupo).toBeTruthy();
        for (const m of g.modos) {
          expect(m.value.length).toBeGreaterThan(0);
          expect(m.codigo).toMatch(/^[A-Z]{3}$/);  // mnemónico ISO de 3 letras
          expect(m.label.length).toBeGreaterThan(0);
          const meta = modoMeta(m.value);
          expect(meta.clase).toBe(c.clase);
          expect(meta.grupo).toBe(g.grupo);
          expect(meta.codigo).toBe(m.codigo);
        }
      }
    }
  });

  it("modoMeta tolera texto libre / desconocido sin romper el roll-up", () => {
    const m = modoMeta("texto_libre_legacy");
    expect(m.codigo).toBe("—");
    expect(m.clase).toBe("Sin clasificar");
    expect(modoMeta("").label).toBe("Sin codificar");
  });

  it("codigoLabel produce una etiqueta ISO legible para benchmarking", () => {
    expect(codigoLabel("VIB")).toContain("VIB");
    expect(codigoLabel("VIB")).toContain("Vibración");
  });
});

describe("Cruce modo ↔ mecanismo (coherencia ISO 14224)", () => {
  const MEC_VALIDOS = new Set(MECANISMOS_FALLA_ISO.map((m) => m.value));

  it("cada mecanismo plausible declarado es un value válido del catálogo", () => {
    for (const c of FALLA_TAXONOMIA)
      for (const g of c.grupos)
        for (const m of g.modos)
          for (const mv of (m.mec || [])) expect(MEC_VALIDOS.has(mv)).toBe(true);
  });

  it("mecanismosProbables: el 1º es el primario; 'otro' sin restricción", () => {
    expect(mecanismosProbables("vibracion")[0]).toBe("mecanico");
    expect(mecanismosProbables("falla_electrica")).toEqual(["electrico"]);
    expect(mecanismosProbables("otro")).toEqual([]);
  });

  it("coherenteModoMecanismo acepta lo plausible y marca lo improbable", () => {
    expect(coherenteModoMecanismo("vibracion", "mecanico")).toBe(true);
    expect(coherenteModoMecanismo("vibracion", "instrumentacion")).toBe(false);
    expect(coherenteModoMecanismo("lectura_anormal", "instrumentacion")).toBe(true);
    expect(coherenteModoMecanismo("otro", "electrico")).toBe(true);   // sin restricción
    expect(coherenteModoMecanismo("", "mecanico")).toBe(true);        // falta modo → no valida
    expect(coherenteModoMecanismo("vibracion", "")).toBe(true);       // falta mecanismo → no valida
  });
});
