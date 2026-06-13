import { describe, it, expect } from "vitest";
import {
  parseMontoCLP,
  scoreMatch,
  matchItem,
  calcularTotales,
  validarFactura,
  formatRUT,
} from "../src/lib/facturas.js";

// ── parseMontoCLP ─────────────────────────────────────────────────────────────
describe("parseMontoCLP", () => {
  it("parsea entero sin formato", () => {
    expect(parseMontoCLP("12345")).toBe(12345);
  });

  it("parsea con puntos de miles", () => {
    expect(parseMontoCLP("1.234.567")).toBe(1234567);
  });

  it("parsea con coma decimal", () => {
    expect(parseMontoCLP("1.234,56")).toBeCloseTo(1234.56, 2);
  });

  it("ignora símbolo $", () => {
    expect(parseMontoCLP("$1.500")).toBe(1500);
  });

  it("retorna null para null", () => {
    expect(parseMontoCLP(null)).toBeNull();
  });

  it("retorna null para cadena vacía", () => {
    expect(parseMontoCLP("")).toBeNull();
  });

  it("retorna null para texto no numérico", () => {
    expect(parseMontoCLP("abc")).toBeNull();
  });

  it("parsea número ya numérico sin formato", () => {
    expect(parseMontoCLP(9999)).toBe(9999);
  });

  it("ignora espacios", () => {
    expect(parseMontoCLP(" 5.000 ")).toBe(5000);
  });
});

// ── scoreMatch ────────────────────────────────────────────────────────────────
describe("scoreMatch", () => {
  it("identidad retorna 1.0", () => {
    expect(scoreMatch("filtro aceite motor", "filtro aceite motor")).toBe(1);
  });

  it("sin coincidencia retorna 0", () => {
    expect(scoreMatch("filtro aceite", "rodamiento rueda")).toBe(0);
  });

  it("coincidencia parcial retorna > 0 y < 1", () => {
    const s = scoreMatch("filtro aceite motor", "filtro aceite");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("normaliza acentos (á → a)", () => {
    expect(scoreMatch("válvula hidráulica", "valvula hidraulica")).toBeGreaterThan(0.9);
  });

  it("cadena vacía retorna 0", () => {
    expect(scoreMatch("", "filtro")).toBe(0);
    expect(scoreMatch("filtro", "")).toBe(0);
  });

  it("tokens de 1 letra se ignoran (score = 0)", () => {
    expect(scoreMatch("a b c", "a b d")).toBe(0);
  });

  it("es simétrico", () => {
    expect(scoreMatch("filtro aceite", "aceite filtro")).toBe(1);
  });
});

// ── matchItem ─────────────────────────────────────────────────────────────────
describe("matchItem", () => {
  const inv = [
    { id: "i1", descripcion: "Filtro de aceite motor principal", codigo: "FAM-001" },
    { id: "i2", descripcion: "Rodamiento de rueda dentada",     codigo: "RRD-042" },
    { id: "i3", descripcion: "Válvula hidráulica de control",   codigo: "VHC-007" },
  ];

  it("retorna [] para descripcion vacía", () => {
    expect(matchItem("", inv)).toHaveLength(0);
  });

  it("retorna [] si inventario vacío", () => {
    expect(matchItem("filtro aceite", [])).toHaveLength(0);
  });

  it("el mejor match queda primero", () => {
    const r = matchItem("filtro aceite motor", inv);
    expect(r[0].item.id).toBe("i1");
  });

  it("match por código exacto tiene score > 0", () => {
    const r = matchItem("FAM-001", inv);
    expect(r.some((x) => x.item.id === "i1")).toBe(true);
  });

  it("ordena por score descendente", () => {
    const r = matchItem("filtro aceite motor", inv);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it("todos los resultados tienen score > 0", () => {
    const r = matchItem("filtro aceite motor", inv);
    expect(r.every((x) => x.score > 0)).toBe(true);
  });

  it("sin coincidencia de ningún token → []", () => {
    expect(matchItem("tornillo hexagonal zincado", inv)).toHaveLength(0);
  });
});

// ── calcularTotales ───────────────────────────────────────────────────────────
describe("calcularTotales", () => {
  it("neto = suma de precio_total de líneas", () => {
    const lineas = [{ precio_total: 100 }, { precio_total: 200 }];
    expect(calcularTotales(lineas).neto).toBe(300);
  });

  it("iva al 19% sobre el neto", () => {
    const lineas = [{ precio_total: 1000 }];
    expect(calcularTotales(lineas).iva).toBe(190);
  });

  it("total = neto + iva", () => {
    const lineas = [{ precio_total: 1000 }];
    const t = calcularTotales(lineas);
    expect(t.total).toBe(t.neto + t.iva);
  });

  it("iva_pct configurable", () => {
    const lineas = [{ precio_total: 100 }];
    expect(calcularTotales(lineas, 0).iva).toBe(0);
    expect(calcularTotales(lineas, 10).iva).toBe(10);
  });

  it("líneas vacías → todo cero", () => {
    const t = calcularTotales([]);
    expect(t.neto).toBe(0);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(0);
  });

  it("ignora precio_total null (trata como 0)", () => {
    const lineas = [{ precio_total: 500 }, { precio_total: null }];
    expect(calcularTotales(lineas).neto).toBe(500);
  });

  it("iva se redondea al entero más cercano", () => {
    // neto=3 → iva=0.57 → Math.round → 1
    const lineas = [{ precio_total: 3 }];
    expect(Number.isInteger(calcularTotales(lineas).iva)).toBe(true);
  });
});

// ── validarFactura ────────────────────────────────────────────────────────────
describe("validarFactura", () => {
  const base = {
    proveedor: "Repuestos Marítimos Ltda.",
    fecha: "2026-06-13",
    lineas: [{ descripcion: "Filtro aceite", cantidad: 2, precio_unitario: 5000, precio_total: 10000 }],
  };

  it("factura válida → 0 errores", () => {
    expect(validarFactura(base)).toHaveLength(0);
  });

  it("sin proveedor → error con 'proveedor'", () => {
    const errs = validarFactura({ ...base, proveedor: "" });
    expect(errs.some((e) => /proveedor/i.test(e))).toBe(true);
  });

  it("sin fecha → error con 'fecha'", () => {
    const errs = validarFactura({ ...base, fecha: null });
    expect(errs.some((e) => /fecha/i.test(e))).toBe(true);
  });

  it("sin líneas → error con 'ítem'", () => {
    const errs = validarFactura({ ...base, lineas: [] });
    expect(errs.some((e) => /ítem/i.test(e))).toBe(true);
  });

  it("línea con cantidad 0 → error con 'cantidad'", () => {
    const lineas = [{ descripcion: "X", cantidad: 0, precio_total: 1000 }];
    const errs = validarFactura({ ...base, lineas });
    expect(errs.some((e) => /cantidad/i.test(e))).toBe(true);
  });

  it("múltiples errores se acumulan", () => {
    const errs = validarFactura({ proveedor: "", fecha: null, lineas: [] });
    expect(errs.length).toBeGreaterThan(1);
  });
});

// ── formatRUT ─────────────────────────────────────────────────────────────────
describe("formatRUT", () => {
  it("formatea RUT sin separadores", () => {
    expect(formatRUT("765432109")).toBe("76.543.210-9");
  });

  it("preserva dígito verificador K mayúscula", () => {
    expect(formatRUT("12345678K")).toBe("12.345.678-K");
  });

  it("retorna cadena vacía para null", () => {
    expect(formatRUT(null)).toBe("");
    expect(formatRUT("")).toBe("");
  });

  it("normaliza RUT ya formateado (limpia y reformatea)", () => {
    expect(formatRUT("76.543.210-9")).toBe("76.543.210-9");
  });

  it("RUT con guión pero sin puntos → agrega puntos", () => {
    expect(formatRUT("76543210-9")).toBe("76.543.210-9");
  });
});
