import { describe, it, expect } from "vitest";
import {
  resolveEmbarcacion,
  filterByEmbarcacion,
  filterFleetForEmbarcacion,
  readAppMode,
} from "../src/lib/embarcacionActiva.js";

const EMBS = [
  { id: "e1", codigo: "ATL-03", nombre: "Atlántico", embarcacion_id: "e1" },
  { id: "e2", codigo: "PAC-07", nombre: "Pacífico", embarcacion_id: "e2" },
];

describe("embarcacionActiva", () => {
  it("resolveEmbarcacion encuentra por id", () => {
    expect(resolveEmbarcacion(EMBS, "e1")?.codigo).toBe("ATL-03");
    expect(resolveEmbarcacion(EMBS, "x")).toBeNull();
  });

  it("filterByEmbarcacion filtra filas", () => {
    const ots = [
      { id: 1, embarcacion_id: "e1" },
      { id: 2, embarcacion_id: "e2" },
    ];
    expect(filterByEmbarcacion(ots, "e1")).toHaveLength(1);
    expect(filterByEmbarcacion(ots, null)).toHaveLength(2);
  });

  it("filterFleetForEmbarcacion acota equipos y derivados", () => {
    const raw = {
      embarcaciones: EMBS,
      equipos: [
        { id: "q1", embarcacion_id: "e1" },
        { id: "q2", embarcacion_id: "e2" },
      ],
      ordenes_trabajo: [{ id: "o1", embarcacion_id: "e1" }],
      planes_pm: [{ id: "p1", equipo_id: "q1" }, { id: "p2", equipo_id: "q2" }],
    };
    const f = filterFleetForEmbarcacion(raw, "e1");
    expect(f.equipos).toHaveLength(1);
    expect(f.ordenes_trabajo).toHaveLength(1);
    expect(f.planes_pm).toHaveLength(1);
  });

  it("readAppMode devuelve default si no hay valor válido", () => {
    expect(readAppMode("campo")).toBe("campo");
  });
});
