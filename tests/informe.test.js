import { describe, it, expect } from "vitest";
import {
  contarPMs,
  pctPreventivoPeriodo,
  contarOTs,
  topRiesgo,
  mtbfPromedio,
  topBacklog,
  construirContextoInforme,
} from "../src/lib/informe.js";

const HOY = "2026-06-12";
const DESDE = "2026-03-12";
const EMB1 = "emb-1";
const EMB2 = "emb-2";

const embarcaciones = [
  { id: EMB1, nombre: "Don Pedro", codigo: "DP-01" },
  { id: EMB2, nombre: "María Sofía", codigo: "MS-02" },
];

const equipos = [
  { id: "eq1", embarcacion_id: EMB1, sistema: "Motor principal", criticidad: "A" },
  { id: "eq2", embarcacion_id: EMB1, sistema: "Hélice", criticidad: "B" },
];

// ── contarPMs ─────────────────────────────────────────────────────────────────
describe("contarPMs", () => {
  it("clasifica por tono red/yellow", () => {
    const planesEval = [
      { tone: "red" }, { tone: "red" }, { tone: "yellow" }, { tone: "green" },
    ];
    expect(contarPMs(planesEval)).toEqual({ vencidos: 2, proximos: 1, total: 4 });
  });
  it("lista vacía → ceros", () => {
    expect(contarPMs([])).toEqual({ vencidos: 0, proximos: 0, total: 0 });
  });
});

// ── pctPreventivoPeriodo ──────────────────────────────────────────────────────
describe("pctPreventivoPeriodo", () => {
  const ots = [
    { estado: "cerrada", tipo: "preventivo", fecha: "2026-04-01" },
    { estado: "cerrada", tipo: "correctivo", fecha: "2026-04-15" },
    { estado: "cerrada", tipo: "preventivo", fecha: "2026-05-01" },
    { estado: "cerrada", tipo: "preventivo", fecha: "2026-01-01" }, // fuera de período
    { estado: "abierta", tipo: "preventivo", fecha: "2026-05-10" }, // no cerrada
  ];
  it("calcula % preventivo de las cerradas en el período", () => {
    // dentro de período: 2 prev + 1 corr → 66.67%
    expect(pctPreventivoPeriodo(ots, DESDE)).toBeCloseTo(66.67, 1);
  });
  it("sin cerradas → null", () => {
    expect(pctPreventivoPeriodo([{ estado: "abierta", tipo: "preventivo", fecha: "2026-05-01" }], DESDE)).toBeNull();
  });
});

// ── contarOTs ─────────────────────────────────────────────────────────────────
describe("contarOTs", () => {
  const ots = [
    { estado: "abierta", fecha: "2026-05-01" },
    { estado: "en_proceso", fecha: "2026-05-02" },
    { estado: "cerrada", fecha: "2026-04-10" },   // en período
    { estado: "cerrada", fecha: "2026-01-10" },   // fuera
  ];
  it("cuenta abiertas y cerradas en período", () => {
    expect(contarOTs(ots, DESDE)).toEqual({ abiertas: 2, cerradasPeriodo: 1 });
  });
});

// ── topRiesgo ─────────────────────────────────────────────────────────────────
describe("topRiesgo", () => {
  const ranking = [
    { equipo: equipos[0], score: 80, zona: "roja", mtbf: 65.4, motivos: ["PM vencido", "MTBF superado", "x"] },
    { equipo: equipos[1], score: 30, zona: "amarilla", mtbf: null, motivos: ["PM próximo"] },
    { equipo: { id: "eq9", embarcacion_id: EMB2, sistema: "X" }, score: 0, zona: "verde", motivos: [] },
  ];
  it("excluye score 0 y mapea a forma compacta con nombre de nave", () => {
    const r = topRiesgo(ranking, embarcaciones, 5);
    expect(r).toHaveLength(2);
    expect(r[0].nave).toBe("Don Pedro");
    expect(r[0].mtbfDias).toBe(65);
    expect(r[0].motivos).toHaveLength(2); // recorta a 2
  });
  it("respeta el límite n", () => {
    expect(topRiesgo(ranking, embarcaciones, 1)).toHaveLength(1);
  });
});

// ── mtbfPromedio ──────────────────────────────────────────────────────────────
describe("mtbfPromedio", () => {
  it("promedia los MTBF no nulos", () => {
    expect(mtbfPromedio([{ mtbf: 60 }, { mtbf: 40 }, { mtbf: null }])).toBe(50);
  });
  it("sin datos → null", () => {
    expect(mtbfPromedio([{ mtbf: null }])).toBeNull();
    expect(mtbfPromedio([])).toBeNull();
  });
});

// ── topBacklog ────────────────────────────────────────────────────────────────
describe("topBacklog", () => {
  const ots = [
    { id: "o1", equipo_id: "eq1", embarcacion_id: EMB1, estado: "abierta", folio: "OT-1", sistema: "Motor", prioridad: "critica", fecha: "2026-05-01" },
    { id: "o2", equipo_id: "eq2", embarcacion_id: EMB1, estado: "abierta", folio: "OT-2", sistema: "Hélice", prioridad: "baja", fecha: "2026-06-01" },
    { id: "o3", equipo_id: "eq1", embarcacion_id: EMB1, estado: "cerrada", folio: "OT-3", sistema: "Motor", prioridad: "alta", fecha: "2026-05-15" }, // cerrada, excluida
  ];
  it("ordena por score y excluye cerradas", () => {
    const r = topBacklog(ots, equipos, embarcaciones, HOY, 5);
    expect(r.map((x) => x.folio)).toEqual(["OT-1", "OT-2"]);
    expect(r[0].nave).toBe("Don Pedro");
    expect(r[0].score).toBeGreaterThan(r[1].score); // crítica > baja
  });
});

// ── construirContextoInforme ──────────────────────────────────────────────────
describe("construirContextoInforme", () => {
  const ots = [
    { id: "o1", equipo_id: "eq1", embarcacion_id: EMB1, estado: "abierta", folio: "OT-1", sistema: "Motor", prioridad: "critica", tipo: "correctivo", fecha: "2026-05-01" },
    { id: "o2", equipo_id: "eq2", embarcacion_id: EMB1, estado: "cerrada", tipo: "preventivo", fecha: "2026-04-01" },
  ];
  const planesEval = [{ tone: "red" }, { tone: "yellow" }, { tone: "green" }];
  const riesgoRanking = [
    { equipo: equipos[0], score: 80, zona: "roja", mtbf: 60, motivos: ["PM vencido"] },
    { equipo: equipos[1], score: 25, zona: "amarilla", mtbf: null, motivos: ["PM próximo"] },
  ];
  const presupuestoData = [
    { emb: embarcaciones[0], gasto: { total: 5_000_000 }, rr: { anualProyectado: 6_000_000 }, ppto: 8_000_000, estado: { zona: "ok", porcentaje: 62 }, mesesAgot: 4.2 },
    { emb: embarcaciones[1], gasto: { total: 2_000_000 }, rr: { anualProyectado: 2_500_000 }, ppto: 0, estado: { zona: "sin-dato" }, mesesAgot: null },
  ];
  const estadoPorNave = new Map([[EMB1, "en puerto"], [EMB2, "en mar"]]);
  const sinCobertura = [
    { item: { codigo: "REP-1", descripcion: "Filtro" }, equiposA: [equipos[0]] },
  ];

  const ctx = construirContextoInforme({
    empresa: "Korelfox",
    periodo: { label: "últimos 3 meses", meses: 3, desde: DESDE, hasta: HOY },
    embarcaciones, equipos, planesEval, riesgoRanking, ots,
    estadoPorNave, presupuestoData,
    runRateFlota: { mensual: 700_000, anualProyectado: 8_500_000 },
    sinCobertura, itemsSubdotados: 7, hoy: HOY,
  });

  it("incluye los bloques de alto nivel", () => {
    expect(ctx.empresa).toBe("Korelfox");
    expect(ctx.flota.totalNaves).toBe(2);
    expect(ctx.confiabilidad).toBeDefined();
    expect(ctx.mantenimiento).toBeDefined();
    expect(ctx.costos).toBeDefined();
    expect(ctx.inventario).toBeDefined();
  });

  it("refleja estado por nave", () => {
    const dp = ctx.flota.naves.find((n) => n.nombre === "Don Pedro");
    expect(dp.estado).toBe("en puerto");
  });

  it("agrega confiabilidad correctamente", () => {
    expect(ctx.confiabilidad.equiposRiesgoAlto).toBe(1);
    expect(ctx.confiabilidad.equiposRiesgoMedio).toBe(1);
    expect(ctx.confiabilidad.mtbfPromedioDias).toBe(60);
    expect(ctx.confiabilidad.topRiesgo[0].nave).toBe("Don Pedro");
  });

  it("agrega mantenimiento (PMs, OTs, % preventivo)", () => {
    expect(ctx.mantenimiento.pmVencidos).toBe(1);
    expect(ctx.mantenimiento.pmProximos).toBe(1);
    expect(ctx.mantenimiento.otsAbiertas).toBe(1);
    expect(ctx.mantenimiento.otsCerradasPeriodo).toBe(1);
    expect(ctx.mantenimiento.pctPreventivo).toBe(100); // la única cerrada en período es preventiva
    expect(ctx.mantenimiento.backlogTop[0].folio).toBe("OT-1");
  });

  it("agrega costos de flota y ordena naves por gasto", () => {
    expect(ctx.costos.gastoAnioFlota).toBe(7_000_000);
    expect(ctx.costos.presupuestoFlota).toBe(8_000_000);
    expect(ctx.costos.runRateAnual).toBe(8_500_000);
    expect(ctx.costos.porNave[0].nave).toBe("Don Pedro"); // mayor gasto primero
  });

  it("agrega inventario crítico", () => {
    expect(ctx.inventario.criticosSinStock).toBe(1);
    expect(ctx.inventario.itemsSubdotados).toBe(7);
    expect(ctx.inventario.topCriticos[0].codigo).toBe("REP-1");
  });
});
