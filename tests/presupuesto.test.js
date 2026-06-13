import { describe, it, expect } from "vitest";
import {
  gastoAnual,
  serieMensual,
  runRate,
  estadoPresupuesto,
  mesesHastaAgotamiento,
  presupuestoFlota,
} from "../src/lib/presupuesto.js";

const HOY  = "2026-06-12";
const ANIO = 2026;
const EMB1 = "emb-1";
const EMB2 = "emb-2";

const otsBase = [
  { id: "o1", embarcacion_id: EMB1, tipo: "preventivo",  estado: "cerrada",    fecha: "2026-01-15", costo_mo: 100_000, costo_mat: 50_000  },
  { id: "o2", embarcacion_id: EMB1, tipo: "correctivo",  estado: "cerrada",    fecha: "2026-03-10", costo_mo: 200_000, costo_mat: 80_000  },
  { id: "o3", embarcacion_id: EMB1, tipo: "correctivo",  estado: "en_proceso", fecha: "2026-05-01", costo_mo: 999_000, costo_mat: 0        }, // no cerrada
  { id: "o4", embarcacion_id: EMB2, tipo: "preventivo",  estado: "cerrada",    fecha: "2026-02-20", costo_mo:  60_000, costo_mat: 20_000  },
  { id: "o5", embarcacion_id: EMB1, tipo: "preventivo",  estado: "cerrada",    fecha: "2025-12-01", costo_mo:  40_000, costo_mat: 10_000  }, // año anterior
  { id: "o6", embarcacion_id: EMB1, tipo: "correctivo",  estado: "cerrada",    fecha: "2026-04-08", costo_mo: 150_000, costo_mat: 30_000  },
  { id: "o7", embarcacion_id: EMB1, tipo: "correctivo",  estado: "cerrada",    fecha: "2026-05-25", costo_mo: 120_000, costo_mat: 40_000  },
];

// ── gastoAnual ────────────────────────────────────────────────────────────────
describe("gastoAnual", () => {
  it("suma costos de OTs cerradas del año para la nave", () => {
    const r = gastoAnual(otsBase, EMB1, ANIO);
    // o1 prev: 150k, o2 corr: 280k, o6 corr: 180k, o7 corr: 160k
    expect(r.preventivo).toBe(150_000);
    expect(r.correctivo).toBe(280_000 + 180_000 + 160_000);
    expect(r.total).toBe(150_000 + 280_000 + 180_000 + 160_000);
  });

  it("excluye OTs no cerradas y de otro año", () => {
    const r = gastoAnual(otsBase, EMB1, ANIO);
    expect(r.total).not.toBeGreaterThan(800_000); // o3 (no cerrada) y o5 (2025) excluidos
  });

  it("embId null → suma toda la flota", () => {
    const r = gastoAnual(otsBase, null, ANIO);
    expect(r.total).toBeGreaterThan(gastoAnual(otsBase, EMB1, ANIO).total);
  });

  it("sin OTs → todos en 0", () => {
    const r = gastoAnual([], EMB1, ANIO);
    expect(r.total).toBe(0);
    expect(r.preventivo).toBe(0);
    expect(r.correctivo).toBe(0);
  });
});

// ── serieMensual ──────────────────────────────────────────────────────────────
describe("serieMensual", () => {
  it("genera N meses con cero donde no hay OTs", () => {
    const serie = serieMensual(otsBase, EMB1, HOY, 6);
    expect(serie).toHaveLength(6);
    const ene = serie.find((s) => s.mesKey === "2026-01");
    expect(ene?.preventivo).toBe(150_000);
  });

  it("mes sin OTs tiene total=0", () => {
    const serie = serieMensual(otsBase, EMB1, HOY, 6);
    const feb = serie.find((s) => s.mesKey === "2026-02");
    expect(feb?.total).toBe(0);
  });

  it("el mes más reciente incluye los últimos costos", () => {
    const serie = serieMensual(otsBase, EMB1, HOY, 6);
    const may = serie.find((s) => s.mesKey === "2026-05");
    expect(may?.correctivo).toBe(160_000); // o7: 120k+40k
  });

  it("excluye OTs de otras naves (EMB2 y no cerradas)", () => {
    const serie = serieMensual(otsBase, EMB1, HOY, 12);
    const total = serie.reduce((s, m) => s + m.total, 0);
    // o1(150k)+o2(280k)+o5(50k dec-25 dentro ventana)+o6(180k)+o7(160k) = 820k
    // excluye o3(no cerrada), o4(EMB2)
    expect(total).toBe(820_000);
  });
});

// ── runRate ───────────────────────────────────────────────────────────────────
describe("runRate", () => {
  it("promedia gasto en ventana de meses", () => {
    // últimos 3 meses (abr+may+jun): o6(180k) + o7(160k) = 340k / 3 ≈ 113k/mes
    const r = runRate(otsBase, EMB1, HOY, 3);
    expect(r.mensual).toBeCloseTo(340_000 / 3, -1);
    expect(r.anualProyectado).toBeCloseTo((340_000 / 3) * 12, -1);
  });

  it("sin OTs → mensual=0", () => {
    const r = runRate([], EMB1, HOY, 3);
    expect(r.mensual).toBe(0);
    expect(r.anualProyectado).toBe(0);
    expect(r.mesesConData).toBe(0);
  });
});

// ── estadoPresupuesto ─────────────────────────────────────────────────────────
describe("estadoPresupuesto", () => {
  it("gasto dentro de lo esperado → zona ok", () => {
    // A mediados de junio (~46% del año), con presupuesto 1M, esperado ~460k
    // gasto 400k → ok
    const r = estadoPresupuesto(400_000, 1_000_000, HOY, ANIO);
    expect(r.zona).toBe("ok");
    expect(r.porcentaje).toBeCloseTo(40, 0);
    expect(r.desviacion).toBeLessThan(0); // bajo lo esperado
  });

  it("leve sobregasto → zona atención (≤5%)", () => {
    // esperado ~460k, gasto 490k → desviacion ~30k / 1M = 3% → atención
    const r = estadoPresupuesto(490_000, 1_000_000, HOY, ANIO);
    expect(r.zona).toBe("atención");
  });

  it("sobregasto crítico (>5%) → zona critico", () => {
    // gasto 600k con esperado ~460k → desviacion 140k / 1M = 14% → critico
    const r = estadoPresupuesto(600_000, 1_000_000, HOY, ANIO);
    expect(r.zona).toBe("critico");
  });

  it("sin presupuesto → zona sin-dato", () => {
    const r = estadoPresupuesto(500_000, 0, HOY, ANIO);
    expect(r.zona).toBe("sin-dato");
    expect(r.porcentaje).toBeNull();
  });
});

// ── mesesHastaAgotamiento ─────────────────────────────────────────────────────
describe("mesesHastaAgotamiento", () => {
  it("saldo / mensual = meses restantes", () => {
    // 1M presupuesto, 400k gastado → saldo 600k, mensual 100k → 6 meses
    expect(mesesHastaAgotamiento(400_000, 1_000_000, 100_000)).toBeCloseTo(6, 1);
  });

  it("ya agotado → 0", () => {
    expect(mesesHastaAgotamiento(1_100_000, 1_000_000, 100_000)).toBe(0);
  });

  it("sin presupuesto → null", () => {
    expect(mesesHastaAgotamiento(400_000, 0, 100_000)).toBeNull();
  });

  it("run-rate cero → null", () => {
    expect(mesesHastaAgotamiento(400_000, 1_000_000, 0)).toBeNull();
  });
});

// ── presupuestoFlota ──────────────────────────────────────────────────────────
describe("presupuestoFlota", () => {
  const embarcaciones = [
    { id: EMB1, nombre: "Nave 1" },
    { id: EMB2, nombre: "Nave 2" },
  ];
  const pptoMap = new Map([[EMB1, 1_000_000], [EMB2, 500_000]]);

  it("retorna una entrada por embarcación", () => {
    const r = presupuestoFlota({ ots: otsBase, embarcaciones, presupuestosMap: pptoMap, hoy: HOY, anio: ANIO });
    expect(r).toHaveLength(2);
    const n1 = r.find((e) => e.emb.id === EMB1);
    expect(n1.ppto).toBe(1_000_000);
    expect(n1.gasto.total).toBeGreaterThan(0);
  });

  it("nave sin presupuesto → estado sin-dato", () => {
    const r = presupuestoFlota({ ots: otsBase, embarcaciones, presupuestosMap: new Map(), hoy: HOY, anio: ANIO });
    expect(r.every((e) => e.estado.zona === "sin-dato")).toBe(true);
  });

  it("embarcaciones vacías → []", () => {
    expect(presupuestoFlota({ ots: otsBase, embarcaciones: [], presupuestosMap: pptoMap, hoy: HOY, anio: ANIO })).toHaveLength(0);
  });
});
