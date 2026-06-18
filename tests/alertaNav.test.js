import { describe, it, expect } from "vitest";
import { resolveAlertaNav } from "../src/lib/alertaNav.js";
import { sugerirSiguienteAccion } from "../src/lib/campoAccion.js";

describe("alertaNav", () => {
  it("OT en Campo abre tab Trabajo con wizard", () => {
    const r = resolveAlertaNav({ cat: "ot", ref: "ot-1" }, { appMode: "campo" });
    expect(r.destino).toBe("trabajo");
    expect(r.campoEvent?.otId).toBe("ot-1");
    expect(r.campoEvent?.openWizard).toBe(true);
  });

  it("OT en Oficina abre ejecución en detalle", () => {
    const r = resolveAlertaNav({ cat: "ot", ref: "ot-1" }, { appMode: "oficina" });
    expect(r.destino).toBe("ots");
    expect(r.params?.otId).toBe("ot-1");
    expect(r.params?.detailTab).toBe("ejecucion");
  });

  it("datos sin valorizar abre tab costos", () => {
    const r = resolveAlertaNav({ cat: "datos", ref: "ot-2", titulo: "OT sin valorizar · OT-002" }, { appMode: "oficina" });
    expect(r.params?.detailTab).toBe("costos");
  });

  it("stock en Campo va a inventario con filtro", () => {
    const r = resolveAlertaNav({ cat: "stock", sev: "red", ref: "item-1" }, { appMode: "campo" });
    expect(r.destino).toBe("inventario");
    expect(r.params?.filtroStock).toBe("bajo");
    expect(r.params?.campo).toBe(true);
  });

  it("navigateFromAlerta en Campo usa campoEvent de OT", () => {
    const r = resolveAlertaNav({ cat: "ot", ref: "x" }, { appMode: "campo" });
    expect(r.campoEvent?.tab).toBe("trabajo");
    expect(r.campoEvent?.otId).toBe("x");
  });
});

describe("campoAccion", () => {
  it("prioriza OT en ejecución", () => {
    const acc = sugerirSiguienteAccion({
      ots: [{ id: "a", folio: "OT-1", estado: "en_ejecucion", checklist: [{ ok: true }, {}] }],
      enEjecucion: { id: "a", folio: "OT-1", estado: "en_ejecucion", checklist: [{ ok: true }, {}] },
    });
    expect(acc?.kind).toBe("ot_continue");
    expect(acc?.otId).toBe("a");
  });

  it("sugiere OT crítica si no hay ejecución", () => {
    const acc = sugerirSiguienteAccion({
      ots: [{ id: "b", folio: "OT-2", prioridad: "critica", descripcion: "Fuga" }],
    });
    expect(acc?.kind).toBe("ot_start");
    expect(acc?.otId).toBe("b");
  });
});
