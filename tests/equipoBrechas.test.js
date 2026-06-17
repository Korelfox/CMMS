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

  it("marca sin fecha de instalación en equipos tipo fecha/mixto", () => {
    const nav = eq({
      id: "nav",
      tipo_nodo: "subsistema",
      id_visible: "BC01-NAV-GPS",
      horometro: "no",
      ficha: { _registro: "fecha" },
      parent_id: "p1",
    });
    const mixto = eq({
      id: "vir",
      id_visible: "BC01-FISH-VIR",
      ficha: { _registro: "mixto" },
    });
    const ok = eq({
      id: "ok-nav",
      tipo_nodo: "subsistema",
      id_visible: "BC01-NAV-RAD",
      horometro: "no",
      ficha: { _registro: "fecha", fecha_instalacion: "2024-03-15" },
      parent_id: "p1",
    });
    const { idsConHijos } = buildIndices([nav, mixto, ok]);
    const bNav = brechasDeEquipo(nav, new Map([[nav.id, nav]]), new Map(), idsConHijos);
    expect(bNav.some((x) => x.tipo === "sin_fecha_instalacion")).toBe(true);
    const bMix = brechasDeEquipo(mixto, new Map([[mixto.id, mixto]]), new Map(), idsConHijos);
    expect(bMix.some((x) => x.tipo === "sin_fecha_instalacion")).toBe(true);
    const bOk = brechasDeEquipo(ok, new Map([[ok.id, ok]]), new Map(), idsConHijos);
    expect(bOk.some((x) => x.tipo === "sin_fecha_instalacion")).toBe(false);
  });

  it("infiera fecha por id_visible sin _registro en ficha", () => {
    const str = eq({
      id: "str",
      tipo_nodo: "subsistema",
      id_visible: "BC01-STR-CAS",
      horometro: "no",
      parent_id: "p1",
    });
    const { idsConHijos } = buildIndices([str]);
    const b = brechasDeEquipo(str, new Map([[str.id, str]]), new Map(), idsConHijos);
    expect(b.some((x) => x.tipo === "sin_fecha_instalacion")).toBe(true);
  });
});
