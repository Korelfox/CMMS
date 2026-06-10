import { describe, it, expect } from "vitest";
import { TIPOS_PDM, PARAMETROS_PDM, evaluarMedicion, seriesPdM } from "../src/lib/pdm.js";

describe("Catálogo PdM", () => {
  it("tipos con value/label y parámetros sugeridos bien formados", () => {
    expect(TIPOS_PDM.length).toBeGreaterThanOrEqual(3);
    for (const t of TIPOS_PDM) {
      expect(t.value).toBeTruthy();
      expect(Array.isArray(PARAMETROS_PDM[t.value])).toBe(true);
    }
    for (const lista of Object.values(PARAMETROS_PDM)) {
      for (const [nombre, unidad, alerta, critico] of lista) {
        expect(typeof nombre).toBe("string");
        expect(typeof unidad).toBe("string");
        if (alerta != null && critico != null) expect(critico).toBeGreaterThan(alerta);
      }
    }
  });
});

describe("evaluarMedicion (semáforo por condición)", () => {
  it("clasifica normal / alerta / crítico con umbrales ascendentes", () => {
    expect(evaluarMedicion(50, 80, 150).key).toBe("ok");
    expect(evaluarMedicion(90, 80, 150).key).toBe("alerta");
    expect(evaluarMedicion(150, 80, 150).key).toBe("critico"); // >= crítico
  });

  it("sin límites definidos → sin_limites (no un falso 'normal')", () => {
    expect(evaluarMedicion(99, null, null).key).toBe("sin_limites");
  });

  it("funciona con un solo límite definido", () => {
    expect(evaluarMedicion(99, null, 150).key).toBe("ok");
    expect(evaluarMedicion(200, null, 150).key).toBe("critico");
    expect(evaluarMedicion(99, 80, null).key).toBe("alerta");
  });

  it("valor no numérico → sin valor", () => {
    expect(evaluarMedicion("abc", 80, 150).key).toBe("sin_limites");
  });
});

describe("seriesPdM", () => {
  it("agrupa por equipo+tipo+parámetro y ordena por fecha desc", () => {
    const med = (eq, tipo, par, fecha, valor) => ({ equipo_id: eq, tipo, parametro: par, fecha, valor });
    const series = seriesPdM([
      med("e1", "aceite", "Hierro (Fe)", "2026-05-01", 40),
      med("e1", "aceite", "Hierro (Fe)", "2026-06-01", 60),
      med("e1", "vibracion", "Velocidad RMS", "2026-06-01", 4),
      med("e2", "aceite", "Hierro (Fe)", "2026-06-01", 30),
    ]);
    expect(series.size).toBe(3);
    const fe1 = series.get("e1|aceite|Hierro (Fe)");
    expect(fe1).toHaveLength(2);
    expect(fe1[0].valor).toBe(60); // la última primero
  });
});
