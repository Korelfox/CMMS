import { describe, it, expect } from "vitest";
import { resolveAlertaNav } from "../src/lib/alertaNav.js";
import { sugerirSiguienteAccionOficina } from "../src/lib/oficinaAccion.js";

describe("alertaNav deep links extendidos", () => {
  it("documento incluye docId y filtro embarcación", () => {
    const r = resolveAlertaNav({ cat: "documento", ref: "doc-1", embId: "emb-1" }, { appMode: "oficina" });
    expect(r.destino).toBe("cumplimiento");
    expect(r.params?.docId).toBe("doc-1");
    expect(r.params?.filtro).toBe("emb-1");
  });

  it("fmeca incluye fallaId", () => {
    const r = resolveAlertaNav({ cat: "fmeca", ref: "f-1", embId: "emb-2" }, { appMode: "oficina" });
    expect(r.destino).toBe("fallas");
    expect(r.params?.fallaId).toBe("f-1");
    expect(r.params?.embFiltro).toBe("emb-2");
  });

  it("compra incluye compraId", () => {
    const r = resolveAlertaNav({ cat: "compra", ref: "oc-9" }, { appMode: "oficina" });
    expect(r.destino).toBe("almacen");
    expect(r.params?.compraId).toBe("oc-9");
    expect(r.params?.tab).toBe("compras");
  });

  it("sla incluye solicitudId", () => {
    const r = resolveAlertaNav({ cat: "sla", ref: "sol-3", sev: "red" }, { appMode: "oficina" });
    expect(r.destino).toBe("solicitudes");
    expect(r.params?.solicitudId).toBe("sol-3");
    expect(r.params?.filtro).toBe("pendiente");
  });

  it("pm incluye planId", () => {
    const r = resolveAlertaNav({ cat: "pm", ref: "plan-7", embId: "emb-1" }, { appMode: "oficina" });
    expect(r.params?.planId).toBe("plan-7");
  });

  it("pdm incluye equipoId y vista series", () => {
    const r = resolveAlertaNav({ cat: "pdm", equipoId: "eq-1" }, { appMode: "oficina" });
    expect(r.destino).toBe("pdm");
    expect(r.params?.equipoId).toBe("eq-1");
    expect(r.params?.vista).toBe("series");
  });
});

describe("oficinaAccion", () => {
  it("prioriza SLA vencido sobre OT media", () => {
    const hace5h = new Date(Date.now() - 5 * 36e5).toISOString();
    const acc = sugerirSiguienteAccionOficina({
      ots: [{ id: "o1", folio: "OT-1", prioridad: "media", estado: "planificada" }],
      solicitudes: [{ id: "s1", folio: "SOL-1", estado: "pendiente", prioridad: "critica", descripcion: "Fuga", created_at: hace5h }],
      planesEval: [],
    });
    expect(acc?.kind).toBe("nav");
    expect(acc?.alerta?.cat).toBe("sla");
  });

  it("sugiere PM vencido si no hay OT crítica ni SLA", () => {
    const acc = sugerirSiguienteAccionOficina({
      ots: [],
      solicitudes: [],
      planesEval: [{ tone: "red", plan: { id: "p1", descripcion: "Cambio aceite" }, equipo: { id: "e1" }, label: "Vencido" }],
    });
    expect(acc?.destino).toBe("planpm");
  });
});
