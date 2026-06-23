import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "./lib/auth";
import { DesignSystemStyles, FocusScroll } from "./ui";
import { WindowProvider, WindowHost } from "./components/windows/WindowManager";
import { THEME_VARS } from "./theme";
import App from "./App";

// Aplica el tema guardado antes del primer render (evita parpadeo claro→oscuro)
try {
  const saved = localStorage.getItem("cmms-theme");
  if (saved === "dark") document.documentElement.dataset.theme = "dark";
} catch { /* localStorage no disponible */ }

// ── Auto-actualización del Service Worker ──────────────────────────────
// Antes los deploys quedaban "pegados" hasta un Ctrl+Shift+R: el SW nuevo se
// instalaba pero la página seguía sirviendo los assets viejos. Ahora:
//  1. Se buscan actualizaciones periódicamente y al volver a la pestaña.
//  2. registerType "autoUpdate" hace skipWaiting → el SW nuevo activa solo.
//  3. Al cambiar el controlador, recargamos UNA vez para servir la versión nueva.
if ("serviceWorker" in navigator) {
  // No recargamos a mitad de tarea: cuando llega un SW nuevo (deploy), esperamos
  // a que la pestaña pase a segundo plano (el operario bloquea el teléfono o
  // cambia de app) para aplicar la versión nueva sin interrumpir el trabajo en
  // terreno. Con la vista persistida, además, la recarga ya no salta a inicio.
  let pendiente = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { pendiente = true; });
  document.addEventListener("visibilitychange", () => {
    if (pendiente && document.visibilityState === "hidden") {
      pendiente = false;
      window.location.reload();
    }
  });
}
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const buscar = () => reg.update().catch(() => { /* sin red: reintenta luego */ });
    setInterval(buscar, 30 * 60 * 1000);                 // cada 30 min
    document.addEventListener("visibilitychange", () => { // y al volver a la pestaña
      if (document.visibilityState === "visible") buscar();
    });
  },
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_VARS}</style>
    <DesignSystemStyles />
    <FocusScroll />
    <AuthProvider>
      <WindowProvider>
        <App />
        <WindowHost />
      </WindowProvider>
    </AuthProvider>
  </React.StrictMode>
);
