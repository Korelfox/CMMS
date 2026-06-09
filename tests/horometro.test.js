import { describe, it, expect } from "vitest";
import { validarLectura, tendenciaHorasDia, diasHasta, diasDesde } from "../src/lib/horometro.js";

const dia = (n) => new Date(Date.UTC(2026, 5, n)); // junio 2026

describe("validarLectura", () => {
  it("rechaza valores no numéricos o negativos", () => {
    expect(validarLectura({ horas: "abc" }).ok).toBe(false);
    expect(validarLectura({ horas: -5 }).ok).toBe(false);
  });

  it("acepta la primera lectura (sin previa)", () => {
    expect(validarLectura({ horas: 1200 })).toEqual({ ok: true });
  });

  it("rechaza lecturas decrecientes (horómetro no retrocede)", () => {
    const r = validarLectura({ horasPrev: 1500, horas: 1400 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/menor que la anterior/);
  });

  it("acepta lectura igual a la anterior (equipo detenido)", () => {
    expect(validarLectura({ horasPrev: 1500, horas: 1500, fechaPrev: dia(1), fecha: dia(5) }).ok).toBe(true);
  });

  it("advierte si el ritmo supera 24 h/día", () => {
    // 300 h en 2 días (máx físico 48) → warning, pero ok:true
    const r = validarLectura({ horasPrev: 1000, horas: 1300, fechaPrev: dia(1), fecha: dia(3) });
    expect(r.ok).toBe(true);
    expect(r.warning).toMatch(/máximo físico/);
  });

  it("no advierte con ritmo normal (10 h/día)", () => {
    const r = validarLectura({ horasPrev: 1000, horas: 1050, fechaPrev: dia(1), fecha: dia(6) });
    expect(r).toEqual({ ok: true });
  });
});

describe("tendenciaHorasDia", () => {
  it("null con menos de 2 lecturas", () => {
    expect(tendenciaHorasDia([])).toBeNull();
    expect(tendenciaHorasDia([{ fecha: dia(1), horas: 100 }])).toBeNull();
  });

  it("calcula h/día entre primera y última lectura de la ventana", () => {
    const lecturas = [
      { fecha: dia(1), horas: 1000 },
      { fecha: dia(6), horas: 1050 }, // 50 h en 5 días
    ];
    expect(tendenciaHorasDia(lecturas)).toBeCloseTo(10, 5);
  });

  it("ordena por fecha aunque lleguen desordenadas", () => {
    const lecturas = [
      { fecha: dia(6), horas: 1050 },
      { fecha: dia(1), horas: 1000 },
    ];
    expect(tendenciaHorasDia(lecturas)).toBeCloseTo(10, 5);
  });

  it("usa solo las últimas n lecturas", () => {
    const lecturas = [
      { fecha: dia(1), horas: 0 },     // vieja época de uso intenso
      { fecha: dia(10), horas: 900 },
      { fecha: dia(20), horas: 1000 }, // últimas 2: 100 h en 10 días
    ];
    expect(tendenciaHorasDia(lecturas, 2)).toBeCloseTo(10, 5);
  });
});

describe("diasHasta / diasDesde", () => {
  it("proyecta días hasta el objetivo", () => {
    expect(diasHasta(1000, 1100, 10)).toBeCloseTo(10, 5);
    expect(diasHasta(1100, 1100, 10)).toBe(0);   // ya alcanzado
    expect(diasHasta(1000, 1100, 0)).toBeNull(); // sin tendencia
  });

  it("diasDesde mide antigüedad de la lectura", () => {
    expect(diasDesde(dia(1), dia(8))).toBeCloseTo(7, 5);
    expect(diasDesde(null)).toBeNull();
  });
});
