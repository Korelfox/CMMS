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
    // ISO 14224: el motor es equipo independiente (top-level), no subsistema de PROP
    const mtr = find(PLANTILLA_PESQUERA, "MTR");
    expect(mtr.tipo).toBe("sistema");
    expect(mtr.hijos).toHaveLength(10);
    expect(countComp(mtr)).toBeGreaterThanOrEqual(55);
    // Subsistemas marinos clave:
    expect(find(mtr.hijos, "MTR-BLK")).toBeTruthy(); // tren alternativo (cigüeñal, cojinetes)
    expect(find(mtr.hijos, "MTR-SW")).toBeTruthy();  // refrigeración agua de mar
    expect(find(mtr.hijos, "MTR-EXH")).toBeTruthy(); // escape (codo húmedo)
    expect(find(mtr.hijos, "MTR-AIR")).toBeTruthy(); // admisión + aftercooler
  });

  it("Motor Generador: equipo independiente con taxonomía marina + alternador", () => {
    // ISO 14224: el grupo electrógeno es equipo independiente (alimenta al
    // cuadro eléctrico, no es parte de él).
    const gmtr = find(PLANTILLA_PESQUERA, "GEN-MTR");
    expect(gmtr.tipo).toBe("sistema");
    expect(gmtr.hijos).toHaveLength(10);
    expect(find(gmtr.hijos, "GEN-MTR-SW")).toBeTruthy();  // agua de mar
    expect(find(gmtr.hijos, "GEN-MTR-ALT")).toBeTruthy(); // alternador eléctrico
    expect(countComp(gmtr)).toBeGreaterThan(0);
  });

  it("Motor de Emergencia: equipo independiente con 6 sistemas y arranque automático", () => {
    // ISO 14224: provee energía de emergencia; no es parte del cuadro de emergencia.
    const mem = find(PLANTILLA_PESQUERA, "GEN-EMG");
    expect(mem.tipo).toBe("sistema");
    expect(mem.hijos).toHaveLength(6);
    // Función vital: arranque automático por fallo de tensión.
    const ele = find(mem.hijos, "GEN-EMG-ELE");
    const ats = find(ele.hijos, "GEN-EMG-ELE-ATS");
    expect(ats).toBeTruthy();
    expect(ats.pm.some(([d]) => /arranque autom/i.test(d))).toBe(true);
    // Régimen de pocas horas → PM calendario (SOLAS prueba semanal/mensual).
    expect(countComp(mem)).toBeGreaterThanOrEqual(14);
  });

  it("modo Básico carga menos nodos que Completo y poda subsistemas de overhaul", () => {
    const basico = contarNodosPlantilla("basico");
    const completo = contarNodosPlantilla("completo");
    expect(basico).toBeGreaterThan(0);
    expect(basico).toBeLessThan(completo);
    // El Bloque y Tren Alternativo es 100% avanzado → se poda entero en Básico.
    const mtr = find(PLANTILLA_PESQUERA, "MTR");
    const blk = find(mtr.hijos, "MTR-BLK");
    expect(nodoIncluido(blk, "basico")).toBe(false);
    expect(nodoIncluido(blk, "completo")).toBe(true);
    // El Agua de Mar tiene ítems esenciales (impeller, ánodos) → se incluye en Básico.
    expect(nodoIncluido(find(mtr.hijos, "MTR-SW"), "basico")).toBe(true);
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
