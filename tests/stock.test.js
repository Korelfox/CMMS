import { describe, it, expect } from "vitest";
import { estadoStock } from "../src/lib/stock.js";

describe("estadoStock", () => {
  it("con mínimo definido: bajo / revisar / ok", () => {
    expect(estadoStock(0, 5, 10).key).toBe("bajo");
    expect(estadoStock(5, 5, 10).key).toBe("bajo");      // total <= min
    expect(estadoStock(7, 5, 10).key).toBe("revisar");   // total <= min*1.5 (7.5)
    expect(estadoStock(20, 5, 10).key).toBe("ok");
  });
  it("sin mínimo (0) → 'Sin mín', nunca 'Bajo'", () => {
    expect(estadoStock(0, 0, 0)).toMatchObject({ key: "ok", label: "Sin mín" });
    expect(estadoStock(0, 0, 5)).toMatchObject({ key: "ok", label: "Sin mín" });
  });
  it("excepción: máximo = 1 sin mínimo y stock 0 → Bajo", () => {
    expect(estadoStock(0, 0, 1).key).toBe("bajo");
    expect(estadoStock(1, 0, 1).key).toBe("ok");          // ya tiene su unidad
  });
});
