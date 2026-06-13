import { describe, it, expect } from "vitest";
import {
  factorRecuperacionCapital,
  caeReemplazo,
  caeMantener,
  historialReparaciones,
  analizarEquipoCapex,
  analizarFlotaCapex,
  SUPUESTOS_DEFECTO,
} from "../src/lib/capex.js";

const HOY = "2026-06-13";

// Helper: equipo con CAPEX configurado.
function equipo(over = {}) {
  return {
    id: "eq1",
    embarcacion_id: "emb1",
    sistema: "Motor principal",
    anio: "2010",
    tipo_nodo: "componente",
    ficha: { capex: { valor_reemplazo: 50_000_000, vida_util_anios: 15, valor_residual_pct: 10 } },
    ...over,
  };
}

function ot(over = {}) {
  return {
    equipo_id: "eq1", tipo: "correctivo", estado: "cerrada",
    fecha: "2026-01-15", costo_mo: 500_000, costo_mat: 500_000, mttr_horas: 24,
    ...over,
  };
}

// ── factorRecuperacionCapital ─────────────────────────────────────────────────
describe("factorRecuperacionCapital", () => {
  it("con tasa 0 devuelve 1/n", () => {
    expect(factorRecuperacionCapital(0, 10)).toBeCloseTo(0.1, 6);
  });

  it("calcula CRF estándar (10% a 10 años ≈ 0.16275)", () => {
    expect(factorRecuperacionCapital(10, 10)).toBeCloseTo(0.162745, 5);
  });

  it("CRF mayor a menor plazo", () => {
    expect(factorRecuperacionCapital(12, 5)).toBeGreaterThan(factorRecuperacionCapital(12, 20));
  });

  it("clampa n<1 a 1 año", () => {
    expect(factorRecuperacionCapital(0, 0)).toBe(1);
  });
});

// ── caeReemplazo ──────────────────────────────────────────────────────────────
describe("caeReemplazo", () => {
  it("crece con el CAPEX", () => {
    const a = caeReemplazo({ Cr: 10_000_000, vidaUtil: 15 });
    const b = caeReemplazo({ Cr: 50_000_000, vidaUtil: 15 });
    expect(b.cae).toBeGreaterThan(a.cae);
  });

  it("descuenta el valor residual del capital a recuperar", () => {
    const sinVR  = caeReemplazo({ Cr: 50_000_000, vidaUtil: 15, valorResidualPct: 0, tasa: 12 });
    const conVR  = caeReemplazo({ Cr: 50_000_000, vidaUtil: 15, valorResidualPct: 30, tasa: 12 });
    expect(conVR.cae).toBeLessThan(sinVR.cae);
    expect(conVR.valorResidual).toBe(15_000_000);
  });

  it("la mantención del equipo nuevo aplica el ahorro esperado", () => {
    const r = caeReemplazo({ Cr: 50_000_000, vidaUtil: 15, repAnual: 4_000_000, ahorroMantencion: 75 });
    expect(r.omNuevoAnual).toBe(1_000_000); // 25% de 4M
  });
});

// ── caeMantener ───────────────────────────────────────────────────────────────
describe("caeMantener", () => {
  it("escala la reparación con la edad relativa", () => {
    const joven = caeMantener({ repAnual: 1_000_000, edad: 0, vidaUtil: 15, escalada: 8 });
    const viejo = caeMantener({ repAnual: 1_000_000, edad: 15, vidaUtil: 15, escalada: 8 });
    expect(viejo.repProyectado).toBeGreaterThan(joven.repProyectado);
    expect(joven.repProyectado).toBe(1_000_000); // edad 0 ⇒ sin escalada
  });

  it("suma lucro cesante cuando hay margen/día", () => {
    const r = caeMantener({ repAnual: 1_000_000, edad: 10, vidaUtil: 15, diasParadoAnual: 5, margenDia: 2_000_000 });
    expect(r.lucroAnual).toBe(10_000_000);
    expect(r.cae).toBe(r.repProyectado + 10_000_000);
  });

  it("sin margen/día el lucro es cero", () => {
    const r = caeMantener({ repAnual: 1_000_000, diasParadoAnual: 5, margenDia: null });
    expect(r.lucroAnual).toBe(0);
  });
});

// ── historialReparaciones ─────────────────────────────────────────────────────
describe("historialReparaciones", () => {
  it("acumula costo correctivo y cuenta eventos", () => {
    const ots = [
      ot({ fecha: "2026-01-10", costo_mo: 300_000, costo_mat: 200_000 }),
      ot({ fecha: "2025-06-10", costo_mo: 400_000, costo_mat: 100_000 }),
    ];
    const h = historialReparaciones(ots, "eq1", HOY);
    expect(h.repAcum).toBe(1_000_000);
    expect(h.nEventos).toBe(2);
  });

  it("ignora OTs de otro equipo, preventivas o abiertas", () => {
    const ots = [
      ot(),
      ot({ equipo_id: "otro" }),
      ot({ tipo: "preventivo" }),
      ot({ estado: "abierta" }),
    ];
    const h = historialReparaciones(ots, "eq1", HOY);
    expect(h.nEventos).toBe(1);
  });

  it("anualiza por la ventana reciente y suma días parados", () => {
    const ots = [ot({ fecha: "2026-03-01", mttr_horas: 48 })]; // 2 días, dentro de 12m
    const h = historialReparaciones(ots, "eq1", HOY, 12);
    expect(h.nEventosVentana).toBe(1);
    expect(h.diasParadoAnual).toBe(2);
  });

  it("sin eventos recientes cae al promedio histórico", () => {
    const ots = [ot({ fecha: "2020-01-01", costo_mo: 1_000_000, costo_mat: 0, mttr_horas: 24 })];
    const h = historialReparaciones(ots, "eq1", HOY, 12);
    expect(h.nEventosVentana).toBe(0);
    expect(h.repAcum).toBe(1_000_000);
    expect(h.repAnual).toBeGreaterThan(0);       // promedio sobre ~6 años
    expect(h.repAnual).toBeLessThan(1_000_000);
    expect(h.diasParadoAnual).toBe(0);
  });
});

// ── analizarEquipoCapex ───────────────────────────────────────────────────────
describe("analizarEquipoCapex", () => {
  it("sin CAPEX configurado devuelve estado sin_configurar", () => {
    const eq = equipo({ ficha: {} });
    const r = analizarEquipoCapex({ equipo: eq, ots: [], hoy: HOY });
    expect(r.estado).toBe("sin_configurar");
    expect(r.recomendacion).toBeNull();
  });

  it("recomienda REEMPLAZAR cuando lo acumulado supera el valor de reemplazo", () => {
    const ots = Array.from({ length: 60 }, (_, i) =>
      ot({ fecha: `2026-0${(i % 9) + 1}-01`, costo_mo: 1_000_000, costo_mat: 0 }));
    const r = analizarEquipoCapex({ equipo: equipo(), ots, hoy: HOY });
    expect(r.recomendacion).toBe("reemplazar");
    expect(r.ratioAcum).toBeGreaterThanOrEqual(1);
  });

  it("recomienda REPARAR un equipo nuevo y sano", () => {
    const eqNuevo = equipo({ anio: "2025", ficha: { capex: { valor_reemplazo: 50_000_000, vida_util_anios: 15 } } });
    const r = analizarEquipoCapex({ equipo: eqNuevo, ots: [], hoy: HOY });
    expect(r.recomendacion).toBe("reparar");
    expect(r.hist.repAcum).toBe(0);
  });

  it("fuerza REEMPLAZAR si la edad supera 1.2× la vida útil", () => {
    const viejo = equipo({ anio: "2000", ficha: { capex: { valor_reemplazo: 50_000_000, vida_util_anios: 15 } } });
    const r = analizarEquipoCapex({ equipo: viejo, ots: [], hoy: HOY });
    expect(r.finVidaUtil).toBe(true);
    expect(r.recomendacion).toBe("reemplazar");
  });

  it("calcula payback cuando reemplazar ahorra", () => {
    const ots = Array.from({ length: 24 }, (_, i) =>
      ot({ fecha: `2026-0${(i % 9) + 1}-01`, costo_mo: 800_000, costo_mat: 200_000, mttr_horas: 72 }));
    const r = analizarEquipoCapex({ equipo: equipo(), ots, hoy: HOY, margenDia: 1_500_000 });
    if (r.ahorroAnual > 0) {
      expect(r.paybackAnios).toBeGreaterThan(0);
      expect(r.paybackAnios).not.toBeNull();
    }
  });
});

// ── analizarFlotaCapex ────────────────────────────────────────────────────────
describe("analizarFlotaCapex", () => {
  it("ordena reemplazar primero y sin_configurar al final", () => {
    const equipos = [
      equipo({ id: "sano", anio: "2025", ficha: { capex: { valor_reemplazo: 50_000_000, vida_util_anios: 15 } } }),
      equipo({ id: "viejo", anio: "1999", ficha: { capex: { valor_reemplazo: 50_000_000, vida_util_anios: 15 } } }),
      equipo({ id: "nocfg", ficha: {} }),
    ];
    const res = analizarFlotaCapex({ equipos, ots: [], hoy: HOY });
    expect(res[0].equipo.id).toBe("viejo");
    expect(res[res.length - 1].estado).toBe("sin_configurar");
  });

  it("excluye nodos de tipo sistema/grupo", () => {
    const equipos = [
      equipo({ id: "sis", tipo_nodo: "sistema" }),
      equipo({ id: "comp", tipo_nodo: "componente" }),
    ];
    const res = analizarFlotaCapex({ equipos, ots: [], hoy: HOY });
    expect(res.find((r) => r.equipo.id === "sis")).toBeUndefined();
    expect(res.find((r) => r.equipo.id === "comp")).toBeDefined();
  });

  it("respeta los supuestos de flota inyectados", () => {
    const res = analizarFlotaCapex({
      equipos: [equipo()], ots: [], hoy: HOY,
      params: { ...SUPUESTOS_DEFECTO, tasa: 20 },
    });
    expect(res[0].rem.cae).toBeGreaterThan(0);
  });
});
