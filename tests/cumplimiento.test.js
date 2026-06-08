import { describe, it, expect } from "vitest";
import { estadoDoc, diasHabilesEntre, docDe } from "../src/lib/cumplimiento.js";

const HOY = new Date("2024-01-01T12:00:00"); // lunes 1 de enero de 2024

describe("estadoDoc", () => {
  it("sin documento → Falta", () => expect(estadoDoc(null).key).toBe("falta"));
  it("sin vencimiento → vigente", () => expect(estadoDoc({}).key).toBe("vigente"));
  it("vencido cuando la fecha pasó", () => expect(estadoDoc({ vencimiento: "2023-12-25" }, HOY).key).toBe("vencido"));
  it("por vencer (≤ 15 días hábiles)", () => expect(estadoDoc({ vencimiento: "2024-01-05" }, HOY).key).toBe("por_vencer"));
  it("vigente cuando está lejos", () => expect(estadoDoc({ vencimiento: "2024-06-01" }, HOY).key).toBe("vigente"));
});

describe("diasHabilesEntre", () => {
  it("cuenta solo lun-vie (Mon→Mon = 5)", () => {
    expect(diasHabilesEntre("2024-01-01", "2024-01-08")).toBe(5);
  });
  it("mismo día = 0", () => expect(diasHabilesEntre("2024-01-01", "2024-01-01")).toBe(0));
});

describe("docDe", () => {
  const docs = [
    { embarcacion_id: "n1", tipo: "Seguro", vencimiento: "2026-01-01" },
    { embarcacion_id: "n1", tipo: "Seguro", vencimiento: "2027-01-01" },
    { embarcacion_id: "n2", tipo: "Seguro", vencimiento: "2030-01-01" },
  ];
  it("devuelve el de vencimiento más lejano de la nave/tipo", () => {
    expect(docDe(docs, "n1", "Seguro").vencimiento).toBe("2027-01-01");
  });
  it("null si no existe", () => expect(docDe(docs, "n3", "Seguro")).toBeNull());
});
