import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth";
import { DesignSystemStyles, FocusScroll } from "./ui";
import { THEME_VARS } from "./theme";
import App from "./App";

// Aplica el tema guardado antes del primer render (evita parpadeo claro→oscuro)
try {
  const saved = localStorage.getItem("cmms-theme");
  if (saved === "dark") document.documentElement.dataset.theme = "dark";
} catch { /* localStorage no disponible */ }

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_VARS}</style>
    <DesignSystemStyles />
    <FocusScroll />
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
