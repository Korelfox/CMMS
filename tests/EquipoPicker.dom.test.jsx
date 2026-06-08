// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EquipoPicker from "../src/components/EquipoPicker.jsx";

afterEach(cleanup);

const equipos = [
  { id: "1", id_visible: "DM-PROP", sistema: "Propulsión", parent_id: null, embarcacion_id: "n1" },
  { id: "2", id_visible: "DM-PROP-MTR", sistema: "Motor Principal", parent_id: "1", embarcacion_id: "n1" },
  { id: "3", id_visible: "DM-PROP-MTR-RAD", sistema: "Radiador", parent_id: "2", embarcacion_id: "n1" },
];

describe("EquipoPicker (RTL)", () => {
  it("filtra al escribir y selecciona con click", () => {
    const onChange = vi.fn();
    render(<EquipoPicker equipos={equipos} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/buscar/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "radiador" } });
    fireEvent.click(screen.getByText("Radiador"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ id: "3", sistema: "Radiador" });
  });

  it("la opción '— Ninguno —' limpia (onChange null)", () => {
    const onChange = vi.fn();
    render(<EquipoPicker equipos={equipos} value={null} onChange={onChange} />);
    fireEvent.focus(screen.getByPlaceholderText(/buscar/i));
    fireEvent.click(screen.getByText("— Ninguno —"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("Enter selecciona el resultado resaltado", () => {
    const onChange = vi.fn();
    render(<EquipoPicker equipos={equipos} value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/buscar/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "motor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange.mock.calls[0][0]).toMatchObject({ id: "2" });
  });
});
