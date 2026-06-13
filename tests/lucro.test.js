import { describe, it, expect } from "vitest";
import {
  margenDiarioNave,
  eventosCorrectivos,
  eventosVaradas,
  lucroCesanteNave,
} from "../src/lib/lucro.js";

const EMB = "nave-1";
const CORTE = "2025-06-12"; // 12 meses atrás

// ── margenDiarioNave ─────────────────────────────────────────────────────────
describe("margenDiarioNave", () => {
  it("calcula el margen promedio por día de mar", () => {
    const plList = [
      { dias: 10, margen: 1_000_000, tieneCaptura: true },
      { dias: 5,  margen:   500_000, tieneCaptura: true },
    ];
    expect(margenDiarioNave(plList)).toBeCloseTo(100_000, 0);
  });

  it("ignora mareas sin captura", () => {
    const plList = [
      { dias: 10, margen: 1_000_000, tieneCaptura: true  },
      { dias: 10, margen: 0,          tieneCaptura: false },
    ];
    expect(margenDiarioNave(plList)).toBeCloseTo(100_000, 0);
  });

  it("ignora mareas con dias = 0", () => {
    const plList = [{ dias: 0, margen: 999_999, tieneCaptura: true }];
    expect(margenDiarioNave(plList)).toBeNull();
  });

  it("lista vacía → null", () => {
    expect(margenDiarioNave([])).toBeNull();
    expect(margenDiarioNave()).toBeNull();
  });
});

// ── eventosCorrectivos ────────────────────────────────────────────────────────
describe("eventosCorrectivos", () => {
  const ots = [
    { id: "o1", embarcacion_id: EMB, tipo: "correctivo", estado: "cerrada",    mttr_horas: 48, fecha: "2026-01-10", costo_mo: 100_000, costo_mat: 50_000 },
    { id: "o2", embarcacion_id: EMB, tipo: "correctivo", estado: "cerrada",    mttr_horas: 0,  fecha: "2026-02-01" }, // sin MTTR
    { id: "o3", embarcacion_id: EMB, tipo: "preventivo", estado: "cerrada",    mttr_horas: 24, fecha: "2026-03-01" }, // preventivo
    { id: "o4", embarcacion_id: EMB, tipo: "correctivo", estado: "en_proceso", mttr_horas: 24, fecha: "2026-04-01" }, // no cerrada
    { id: "o5", embarcacion_id: "otra", tipo: "correctivo", estado: "cerrada", mttr_horas: 24, fecha: "2026-01-01" }, // otra nave
    { id: "o6", embarcacion_id: EMB, tipo: "correctivo", estado: "cerrada",    mttr_horas: 12, fecha: "2024-01-01" }, // antes del corte
  ];

  it("retorna solo correctivas cerradas con MTTR dentro del período", () => {
    const result = eventosCorrectivos(ots, EMB, CORTE);
    expect(result.map((e) => e.id)).toEqual(["o1"]);
    expect(result[0].dias).toBeCloseTo(2, 5);
    expect(result[0].costoOT).toBe(150_000);
  });

  it("sin corte incluye eventos fuera del período", () => {
    const result = eventosCorrectivos(ots, EMB, "");
    expect(result.map((e) => e.id)).toEqual(["o1", "o6"]);
  });

  it("lista vacía → []", () => {
    expect(eventosCorrectivos([], EMB, CORTE)).toHaveLength(0);
  });
});

// ── eventosVaradas ────────────────────────────────────────────────────────────
describe("eventosVaradas", () => {
  const varadas = [
    { id: "v1", embarcacion_id: EMB, estado: "cerrada",      fecha_inicio: "2026-01-10", fecha_fin_real: "2026-01-20", nombre: "Varada 2026" },
    { id: "v2", embarcacion_id: EMB, estado: "ejecucion",    fecha_inicio: "2026-03-01", fecha_fin_real: "2026-03-10" }, // no cerrada
    { id: "v3", embarcacion_id: EMB, estado: "cerrada",      fecha_inicio: "2026-02-01", fecha_fin_real: null },         // sin fecha fin
    { id: "v4", embarcacion_id: "otra", estado: "cerrada",   fecha_inicio: "2026-01-01", fecha_fin_real: "2026-01-15" }, // otra nave
    { id: "v5", embarcacion_id: EMB, estado: "cerrada",      fecha_inicio: "2024-06-01", fecha_fin_real: "2024-06-15" }, // antes del corte
  ];

  it("retorna varadas cerradas con fechas completas en el período", () => {
    const result = eventosVaradas(varadas, EMB, CORTE);
    expect(result.map((e) => e.id)).toEqual(["v1"]);
    expect(result[0].dias).toBe(10);
    expect(result[0].descripcion).toBe("Varada 2026");
  });

  it("varada de 0 días (fechas iguales) retorna dias=0", () => {
    const v = [{ id: "v9", embarcacion_id: EMB, estado: "cerrada", fecha_inicio: "2026-03-01", fecha_fin_real: "2026-03-01", nombre: "X" }];
    expect(eventosVaradas(v, EMB, "")[0].dias).toBe(0);
  });

  it("lista vacía → []", () => {
    expect(eventosVaradas([], EMB, CORTE)).toHaveLength(0);
  });
});

// ── lucroCesanteNave ──────────────────────────────────────────────────────────
describe("lucroCesanteNave", () => {
  const plList = [
    { dias: 20, margen: 2_000_000, tieneCaptura: true }, // margen = 100k/día
  ];
  const ots = [
    { id: "o1", embarcacion_id: EMB, tipo: "correctivo", estado: "cerrada", mttr_horas: 48, fecha: "2026-01-10", costo_mo: 0, costo_mat: 0 }, // 2 días
    { id: "o2", embarcacion_id: EMB, tipo: "preventivo", estado: "cerrada", fecha: "2026-02-01", costo_mo: 200_000, costo_mat: 100_000 },
  ];
  const varadas = [
    { id: "v1", embarcacion_id: EMB, estado: "cerrada", fecha_inicio: "2026-03-01", fecha_fin_real: "2026-03-06", nombre: "V" }, // 5 días
  ];

  it("calcula lucro cesante correctamente (fallas + varadas)", () => {
    const r = lucroCesanteNave({ plList, ots, varadas, embId: EMB, corteISO: CORTE });
    expect(r.margenDia).toBeCloseTo(100_000, 0);
    expect(r.diasCorr).toBeCloseTo(2, 5);
    expect(r.diasVarada).toBe(5);
    expect(r.lucroCorr).toBeCloseTo(200_000, 0);
    expect(r.lucroVarada).toBeCloseTo(500_000, 0);
    expect(r.lucroTotal).toBeCloseTo(700_000, 0);
    expect(r.costoPrev).toBe(300_000);
  });

  it("sin mareas con captura → lucros null, días siguen calculándose", () => {
    const r = lucroCesanteNave({ plList: [], ots, varadas, embId: EMB, corteISO: CORTE });
    expect(r.margenDia).toBeNull();
    expect(r.lucroTotal).toBeNull();
    expect(r.diasCorr).toBeCloseTo(2, 5);
    expect(r.diasVarada).toBe(5);
  });

  it("sin eventos → todo en 0 y lucros nulos si no hay mareas", () => {
    const r = lucroCesanteNave({ plList: [], ots: [], varadas: [], embId: EMB, corteISO: CORTE });
    expect(r.totalDias).toBe(0);
    expect(r.lucroTotal).toBeNull();
    expect(r.costoPrev).toBe(0);
  });

  it("eventos ordenados por fecha descendente", () => {
    const r = lucroCesanteNave({ plList, ots, varadas, embId: EMB, corteISO: CORTE });
    const fechas = r.eventos.map((e) => e.fecha);
    for (let i = 1; i < fechas.length; i++) {
      expect(fechas[i - 1] >= fechas[i]).toBe(true);
    }
  });
});
