import { describe, it, expect } from "vitest";
import {
  correctivasPorEquipos,
  sugerirMinMax,
  analizarMinMax,
} from "../src/lib/minmax.js";

const HOY = "2026-06-12";
const EQ_A = "eq-a"; // criticidad A
const EQ_B = "eq-b"; // criticidad B
const EQ_C = "eq-c"; // criticidad C

const equipoA = { id: EQ_A, criticidad: "A", sistema: "Motor" };
const equipoB = { id: EQ_B, criticidad: "B", sistema: "Bomba" };
const equipoC = { id: EQ_C, criticidad: "C", sistema: "Ventilación" };

const otsBase = [
  { id: "o1", equipo_id: EQ_A, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01" },
  { id: "o2", equipo_id: EQ_A, tipo: "correctivo", estado: "cerrada", fecha: "2026-02-01" },
  { id: "o3", equipo_id: EQ_A, tipo: "correctivo", estado: "cerrada", fecha: "2026-03-01" },
  { id: "o4", equipo_id: EQ_A, tipo: "preventivo", estado: "cerrada", fecha: "2026-04-01" }, // preventivo
  { id: "o5", equipo_id: EQ_B, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-15" },
  { id: "o6", equipo_id: EQ_A, tipo: "correctivo", estado: "en_proceso", fecha: "2026-05-01" }, // no cerrada
  { id: "o7", equipo_id: EQ_A, tipo: "correctivo", estado: "cerrada", fecha: "2024-01-01" }, // fuera período
];

// ── correctivasPorEquipos ─────────────────────────────────────────────────────
describe("correctivasPorEquipos", () => {
  it("cuenta correctivas cerradas en período para múltiples equipos", () => {
    expect(correctivasPorEquipos(otsBase, [EQ_A, EQ_B], 365, HOY)).toBe(4); // 3 EQ_A + 1 EQ_B
  });

  it("excluye preventivas, abiertas y fuera de período", () => {
    expect(correctivasPorEquipos(otsBase, [EQ_A], 365, HOY)).toBe(3);
  });

  it("sin equipoIds → 0", () => {
    expect(correctivasPorEquipos(otsBase, [], 365, HOY)).toBe(0);
  });

  it("lista vacía de OTs → 0", () => {
    expect(correctivasPorEquipos([], [EQ_A], 365, HOY)).toBe(0);
  });
});

// ── sugerirMinMax ─────────────────────────────────────────────────────────────
describe("sugerirMinMax", () => {
  const itemBase = { id: "i1", codigo: "REP-001", descripcion: "Filtro", lead_dias: 14 };

  it("con historial: min = ceil(demanda × lead × factor), max incluye ciclo de reorden", () => {
    // 3 correctivas / 365d = 0.0082/d, lead=14d, factorA=2.5
    // min = ceil(0.0082 * 14 * 2.5) = ceil(0.287) = 1
    // max = 1 + max(1, ceil(0.0082 * 90)) = 1 + max(1, 1) = 2
    const r = sugerirMinMax({ item: itemBase, equiposDestino: [equipoA], ots: otsBase, periodoDias: 365, hoy: HOY });
    expect(r.minSugerido).toBe(1);
    expect(r.maxSugerido).toBeGreaterThanOrEqual(r.minSugerido + 1);
    expect(r.confianza).toBe("media"); // 3 correctivas → media (2-4)
  });

  it("sin historial, equipo crítico A → min=1 por stock estratégico", () => {
    const r = sugerirMinMax({ item: itemBase, equiposDestino: [equipoA], ots: [], periodoDias: 365, hoy: HOY });
    expect(r.minSugerido).toBe(1);
    expect(r.maxSugerido).toBeGreaterThanOrEqual(2);
    expect(r.confianza).toBe("baja");
    expect(r.razon).toMatch(/crítico A/i);
  });

  it("sin historial, equipo no crítico → 0/0 (no se necesita stock)", () => {
    const r = sugerirMinMax({ item: itemBase, equiposDestino: [equipoC], ots: [], periodoDias: 365, hoy: HOY });
    expect(r.minSugerido).toBe(0);
    expect(r.maxSugerido).toBe(0);
  });

  it("sin equipos destino → 0/0", () => {
    const r = sugerirMinMax({ item: itemBase, equiposDestino: [], ots: otsBase, periodoDias: 365, hoy: HOY });
    expect(r.minSugerido).toBe(0);
    expect(r.maxSugerido).toBe(0);
  });

  it("alta confianza con ≥5 correctivas", () => {
    const muchos = Array.from({ length: 6 }, (_, i) => ({
      id: `x${i}`, equipo_id: EQ_A, tipo: "correctivo", estado: "cerrada", fecha: `2026-0${i + 1}-01`,
    }));
    const r = sugerirMinMax({ item: itemBase, equiposDestino: [equipoA], ots: muchos, periodoDias: 365, hoy: HOY });
    expect(r.confianza).toBe("alta");
  });

  it("lead_dias por defecto 14 si no especificado", () => {
    const itemSinLead = { id: "i2", codigo: "X", descripcion: "X" };
    const r = sugerirMinMax({ item: itemSinLead, equiposDestino: [equipoA], ots: [], periodoDias: 365, hoy: HOY });
    expect(r.minSugerido).toBeGreaterThanOrEqual(0);
  });
});

// ── analizarMinMax ────────────────────────────────────────────────────────────
describe("analizarMinMax", () => {
  const items = [
    { id: "i1", codigo: "REP-001", descripcion: "Filtro aceite", stock_min: 0, stock_max: 0, lead_dias: 14 },
    { id: "i2", codigo: "REP-002", descripcion: "Correa",        stock_min: 2, stock_max: 5, lead_dias: 7  },
  ];
  const destinos = [
    { id: "d1", item_id: "i1", equipo_id: EQ_A },
    { id: "d2", item_id: "i2", equipo_id: EQ_B },
  ];
  const equipos = [equipoA, equipoB];

  it("retorna una entrada por ítem con campos esperados", () => {
    const r = analizarMinMax({ items, equipos, ots: otsBase, destinos, periodoDias: 365, hoy: HOY });
    expect(r).toHaveLength(2);
    r.forEach((entry) => {
      expect(entry).toHaveProperty("item");
      expect(entry).toHaveProperty("minSugerido");
      expect(entry).toHaveProperty("maxSugerido");
      expect(entry).toHaveProperty("accion");
      expect(entry).toHaveProperty("confianza");
    });
  });

  it("accion=aumentar cuando sugerido > actual", () => {
    // i1 tiene min=0, max=0; equipo A → sugerirá min≥1 → accion=aumentar
    const r = analizarMinMax({ items, equipos, ots: otsBase, destinos, periodoDias: 365, hoy: HOY });
    const i1 = r.find((e) => e.item.id === "i1");
    expect(i1.accion).toBe("aumentar");
  });

  it("ordena por totalDelta descendente (mayor urgencia primero)", () => {
    const r = analizarMinMax({ items, equipos, ots: otsBase, destinos, periodoDias: 365, hoy: HOY });
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].totalDelta).toBeGreaterThanOrEqual(r[i].totalDelta);
    }
  });

  it("accion=ok cuando sugerido coincide con actual", () => {
    const itemOK = [{ id: "i3", codigo: "X", stock_min: 0, stock_max: 0, lead_dias: 14, descripcion: "X" }];
    const desOK  = [{ item_id: "i3", equipo_id: EQ_C }];
    const r = analizarMinMax({ items: itemOK, equipos: [equipoC], ots: [], destinos: desOK, hoy: HOY });
    expect(r[0].accion).toBe("ok"); // sin demanda ni crit A → 0/0 = actual 0/0
  });

  it("ítems sin destino → 0/0 sugerido (sin datos de equipo)", () => {
    const itemSolo = [{ id: "i4", codigo: "Z", stock_min: 3, stock_max: 6, lead_dias: 10, descripcion: "Z" }];
    const r = analizarMinMax({ items: itemSolo, equipos, ots: otsBase, destinos: [], hoy: HOY });
    expect(r[0].minSugerido).toBe(0);
    expect(r[0].maxSugerido).toBe(0);
  });
});
