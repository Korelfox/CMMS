import { describe, it, expect } from "vitest";
import {
  calcCT, catCT, cgmCalcular, TASA_INV,
  gammaFunc, calcMTBF, calcTsOpt, decidir,
} from "../src/lib/calculos.js";

describe("Criticidad · CT", () => {
  it("CT = frec × (prod+seg+amb+costo)", () => {
    expect(calcCT({ frec: 4, prod: 5, seg: 3, amb: 2, costo: 4 })).toBe(4 * (5 + 3 + 2 + 4)); // 56
  });
  it("tolera campos faltantes (0)", () => {
    expect(calcCT({})).toBe(0);
    expect(calcCT({ frec: 3 })).toBe(0); // sin las otras dimensiones
  });
  it("categoriza: ≥50 Alta, 20-49 Media, <20 Baja", () => {
    expect(catCT(56)).toEqual(["red", "Alta"]);
    expect(catCT(30)).toEqual(["yellow", "Media"]);
    expect(catCT(10)).toEqual(["green", "Baja"]);
    expect(catCT(50)[1]).toBe("Alta");   // límite inferior de Alta
    expect(catCT(19)[1]).toBe("Baja");
  });
});

describe("CGM · costo global (Pascual)", () => {
  it("Cg = Ci + Cf + Ca + Ai", () => {
    const c = { hh_c: 2, hh_p: 1, c_hh: 10000, rep: 5000, fung: 1000, hrs_par: 4, val_prod: 40000, g_extra: 5000, val_inv: 12000, val_eq: 600000, vida: 10 };
    const r = cgmCalcular(c);
    expect(r.Ci).toBe((2 + 1) * 10000 + 5000 + 1000);       // 36000
    expect(r.Cf).toBe(4 * 40000 + 5000);                     // 165000
    expect(r.Ca).toBeCloseTo((12000 * TASA_INV) / 12);       // 200
    expect(r.Ai).toBeCloseTo(600000 / (10 * 12));            // 5000
    expect(r.total).toBeCloseTo(r.Ci + r.Cf + r.Ca + r.Ai);
  });
  it("Ai = 0 si no hay vida útil (evita división rara)", () => {
    expect(cgmCalcular({ val_eq: 600000, vida: 0 }).Ai).toBe(0);
  });
  it("todo en cero da total 0 (ítem sin configurar)", () => {
    expect(cgmCalcular({}).total).toBe(0);
  });
});

describe("Weibull · confiabilidad", () => {
  it("Γ(n) = (n-1)! para enteros", () => {
    expect(gammaFunc(5)).toBeCloseTo(24, 4);   // 4!
    expect(gammaFunc(1)).toBeCloseTo(1, 6);
  });
  it("MTBF con β=1 ≈ η (exponencial)", () => {
    expect(calcMTBF(1, 1000, 0)).toBeCloseTo(1000, 2); // Γ(2)=1
  });
  it("MTBF suma el umbral γ", () => {
    expect(calcMTBF(1, 1000, 200)).toBeCloseTo(1200, 2);
  });
  it("Ts* es null cuando β ≤ 1 (no hay óptimo PM)", () => {
    expect(calcTsOpt(1, 1000, 0, 50000, 12000)).toBeNull();
    expect(calcTsOpt(0.8, 1000, 0, 50000, 12000)).toBeNull();
  });
  it("Ts* positivo y menor que η con β>1 y r alto", () => {
    const ts = calcTsOpt(2.5, 1000, 0, 50000, 12000);
    expect(ts).toBeGreaterThan(0);
    expect(ts).toBeLessThan(1000);
  });
  it("decisión: β≤1 → Inspección", () => {
    expect(decidir(1, 1000, null, 4).tipo).toBe("Inspección");
  });
  it("decisión: MTBF bajo y r alto → Reemplazo", () => {
    expect(decidir(2, 150, 100, 5).tipo).toBe("Reemplazo");
  });
  it("decisión: β>1 con óptimo válido → PM Preventivo", () => {
    expect(decidir(2, 1000, 400, 2).tipo).toBe("PM Preventivo");
  });
});
