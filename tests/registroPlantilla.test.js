import { describe, it, expect } from "vitest";
import {
  PLANTILLA_PESQUERA,
  registroDesdeNodo,
  registroDesdeIdVisible,
  fichaInicialDesdeRegistro,
  datosOperacionalesDesdeNodo,
  collectFuentesPlantilla,
} from "../src/lib/plantillaPesquera.js";

const findDeep = (arr, cod) => {
  for (const n of arr || []) {
    if (n.cod === cod) return n;
    const hit = findDeep(n.hijos, cod);
    if (hit) return hit;
  }
  return null;
};

describe("Registro de vida — plantilla pesquera", () => {
  it("motores principales: horómetro propio y consume aceite", () => {
    const mtr = findDeep(PLANTILLA_PESQUERA, "PROP-MTR");
    const reg = registroDesdeNodo(mtr);
    expect(reg.registro).toBe("horas");
    expect(reg.horometro).toBe("propio");
    expect(reg.consume_aceite).toBe(true);
    expect(reg.requiere_instalacion).toBe(false);
  });

  it("componentes bajo motor: heredan horas", () => {
    const flt = findDeep(PLANTILLA_PESQUERA, "PROP-MTR-LUB-FLT");
    const reg = registroDesdeNodo(flt);
    expect(reg.registro).toBe("hereda_horas");
    expect(reg.horometro).toBe("hereda");
  });

  it("casco y navegación: sin horómetro, requiere fecha", () => {
    for (const cod of ["STR-CAS", "NAV-GPS", "COMM-VHF"]) {
      const nodo = findDeep(PLANTILLA_PESQUERA, cod);
      const reg = registroDesdeNodo(nodo);
      expect(reg.registro).toBe("fecha");
      expect(reg.horometro).toBe("no");
      expect(reg.requiere_instalacion).toBe(true);
    }
  });

  it("gobierno y virador: mixto con fuente HPU-MTR", () => {
    for (const cod of ["STEER-PWR", "FISH-VIR"]) {
      const reg = registroDesdeNodo(findDeep(PLANTILLA_PESQUERA, cod));
      expect(reg.registro).toBe("mixto");
      expect(reg.horometro).toBe("hereda");
      expect(reg.fuente).toBe("HPU-MTR");
      expect(fichaInicialDesdeRegistro(reg)).toEqual({ _registro: "mixto" });
    }
  });

  it("datosOperacionalesDesdeNodo incluye ficha _registro para tipo fecha", () => {
    const nav = findDeep(PLANTILLA_PESQUERA, "NAV-RAD");
    const datos = datosOperacionalesDesdeNodo(nav);
    expect(datos.horometro).toBe("no");
    expect(datos.ficha).toEqual({ _registro: "fecha" });
    expect(datos.consume_aceite).toBe(false);
  });

  it("collectFuentesPlantilla incluye transmisión y gobierno", () => {
    const fuentes = collectFuentesPlantilla();
    expect(fuentes).toContainEqual({ cod: "PROP-RED", fuente: "PROP-MTR" });
    expect(fuentes).toContainEqual({ cod: "STEER-PWR", fuente: "HPU-MTR" });
    expect(fuentes).toContainEqual({ cod: "FISH-VIR", fuente: "HPU-MTR" });
  });

  it("puntos de horómetro adicionales: HPU, compresores, RSW", () => {
    expect(registroDesdeNodo(findDeep(PLANTILLA_PESQUERA, "HPU-MTR")).horometro).toBe("propio");
    expect(registroDesdeNodo(findDeep(PLANTILLA_PESQUERA, "GEN-EMG")).horometro).toBe("propio");
    expect(registroDesdeNodo(findDeep(PLANTILLA_PESQUERA, "AIR-ARR-CMP")).registro).toBe("horas");
    expect(registroDesdeNodo(findDeep(PLANTILLA_PESQUERA, "RSW-CMP-CMP")).registro).toBe("horas");
  });

  it("registroDesdeIdVisible infiere fecha para navegación", () => {
    const reg = registroDesdeIdVisible("BC01-NAV-GPS");
    expect(reg.registro).toBe("fecha");
    expect(reg.requiere_instalacion).toBe(true);
  });

  it("NAV/COMM/STR tienen PM calendario (no solo horas)", () => {
    const navGps = findDeep(PLANTILLA_PESQUERA, "NAV-GPS");
    const commVhf = findDeep(PLANTILLA_PESQUERA, "COMM-VHF");
    const strCas = findDeep(PLANTILLA_PESQUERA, "STR-CAS");
    const calendario = (n) => (n.pm || []).every(([, h, u]) => u != null && h == null);
    expect(calendario(navGps)).toBe(true);
    expect(calendario(commVhf)).toBe(true);
    expect(calendario(strCas)).toBe(true);
    expect(findDeep(PLANTILLA_PESQUERA, "COMM-EPI").pm.some(([, , u]) => u === "anual")).toBe(true);
  });
});
