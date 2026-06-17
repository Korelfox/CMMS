import { describe, it, expect } from "vitest";
import { validarLectura, tendenciaHorasDia, diasHasta, diasDesde, puntoHorometro, idsBajoPunto } from "../src/lib/horometro.js";

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

describe("herencia de horómetro (puntoHorometro / idsBajoPunto)", () => {
  // Motor (propio) → Lubricación (hereda) → Filtro (hereda); Mampáro (no)
  const eqs = [
    { id: "mtr", parent_id: null,  horometro: "propio" },
    { id: "lub", parent_id: "mtr", horometro: "hereda" },
    { id: "flt", parent_id: "lub", horometro: "hereda" },
    { id: "gen", parent_id: null,  horometro: "propio" },
    { id: "mam", parent_id: null,  horometro: "no" },
    { id: "nav", parent_id: null,  horometro: "hereda" }, // sin ancestro propio
  ];
  const byId = new Map(eqs.map((e) => [e.id, e]));

  it("un componente que hereda apunta a su máquina ('propio') más cercana", () => {
    expect(puntoHorometro(byId.get("flt"), byId)).toBe("mtr");
    expect(puntoHorometro(byId.get("lub"), byId)).toBe("mtr");
    expect(puntoHorometro(byId.get("mtr"), byId)).toBe("mtr"); // el propio es su propio punto
  });

  it("'no' y 'hereda' sin ancestro propio no tienen horómetro", () => {
    expect(puntoHorometro(byId.get("mam"), byId)).toBeNull();
    expect(puntoHorometro(byId.get("nav"), byId)).toBeNull();
  });

  it("idsBajoPunto = el propio + sus descendientes que heredan (sin tocar otra máquina ni 'no')", () => {
    const ids = idsBajoPunto("mtr", eqs, byId);
    expect(ids.sort()).toEqual(["flt", "lub", "mtr"]);
    expect(idsBajoPunto("gen", eqs, byId)).toEqual(["gen"]);
  });

  it("hereda vía horas_fuente_id cuando no hay ancestro propio (hermanos del motor)", () => {
    const prop = { id: "prop", parent_id: null, horometro: "hereda" };
    const mtr = { id: "mtr", parent_id: "prop", horometro: "propio" };
    const red = { id: "red", parent_id: "prop", horometro: "hereda", horas_fuente_id: "mtr" };
    const byIdProp = new Map([prop, mtr, red].map((e) => [e.id, e]));
    expect(puntoHorometro(red, byIdProp)).toBe("mtr");
    expect(idsBajoPunto("mtr", [prop, mtr, red], byIdProp).sort()).toEqual(["mtr", "red"]);
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
