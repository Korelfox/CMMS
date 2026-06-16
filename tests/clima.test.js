import { describe, it, expect } from "vitest";
import {
  normalizarPuerto,
  resolverCoordenadas,
  evaluarCondiciones,
  direccionViento,
  etiquetaClima,
  resumirPorDia,
  PUERTOS_CHILE,
  listaPuertos,
  puertoInicial,
  serieGrafico48h,
  precipProximasHoras,
  formatearHoraCorta,
  evaluarZarpeClima,
  evaluarCubierta,
  evaluarSemáforosOperacionales,
  peorSemáforo,
  analizarMarea,
  etiquetaEventoMarea,
  localidadShoa,
  resumirAlertasTemporales,
  insightClimaIAF,
  etiquetaModeloOleaje,
} from "../src/lib/clima.js";

describe("normalizarPuerto", () => {
  it("elimina tildes y pasa a minúsculas", () => {
    expect(normalizarPuerto("  Quellón  ")).toBe("quellon");
    expect(normalizarPuerto("Valparaíso")).toBe("valparaiso");
  });
});

describe("resolverCoordenadas", () => {
  it("resuelve puerto exacto", () => {
    const r = resolverCoordenadas("Puerto Montt");
    expect(r.lat).toBe(PUERTOS_CHILE["puerto montt"].lat);
    expect(r.origen).toBe("exacto");
  });

  it("resuelve coincidencia parcial", () => {
    const r = resolverCoordenadas("Montt");
    expect(r.origen).toBe("parcial");
    expect(r.label).toBe("Puerto Montt");
  });

  it("usa defecto si no reconoce el puerto", () => {
    const r = resolverCoordenadas("Puerto Inventado XYZ");
    expect(r.origen).toBe("defecto");
    expect(r.label).toBe("Puerto Montt");
  });

  it("usa defecto si puerto vacío", () => {
    const r = resolverCoordenadas("");
    expect(r.origen).toBe("defecto");
  });
});

describe("evaluarCondiciones", () => {
  it("verde con condiciones favorables", () => {
    expect(evaluarCondiciones({ vientoKn: 12, oleajeM: 1.0 }).nivel).toBe("verde");
  });

  it("ámbar con viento moderado-fuerte", () => {
    expect(evaluarCondiciones({ vientoKn: 22, oleajeM: 1.0 }).nivel).toBe("ambar");
  });

  it("rojo con oleaje alto", () => {
    expect(evaluarCondiciones({ vientoKn: 15, oleajeM: 3.2 }).nivel).toBe("rojo");
  });

  it("rojo con viento muy fuerte", () => {
    expect(evaluarCondiciones({ vientoKn: 30, oleajeM: 0.5 }).nivel).toBe("rojo");
  });
});

describe("direccionViento", () => {
  it("devuelve puntos cardinales", () => {
    expect(direccionViento(0)).toBe("N");
    expect(direccionViento(180)).toBe("S");
  });

  it("maneja null", () => {
    expect(direccionViento(null)).toBe("—");
  });
});

describe("etiquetaClima", () => {
  it("mapea códigos WMO básicos", () => {
    expect(etiquetaClima(0)).toBe("Despejado");
    expect(etiquetaClima(61)).toBe("Lluvia");
    expect(etiquetaClima(95)).toBe("Tormenta");
  });
});

describe("resumirPorDia", () => {
  const horario = [
    { time: "2026-06-16T08:00", tempC: 10, vientoKn: 15, oleajeM: 1.2 },
    { time: "2026-06-16T14:00", tempC: 14, vientoKn: 25, oleajeM: 2.1 },
    { time: "2026-06-17T08:00", tempC: 9,  vientoKn: 12, oleajeM: 0.8 },
  ];

  it("agrupa por día y calcula máximos", () => {
    const dias = resumirPorDia(horario, 2);
    expect(dias).toHaveLength(2);
    expect(dias[0].fecha).toBe("2026-06-16");
    expect(dias[0].vientoMaxKn).toBe(25);
    expect(dias[0].evaluacion.nivel).toBe("ambar");
    expect(dias[1].evaluacion.nivel).toBe("verde");
  });
});

describe("listaPuertos y puertoInicial", () => {
  it("lista puertos ordenados alfabéticamente", () => {
    const lista = listaPuertos();
    expect(lista.length).toBeGreaterThan(10);
    expect(lista).toContain("Puerto Montt");
    expect(lista).toContain("Quellón");
    expect([...lista].sort((a, b) => a.localeCompare(b, "es"))).toEqual(lista);
  });

  it("puertoInicial usa guardado si es válido", () => {
    expect(puertoInicial("Puerto Montt", "Castro")).toBe("Castro");
  });

  it("puertoInicial resuelve desde puerto_base si guardado inválido", () => {
    expect(puertoInicial("Talcahuano", "Puerto Inventado")).toBe("Talcahuano");
  });
});

describe("evaluarSemáforos operacionales y marea", () => {
  it("evaluarZarpeClima sigue umbrales marítimos", () => {
    expect(evaluarZarpeClima({ vientoKn: 12, oleajeM: 1 }).nivel).toBe("verde");
    expect(evaluarZarpeClima({ vientoKn: 22, oleajeM: 1 }).nivel).toBe("ambar");
    expect(evaluarZarpeClima({ vientoKn: 30, oleajeM: 1 }).nivel).toBe("rojo");
  });

  it("evaluarCubierta considera lluvia", () => {
    expect(evaluarCubierta({ vientoKn: 10, precipMm6h: 0 }).nivel).toBe("verde");
    expect(evaluarCubierta({ vientoKn: 10, precipMm6h: 3 }).nivel).toBe("ambar");
    expect(evaluarCubierta({ vientoKn: 10, precipMm6h: 6 }).nivel).toBe("rojo");
  });

  it("evaluarSemáforosOperacionales devuelve tres chips", () => {
    const s = evaluarSemáforosOperacionales({ vientoKn: 21, oleajeM: 2.0 }, 1);
    expect(s.zarpe).toBeTruthy();
    expect(s.cubierta).toBeTruthy();
    expect(s.pmPuerto).toBeTruthy();
    expect(peorSemáforo(s).nivel).toBe("ambar");
  });

  it("analizarMarea detecta pleamar y bajamar", () => {
    const horarioMarea = [
      { time: "2026-06-16T08:00", mareaM: 0.5 },
      { time: "2026-06-16T09:00", mareaM: 1.2 },
      { time: "2026-06-16T10:00", mareaM: 2.0 },
      { time: "2026-06-16T11:00", mareaM: 1.5 },
      { time: "2026-06-16T12:00", mareaM: 0.2 },
      { time: "2026-06-16T13:00", mareaM: -0.5 },
      { time: "2026-06-16T14:00", mareaM: 0.0 },
    ];
    const info = analizarMarea(horarioMarea, new Date("2026-06-16T07:00").getTime());
    expect(info.pleamar?.alturaM).toBe(2.0);
    expect(info.bajamar?.alturaM).toBe(-0.5);
    expect(etiquetaEventoMarea(info.pleamar)).toMatch(/Pleamar/);
  });

  it("localidadShoa mapea puertos CMMS", () => {
    expect(localidadShoa("Puerto Montt")).toBe("PUERTO MONTT");
    expect(localidadShoa("Chacao")).toBe("PUERTO CHACAO");
  });

  it("resumirAlertasTemporales detecta pico adverso", () => {
    const horario = [
      { time: "2026-06-16T10:00", vientoKn: 12, oleajeM: 1 },
      { time: "2026-06-17T06:00", vientoKn: 30, oleajeM: 2.5 },
    ];
    const r = resumirAlertasTemporales(horario, new Date("2026-06-16T08:00").getTime());
    expect(r.hayTemporal).toBe(true);
    expect(r.peor.ev.nivel).toBe("rojo");
  });

  it("insightClimaIAF devuelve agente IA-F", () => {
    const datos = {
      puerto: "Puerto Montt",
      actual: { vientoKn: 22, oleajeM: 2.1 },
      horario: [{ time: "2026-06-16T10:00", vientoKn: 22, oleajeM: 2.1 }],
      actualizado: "2026-06-16T09:00:00Z",
    };
    const ins = insightClimaIAF(datos);
    expect(ins.agente).toBe("IA-F");
    expect(ins.severidad).toBe("amber");
  });
});

describe("serieGrafico48h y precipitación", () => {
  const horario = [
    { time: "2026-06-16T08:00", vientoKn: 15, oleajeM: 1.2, precipMm: 0.5 },
    { time: "2026-06-16T09:00", vientoKn: 18, oleajeM: 1.4, precipMm: 1.2 },
    { time: "2026-06-16T10:00", vientoKn: 20, oleajeM: 1.5, precipMm: 0 },
  ];

  it("formatearHoraCorta devuelve hora local", () => {
    expect(formatearHoraCorta("2026-06-16T14:00")).toMatch(/\d{1,2}:\d{2}/);
  });

  it("serieGrafico48h mapea campos del gráfico", () => {
    const s = serieGrafico48h(horario);
    expect(s).toHaveLength(3);
    expect(s[0].vientoKn).toBe(15);
    expect(s[0].oleajeM).toBe(1.2);
    expect(s[0].precipMm).toBe(0.5);
  });

  it("precipProximasHoras suma mm", () => {
    expect(precipProximasHoras(horario, 2)).toBeCloseTo(1.7);
  });

  it("etiquetaModeloOleaje traduce slugs", () => {
    expect(etiquetaModeloOleaje("ecmwf_wam")).toBe("ECMWF WAM");
    expect(etiquetaModeloOleaje("ncep_gfswave016")).toBe("GFS Wave 16 km");
  });
});
