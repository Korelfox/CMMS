import { describe, it, expect } from "vitest";
import { candidatosRCA, accionesPendientes, ESTADOS_RCA } from "../src/lib/rca.js";

const HOY = "2026-06-12";
const otc = (equipo_id, fecha, extra = {}) => ({ tipo: "correctivo", equipo_id, fecha, ...extra });

describe("candidatosRCA (detección de fallas crónicas)", () => {
  it("equipo con ≥3 correctivas en la ventana es candidato", () => {
    const ots = [otc("e1", "2026-05-01"), otc("e1", "2026-05-20"), otc("e1", "2026-06-05")];
    const r = candidatosRCA(ots, [], { hoy: HOY });
    expect(r).toHaveLength(1);
    expect(r[0].n).toBe(3);
    expect(r[0].equipoId).toBe("e1");
    expect(r[0].ultimaOT.fecha).toBe("2026-06-05"); // la más reciente
  });

  it("menos de minEventos o fuera de ventana no es candidato", () => {
    const pocas = [otc("e1", "2026-05-01"), otc("e1", "2026-06-01")];
    expect(candidatosRCA(pocas, [], { hoy: HOY })).toHaveLength(0);
    const viejas = [otc("e1", "2025-01-01"), otc("e1", "2025-02-01"), otc("e1", "2025-03-01")];
    expect(candidatosRCA(viejas, [], { hoy: HOY, dias: 180 })).toHaveLength(0);
  });

  it("preventivas no cuentan como falla", () => {
    const ots = [otc("e1", "2026-05-01"), otc("e1", "2026-05-20"),
      { tipo: "preventivo", equipo_id: "e1", fecha: "2026-06-05" }];
    expect(candidatosRCA(ots, [], { hoy: HOY })).toHaveLength(0);
  });

  it("OTs sin equipo agrupan por embarcación+sistema", () => {
    const ots = [
      otc(null, "2026-05-01", { embarcacion_id: "n1", sistema: "Motor Ppal" }),
      otc(null, "2026-05-15", { embarcacion_id: "n1", sistema: "motor ppal " }), // normaliza
      otc(null, "2026-06-01", { embarcacion_id: "n1", sistema: "Motor Ppal" }),
    ];
    const r = candidatosRCA(ots, [], { hoy: HOY });
    expect(r).toHaveLength(1);
    expect(r[0].n).toBe(3);
    expect(r[0].equipoId).toBeNull();
  });

  it("un RCA en trabajo (no verificado) cubre el equipo; uno verificado antiguo no bloquea", () => {
    const ots = [otc("e1", "2026-05-01"), otc("e1", "2026-05-20"), otc("e1", "2026-06-05")];
    const abierto = [{ equipo_id: "e1", estado: "abierto", fecha: "2025-01-01" }];
    expect(candidatosRCA(ots, abierto, { hoy: HOY })).toHaveLength(0);
    const verificadoViejo = [{ equipo_id: "e1", estado: "verificado", fecha: "2025-01-01" }];
    expect(candidatosRCA(ots, verificadoViejo, { hoy: HOY })).toHaveLength(1);
    const verificadoReciente = [{ equipo_id: "e1", estado: "verificado", fecha: "2026-06-01" }];
    expect(candidatosRCA(ots, verificadoReciente, { hoy: HOY })).toHaveLength(0);
  });

  it("reporta el modo de falla dominante y ordena por frecuencia", () => {
    const ots = [
      otc("e1", "2026-05-01", { modo_falla: "sobrecalentamiento" }),
      otc("e1", "2026-05-10", { modo_falla: "sobrecalentamiento" }),
      otc("e1", "2026-05-20", { modo_falla: "vibracion" }),
      otc("e2", "2026-05-01"), otc("e2", "2026-05-05"), otc("e2", "2026-05-10"), otc("e2", "2026-05-15"),
    ];
    const r = candidatosRCA(ots, [], { hoy: HOY });
    expect(r[0].equipoId).toBe("e2"); // 4 fallas primero
    expect(r[1].modoTop).toBe("sobrecalentamiento");
  });
});

describe("accionesPendientes y estados RCA", () => {
  it("cuenta acciones sin done", () => {
    expect(accionesPendientes({ acciones: [{ done: true }, { done: false }, {}] })).toBe(2);
    expect(accionesPendientes({})).toBe(0);
    expect(accionesPendientes(null)).toBe(0);
  });
  it("estados definidos: abierto → implementado → verificado", () => {
    expect(ESTADOS_RCA.map((e) => e.value)).toEqual(["abierto", "implementado", "verificado"]);
  });
});
