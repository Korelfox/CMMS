import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Entorno node por defecto (lógica pura). Los tests de componente activan
    // jsdom por archivo con la directiva: // @vitest-environment jsdom
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
