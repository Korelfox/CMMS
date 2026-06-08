// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ComboInput from "../src/components/ComboInput.jsx";

afterEach(cleanup);

const OPCIONES = ["Cambio de aceite de motor", "Análisis de aceite", "Termografía"];

describe("ComboInput (RTL)", () => {
  it("filtra las opciones por substring al escribir", () => {
    const onChange = vi.fn();
    render(<ComboInput value="aceite" onChange={onChange} options={OPCIONES} />);
    fireEvent.focus(screen.getByRole("textbox"));
    expect(screen.getByText("Cambio de aceite de motor")).toBeTruthy();
    expect(screen.getByText("Análisis de aceite")).toBeTruthy();
    expect(screen.queryByText("Termografía")).toBeNull();
  });

  it("permite texto propio mostrando la opción «Usar»", () => {
    render(<ComboInput value="Tarea custom" onChange={() => {}} options={OPCIONES} />);
    fireEvent.focus(screen.getByRole("textbox"));
    expect(screen.getByText(/Usar:/)).toBeTruthy();
  });

  it("al seleccionar una opción llama onChange con su texto", () => {
    const onChange = vi.fn();
    render(<ComboInput value="termo" onChange={onChange} options={OPCIONES} />);
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.click(screen.getByText("Termografía"));
    expect(onChange).toHaveBeenCalledWith("Termografía");
  });
});
