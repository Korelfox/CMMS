import { describe, it, expect } from "vitest";
import {
  tasaHorasDia,
  diasHastaPM,
  proyectarVencimientos,
  curvaCargaSemanal,
  ventanaPuerto,
  trabajosEnVentana,
  HH_DEFAULT_POR_PM,
} from "../src/lib/planificacion.js";

const HOY = "2026-06-12";
const EMB = "emb-1";

// ── tasaHorasDia ─────────────────────────────────────────────────────────────
describe("tasaHorasDia", () => {
  it("calcula tasa correcta con dos lecturas ordenadas desc", () => {
    const lecturas = [
      { equipo_id: "e1", horas: 1100, fecha: "2026-06-10" },
      { equipo_id: "e1", horas: 1000, fecha: "2026-06-01" },
    ];
    // 100h en 9 días ≈ 11.11 h/día
    expect(tasaHorasDia(lecturas)).toBeCloseTo(100 / 9, 4);
  });

  it("ignora el orden — toma las dos últimas por fecha", () => {
    const lecturas = [
      { equipo_id: "e1", horas: 1000, fecha: "2026-06-01" },  // más antigua, al frente
      { equipo_id: "e1", horas: 1100, fecha: "2026-06-10" },
    ];
    expect(tasaHorasDia(lecturas)).toBeCloseTo(100 / 9, 4);
  });

  it("delta negativo → null (sensor reseteado)", () => {
    const lecturas = [
      { equipo_id: "e1", horas: 500, fecha: "2026-06-10" },
      { equipo_id: "e1", horas: 1000, fecha: "2026-06-01" },
    ];
    expect(tasaHorasDia(lecturas)).toBeNull();
  });

  it("menos de 2 lecturas → null", () => {
    expect(tasaHorasDia([{ horas: 100, fecha: "2026-06-01" }])).toBeNull();
    expect(tasaHorasDia([])).toBeNull();
    expect(tasaHorasDia()).toBeNull();
  });
});

// ── diasHastaPM ───────────────────────────────────────────────────────────────
describe("diasHastaPM", () => {
  it("PM calendario: días directamente desde elapsed/limite", () => {
    const pe = { elapsed: 20, limite: 30, esCalendario: true };
    expect(diasHastaPM(pe)).toBe(10);
  });

  it("PM calendario vencido: resultado negativo", () => {
    const pe = { elapsed: 35, limite: 30, esCalendario: true };
    expect(diasHastaPM(pe)).toBe(-5);
  });

  it("PM por horas con tasa: h restantes / tasa = días", () => {
    const pe = { elapsed: 200, limite: 300, esCalendario: false };
    expect(diasHastaPM(pe, 10)).toBeCloseTo(10, 4); // 100h / 10 h/día
  });

  it("PM por horas sin tasa → null", () => {
    const pe = { elapsed: 200, limite: 300, esCalendario: false };
    expect(diasHastaPM(pe, null)).toBeNull();
    expect(diasHastaPM(pe, 0)).toBeNull();
  });

  it("limite <= 0 → null", () => {
    expect(diasHastaPM({ elapsed: 0, limite: 0, esCalendario: true })).toBeNull();
    expect(diasHastaPM(null)).toBeNull();
  });
});

// ── proyectarVencimientos ─────────────────────────────────────────────────────
describe("proyectarVencimientos", () => {
  const equipo1 = { id: "eq1", embarcacion_id: EMB, sistema: "Motor principal" };
  const equipo2 = { id: "eq2", embarcacion_id: EMB, sistema: "Hélice" };

  const planesEval = [
    { plan: { id: "p1", descripcion: "Cambio aceite" }, equipo: equipo1, elapsed: 25, limite: 30, esCalendario: true, tone: "yellow", label: "5d restantes" },
    { plan: { id: "p2", descripcion: "Rev hélice" },    equipo: equipo2, elapsed: 800, limite: 1000, esCalendario: false, tone: "green", label: "200h restantes" },
    { plan: { id: "p3", descripcion: "Sin tasa" },      equipo: { id: "eq3", embarcacion_id: EMB }, elapsed: 50, limite: 100, esCalendario: false, tone: "green", label: "50h" },
  ];

  it("proyecta planes calendario y por horas (con tasa), omite sin tasa", () => {
    const tasas = new Map([["eq1", 1], ["eq2", 20]]);
    const result = proyectarVencimientos(planesEval, tasas, HOY);
    const ids = result.map((p) => p.plan.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
    expect(ids).not.toContain("p3"); // eq3 sin tasa, plan por horas
  });

  it("ordena por diasHasta ascendente", () => {
    const tasas = new Map([["eq1", 1], ["eq2", 20]]);
    const result = proyectarVencimientos(planesEval, tasas, HOY);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].diasHasta).toBeLessThanOrEqual(result[i].diasHasta);
    }
  });

  it("añade diasHasta y fechaEstimada a cada proyección", () => {
    const tasas = new Map([["eq1", 1]]);
    const result = proyectarVencimientos(planesEval, tasas, HOY);
    const p1 = result.find((p) => p.plan.id === "p1");
    expect(p1.diasHasta).toBe(5);
    expect(p1.fechaEstimada).toBe("2026-06-17");
  });

  it("planesEval vacío → []", () => {
    expect(proyectarVencimientos([], new Map(), HOY)).toHaveLength(0);
  });
});

// ── curvaCargaSemanal ─────────────────────────────────────────────────────────
describe("curvaCargaSemanal", () => {
  it("agrupa PMs por semana correctamente", () => {
    // Hoy = 2026-06-12 (viernes). Semana 1: 12 jun → 19 jun
    const proyecciones = [
      { plan: { id: "p1" }, fechaEstimada: "2026-06-13", diasHasta: 1 }, // semana 1
      { plan: { id: "p2" }, fechaEstimada: "2026-06-14", diasHasta: 2 }, // semana 1
      { plan: { id: "p3" }, fechaEstimada: "2026-06-21", diasHasta: 9 }, // semana 2
    ];
    const curva = curvaCargaSemanal(proyecciones, HOY, 4);
    expect(curva[0].count).toBe(2);
    expect(curva[1].count).toBe(1);
    expect(curva[2].count).toBe(0);
    expect(curva).toHaveLength(4);
  });

  it("hhTotal = count × hhPorPM", () => {
    const prs = [{ plan: { id: "p1" }, fechaEstimada: "2026-06-13", diasHasta: 1 }];
    const curva = curvaCargaSemanal(prs, HOY, 2, HH_DEFAULT_POR_PM);
    expect(curva[0].hhTotal).toBe(HH_DEFAULT_POR_PM);
  });

  it("marca pico cuando count >= 75% del máximo y máximo > 2", () => {
    const prs = Array.from({ length: 4 }, (_, i) => ({
      plan: { id: `p${i}` }, fechaEstimada: "2026-06-13", diasHasta: 1,
    }));
    prs.push({ plan: { id: "p5" }, fechaEstimada: "2026-06-21", diasHasta: 9 }); // semana 2 = 1 PM
    const curva = curvaCargaSemanal(prs, HOY, 4);
    // max = 4, semana 1 (4) >= 3 → pico. Semana 2 (1) < 3 → no pico
    expect(curva[0].esPico).toBe(true);
    expect(curva[1].esPico).toBe(false);
  });

  it("proyecciones vacías → todas las semanas con count=0", () => {
    const curva = curvaCargaSemanal([], HOY, 4);
    curva.forEach((w) => expect(w.count).toBe(0));
  });
});

// ── ventanaPuerto ─────────────────────────────────────────────────────────────
describe("ventanaPuerto", () => {
  const mareaRecalada = {
    id: "m1", embarcacion_id: EMB,
    zarpe_at: "2026-05-01T08:00:00Z",
    recalada_at: "2026-06-10T08:00:00Z",
    estado: "cerrada",
  };
  const mareaAnterior = {
    id: "m0", embarcacion_id: EMB,
    zarpe_at: "2026-04-01T08:00:00Z",
    recalada_at: "2026-04-25T08:00:00Z",
    estado: "cerrada",
  };

  it("nave en puerto: detecta recalada sin estado navegando", () => {
    const r = ventanaPuerto([mareaRecalada, mareaAnterior], EMB, HOY);
    expect(r.enPuerto).toBe(true);
    expect(r.inicio).toBe("2026-06-10");
    expect(r.diasEnPuerto).toBeGreaterThan(0);
  });

  it("nave en mar: estado navegando, retorna proximaRecalada estimada", () => {
    const navegando = { ...mareaRecalada, estado: "navegando" };
    const r = ventanaPuerto([navegando, mareaAnterior], EMB, HOY);
    expect(r.enPuerto).toBe(false);
    expect(r.proximaRecalada).toBeTruthy();
  });

  it("duracionTipica es mediana de los gaps en puerto históricos", () => {
    // gap entre mareaAnterior.recalada → mareaRecalada.zarpe = aprox. 6 días
    const r = ventanaPuerto([mareaRecalada, mareaAnterior], EMB, HOY);
    expect(r.duracionTipica).toBeGreaterThan(0);
  });

  it("sin mareas → enPuerto:true, duracionTipica=5 (default)", () => {
    const r = ventanaPuerto([], EMB, HOY);
    expect(r.enPuerto).toBe(true);
    expect(r.duracionTipica).toBe(5);
  });

  it("filtra mareas de otra nave", () => {
    const otraEmb = { ...mareaRecalada, embarcacion_id: "otra" };
    const r = ventanaPuerto([otraEmb], EMB, HOY);
    expect(r.enPuerto).toBe(true);
    expect(r.inicio).toBeNull();
  });
});

// ── trabajosEnVentana ─────────────────────────────────────────────────────────
describe("trabajosEnVentana", () => {
  const equipo = { id: "eq1", embarcacion_id: EMB };

  const proyecciones = [
    { plan: { id: "p1" }, equipo, diasHasta: 3, fechaEstimada: "2026-06-15" },
    { plan: { id: "p2" }, equipo, diasHasta: 10, fechaEstimada: "2026-06-22" },
    { plan: { id: "p3" }, equipo: { id: "eq3", embarcacion_id: "otra" }, diasHasta: 2, fechaEstimada: "2026-06-14" }, // otra nave
  ];

  const ots = [
    { id: "o1", embarcacion_id: EMB, estado: "pendiente", horas_estimadas: 8 },
    { id: "o2", embarcacion_id: EMB, estado: "cerrada",   horas_estimadas: 4 }, // cerrada, no cuenta
    { id: "o3", embarcacion_id: "otra", estado: "pendiente", horas_estimadas: 6 }, // otra nave
  ];

  it("incluye solo PMs dentro del horizonte de la nave correcta", () => {
    const r = trabajosEnVentana(proyecciones, ots, EMB, 5, 40, HOY);
    expect(r.pms.map((p) => p.plan.id)).toEqual(["p1"]);
  });

  it("incluye solo OTs pendientes de la nave", () => {
    const r = trabajosEnVentana(proyecciones, ots, EMB, 5, 40, HOY);
    expect(r.ots.map((o) => o.id)).toEqual(["o1"]);
  });

  it("hhTotal = PMs×hhPorPM + suma horas_estimadas OTs", () => {
    const r = trabajosEnVentana(proyecciones, ots, EMB, 5, 40, HOY, 4);
    expect(r.hhPMs).toBe(4);   // 1 PM × 4h
    expect(r.hhOTs).toBe(8);   // 1 OT × 8h
    expect(r.hhTotal).toBe(12);
  });

  it("sobreCarga=true cuando hhTotal > hhDisponibles", () => {
    const r = trabajosEnVentana(proyecciones, ots, EMB, 5, 10, HOY, 4);
    expect(r.sobreCarga).toBe(true);
  });

  it("sobreCarga=false cuando hhDisponibles=0 (no se puede calcular)", () => {
    const r = trabajosEnVentana(proyecciones, ots, EMB, 5, 0, HOY, 4);
    expect(r.sobreCarga).toBe(false);
  });

  it("proyecciones y ots vacíos → ceros sin error", () => {
    const r = trabajosEnVentana([], [], EMB, 14, 100, HOY);
    expect(r.hhTotal).toBe(0);
    expect(r.sobreCarga).toBe(false);
  });
});
