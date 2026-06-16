import { describe, it, expect } from "vitest";
import {
  analizarBrechas, brechasDeEquipo, buildIndices, esHojaEvaluable, horometroConfigurado,
} from "../src/lib/equipoBrechas.js";

const emb = "emb-1";

function eq(overrides) {
  return {
    id: "e1",
    embarcacion_id: emb,
    id_visible: "AUR-PROP-MTR",
    sistema: "Motor",
    tipo_nodo: "componente",
    criticidad: "A",
    horometro: "propio",
    marca: "Wärtsilä",
    modelo: "6L26",
    estado: "operativo",
    parent_id: "p1",
    ...overrides,
  };
}

describe("equipoBrechas", () => {
  it("marca sin criticidad en hoja evaluable", () => {
    const e = eq({ criticidad: null });
    const { idsConHijos } = buildIndices([e]);
    const b = brechasDeEquipo(e, new Map([[e.id, e]]), new Map(), idsConHijos);
    expect(b.some((x) => x.tipo === "sin_criticidad")).toBe(true);
  });

  it("marca sin horómetro en componente", () => {
    const e = eq({ horometro: null });
    const { idsConHijos } = buildIndices([e]);
    const b = brechasDeEquipo(e, new Map([[e.id, e]]), new Map(), idsConHijos);
    expect(b.some((x) => x.tipo === "sin_horometro")).toBe(true);
  });

  it("horometro no cuenta como sin configurar", () => {
    expect(horometroConfigurado(eq({ horometro: "no" }))).toBe(true);
  });

  it("crítico A sin repuestos enlazados", () => {
    const e = eq({ criticidad: "A" });
    const { idsConHijos } = buildIndices([e]);
    const b = brechasDeEquipo(e, new Map([[e.id, e]]), new Map(), idsConHijos);
    expect(b.some((x) => x.tipo === "sin_repuestos")).toBe(true);
  });

  it("calcula salud del registro", () => {
    const padre = eq({ id: "p1", tipo_nodo: "subsistema", parent_id: null, criticidad: "B", horometro: "no" });
    const ok = eq({ id: "ok", parent_id: "p1" });
    const bad = eq({ id: "bad", parent_id: "p1", criticidad: null });
    const r = analizarBrechas([padre, ok, bad], [{ equipo_id: "ok", item_id: "i1" }]);
    expect(r.evaluables).toBe(2);
    expect(r.completos).toBe(1);
    expect(r.salud).toBe(50);
    expect(r.total).toBeGreaterThan(0);
  });

  it("no evalúa sistemas contenedores", () => {
    const sis = eq({ id: "s", tipo_nodo: "sistema", parent_id: null });
    expect(esHojaEvaluable(sis, new Set(["s"]))).toBe(false);
  });
});
