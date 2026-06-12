import { describe, it, expect } from "vitest";
import { evaluarZarpe, diasEnMar, diasAbierta, scoreBacklog, nivelScore, semanasCuadrilla } from "../src/lib/operacional.js";

const HOY = "2026-06-12";
const EMB = "nave-1";

describe("evaluarZarpe (semáforo GO/NO-GO)", () => {
  it("sin hallazgos → GO", () => {
    const r = evaluarZarpe(EMB, { equipos: [], ots: [], documentos: [], planesEval: [], hoy: HOY });
    expect(r.nivel).toBe("go");
    expect(r.bloqueos).toHaveLength(0);
    expect(r.advertencias).toHaveLength(0);
  });

  it("equipo crítico A fuera de servicio → NO-GO; no crítico → condicional", () => {
    const base = { ots: [], documentos: [], planesEval: [], hoy: HOY };
    const critico = evaluarZarpe(EMB, { ...base, equipos: [{ embarcacion_id: EMB, sistema: "Motor Ppal", estado: "fuera_servicio", criticidad: "A" }] });
    expect(critico.nivel).toBe("nogo");
    const menor = evaluarZarpe(EMB, { ...base, equipos: [{ embarcacion_id: EMB, sistema: "Bomba aux", estado: "fuera_servicio", criticidad: "C" }] });
    expect(menor.nivel).toBe("condicional");
  });

  it("crítico A en reparación → condicional", () => {
    const r = evaluarZarpe(EMB, { equipos: [{ embarcacion_id: EMB, sistema: "Gobierno", estado: "en_reparacion", criticidad: "A" }], ots: [], documentos: [], planesEval: [], hoy: HOY });
    expect(r.nivel).toBe("condicional");
  });

  it("OT crítica abierta bloquea; alta advierte; cerrada no cuenta", () => {
    const ots = [
      { embarcacion_id: EMB, estado: "programada", prioridad: "critica", folio: "OT-001", id: "x" },
      { embarcacion_id: EMB, estado: "cerrada", prioridad: "critica", folio: "OT-002" },
    ];
    const r = evaluarZarpe(EMB, { equipos: [], ots, documentos: [], planesEval: [], hoy: HOY });
    expect(r.nivel).toBe("nogo");
    expect(r.bloqueos).toHaveLength(1);
    expect(r.bloqueos[0].ref).toBe("x");
  });

  it("documento vencido → NO-GO; por vencer en ≤7 días → condicional", () => {
    const base = { equipos: [], ots: [], planesEval: [], hoy: HOY };
    expect(evaluarZarpe(EMB, { ...base, documentos: [{ embarcacion_id: EMB, tipo: "Cert. navegabilidad", vencimiento: "2026-06-10" }] }).nivel).toBe("nogo");
    expect(evaluarZarpe(EMB, { ...base, documentos: [{ embarcacion_id: EMB, tipo: "Matrícula", vencimiento: "2026-06-18" }] }).nivel).toBe("condicional");
    expect(evaluarZarpe(EMB, { ...base, documentos: [{ embarcacion_id: EMB, tipo: "Matrícula", vencimiento: "2026-08-01" }] }).nivel).toBe("go");
  });

  it("PM vencido en equipo crítico A → condicional; en B no afecta", () => {
    const eqA = { id: "e1", embarcacion_id: EMB, sistema: "Motor", criticidad: "A" };
    const eqB = { id: "e2", embarcacion_id: EMB, sistema: "Aux", criticidad: "B" };
    const base = { equipos: [], ots: [], documentos: [], hoy: HOY };
    expect(evaluarZarpe(EMB, { ...base, planesEval: [{ tone: "red", plan: { descripcion: "Cambio aceite" }, equipo: eqA }] }).nivel).toBe("condicional");
    expect(evaluarZarpe(EMB, { ...base, planesEval: [{ tone: "red", plan: { descripcion: "Cambio aceite" }, equipo: eqB }] }).nivel).toBe("go");
  });

  it("ignora hallazgos de otras embarcaciones", () => {
    const r = evaluarZarpe(EMB, {
      equipos: [{ embarcacion_id: "otra", estado: "fuera_servicio", criticidad: "A", sistema: "X" }],
      ots: [{ embarcacion_id: "otra", estado: "programada", prioridad: "critica" }],
      documentos: [{ embarcacion_id: "otra", tipo: "Doc", vencimiento: "2020-01-01" }],
      planesEval: [], hoy: HOY,
    });
    expect(r.nivel).toBe("go");
  });
});

describe("diasEnMar (utilización 30 días)", () => {
  const hoyMs = new Date("2026-06-12T00:00:00Z").getTime();
  const DIA = 86_400_000;

  it("marea cerrada dentro de la ventana suma sus días", () => {
    const mareas = [{ embarcacion_id: EMB, zarpe_at: new Date(hoyMs - 10 * DIA).toISOString(), recalada_at: new Date(hoyMs - 5 * DIA).toISOString() }];
    expect(diasEnMar(mareas, EMB, hoyMs, 30)).toBeCloseTo(5, 5);
  });

  it("marea abierta (navegando) cuenta hasta hoy", () => {
    const mareas = [{ embarcacion_id: EMB, zarpe_at: new Date(hoyMs - 3 * DIA).toISOString(), recalada_at: null }];
    expect(diasEnMar(mareas, EMB, hoyMs, 30)).toBeCloseTo(3, 5);
  });

  it("recorta lo que cae fuera de la ventana", () => {
    const mareas = [{ embarcacion_id: EMB, zarpe_at: new Date(hoyMs - 40 * DIA).toISOString(), recalada_at: new Date(hoyMs - 25 * DIA).toISOString() }];
    expect(diasEnMar(mareas, EMB, hoyMs, 30)).toBeCloseTo(5, 5); // solo días -30 a -25
  });

  it("otras naves y listas vacías → 0", () => {
    expect(diasEnMar([], EMB, hoyMs)).toBe(0);
    expect(diasEnMar([{ embarcacion_id: "otra", zarpe_at: new Date(hoyMs - DIA).toISOString() }], EMB, hoyMs)).toBe(0);
  });
});

describe("scoreBacklog (riesgo de la cola de trabajo)", () => {
  it("correctiva crítica en equipo A vieja → score máximo", () => {
    const ot = { prioridad: "critica", tipo: "correctivo", fecha: "2026-01-01" }; // >50 días
    expect(scoreBacklog(ot, { criticidad: "A" }, HOY)).toBe(100); // 40+25+25+10
  });

  it("preventiva baja en equipo C recién creada → score bajo", () => {
    const ot = { prioridad: "baja", tipo: "preventivo", fecha: HOY };
    expect(scoreBacklog(ot, { criticidad: "C" }, HOY)).toBe(17); // 8+5+0+4
  });

  it("la antigüedad envejece el score (+0.5/día, tope 25)", () => {
    const base = { prioridad: "media", tipo: "correctivo" };
    const nueva = scoreBacklog({ ...base, fecha: HOY }, { criticidad: "B" }, HOY);
    const vieja = scoreBacklog({ ...base, fecha: "2026-06-02" }, { criticidad: "B" }, HOY); // 10 días
    expect(vieja - nueva).toBe(5);
  });

  it("sin equipo asociado usa peso de incertidumbre", () => {
    const ot = { prioridad: "media", tipo: "correctivo", fecha: HOY };
    expect(scoreBacklog(ot, null, HOY)).toBe(16 + 10 + 0 + 10);
  });

  it("diasAbierta nunca es negativo (OT con fecha futura)", () => {
    expect(diasAbierta({ fecha: "2026-12-31" }, HOY)).toBe(0);
  });
});

describe("nivelScore y semanasCuadrilla", () => {
  it("umbrales de nivel", () => {
    expect(nivelScore(85)[1]).toBe("Urgente");
    expect(nivelScore(50)[1]).toBe("Alta");
    expect(nivelScore(30)[1]).toBe("Media");
    expect(nivelScore(10)[1]).toBe("Baja");
  });
  it("semanas-cuadrilla = HH / capacidad semanal; null sin capacidad", () => {
    expect(semanasCuadrilla(120, 40)).toBe(3);
    expect(semanasCuadrilla(120, 0)).toBeNull();
    expect(semanasCuadrilla(0, 40)).toBe(0);
  });
});
