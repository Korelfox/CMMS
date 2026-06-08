import { describe, it, expect } from "vitest";
import {
  PLANTILLA_PESQUERA, contarNodosPlantilla, contarRepuestosPlantilla, contarPlanesPMPlantilla,
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

  it("Central/Grupo Hidráulico (HPU, Caso A): es sistema propio con motor + bomba + estanque + válvulas + filtros", () => {
    const hpu = find(PLANTILLA_PESQUERA, "HPU");
    expect(hpu).toBeTruthy();
    expect(hpu.tipo).toBe("sistema");
    // El motor diésel es accionador DENTRO de la central, NO cuelga de Hidráulico.
    expect(find(hpu.hijos, "HPU-MTR")).toBeTruthy();
    expect(find(hpu.hijos, "HPU-BMB")).toBeTruthy();
    expect(find(hpu.hijos, "HPU-TNK")).toBeTruthy();
    expect(find(hpu.hijos, "HPU-VLV")).toBeTruthy();
    expect(find(hpu.hijos, "HPU-FLT")).toBeTruthy();
    expect(countComp(hpu)).toBeGreaterThan(0);
  });

  it("la plantilla precarga planes PM válidos (descripción + intervalo > 0)", () => {
    expect(contarPlanesPMPlantilla()).toBeGreaterThan(0);
    const ok = (nodos) => (nodos || []).every(
      (n) => (n.pm || []).every(([d, h]) => typeof d === "string" && d.length > 0 && h > 0) && ok(n.hijos));
    expect(ok(PLANTILLA_PESQUERA)).toBe(true);
  });

  it("cada repuesto declara un tipo válido", () => {
    const tipos = new Set(["oem", "alternativo", "generico"]);
    const ok = (nodos) => (nodos || []).every(
      (n) => (n.rep || []).every(([, , t]) => tipos.has(t)) && ok(n.hijos));
    expect(ok(PLANTILLA_PESQUERA)).toBe(true);
  });
});
