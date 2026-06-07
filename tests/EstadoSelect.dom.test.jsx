// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EstadoSelect from "../src/components/ot/EstadoSelect.jsx";

afterEach(cleanup);

describe("EstadoSelect (RTL)", () => {
  it("muestra el estado actual y todas las opciones de estado", () => {
    render(<EstadoSelect estado="solicitada" onChange={() => {}} />);
    const sel = screen.getByTitle("Cambiar estado de la orden");
    expect(sel.value).toBe("solicitada");
    expect(sel.querySelectorAll("option").length).toBeGreaterThanOrEqual(5);
  });

  it("dispara onChange con el nuevo estado al avanzar la OT", () => {
    const onChange = vi.fn();
    render(<EstadoSelect estado="solicitada" onChange={onChange} />);
    fireEvent.change(screen.getByTitle("Cambiar estado de la orden"), { target: { value: "cerrada" } });
    expect(onChange).toHaveBeenCalledWith("cerrada");
  });
});
