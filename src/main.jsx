import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/auth";
import { DesignSystemStyles } from "./ui";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DesignSystemStyles />
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
