import { describe, it, expect } from "vitest";
import {
  PLANTILLA_PESQUERA, nodoIncluido, contarNodosPlantilla, contarRepuestosPlantilla, contarPlanesPMPlantilla,
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

  it("Motor Principal: taxonomía marina de 10 subsistemas ISO 14224", () => {
    const mtr = find(find(PLANTILLA_PESQUERA, "PROP").hijos, "PROP-MTR");
    expect(mtr.hijos).toHaveLength(10);
    expect(countComp(mtr)).toBeGreaterThanOrEqual(55);
    // Subsistemas marinos clave que antes faltaban:
    expect(find(mtr.hijos, "PROP-MTR-BLK")).toBeTruthy(); // tren alternativo (cigüeñal, cojinetes)
    expect(find(mtr.hijos, "PROP-MTR-SW")).toBeTruthy();  // refrigeración agua de mar
    expect(find(mtr.hijos, "PROP-MTR-EXH")).toBeTruthy(); // escape (codo húmedo)
    expect(find(mtr.hijos, "PROP-MTR-AIR")).toBeTruthy(); // admisión + aftercooler
  });

  it("Motor Generador: taxonomía marina (versión liviana) + alternador", () => {
    const gmtr = find(find(PLANTILLA_PESQUERA, "GEN").hijos, "GEN-MTR");
    expect(gmtr.hijos).toHaveLength(10);
    expect(find(gmtr.hijos, "GEN-MTR-SW")).toBeTruthy();  // agua de mar
    expect(find(gmtr.hijos, "GEN-MTR-ALT")).toBeTruthy(); // alternador eléctrico
    expect(countComp(gmtr)).toBeGreaterThan(0);
  });

  it("modo Básico carga menos nodos que Completo y poda subsistemas de overhaul", () => {
    const basico = contarNodosPlantilla("basico");
    const completo = contarNodosPlantilla("completo");
    expect(basico).toBeGreaterThan(0);
    expect(basico).toBeLessThan(completo);
    // El Bloque y Tren Alternativo es 100% avanzado → se poda entero en Básico.
    const mtr = find(find(PLANTILLA_PESQUERA, "PROP").hijos, "PROP-MTR");
    const blk = find(mtr.hijos, "PROP-MTR-BLK");
    expect(nodoIncluido(blk, "basico")).toBe(false);
    expect(nodoIncluido(blk, "completo")).toBe(true);
    // El Agua de Mar tiene ítems esenciales (impeller, ánodos) → se incluye en Básico.
    expect(nodoIncluido(find(mtr.hijos, "PROP-MTR-SW"), "basico")).toBe(true);
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

  it("incluye los sistemas de seguridad/ambientales/operativos de un pesquero", () => {
    const cods = PLANTILLA_PESQUERA.map((s) => s.cod);
    // Tier 1 (reglamentario): gobierno, contraincendios, achique, MARPOL
    for (const c of ["STEER", "FIRE", "BILGE", "ENV"]) expect(cods).toContain(c);
    // Tier 2 (operativo): fondeo, comunicaciones GMDSS, HVAC, viveros
    for (const c of ["ANCH", "COMM", "HVAC", "CATCH"]) expect(cods).toContain(c);
    // Tier 3 (habitabilidad)
    expect(cods).toContain("HOTEL");
  });

  it("Equipo de Pesca está adaptado a trampas/centolla (virador, trampas, viveros)", () => {
    const fish = find(PLANTILLA_PESQUERA, "FISH");
    const fcods = fish.hijos.map((h) => h.cod);
    expect(fcods).toContain("FISH-VIR"); // virador de trampas
    expect(fcods).toContain("FISH-TRA"); // trampas / nasas
    expect(find(PLANTILLA_PESQUERA, "CATCH").hijos.some((h) => h.cod === "CATCH-VIV")).toBe(true); // viveros
  });

  it("la plantilla precarga planes PM válidos (horas > 0, o calendario con unidad válida)", () => {
    expect(contarPlanesPMPlantilla()).toBeGreaterThan(0);
    // Dos formatos documentados: [desc, horas] (disparador horas)
    // y [desc, null, unidad] (disparador calendario).
    const UNIDADES = new Set(["diario", "semanal", "mensual", "trimestral", "semestral", "anual"]);
    const ok = (nodos) => (nodos || []).every(
      (n) => (n.pm || []).every(([d, h, u]) =>
        typeof d === "string" && d.length > 0 &&
        (u == null ? h > 0 : h == null && UNIDADES.has(u))
      ) && ok(n.hijos));
    expect(ok(PLANTILLA_PESQUERA)).toBe(true);
  });

  it("cada repuesto declara un tipo válido", () => {
    const tipos = new Set(["oem", "alternativo", "generico"]);
    const ok = (nodos) => (nodos || []).every(
      (n) => (n.rep || []).every(([, , t]) => tipos.has(t)) && ok(n.hijos));
    expect(ok(PLANTILLA_PESQUERA)).toBe(true);
  });
});
