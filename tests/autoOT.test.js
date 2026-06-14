import { describe, it, expect } from "vitest";
import { generarOTsPreventivas, huellaPM } from "../src/lib/autoOT.js";

// Equipo con horómetro propio a 1000 h.
const EQ = { id: "e1", embarcacion_id: "n1", sistema: "Motor Ppal", horas_actual: 1000 };

// Planes: a=verde (200/250), b=amarillo (225/250), c=rojo (300/250).
const planVerde    = { id: "a", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 800, descripcion: "Cambio aceite" };
const planAmarillo = { id: "b", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 775, descripcion: "Filtros" };
const planRojo     = { id: "c", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 700, descripcion: "Inyectores" };

describe("huellaPM (idempotencia)", () => {
  it("horas: depende del hito horas_ult_pm", () => {
    expect(huellaPM(planRojo)).toBe("pm:c:700");
    expect(huellaPM({ ...planRojo, horas_ult_pm: 950 })).toBe("pm:c:950"); // tras ejecutar el PM
  });
  it("horas sin hito previo → base 0", () => {
    expect(huellaPM({ id: "x", intervalo_horas: 100 })).toBe("pm:x:0");
  });
  it("calendario: depende de fecha_ult_pm; nunca ejecutado → 'inicio'", () => {
    expect(huellaPM({ id: "k", tipo_disparador: "calendario", fecha_ult_pm: "2026-01-01" })).toBe("pm:k:2026-01-01");
    expect(huellaPM({ id: "k", tipo_disparador: "calendario" })).toBe("pm:k:inicio");
  });
  it("sin id → null", () => expect(huellaPM({})).toBeNull());
});

describe("generarOTsPreventivas (disparador por horas)", () => {
  it("solo genera vencidos (rojo); ignora verde y amarillo por defecto", () => {
    const { sugerencias, total } = generarOTsPreventivas({ planes: [planVerde, planAmarillo, planRojo], equipos: [EQ] });
    expect(total).toBe(1);
    expect(sugerencias[0].plan_id).toBe("c");
    expect(sugerencias[0].huella).toBe("pm:c:700");
    expect(sugerencias[0].prioridad).toBe("alta");
    expect(sugerencias[0].tipo).toBe("preventivo");
    expect(sugerencias[0].embarcacion_id).toBe("n1");
  });

  it("incluirProximos suma los amarillos con prioridad media", () => {
    const { sugerencias } = generarOTsPreventivas(
      { planes: [planVerde, planAmarillo, planRojo], equipos: [EQ] },
      { incluirProximos: true }
    );
    expect(sugerencias.map((s) => s.plan_id).sort()).toEqual(["b", "c"]);
    expect(sugerencias.find((s) => s.plan_id === "b").prioridad).toBe("media");
  });

  it("el motivo explica el disparo con los números reales", () => {
    const { sugerencias } = generarOTsPreventivas({ planes: [planRojo], equipos: [EQ] });
    // 1000 h, PM 250 h, último a 700 h → +50 h de exceso
    expect(sugerencias[0].motivo).toContain("1000 h");
    expect(sugerencias[0].motivo).toContain("250 h");
    expect(sugerencias[0].motivo).toContain("+50 h");
  });

  it("idempotencia: si ya existe OT con esa huella, va a yaCubiertas y no se duplica", () => {
    const ots = [{ id: "ot1", huella: "pm:c:700", estado: "planificada" }];
    const r = generarOTsPreventivas({ planes: [planRojo], equipos: [EQ], ots });
    expect(r.total).toBe(0);
    expect(r.sugerencias).toEqual([]);
    expect(r.yaCubiertas.map((y) => y.plan_id)).toEqual(["c"]);
  });

  it("al avanzar el hito (PM ejecutado) la huella cambia y se libera el próximo ciclo", () => {
    // OT vieja con huella del ciclo anterior; el plan ya avanzó su hito.
    const ots = [{ id: "ot1", huella: "pm:c:700" }];
    const planAvanzado = { ...planRojo, horas_ult_pm: 950 }; // 1000-950=50 → aún verde
    // a 50h de 250 es verde, no genera; subimos horas del equipo para revencer.
    const eqMasHoras = { ...EQ, horas_actual: 1250 };          // 1250-950=300 → rojo otra vez
    const r = generarOTsPreventivas({ planes: [planAvanzado], equipos: [eqMasHoras], ots });
    expect(r.total).toBe(1);
    expect(r.sugerencias[0].huella).toBe("pm:c:950");          // huella nueva ≠ la cubierta
  });

  it("plan sin equipo no genera (no hay dónde colgar la OT)", () => {
    const huerfano = { id: "h", equipo_id: "no-existe", intervalo_horas: 100, horas_ult_pm: 0 };
    const r = generarOTsPreventivas({ planes: [huerfano], equipos: [EQ] });
    expect(r.total).toBe(0);
  });

  it("calendario nunca ejecutado → vencido, con motivo claro", () => {
    const cal = { id: "k", equipo_id: "e1", tipo_disparador: "calendario", unidad_calendario: "mensual", intervalo_calendario: 1, descripcion: "Inspección" };
    const { sugerencias } = generarOTsPreventivas({ planes: [cal], equipos: [EQ] });
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0].huella).toBe("pm:k:inicio");
    expect(sugerencias[0].motivo).toContain("nunca ejecutado");
    expect(sugerencias[0].descripcion).toContain("PM Cal");
  });

  it("ordena por mayor exceso primero", () => {
    const p1 = { id: "p1", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 700 }; // +50
    const p2 = { id: "p2", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 400 }; // +350
    const { sugerencias } = generarOTsPreventivas({ planes: [p1, p2], equipos: [EQ] });
    expect(sugerencias.map((s) => s.plan_id)).toEqual(["p2", "p1"]);
  });

  it("entradas vacías → estructura vacía estable", () => {
    expect(generarOTsPreventivas()).toEqual({ sugerencias: [], yaCubiertas: [], total: 0 });
    expect(generarOTsPreventivas({})).toEqual({ sugerencias: [], yaCubiertas: [], total: 0 });
  });
});
