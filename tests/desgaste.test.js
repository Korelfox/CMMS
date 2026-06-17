import { describe, it, expect } from "vitest";
import { agruparLecturasPorPunto, analizarDesgasteFlota } from "../src/lib/desgaste.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const EMB1 = "emb-1";
const EQ_MOTOR    = "eq-motor";   // propio
const EQ_FILTROS  = "eq-filtros"; // hereda del motor
const EQ_GENERA   = "eq-genera";  // propio independiente

const embarcaciones = [
  { id: EMB1, nombre: "Don Pedro", tipo: "arrastrero" },
];

const equipos = [
  { id: EQ_MOTOR,   embarcacion_id: EMB1, horometro: "propio",  horas_actual: 8100, sistema: "Motor Principal",  criticidad: "A", parent_id: null },
  { id: EQ_FILTROS, embarcacion_id: EMB1, horometro: "hereda",  horas_actual: 8100, sistema: "Filtros Motor",    criticidad: "B", parent_id: EQ_MOTOR },
  { id: EQ_GENERA,  embarcacion_id: EMB1, horometro: "propio",  horas_actual: 5000, sistema: "Generador 1",     criticidad: "A", parent_id: null },
];

// 7 lecturas del motor: de 7800 a 8100 en 15 días → ~20 h/día
const lecturasMotor = [
  { equipo_id: EQ_MOTOR, fecha: "2026-06-01T00:00:00Z", horas: 7800 },
  { equipo_id: EQ_MOTOR, fecha: "2026-06-03T00:00:00Z", horas: 7840 },
  { equipo_id: EQ_MOTOR, fecha: "2026-06-06T00:00:00Z", horas: 7900 },
  { equipo_id: EQ_MOTOR, fecha: "2026-06-09T00:00:00Z", horas: 7960 },
  { equipo_id: EQ_MOTOR, fecha: "2026-06-12T00:00:00Z", horas: 8040 },
  { equipo_id: EQ_MOTOR, fecha: "2026-06-15T00:00:00Z", horas: 8100 },
];

// Filtros hereda del motor, sus lecturas van al mismo punto
const lecturasConFiltros = [
  ...lecturasMotor,
  { equipo_id: EQ_FILTROS, fecha: "2026-06-10T00:00:00Z", horas: 8000 },
];

// Plan de cambio de aceite: cada 500 h, último PM a 7800 h → elapsed=300, limite=500
const planAceite = {
  plan: { id: "plan-1", nombre: "Cambio aceite motor" },
  equipo: equipos[0],
  esCalendario: false,
  elapsed: 300,
  limite: 500,
  tone: "yellow",
  label: "Próximo",
};

// Plan de inyectores: cada 1000 h, último PM a 7000 h → elapsed=1100, vida=110% (ya vencido)
const planInyectores = {
  plan: { id: "plan-2", nombre: "Limpieza inyectores" },
  equipo: equipos[0],
  esCalendario: false,
  elapsed: 1100,
  limite: 1000,
  tone: "red",
  label: "Vencido",
};

// Plan de filtros (hereda punto del motor): cada 250 h, elapsed=200, vida=80%
const planFiltros = {
  plan: { id: "plan-3", nombre: "Filtros de agua" },
  equipo: equipos[1],
  esCalendario: false,
  elapsed: 200,
  limite: 250,
  tone: "yellow",
  label: "Próximo",
};

// Plan calendario (debe quedar excluido del análisis de horas)
const planCalendario = {
  plan: { id: "plan-4", nombre: "Revisión anual" },
  equipo: equipos[0],
  esCalendario: true,
  elapsed: 200,
  limite: 365,
  tone: "green",
  label: "OK",
};

const byId = new Map(equipos.map((e) => [e.id, e]));

// ── agruparLecturasPorPunto ───────────────────────────────────────────────────
describe("agruparLecturasPorPunto", () => {
  it("agrupa lecturas del motor bajo su propio id", () => {
    const grupo = agruparLecturasPorPunto(lecturasMotor, equipos, byId);
    expect(grupo.has(EQ_MOTOR)).toBe(true);
    expect(grupo.get(EQ_MOTOR)).toHaveLength(lecturasMotor.length);
  });

  it("lecturas del equipo que hereda se agrupan bajo el punto propio", () => {
    const grupo = agruparLecturasPorPunto(lecturasConFiltros, equipos, byId);
    // EQ_FILTROS hereda de EQ_MOTOR → sus lecturas van al grupo EQ_MOTOR
    expect(grupo.has(EQ_MOTOR)).toBe(true);
    expect(grupo.get(EQ_MOTOR)).toHaveLength(lecturasConFiltros.length);
    expect(grupo.has(EQ_FILTROS)).toBe(false);
  });

  it("equipo sin punto de horómetro (no hereda y no es propio) no genera grupo", () => {
    const sinHorometro = [{ id: "eq-sinH", horometro: "no", embarcacion_id: EMB1, parent_id: null }];
    const byIdSin = new Map([...byId, ["eq-sinH", sinHorometro[0]]]);
    const lecturas = [{ equipo_id: "eq-sinH", fecha: "2026-06-01T00:00:00Z", horas: 100 }];
    const grupo = agruparLecturasPorPunto(lecturas, [...equipos, ...sinHorometro], byIdSin);
    expect(grupo.has("eq-sinH")).toBe(false);
  });

  it("devuelve mapa vacío con lecturas vacías", () => {
    const grupo = agruparLecturasPorPunto([], equipos, byId);
    expect(grupo.size).toBe(0);
  });
});

// ── analizarDesgasteFlota ─────────────────────────────────────────────────────
describe("analizarDesgasteFlota", () => {
  const planesEval = [planAceite, planInyectores, planFiltros, planCalendario];

  it("excluye planes de calendario del análisis de horas", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    // Solo 3 planes de horas (aceite, inyectores, filtros)
    expect(r.estadisticas.planesConDatos).toBe(3);
  });

  it("calcula vida % correctamente: inyectores al 110% → topDesgaste lo incluye primero", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    expect(r.topDesgaste[0].planNombre).toBe("Limpieza inyectores");
    expect(r.topDesgaste[0].vidaPct).toBe(110);
  });

  it("proyecta días hasta vencimiento según tendencia real", () => {
    // Aceite: 200 h restantes. Motor tiene tendencia ~20 h/día → ~10 días
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    const aceite = r.topDesgaste.find((p) => p.planNombre === "Cambio aceite motor");
    expect(aceite).toBeDefined();
    expect(aceite.diasHastaVence).toBeGreaterThan(0);
    expect(aceite.diasHastaVence).toBeLessThan(20); // 200 h / ~20 h/día ≈ 10 días
  });

  it("sin lecturas no hay tendencia; planes no vencidos tienen diasHastaVence null", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: [], equipos, embarcaciones });
    expect(r.estadisticas.planesConTendencia).toBe(0);
    r.topDesgaste.forEach((p) => {
      expect(p.tendenciaHDia).toBeNull();
      // ya vencidos retornan 0 (horasRest ≤ 0); los que aún tienen horas retornan null sin tendencia
      if (p.vidaPct != null && p.vidaPct < 100) {
        expect(p.diasHastaVence).toBeNull();
      } else {
        expect(p.diasHastaVence).toBe(0);
      }
    });
  });

  it("detecta alta intensidad de uso (>18 h/día)", () => {
    // lecturasMotor tiene ~20 h/día
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    expect(r.estadisticas.altaIntensidadN).toBeGreaterThan(0);
    expect(r.altaIntensidad[0].tendenciaHDia).toBeGreaterThan(18);
  });

  it("incluye puntosTendencia para motores con lecturas", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    const motor = r.puntosTendencia.find((p) => p.equipo === "Motor Principal");
    expect(motor).toBeDefined();
    expect(motor.horasActual).toBe(8100);
    expect(motor.tendenciaHDia).toBeGreaterThan(0);
    expect(motor.nave).toBe("Don Pedro");
  });

  it("plan con vida >= 90% cuenta como desgaste crítico", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    expect(r.estadisticas.enDesgasteCritico).toBe(1); // inyectores al 110%
  });

  it("plan próximo a vencer en < 30 días aparece en venceranProximo", () => {
    // aceite: ~10 días según tendencia
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    expect(r.estadisticas.venceranEn30d).toBeGreaterThan(0);
    expect(r.venceranProximo.length).toBeGreaterThan(0);
    expect(r.venceranProximo[0].diasHastaVence).toBeLessThanOrEqual(30);
  });

  it("plan ya vencido tiene diasHastaVence = 0, no aparece en venceranProximo", () => {
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    const inyectores = r.topDesgaste.find((p) => p.planNombre === "Limpieza inyectores");
    expect(inyectores.diasHastaVence).toBe(0);
    const enProximo = r.venceranProximo.find((p) => p.planNombre === "Limpieza inyectores");
    expect(enProximo).toBeUndefined();
  });

  it("datos vacíos no rompen y retornan ceros", () => {
    const r = analizarDesgasteFlota({});
    expect(r.estadisticas.planesConDatos).toBe(0);
    expect(r.topDesgaste).toHaveLength(0);
    expect(r.puntosTendencia).toHaveLength(0);
  });

  it("plan de equipo heredero usa el punto propio para la tendencia", () => {
    // filtros hereda del motor → tendencia = motor ~20 h/día
    const r = analizarDesgasteFlota({ planesEval, lecturas: lecturasMotor, equipos, embarcaciones });
    const filtros = r.topDesgaste.find((p) => p.planNombre === "Filtros de agua");
    expect(filtros).toBeDefined();
    expect(filtros.tendenciaHDia).toBeGreaterThan(0);
  });
});
