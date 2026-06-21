import { describe, it, expect } from "vitest";
import {
  OFFICINA_NARROW_QUERY,
  OFFICINA_LANDSCAPE_QUERY,
  OFFICINA_COMPACT_QUERY,
} from "../src/lib/breakpoints.js";

describe("breakpoints Oficina", () => {
  it("incluye horizontal móvil en narrow y compact", () => {
    expect(OFFICINA_NARROW_QUERY).toContain("orientation: landscape");
    expect(OFFICINA_COMPACT_QUERY).toContain("orientation: landscape");
    expect(OFFICINA_LANDSCAPE_QUERY).toBe("(orientation: landscape) and (max-height: 520px)");
  });
});
