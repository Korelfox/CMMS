import { describe, it, expect } from "vitest";
import { blankOT, folioOT, costoOT, kpisOT, filtrarOTs, buscarOTs, ordenarOTs, validarNuevaOT } from "../src/lib/ot.js";

describe("OT · folio", () => {
  it("online: máximo existente + 1 con padding a 3", () => {
    expect(folioOT([], true)).toBe("OT-001");
    expect(folioOT([{ folio: "OT-011" }], true)).toBe("OT-012");
  });
  it("online: no repite folios tras borrar OTs intermedias", () => {
    // había 9 OTs, se borraron 2..8 — count+1 habría duplicado OT-003
    const ots = [{ folio: "OT-001" }, { folio: "OT-009" }];
    expect(folioOT(ots, true)).toBe("OT-010");
  });
  it("online: ignora folios fuera del esquema (S/N, RF, legacy PM)", () => {
    const ots = [
      { folio: "OT-S/N-06-07-0915" }, { folio: "OT-RF-123456" },
      { folio: "PM-654321" }, { folio: "OT-002" }, { folio: null },
    ];
    expect(folioOT(ots, true)).toBe("OT-003");
  });
  it("offline: provisional S/N sin ':' problemáticos", () => {
    const f = folioOT([], false, "2026-06-07T09:15:00.000Z");
    expect(f.startsWith("OT-S/N-")).toBe(true);
    expect(f).not.toContain(":");
  });
});

describe("OT · costo y KPIs", () => {
  it("costoOT = MO + Mat (tolera faltantes)", () => {
    expect(costoOT({ costo_mo: 1000, costo_mat: 500 })).toBe(1500);
    expect(costoOT({})).toBe(0);
  });
  it("kpisOT cuenta abiertas, preventivas, proactividad y costo", () => {
    const ots = [
      { estado: "cerrada", tipo: "correctivo", costo_mo: 1000, costo_mat: 0 },
      { estado: "solicitada", tipo: "preventivo", costo_mo: 0, costo_mat: 500 },
      { estado: "en_ejecucion", tipo: "preventivo", costo_mo: 0, costo_mat: 0 },
    ];
    const k = kpisOT(ots);
    expect(k.total).toBe(3);
    expect(k.abiertas).toBe(2);
    expect(k.preventivas).toBe(2);
    expect(k.propProactivo).toBe(67);
    expect(k.costoTotal).toBe(1500);
  });
  it("kpisOT vacío → proactividad 0", () => {
    expect(kpisOT([]).propProactivo).toBe(0);
  });
});

describe("OT · filtro de lista", () => {
  const ots = [
    { id: 1, estado: "cerrada", embarcacion_id: "n1" },
    { id: 2, estado: "solicitada", embarcacion_id: "n2" },
  ];
  it("all devuelve todas", () => expect(filtrarOTs(ots, "all")).toHaveLength(2));
  it("filtra por estado", () => expect(filtrarOTs(ots, "cerrada").map((o) => o.id)).toEqual([1]));
  it("filtra por embarcación", () => expect(filtrarOTs(ots, "n2").map((o) => o.id)).toEqual([2]));
  it("filtra OT abiertas (no cerradas)", () => {
    expect(filtrarOTs(ots, "abiertas").map((o) => o.id)).toEqual([2]);
  });
});

describe("OT · validación de OT nueva", () => {
  it("exige embarcación y descripción", () => {
    expect(validarNuevaOT({ descripcion: "x" })).toBeTruthy();
    expect(validarNuevaOT({ embarcacion_id: "n", descripcion: "   " })).toBeTruthy();
  });
  it("válida cuando tiene ambas", () => {
    expect(validarNuevaOT({ embarcacion_id: "n", descripcion: "cambio aceite" })).toBeNull();
  });
});

describe("OT · orden de lista", () => {
  it("abiertas primero, cerradas al final", () => {
    const ots = [
      { id: 1, estado: "cerrada", prioridad: "media", fecha: "2026-06-01" },
      { id: 2, estado: "solicitada", prioridad: "baja", fecha: "2026-06-05" },
      { id: 3, estado: "en_ejecucion", prioridad: "critica", fecha: "2026-06-03" },
      { id: 4, estado: "cerrada", prioridad: "alta", fecha: "2026-06-02" },
    ];
    expect(ordenarOTs(ots).map((o) => o.id)).toEqual([3, 2, 4, 1]);
  });
  it("dentro de abiertas prioriza criticidad y fecha", () => {
    const ots = [
      { id: "a", estado: "solicitada", prioridad: "media", fecha: "2026-06-01" },
      { id: "b", estado: "planificada", prioridad: "alta", fecha: "2026-06-02" },
      { id: "c", estado: "programada", prioridad: "alta", fecha: "2026-06-05" },
    ];
    expect(ordenarOTs(ots).map((o) => o.id)).toEqual(["c", "b", "a"]);
  });
});

describe("OT · búsqueda", () => {
  it("filtra por folio, sistema o descripción", () => {
    const ots = [
      { folio: "OT-001", sistema: "Motor", descripcion: "cambio aceite", embarcacion_id: "a" },
      { folio: "OT-002", sistema: "Bomba", descripcion: "fuga sello", embarcacion_id: "b" },
    ];
    expect(buscarOTs(ots, "motor").length).toBe(1);
    expect(buscarOTs(ots, "OT-002").length).toBe(1);
    expect(buscarOTs(ots, "fuga").length).toBe(1);
    expect(buscarOTs(ots, "", () => "Aurora").length).toBe(2);
  });
});

describe("OT · formulario en blanco", () => {
  it("trae defaults coherentes", () => {
    const b = blankOT("2026-06-07");
    expect(b.estado).toBe("solicitada");
    expect(b.tipo).toBe("preventivo");
    expect(b.fecha).toBe("2026-06-07");
    expect(b.costo_mo).toBe(0);
  });
});
