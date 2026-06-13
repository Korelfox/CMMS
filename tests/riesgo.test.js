import { describe, it, expect } from "vitest";
import {
  mtbfDias,
  diasDesdeUltimaFalla,
  correctivasRecientes,
  scoreRiesgoEquipo,
  riesgoFlota,
} from "../src/lib/riesgo.js";

const HOY  = "2026-06-12";
const EQ1  = "eq-1";
const EMB1 = "emb-1";

const equipo = { id: EQ1, embarcacion_id: EMB1, sistema: "Motor principal", criticidad: "A" };
const equipoB = { id: "eq-2", embarcacion_id: EMB1, sistema: "Hélice", criticidad: "B" };

// OTs base para tests
const otsBase = [
  { id: "o1", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-10" },
  { id: "o2", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-03-15" },
  { id: "o3", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-05-20" },
  { id: "o4", equipo_id: EQ1, tipo: "preventivo", estado: "cerrada", fecha: "2026-02-01" }, // preventivo, no cuenta
  { id: "o5", equipo_id: "eq-99", tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01" }, // otro equipo
];

// ── mtbfDias ──────────────────────────────────────────────────────────────────
describe("mtbfDias", () => {
  it("calcula el MTBF promedio entre fallas", () => {
    // o1→o2: 64d, o2→o3: 66d → media ≈ 65d
    const r = mtbfDias(otsBase, EQ1);
    expect(r).toBeCloseTo(65, 0);
  });

  it("ignora preventivas y otros equipos", () => {
    const ots = [
      { id: "x1", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01" },
      { id: "x2", equipo_id: EQ1, tipo: "preventivo", estado: "cerrada", fecha: "2026-02-01" },
      { id: "x3", equipo_id: "otro", tipo: "correctivo", estado: "cerrada", fecha: "2026-03-01" },
    ];
    expect(mtbfDias(ots, EQ1)).toBeNull(); // solo 1 correctiva para EQ1
  });

  it("menos de 2 fallas → null", () => {
    expect(mtbfDias([otsBase[0]], EQ1)).toBeNull();
    expect(mtbfDias([], EQ1)).toBeNull();
  });
});

// ── diasDesdeUltimaFalla ──────────────────────────────────────────────────────
describe("diasDesdeUltimaFalla", () => {
  it("días desde última falla correctiva cerrada", () => {
    // última = 2026-05-20, hoy = 2026-06-12 → 23 días
    expect(diasDesdeUltimaFalla(otsBase, EQ1, HOY)).toBeCloseTo(23, 0);
  });

  it("ignora preventivas", () => {
    const ots = [{ id: "p1", equipo_id: EQ1, tipo: "preventivo", estado: "cerrada", fecha: "2026-06-01" }];
    expect(diasDesdeUltimaFalla(ots, EQ1, HOY)).toBeNull();
  });

  it("sin fallas → null", () => {
    expect(diasDesdeUltimaFalla([], EQ1, HOY)).toBeNull();
  });
});

// ── correctivasRecientes ──────────────────────────────────────────────────────
describe("correctivasRecientes", () => {
  it("cuenta fallas en el período", () => {
    // Las 3 OTs correctivas de EQ1 están en 2026 (dentro de 365d desde 2026-06-12)
    expect(correctivasRecientes(otsBase, EQ1, 365, HOY)).toBe(3);
  });

  it("excluye fallas fuera del período", () => {
    const ots = [
      { id: "a", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2024-06-01" }, // > 365d
      { id: "b", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01" }, // dentro
    ];
    expect(correctivasRecientes(ots, EQ1, 365, HOY)).toBe(1);
  });

  it("no cuenta otros equipos ni abiertas", () => {
    const ots = [
      { id: "c", equipo_id: "otro", tipo: "correctivo", estado: "cerrada",    fecha: "2026-01-01" },
      { id: "d", equipo_id: EQ1,   tipo: "correctivo", estado: "en_proceso", fecha: "2026-01-01" },
    ];
    expect(correctivasRecientes(ots, EQ1, 365, HOY)).toBe(0);
  });
});

// ── scoreRiesgoEquipo ─────────────────────────────────────────────────────────
describe("scoreRiesgoEquipo", () => {
  it("PM vencido (rojo) sube el score, criticidad A amplifica", () => {
    const planesEvalEquipo = [
      { plan: { id: "p1", descripcion: "Cambio aceite" }, tone: "red", equipo },
    ];
    const r = scoreRiesgoEquipo({ equipo, planesEvalEquipo, otsFalla: [], hoy: HOY });
    expect(r.zona).toBe("roja");
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.motivos[0]).toMatch(/vencido/i);
  });

  it("PM amarillo sin otras señales → zona amarilla", () => {
    const planesEvalEquipo = [
      { plan: { id: "p2", descripcion: "Rev. general" }, tone: "yellow", equipo: equipoB },
    ];
    const r = scoreRiesgoEquipo({ equipo: equipoB, planesEvalEquipo, otsFalla: [], hoy: HOY });
    expect(r.zona).toBe("amarilla");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(60);
  });

  it("sin planes ni fallas → zona verde, score 0", () => {
    const r = scoreRiesgoEquipo({ equipo: equipoB, planesEvalEquipo: [], otsFalla: [], hoy: HOY });
    expect(r.zona).toBe("verde");
    expect(r.score).toBe(0);
  });

  it("MTBF superado acumula puntos adicionales", () => {
    // Simulamos equipo con última falla hace 80d y MTBF 65d → ratio > 1
    const otsConMTBF = [
      { id: "f1", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-12-01" }, // ~6 meses atrás
      { id: "f2", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-09-01" }, // ~3 meses antes de f1
    ];
    const r = scoreRiesgoEquipo({ equipo, planesEvalEquipo: [], otsFalla: otsConMTBF, hoy: HOY });
    // MTBF = ~91d, diasDesde = ~193d → ratio > 2 → 30 pts × 1.4 crit A
    expect(r.score).toBeGreaterThan(30);
    expect(r.zona).not.toBe("verde");
  });

  it("muchas fallas recientes acumulan puntos", () => {
    const muchasFallas = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`, equipo_id: EQ1, tipo: "correctivo", estado: "cerrada",
      fecha: `2026-0${i + 1}-01`,
    }));
    const r = scoreRiesgoEquipo({ equipo, planesEvalEquipo: [], otsFalla: muchasFallas, hoy: HOY });
    expect(r.nFallas12m).toBe(5);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ── riesgoFlota ───────────────────────────────────────────────────────────────
describe("riesgoFlota", () => {
  it("ordena por score descendente", () => {
    const equipos = [equipo, equipoB];
    const planesEval = [
      { plan: { id: "p1", descripcion: "Plan A" }, tone: "red", equipo },
    ];
    const result = riesgoFlota({ planesEval, ots: [], equipos, hoy: HOY });
    expect(result[0].equipo.id).toBe(EQ1);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("filtra por embId si se especifica", () => {
    const equipos = [equipo, { id: "eq-otra", embarcacion_id: "otra-nave", criticidad: "A", sistema: "X" }];
    const result = riesgoFlota({ planesEval: [], ots: [], equipos, embId: EMB1, hoy: HOY });
    expect(result.every((r) => r.equipo.embarcacion_id === EMB1)).toBe(true);
    expect(result.length).toBe(1);
  });

  it("sin equipos → []", () => {
    expect(riesgoFlota({ planesEval: [], ots: [], equipos: [], hoy: HOY })).toHaveLength(0);
  });
});
