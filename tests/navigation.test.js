import { describe, it, expect } from "vitest";
import {
  OFICINA_GROUPS, ANALISIS_IDS, ANALISIS_HUB_ID, CAMPO_TABS, NAV_META, filterNavIds, allNavItems, labelForView,
} from "../src/lib/navigation.js";

describe("navigation", () => {
  it("agrupa módulos Oficina sin duplicar OCR en Análisis", () => {
    // OCR Facturas vive en Materiales & Compras (el sidebar se reorganizó por
    // ciclo SMRP/ISO 55001; ya no existe el grupo "operacion") y no se duplica
    // en el hub Análisis.
    const conOcr = OFICINA_GROUPS.filter((g) => g.items.includes("ocr"));
    expect(conOcr.map((g) => g.id)).toEqual(["materiales"]);
    expect(ANALISIS_IDS).not.toContain("ocr");
  });

  it("filtra entradas admin", () => {
    const perms = { isAdmin: (r) => r === "admin_empresa", isSuperAdmin: () => false };
    const ids = filterNavIds(["usuarios", "ots"], { rol: "tecnico" }, perms);
    expect(ids).toEqual(["ots"]);
  });

  it("expone tabs Campo", () => {
    expect(CAMPO_TABS.map((t) => t.id)).toEqual(["hoy", "trabajo", "horometros", "mas"]);
  });

  it("resuelve etiquetas", () => {
    expect(labelForView("hoy")).toBe("Hoy");
    expect(labelForView("ots")).toBe(NAV_META.ots.label);
    expect(labelForView(ANALISIS_HUB_ID)).toBe("Análisis");
  });

  it("allNavItems incluye operación y análisis visibles", () => {
    const perms = { isAdmin: () => true, isSuperAdmin: () => true };
    const items = allNavItems({ rol: "admin_empresa" }, perms);
    expect(items.some((i) => i.id === "dashboard")).toBe(true);
    expect(items.some((i) => i.id === "ots")).toBe(true);
  });
});
