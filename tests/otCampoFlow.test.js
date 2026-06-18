import { describe, it, expect } from "vitest";
import {
  CAMPO_WIZARD_STEPS, stepIndex, nextCampoStep, prevCampoStep, findOtEnEjecucion,
} from "../src/lib/otCampoFlow.js";

describe("otCampoFlow", () => {
  it("define 4 pasos con repuestos opcional", () => {
    expect(CAMPO_WIZARD_STEPS.map((s) => s.id)).toEqual(["checklist", "fotos", "repuestos", "cierre"]);
    expect(CAMPO_WIZARD_STEPS.find((s) => s.id === "repuestos")?.optional).toBe(true);
  });

  it("desde fotos puede saltar repuestos", () => {
    expect(nextCampoStep("fotos", { skipRepuestos: true })).toBe("cierre");
    expect(nextCampoStep("fotos")).toBe("repuestos");
  });

  it("anterior retrocede un paso", () => {
    expect(prevCampoStep("cierre")).toBe("repuestos");
    expect(prevCampoStep("checklist")).toBe("checklist");
  });

  it("encuentra OT en ejecución", () => {
    const ots = [{ id: "a", estado: "planificada" }, { id: "b", estado: "en_ejecucion" }];
    expect(findOtEnEjecucion(ots)?.id).toBe("b");
    expect(stepIndex("fotos")).toBe(1);
  });
});
