import { describe, it, expect } from "vitest";
import { buildEquipoTree } from "../src/lib/equipTree.js";

const eq = (id, parent_id, extra = {}) => ({ id, parent_id, id_visible: id, sistema: id, embarcacion_id: "n1", ...extra });

describe("buildEquipoTree", () => {
  it("ordena padre antes que hijos y asigna depth/rootId", () => {
    const arr = [eq("hijo", "raiz"), eq("raiz", null), eq("nieto", "hijo")];
    const t = buildEquipoTree(arr);
    const ids = t.map((n) => n.id);
    expect(ids.indexOf("raiz")).toBeLessThan(ids.indexOf("hijo"));
    expect(ids.indexOf("hijo")).toBeLessThan(ids.indexOf("nieto"));
    const byId = Object.fromEntries(t.map((n) => [n.id, n]));
    expect(byId.raiz.depth).toBe(0);
    expect(byId.hijo.depth).toBe(1);
    expect(byId.nieto.depth).toBe(2);
    expect(byId.nieto.rootId).toBe(byId.raiz.id);
  });

  it("trata como raíz a un huérfano (padre inexistente) sin perderlo", () => {
    const t = buildEquipoTree([eq("huerfano", "noexiste")]);
    expect(t).toHaveLength(1);
    expect(t[0].depth).toBe(0);
  });

  it("no entra en bucle con un ciclo (a→b→a)", () => {
    const t = buildEquipoTree([eq("a", "b"), eq("b", "a")]);
    expect(t.length).toBeLessThanOrEqual(2); // no se cuelga ni duplica infinito
  });

  it("respeta el orden manual (campo orden) entre hermanos", () => {
    const arr = [
      eq("s1", null, { orden: 20 }),
      eq("s2", null, { orden: 10 }),
    ];
    const ids = buildEquipoTree(arr).map((n) => n.id);
    expect(ids).toEqual(["s2", "s1"]); // menor orden primero
  });
});
