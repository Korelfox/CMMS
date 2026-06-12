import { describe, it, expect } from "vitest";
import {
  calcularProgreso,
  hhTotalesVarada,
  costoTotalVarada,
  duracionVarada,
  estadoVaradaTone,
  desvioPrespuesto,
  resumenPorSistema,
} from "../src/lib/varada.js";

const HOY = "2026-06-12";

// ── calcularProgreso ──────────────────────────────────────────────────────────
describe("calcularProgreso", () => {
  it("sin trabajos → pct 0, totales 0", () => {
    const r = calcularProgreso([]);
    expect(r.pct).toBe(0);
    expect(r.total).toBe(0);
    expect(r.completados).toBe(0);
  });

  it("todos completados → 100%", () => {
    const trabajos = [
      { estado: "completado" },
      { estado: "completado" },
      { estado: "completado" },
    ];
    expect(calcularProgreso(trabajos).pct).toBe(100);
  });

  it("cancelados no cuentan en el denominador", () => {
    const trabajos = [
      { estado: "completado" },
      { estado: "cancelado" },
      { estado: "pendiente" },
    ];
    const r = calcularProgreso(trabajos);
    expect(r.total).toBe(2);      // cancelado excluido
    expect(r.completados).toBe(1);
    expect(r.pct).toBe(50);
  });

  it("mix pendiente/en_progreso/completado", () => {
    const trabajos = [
      { estado: "pendiente" },
      { estado: "en_progreso" },
      { estado: "completado" },
      { estado: "completado" },
    ];
    const r = calcularProgreso(trabajos);
    expect(r.total).toBe(4);
    expect(r.completados).toBe(2);
    expect(r.enProgreso).toBe(1);
    expect(r.pendientes).toBe(1);
    expect(r.pct).toBe(50);
  });
});

// ── hhTotalesVarada ───────────────────────────────────────────────────────────
describe("hhTotalesVarada", () => {
  it("suma horas excluyendo cancelados", () => {
    const trabajos = [
      { estado: "pendiente",   horas_estimadas: 8 },
      { estado: "completado",  horas_estimadas: 4 },
      { estado: "cancelado",   horas_estimadas: 20 },
    ];
    expect(hhTotalesVarada(trabajos)).toBe(12);
  });

  it("null/undefined horas tratado como 0", () => {
    expect(hhTotalesVarada([{ estado: "pendiente", horas_estimadas: null }])).toBe(0);
  });
});

// ── costoTotalVarada ──────────────────────────────────────────────────────────
describe("costoTotalVarada", () => {
  const VID = "v-001";
  const ots = [
    { varada_id: VID,    costo_mo: 100_000, costo_mat: 50_000 },
    { varada_id: VID,    costo_mo: 200_000, costo_mat: 0      },
    { varada_id: "otro", costo_mo: 999_000, costo_mat: 0      },
    { varada_id: null,   costo_mo: 999_000, costo_mat: 0      },
  ];

  it("suma mo + mat de OTs de la varada", () => {
    expect(costoTotalVarada(ots, VID)).toBe(350_000);
  });

  it("varada sin OTs → 0", () => {
    expect(costoTotalVarada(ots, "inexistente")).toBe(0);
  });

  it("sin varadaId → 0", () => {
    expect(costoTotalVarada(ots, null)).toBe(0);
  });
});

// ── duracionVarada ────────────────────────────────────────────────────────────
describe("duracionVarada", () => {
  it("sin fechas → todo null", () => {
    const r = duracionVarada({}, HOY);
    expect(r.estimados).toBeNull();
    expect(r.reales).toBeNull();
  });

  it("estimados desde fecha_inicio + fecha_fin_estimada", () => {
    const v = { fecha_inicio: "2026-06-01", fecha_fin_estimada: "2026-06-15" };
    const r = duracionVarada(v, HOY);
    expect(r.estimados).toBe(14);
  });

  it("reales para varada en ejecución usan hoy como fin", () => {
    const v = { fecha_inicio: "2026-06-01" };
    const r = duracionVarada(v, HOY);
    expect(r.reales).toBe(11); // del 1 al 12 de junio
    expect(r.desviacion).toBeNull(); // no hay estimados
  });

  it("desviacion = real - estimado (retraso positivo)", () => {
    const v = {
      fecha_inicio: "2026-06-01",
      fecha_fin_estimada: "2026-06-10",
      fecha_fin_real: "2026-06-15",
    };
    const r = duracionVarada(v, HOY);
    expect(r.estimados).toBe(9);
    expect(r.reales).toBe(14);
    expect(r.desviacion).toBe(5);
  });
});

// ── estadoVaradaTone ──────────────────────────────────────────────────────────
describe("estadoVaradaTone", () => {
  it("cancelada → slate", () => {
    expect(estadoVaradaTone({ estado: "cancelada" }, HOY)[0]).toBe("slate");
  });

  it("cerrada → green", () => {
    expect(estadoVaradaTone({ estado: "cerrada" }, HOY)[0]).toBe("green");
  });

  it("ejecucion sin atraso → yellow", () => {
    const v = { estado: "ejecucion", fecha_fin_estimada: "2026-12-31" };
    expect(estadoVaradaTone(v, HOY)[0]).toBe("yellow");
  });

  it("ejecucion atrasada (fin_estimada < hoy) → red", () => {
    const v = { estado: "ejecucion", fecha_fin_estimada: "2026-06-01" };
    const [tone, label] = estadoVaradaTone(v, HOY);
    expect(tone).toBe("red");
    expect(label).toBe("Atrasada");
  });

  it("planificacion con inicio futuro → steel", () => {
    const v = { estado: "planificacion", fecha_inicio: "2026-07-01" };
    expect(estadoVaradaTone(v, HOY)[0]).toBe("steel");
  });

  it("planificacion con inicio pasado → yellow (debe iniciar ejecución)", () => {
    const v = { estado: "planificacion", fecha_inicio: "2026-06-01" };
    expect(estadoVaradaTone(v, HOY)[0]).toBe("yellow");
  });
});

// ── desvioPrespuesto ──────────────────────────────────────────────────────────
describe("desvioPrespuesto", () => {
  it("sin presupuesto → tone slate", () => {
    const r = desvioPrespuesto({ presupuesto: 0 }, 500_000);
    expect(r.tone).toBe("slate");
    expect(r.pct).toBeNull();
  });

  it("bajo presupuesto → green", () => {
    const r = desvioPrespuesto({ presupuesto: 1_000_000 }, 800_000);
    expect(r.tone).toBe("green");
    expect(r.pct).toBe(80);
  });

  it("excede 95% → yellow", () => {
    const r = desvioPrespuesto({ presupuesto: 1_000_000 }, 980_000);
    expect(r.tone).toBe("yellow");
  });

  it("excede 110% → red", () => {
    const r = desvioPrespuesto({ presupuesto: 1_000_000 }, 1_200_000);
    expect(r.tone).toBe("red");
    expect(r.desvio).toBe(200_000);
  });
});

// ── resumenPorSistema ─────────────────────────────────────────────────────────
describe("resumenPorSistema", () => {
  const VID = "v-001";
  const trabajos = [
    { sistema: "Motor", descripcion: "A", estado: "completado" },
    { sistema: "Motor", descripcion: "B", estado: "pendiente"  },
    { sistema: "Casco", descripcion: "C", estado: "completado" },
    { sistema: null,    descripcion: "D", estado: "pendiente"  },
  ];
  const ots = [
    { varada_id: VID, sistema: "Motor", costo_mo: 100_000, costo_mat: 0 },
    { varada_id: VID, sistema: "Casco", costo_mo: 50_000,  costo_mat: 0 },
  ];

  it("agrupa por sistema correctamente", () => {
    const r = resumenPorSistema(trabajos, ots, VID);
    const motor = r.find((s) => s.sistema === "Motor");
    expect(motor.total).toBe(2);
    expect(motor.completados).toBe(1);
    expect(motor.costo).toBe(100_000);
  });

  it("null sistema queda como 'Sin sistema'", () => {
    const r = resumenPorSistema(trabajos, ots, VID);
    expect(r.find((s) => s.sistema === "Sin sistema")).toBeDefined();
  });

  it("sin trabajos → array vacío", () => {
    expect(resumenPorSistema([], [], VID)).toHaveLength(0);
  });
});
