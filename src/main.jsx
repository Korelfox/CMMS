import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth";
import { DesignSystemStyles } from "./ui";
import { THEME_VARS } from "./theme";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{THEME_VARS}</style>
    <DesignSystemStyles />
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
