import { describe, it, expect } from "vitest";
import {
  normalizarPuerto,
  resolverCoordenadas,
  evaluarCondiciones,
  direccionViento,
  etiquetaClima,
  resumirPorDia,
  PUERTOS_CHILE,
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
