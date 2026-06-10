import { describe, it, expect } from "vitest";
import { scheduleCompliance } from "../src/lib/pm.js";

const PLAN = { id: "p1", intervalo_horas: 250 };
const ejec = (planId, horas) => ({ plan_pm_id: planId, horas_realizacion: horas });

describe("scheduleCompliance (PM a tiempo)", () => {
  it("sin datos → pct null (no evaluable, no 0%)", () => {
    expect(scheduleCompliance([], []).pct).toBeNull();
    expect(scheduleCompliance([ejec("p1", 100)], [PLAN]).pct).toBeNull(); // solo 1 ejecución
  });

  it("ejecución dentro del intervalo (+10% tolerancia) cuenta a tiempo", () => {
    // venc = 1000 + 250*1.1 = 1275 → 1270 a tiempo
    const r = scheduleCompliance([ejec("p1", 1000), ejec("p1", 1270)], [PLAN]);
    expect(r.evaluadas).toBe(1);
    expect(r.aTiempo).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("ejecución tarde (más allá de la tolerancia) cuenta fuera de plazo", () => {
    const r = scheduleCompliance([ejec("p1", 1000), ejec("p1", 1400)], [PLAN]);
    expect(r.evaluadas).toBe(1);
    expect(r.aTiempo).toBe(0);
    expect(r.pct).toBe(0);
  });

  it("mezcla: 2 a tiempo + 1 tarde = 67%", () => {
    const hist = [ejec("p1", 0), ejec("p1", 240), ejec("p1", 500), ejec("p1", 900)];
    // evaluadas: 240 (venc 275 ✓), 500 (venc 515 ✓), 900 (venc 775 ✗)
    const r = scheduleCompliance(hist, [PLAN]);
    expect(r.evaluadas).toBe(3);
    expect(r.aTiempo).toBe(2);
    expect(Math.round(r.pct)).toBe(67);
  });

  it("agrega entre varios planes y reporta porPlan", () => {
    const p2 = { id: "p2", intervalo_horas: 100 };
    const hist = [ejec("p1", 0), ejec("p1", 200), ejec("p2", 0), ejec("p2", 350)];
    // p1: 200 <= 275 ✓ · p2: 350 > 110 ✗
    const r = scheduleCompliance(hist, [PLAN, p2]);
    expect(r.evaluadas).toBe(2);
    expect(r.aTiempo).toBe(1);
    expect(r.porPlan.get("p1")).toEqual({ evaluadas: 1, aTiempo: 1 });
    expect(r.porPlan.get("p2")).toEqual({ evaluadas: 1, aTiempo: 0 });
  });

  it("ignora ejecuciones sin plan, sin horas o de planes sin intervalo", () => {
    const r = scheduleCompliance(
      [ejec("p1", 0), ejec("p1", 100), { plan_pm_id: null, horas_realizacion: 50 }, ejec("px", 10), ejec("p1", null)],
      [PLAN, { id: "px", intervalo_horas: 0 }]);
    expect(r.evaluadas).toBe(1); // solo la 2ª de p1
  });
});
