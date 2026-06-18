import { describe, it, expect } from "vitest";
import { canAccessOficina, canOperate } from "../src/theme.js";

describe("acceso a Modo Oficina por rol", () => {
  it("los administrativos ven Campo y Oficina", () => {
    for (const rol of ["super_admin", "admin_empresa", "jefe_mantencion"]) {
      expect(canAccessOficina(rol)).toBe(true);
    }
  });

  it("los operativos a bordo quedan acotados a Campo", () => {
    for (const rol of ["capitan", "maquinista", "contratista"]) {
      expect(canAccessOficina(rol)).toBe(false);
    }
  });

  it("rol desconocido o vacío no accede a Oficina", () => {
    expect(canAccessOficina(undefined)).toBe(false);
    expect(canAccessOficina(null)).toBe(false);
    expect(canAccessOficina("")).toBe(false);
  });

  it("operar (Campo) sigue habilitado para capitán y maquinista", () => {
    expect(canOperate("capitan")).toBe(true);
    expect(canOperate("maquinista")).toBe(true);
  });
});
