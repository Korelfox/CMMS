import { describe, it, expect } from "vitest";
import {
  PLANTILLA_PESQUERA, contarNodosPlantilla, contarRepuestosPlantilla,
} from "../src/lib/plantillaPesquera.js";

// Cuenta componentes (hojas tipo componente/instrumento) bajo un nodo.
const countComp = (n) => (n.hijos || []).reduce(
  (s, h) => s + (h.tipo === "componente" || h.tipo === "instrumento" ? 1 : 0) + countComp(h), 0);
const find = (arr, cod) => arr.find((n) => n.cod === cod);

describe("Plantilla pesquera ISO 14224", () => {
  it("tiene nodos y repuestos cargados", () => {
    expect(contarNodosPlantilla()).toBeGreaterThan(100);
    expect(contarRepuestosPlantilla()).toBeGreaterThan(100);
  });

  it("Motor Principal: 7 subsistemas y 58 componentes (clase mundial)", () => {
    const mtr = find(find(PLANTILLA_PESQUERA, "PROP").hijos, "PROP-MTR");
    expect(mtr.hijos).toHaveLength(7);
    expect(countComp(mtr)).toBe(58);
  });

  it("Motor Generador: 7 subsistemas", () => {
    const gmtr = find(find(PLANTILLA_PESQUERA, "GEN").hijos, "GEN-MTR");
    expect(gmtr.hijos).toHaveLength(7);
    expect(countComp(gmtr)).toBeGreaterThan(0);
  });

  it("los códigos no llevan sufijo -001 (IDs limpios)", () => {
    const haySufijo = (nodos) => (nodos || []).some(
      (n) => /-001$/.test(n.cod) || haySufijo(n.hijos));
    expect(haySufijo(PLANTILLA_PESQUERA)).toBe(false);
  });

  it("cada repuesto declara un tipo válido", () => {
    const tipos = new Set(["oem", "alternativo", "generico"]);
    const ok = (nodos) => (nodos || []).every(
      (n) => (n.rep || []).every(([, , t]) => tipos.has(t)) && ok(n.hijos));
    expect(ok(PLANTILLA_PESQUERA)).toBe(true);
  });
});
