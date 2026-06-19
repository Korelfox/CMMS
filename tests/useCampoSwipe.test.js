import { describe, it, expect } from "vitest";
import { campoTabDelta, campoAnimDir } from "../src/lib/useCampoSwipe.js";

describe("campoTabDelta", () => {
  it("swipe izquierda → tab siguiente", () => {
    expect(campoTabDelta(-80, 10, 200)).toBe(1);
  });

  it("swipe derecha → tab anterior", () => {
    expect(campoTabDelta(90, 8, 180)).toBe(-1);
  });

  it("ignora gesto vertical", () => {
    expect(campoTabDelta(-20, 120, 200)).toBe(0);
  });

  it("ignora desplazamiento corto", () => {
    expect(campoTabDelta(-30, 5, 200)).toBe(0);
  });

  it("ignora gestos lentos", () => {
    expect(campoTabDelta(-120, 5, 800)).toBe(0);
  });
});

describe("campoAnimDir", () => {
  it("avance → animación desde derecha", () => {
    expect(campoAnimDir(0, 2)).toBe(1);
  });

  it("retroceso → animación desde izquierda", () => {
    expect(campoAnimDir(2, 0)).toBe(-1);
  });

  it("mismo tab → sin animación", () => {
    expect(campoAnimDir(1, 1)).toBe(0);
  });
});
