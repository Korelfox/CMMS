import { defineConfig, devices } from "@playwright/test";

// E2E del CMMS. Levanta el dev server automáticamente y corre los specs de e2e/.
// El flujo autenticado de OTs requiere credenciales de prueba en variables de
// entorno: E2E_EMAIL y E2E_PASSWORD (si faltan, ese spec se omite).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL || "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
