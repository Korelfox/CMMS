// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TaskCard from "../src/components/campo/TaskCard.jsx";
import CampoMas from "../src/components/campo/CampoMas.jsx";
import CampoHomeFab from "../src/components/campo/CampoHomeFab.jsx";

describe("Campo mobile UI", () => {
  it("TaskCard aplica clase táctil cuando es interactivo", () => {
    render(<TaskCard title="Motor principal" onClick={() => {}} />);
    expect(document.querySelector(".cmms-campo-touch")).toBeTruthy();
  });

  it("CampoMas renderiza accesos con targets táctiles", () => {
    render(<CampoMas onNavigate={() => {}} pendientes={0} online />);
    expect(screen.getByText("Prezarpe")).toBeTruthy();
    expect(screen.getByText("Plan PM")).toBeTruthy();
    expect(document.querySelectorAll(".cmms-campo-touch").length).toBeGreaterThan(3);
  });

  it("CampoHomeFab es táctil y accesible", () => {
    render(<CampoHomeFab onClick={() => {}} />);
    expect(screen.getByLabelText("Ir a inicio")).toBeTruthy();
    expect(document.querySelector(".cmms-campo-home-fab")).toBeTruthy();
  });
});
