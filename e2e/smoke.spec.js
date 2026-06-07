import { test, expect } from "@playwright/test";

// Smoke E2E (sin autenticación): la app arranca y muestra el arranque/login.
// No requiere credenciales; sirve de baseline para CI.
test("la app carga y muestra el inicio de sesión", async ({ page }) => {
  await page.goto("/");
  // Mientras inicializa muestra "Iniciando sistema…"; luego el login.
  // Verificamos que la app montó (no quedó en blanco) buscando texto del CMMS.
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.getByText(/Iniciando sistema|Korelfox|Ingresar|Iniciar sesión|Contraseña|Email|Correo/i).first())
    .toBeVisible({ timeout: 15_000 });
});
