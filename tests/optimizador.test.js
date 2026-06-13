import { describe, it, expect } from "vitest";
import {
  urgenciaMantenimiento,
  priorizarTareas,
  calcularVentana,
  optimizarVentana,
  optimizarFlota,
} from "../src/lib/optimizador.js";

const HOY  = "2026-06-13";
const EMB1 = "emb-1";
const EMB2 = "emb-2";
const EQ1  = "eq-1";
const EQ2  = "eq-2";

const equipos = [
  { id: EQ1, embarcacion_id: EMB1, id_visible: "DP-MOTOR",   sistema: "Motor principal",  criticidad: "A" },
  { id: EQ2, embarcacion_id: EMB2, id_visible: "MS-HIDRAUL", sistema: "Hidráulica pesca", criticidad: "B" },
];

const embarcaciones = [
  { id: EMB1, nombre: "Don Pedro",   tipo: "arrastrero", matricula: "DP-01" },
  { id: EMB2, nombre: "María Sofía", tipo: "cerquero",   matricula: "MS-02" },
];

// planesEval shape from evaluarPlanes()
const pmRojoCritA   = { equipo: equipos[0], plan: { id: "p1", descripcion: "Cambio aceite motor",  horas_estimadas: 6 }, tone: "red",    label: "Vencido" };
const pmAmarilloCritB = { equipo: equipos[1], plan: { id: "p2", descripcion: "Filtros hidráulicos", horas_estimadas: 4 }, tone: "yellow", label: "Próximo" };
const pmVerdeCritA  = { equipo: equipos[0], plan: { id: "p3", descripcion: "Revisión anual",        horas_estimadas: 8 }, tone: "green",  label: "OK" };

// riesgoEmb items from riesgoFlota()
const riesgoRojoA = { equipo: equipos[0], score: 72, zona: "roja",     motivos: ["PM vencido"] };
const riesgoVerde = { equipo: equipos[1], score: 10, zona: "verde",    motivos: [] };

const otCritica = { id: "o1", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "abierta", prioridad: "critica", descripcion: "Fuga aceite",  horas_estimadas: 8,  fecha: "2026-06-01" };
const otAlta    = { id: "o2", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "abierta", prioridad: "alta",    descripcion: "Vibración",    horas_estimadas: 4,  fecha: "2026-06-05" };
const otCerrada = { id: "o3", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "cerrada", prioridad: "alta",    descripcion: "Resuelta",     horas_estimadas: 4,  fecha: "2026-05-20" };

const items    = [{ id: "i1", codigo: "FIL-01", descripcion: "Filtro aceite" }];
const destinos = [{ item_id: "i1", equipo_id: EQ1 }];
const stockOk  = [{ item_id: "i1", cantidad: 3 }];
const stockVacio = [];

// ── urgenciaMantenimiento ──────────────────────────────────────────────────────
describe("urgenciaMantenimiento", () => {
  it("sin problemas → score 0, nivel bajo", () => {
    const r = urgenciaMantenimiento({ planesEvalEmb: [pmVerdeCritA], riesgoEmb: [riesgoVerde], otsEmb: [] });
    expect(r.score).toBe(0);
    expect(r.nivel).toBe("bajo");
    expect(r.motivos).toHaveLength(0);
  });

  it("PM vencido crit A → score ≥ 35, nivel urgente o superior", () => {
    const r = urgenciaMantenimiento({ planesEvalEmb: [pmRojoCritA], riesgoEmb: [], otsEmb: [] });
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(["urgente", "critico"]).toContain(r.nivel);
    expect(r.motivos.some((m) => m.includes("crítico A"))).toBe(true);
  });

  it("equipo en zona roja → suma puntos y agrega motivo", () => {
    const r = urgenciaMantenimiento({ planesEvalEmb: [], riesgoEmb: [riesgoRojoA], otsEmb: [] });
    expect(r.score).toBeGreaterThan(0);
    expect(r.motivos.some((m) => m.includes("roja"))).toBe(true);
  });

  it("OT crítica abierta → score ≥ 60, nivel critico", () => {
    const r = urgenciaMantenimiento({ planesEvalEmb: [pmRojoCritA], riesgoEmb: [riesgoRojoA], otsEmb: [otCritica] });
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.nivel).toBe("critico");
  });

  it("cap de 100 aunque se acumulen muchos puntos", () => {
    const r = urgenciaMantenimiento({
      planesEvalEmb: [pmRojoCritA, pmRojoCritA, pmRojoCritA],
      riesgoEmb:     [riesgoRojoA, riesgoRojoA, riesgoRojoA],
      otsEmb:        [otCritica, otCritica, otCritica],
    });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ── priorizarTareas ────────────────────────────────────────────────────────────
describe("priorizarTareas", () => {
  it("excluye PMs en verde, incluye rojos y amarillos", () => {
    const r = priorizarTareas({ planesEvalEmb: [pmRojoCritA, pmVerdeCritA, pmAmarilloCritB], otsEmb: [], equipos, items, stock: stockOk, destinos, hoy: HOY });
    expect(r.some((t) => t.tipo === "pm" && t.tone === "green")).toBe(false);
    expect(r.some((t) => t.tone === "red")).toBe(true);
  });

  it("OT crítica tiene mayor score que PM amarillo B", () => {
    const r = priorizarTareas({ planesEvalEmb: [pmAmarilloCritB], otsEmb: [otCritica], equipos, items, stock: stockVacio, destinos, hoy: HOY });
    const scores = r.map((t) => t.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]);
    const otIdx = r.findIndex((t) => t.tipo === "ot" && t.id === "o1");
    const pmIdx = r.findIndex((t) => t.tipo === "pm");
    expect(otIdx).toBeLessThan(pmIdx);
  });

  it("hhAcumulado crece correctamente", () => {
    const r = priorizarTareas({ planesEvalEmb: [pmRojoCritA], otsEmb: [otCritica], equipos, items, stock: stockOk, destinos, hoy: HOY });
    expect(r[r.length - 1].hhAcumulado).toBe(r.reduce((s, t) => s + t.hhEstimado, 0));
  });

  it("partsOk=true cuando hay stock", () => {
    const r = priorizarTareas({ planesEvalEmb: [], otsEmb: [otCritica], equipos, items, stock: stockOk, destinos, hoy: HOY });
    expect(r.find((t) => t.id === "o1").partsOk).toBe(true);
  });

  it("partsOk=false y faltantes=1 cuando stock vacío", () => {
    const r = priorizarTareas({ planesEvalEmb: [], otsEmb: [otCritica], equipos, items, stock: stockVacio, destinos, hoy: HOY });
    const tarea = r.find((t) => t.id === "o1");
    expect(tarea.partsOk).toBe(false);
    expect(tarea.partsFaltantes).toBe(1);
  });

  it("lista vacía de tareas no rompe y retorna []", () => {
    const r = priorizarTareas({ planesEvalEmb: [], otsEmb: [], equipos, items, stock: stockOk, destinos, hoy: HOY });
    expect(r).toHaveLength(0);
  });
});

// ── calcularVentana ────────────────────────────────────────────────────────────
describe("calcularVentana", () => {
  it("0 tareas → 0 horas y 0 días", () => {
    const r = calcularVentana([]);
    expect(r.hhTotal).toBe(0);
    expect(r.diasMinimos).toBe(0);
    expect(r.diasRecomendados).toBe(0);
  });

  it("16h con equipo de 8h/día → 2 días mínimo, 3 recomendados (×1.25)", () => {
    const tareas = [{ hhEstimado: 8 }, { hhEstimado: 8 }];
    const r = calcularVentana(tareas, 8);
    expect(r.hhTotal).toBe(16);
    expect(r.diasMinimos).toBe(2);
    expect(r.diasRecomendados).toBe(3);  // ceil(2 * 1.25) = ceil(2.5) = 3
  });

  it("respeta el parámetro hhDiariosEquipo", () => {
    const tareas = [{ hhEstimado: 12 }];
    const r = calcularVentana(tareas, 6); // 12 HH / 6 h/día = 2 días
    expect(r.diasMinimos).toBe(2);
  });
});

// ── optimizarVentana ───────────────────────────────────────────────────────────
describe("optimizarVentana", () => {
  it("alta urgencia → mantener_puerto", () => {
    const r = optimizarVentana({
      embarcacion: embarcaciones[0],
      planesEvalEmb: [pmRojoCritA],
      riesgoEmb:     [riesgoRojoA],
      otsEmb:        [otCritica],
      equipos, items, stock: stockOk, destinos, hoy: HOY,
    });
    expect(r.recomendacion).toBe("mantener_puerto");
    expect(r.urgencia.nivel).toBe("critico");
  });

  it("sin problemas → zarpar", () => {
    const r = optimizarVentana({
      embarcacion: embarcaciones[1],
      planesEvalEmb: [],
      riesgoEmb:     [riesgoVerde],
      otsEmb:        [],
      equipos, items, stock: stockOk, destinos, hoy: HOY,
    });
    expect(r.recomendacion).toBe("zarpar");
  });

  it("con margenDiario calcula costoVentana", () => {
    const r = optimizarVentana({
      embarcacion: embarcaciones[0],
      planesEvalEmb: [pmRojoCritA],
      riesgoEmb: [], otsEmb: [],
      equipos, items, stock: stockOk, destinos,
      margenDiario: 500_000,
      hoy: HOY,
    });
    expect(r.margenDiario).toBe(500_000);
    expect(r.costoVentana).toBeGreaterThan(0);
    expect(r.costoVentana).toBe(500_000 * r.ventana.diasRecomendados);
  });

  it("sin margenDiario → costoVentana null", () => {
    const r = optimizarVentana({ embarcacion: embarcaciones[0], planesEvalEmb: [pmRojoCritA], hoy: HOY });
    expect(r.costoVentana).toBeNull();
  });
});

// ── optimizarFlota ─────────────────────────────────────────────────────────────
describe("optimizarFlota", () => {
  it("retorna un resultado por nave ordenado por urgencia desc", () => {
    const planesEval = [pmRojoCritA, pmAmarilloCritB];
    const ots = [otCritica, otAlta, otCerrada];
    const r = optimizarFlota({ embarcaciones, equipos, planesEval, ots, items, stock: stockOk, destinos, hoy: HOY });
    expect(r).toHaveLength(2);
    expect(r[0].urgencia.score).toBeGreaterThanOrEqual(r[1].urgencia.score);
    // EMB1 (tiene PM rojo crit A + OT crítica) debe liderar
    expect(r[0].embarcacion.id).toBe(EMB1);
  });

  it("respeta margenDiarioPorEmb", () => {
    const planesEval = [pmRojoCritA];
    const mdMap = new Map([[EMB1, 800_000], [EMB2, null]]);
    const r = optimizarFlota({ embarcaciones, equipos, planesEval, ots: [], items, stock: stockOk, destinos, margenDiarioPorEmb: mdMap, hoy: HOY });
    const emb1 = r.find((x) => x.embarcacion.id === EMB1);
    const emb2 = r.find((x) => x.embarcacion.id === EMB2);
    expect(emb1.margenDiario).toBe(800_000);
    expect(emb2.margenDiario).toBeNull();
  });

  it("flota vacía → []", () => {
    expect(optimizarFlota({ hoy: HOY })).toHaveLength(0);
  });
});
