import { describe, it, expect } from "vitest";
import { scheduleCompliance, statusPlan, evaluarPlanes } from "../src/lib/pm.js";

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

describe("statusPlan (semáforo de horas)", () => {
  it("verde bajo el 90% del intervalo", () => expect(statusPlan(200, 250)[0]).toBe("green"));
  it("amarillo desde el 90%", () => expect(statusPlan(225, 250)).toEqual(["yellow", "Próximo"]));
  it("rojo al alcanzar el intervalo", () => expect(statusPlan(250, 250)).toEqual(["red", "Vencido"]));
});

describe("evaluarPlanes (semáforo real para Alertas/Tablero)", () => {
  const EQ = { id: "e1", embarcacion_id: "n1", sistema: "Motor Ppal", horas_actual: 1000 };

  it("plan de horas usa intervalo y hito propios del plan", () => {
    const planes = [
      { id: "a", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 800 },  // 200h → verde
      { id: "b", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 775 },  // 225h → amarillo
      { id: "c", equipo_id: "e1", intervalo_horas: 250, horas_ult_pm: 700 },  // 300h → rojo
    ];
    const r = evaluarPlanes(planes, [EQ]);
    expect(r.map((x) => x.tone)).toEqual(["green", "yellow", "red"]);
    expect(r[2].elapsed).toBe(300);
    expect(r[2].limite).toBe(250);
    expect(r[2].esCalendario).toBe(false);
  });

  it("plan calendario sin historial muestra 'Sin historial' gris, no 'Vencido'", () => {
    const planes = [{ id: "k", equipo_id: "e1", tipo_disparador: "calendario", unidad_calendario: "mensual", intervalo_calendario: 1 }];
    const [r] = evaluarPlanes(planes, [EQ]);
    expect(r.tone).toBe("slate");
    expect(r.label).toBe("Sin historial");
    expect(r.elapsed).toBe(Infinity);
    expect(r.limite).toBe(30);
    expect(r.esCalendario).toBe(true);
  });

  it("plan calendario recién realizado queda verde", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const planes = [{ id: "k", equipo_id: "e1", tipo_disparador: "calendario", unidad_calendario: "mensual", fecha_ult_pm: hoy }];
    expect(evaluarPlanes(planes, [EQ])[0].tone).toBe("green");
  });

  it("excluye planes inactivos y no crashea sin equipo o sin intervalo", () => {
    const planes = [
      { id: "off", equipo_id: "e1", intervalo_horas: 100, activo: false },
      { id: "huerfano", equipo_id: "no-existe", intervalo_horas: 100, horas_ult_pm: 0 },
      { id: "sin-intervalo", equipo_id: "e1", intervalo_horas: 0, horas_ult_pm: 0 },
    ];
    const r = evaluarPlanes(planes, [EQ]);
    expect(r.map((x) => x.plan.id)).toEqual(["huerfano", "sin-intervalo"]);
    expect(r[0].equipo).toBeNull();          // sin equipo → elapsed 0-0, verde, sin crash
    expect(r[1].tone).toBe("green");         // intervalo 0 no genera falso vencido
  });

  it("listas vacías o nulas → []", () => {
    expect(evaluarPlanes()).toEqual([]);
    expect(evaluarPlanes(null, null)).toEqual([]);
  });
});
