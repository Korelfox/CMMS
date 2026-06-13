import { describe, it, expect } from "vitest";
import {
  historialFallasEquipo,
  fallasSimilares,
  repuestosDeEquipo,
  resumenFallas,
  construirContextoDiagnostico,
} from "../src/lib/diagnostico.js";

const EMB1 = "emb-1";
const EMB2 = "emb-2";
const EQ1 = "eq-1";
const EQ2 = "eq-2"; // mismo sistema que EQ1, otra nave

const embarcaciones = [
  { id: EMB1, nombre: "Don Pedro", codigo: "DP-01" },
  { id: EMB2, nombre: "María Sofía", codigo: "MS-02" },
];

const equipos = [
  { id: EQ1, embarcacion_id: EMB1, id_visible: "DP-MOTOR", sistema: "Motor principal", marca: "Caterpillar", modelo: "C32", criticidad: "A", horas_actual: 12000 },
  { id: EQ2, embarcacion_id: EMB2, id_visible: "MS-MOTOR", sistema: "Motor principal", criticidad: "A" },
];

const ots = [
  { id: "o1", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "cerrada", fecha: "2026-05-10", descripcion: "Sobrecalentamiento en navegación", modo_falla: "sobrecalentamiento", causa_falla: "contaminacion", mecanismo_falla: "material", mttr_horas: 6 },
  { id: "o2", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "cerrada", fecha: "2026-02-01", descripcion: "Baja presión de aceite", modo_falla: "baja_presion", causa_falla: "desgaste_normal", mttr_horas: 4 },
  { id: "o3", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "preventivo", estado: "cerrada", fecha: "2026-03-01", descripcion: "Cambio aceite" }, // preventivo: no cuenta
  { id: "o4", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "abierta", fecha: "2026-06-01", descripcion: "En proceso" }, // no cerrada
  { id: "o5", equipo_id: EQ2, embarcacion_id: EMB2, tipo: "correctivo", estado: "cerrada", fecha: "2026-04-20", descripcion: "Sobrecalentamiento similar", sistema: "Motor principal", modo_falla: "sobrecalentamiento", causa_falla: "falta_lubricacion" },
];

// ── historialFallasEquipo ─────────────────────────────────────────────────────
describe("historialFallasEquipo", () => {
  it("solo correctivas cerradas del equipo, con códigos ISO resueltos a texto", () => {
    const h = historialFallasEquipo(ots, EQ1);
    expect(h).toHaveLength(2);
    expect(h[0].fecha).toBe("2026-05-10"); // orden desc
    expect(h[0].modoFalla).toBe("Sobrecalentamiento");
    expect(h[0].causaFalla).toBe("Contaminación (agua, partículas, biológica)");
    expect(h[0].mecanismo).toBe("Material (corrosión, erosión, fatiga)");
  });
  it("códigos nulos quedan en null, no rompe", () => {
    const h = historialFallasEquipo([{ equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01", descripcion: "x" }], EQ1);
    expect(h[0].modoFalla).toBeNull();
    expect(h[0].causaFalla).toBeNull();
  });
  it("sin historial → []", () => {
    expect(historialFallasEquipo([], EQ1)).toHaveLength(0);
  });
});

// ── fallasSimilares ───────────────────────────────────────────────────────────
describe("fallasSimilares", () => {
  const equiposById = new Map(equipos.map((e) => [e.id, e]));
  it("correctivas de otros equipos del mismo sistema, con nave", () => {
    const r = fallasSimilares(ots, embarcaciones, "Motor principal", EQ1, equiposById, 6);
    expect(r).toHaveLength(1);
    expect(r[0].nave).toBe("María Sofía");
    expect(r[0].modoFalla).toBe("Sobrecalentamiento");
  });
  it("excluye el propio equipo y respeta el sistema", () => {
    const r = fallasSimilares(ots, embarcaciones, "Hélice", EQ1, equiposById, 6);
    expect(r).toHaveLength(0);
  });
  it("sin sistema → []", () => {
    expect(fallasSimilares(ots, embarcaciones, "", EQ1, equiposById)).toHaveLength(0);
  });
});

// ── repuestosDeEquipo ─────────────────────────────────────────────────────────
describe("repuestosDeEquipo", () => {
  const items = [
    { id: "i1", codigo: "FIL-01", descripcion: "Filtro aceite", unidad: "Un" },
    { id: "i2", codigo: "EMP-02", descripcion: "Empaquetadura", unidad: "Un" },
    { id: "i3", codigo: "X", descripcion: "No vinculado" },
  ];
  const destinos = [
    { item_id: "i1", equipo_id: EQ1 },
    { item_id: "i2", equipo_id: EQ1 },
    { item_id: "i3", equipo_id: EQ2 },
  ];
  const stock = [
    { item_id: "i1", cantidad: 3 },
    { item_id: "i1", cantidad: 2 }, // dos bodegas → suma 5
    { item_id: "i2", cantidad: 0 },
  ];
  it("retorna repuestos vinculados con stock sumado por bodega", () => {
    const r = repuestosDeEquipo(items, destinos, stock, EQ1);
    expect(r.map((x) => x.codigo).sort()).toEqual(["EMP-02", "FIL-01"]);
    expect(r.find((x) => x.codigo === "FIL-01").stock).toBe(5);
    expect(r.find((x) => x.codigo === "EMP-02").stock).toBe(0);
  });
  it("equipo sin repuestos → []", () => {
    expect(repuestosDeEquipo(items, destinos, stock, "eq-zzz")).toHaveLength(0);
  });
});

// ── resumenFallas ─────────────────────────────────────────────────────────────
describe("resumenFallas", () => {
  it("total, MTTR promedio y modo más frecuente", () => {
    const h = [
      { modoFalla: "Sobrecalentamiento", mttrHoras: 6 },
      { modoFalla: "Sobrecalentamiento", mttrHoras: 4 },
      { modoFalla: "Vibración anormal", mttrHoras: null },
    ];
    const r = resumenFallas(h);
    expect(r.total).toBe(3);
    expect(r.mttrPromedio).toBe(5);
    expect(r.modoMasFrecuente).toBe("Sobrecalentamiento");
  });
  it("historial vacío → total 0, nulls", () => {
    const r = resumenFallas([]);
    expect(r.total).toBe(0);
    expect(r.mttrPromedio).toBeNull();
    expect(r.modoMasFrecuente).toBeNull();
  });
});

// ── construirContextoDiagnostico ──────────────────────────────────────────────
describe("construirContextoDiagnostico", () => {
  const items = [{ id: "i1", codigo: "FIL-01", descripcion: "Filtro", unidad: "Un" }];
  const destinos = [{ item_id: "i1", equipo_id: EQ1 }];
  const stock = [{ item_id: "i1", cantidad: 4 }];

  it("ensambla ficha, historial, similares y repuestos", () => {
    const ctx = construirContextoDiagnostico({
      equipo: equipos[0], sintoma: "Temperatura sube sobre 95°C a plena carga",
      ots, equipos, embarcaciones, items, destinos, stock,
    });
    expect(ctx.equipo.marca).toBe("Caterpillar");
    expect(ctx.equipo.nave).toBe("Don Pedro");
    expect(ctx.sintoma).toMatch(/Temperatura/);
    expect(ctx.resumen.total).toBe(2);
    expect(ctx.historialEquipo).toHaveLength(2);
    expect(ctx.fallasSimilares).toHaveLength(1);
    expect(ctx.repuestosVinculados[0].codigo).toBe("FIL-01");
  });

  it("sin equipo → null", () => {
    expect(construirContextoDiagnostico({ equipo: null })).toBeNull();
  });
});
