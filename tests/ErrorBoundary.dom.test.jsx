// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ErrorBoundary from "../src/components/ErrorBoundary.jsx";

afterEach(cleanup);

function Boom() { throw new Error("explota"); }

describe("ErrorBoundary (RTL)", () => {
  let spy;
  beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => spy.mockRestore());

  it("renderiza los children cuando no hay error", () => {
    render(<ErrorBoundary><div>contenido ok</div></ErrorBoundary>);
    expect(screen.getByText("contenido ok")).toBeTruthy();
  });

  it("muestra el fallback (sin pantalla en blanco) cuando un hijo lanza", () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Algo salió mal/i)).toBeTruthy();
    expect(screen.getByText(/explota/)).toBeTruthy();
  });
});
