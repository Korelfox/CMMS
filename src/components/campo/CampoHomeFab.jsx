import React from "react";
import { Home } from "lucide-react";
import { C, tint } from "../../theme";

/** Botón flotante para volver a la pantalla inicial (Hoy) en Modo Campo. */
export default function CampoHomeFab({ onClick, atHome = false, inStack = false }) {
  return (
    <button
      type="button"
      className={`cmms-campo-home-fab cmms-campo-touch${inStack ? " cmms-campo-home-fab-stack" : ""}`}
      onClick={onClick}
      aria-label={atHome ? "Ir arriba en inicio" : "Ir a inicio"}
      title="Inicio"
      style={{
        position: "fixed",
        left: 12,
        bottom: inStack
          ? "calc(16px + env(safe-area-inset-bottom, 0px))"
          : "calc(72px + env(safe-area-inset-bottom, 0px))",
        zIndex: 40,
        width: 48,
        height: 48,
        borderRadius: 14,
        border: `1px solid ${tint(C.sky, atHome ? 22 : 35)}`,
        background: tint(C.surface, 94),
        color: atHome ? C.steel : C.sky,
        boxShadow: "0 4px 18px rgba(8,20,32,.12)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        opacity: atHome ? 0.72 : 1,
      }}
    >
      <Home size={22} strokeWidth={atHome ? 2 : 2.4} />
    </button>
  );
}
