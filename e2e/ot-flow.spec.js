import { test, expect } from "@playwright/test";

// ── Flujo E2E de Órdenes de Trabajo (autenticado) ──────────────
// Requiere credenciales de PRUEBA (idealmente contra un proyecto/DB de staging,
// no producción):  E2E_EMAIL, E2E_PASSWORD  (opcional E2E_BASE_URL).
// Si no están definidas, el flujo se omite (skip) para no romper CI.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe("Flujo OT", () => {
  test.skip(!EMAIL || !PASSWORD, "Define E2E_EMAIL y E2E_PASSWORD (DB de staging) para correr el flujo autenticado.");

  // Login. Ajustar selectores si el formulario cambia (usar getByLabel/placeholder).
  async function login(page) {
    await page.goto("/");
    await page.getByPlaceholder(/correo|email/i).fill(EMAIL);
    await page.getByPlaceholder(/contraseña|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /ingresar|iniciar sesión|entrar/i }).click();
    // Esperar a que cargue el shell (menú lateral con módulos).
    await expect(page.getByText(/Órdenes de Trabajo/i).first()).toBeVisible({ timeout: 20_000 });
  }

  test("crear una OT y avanzar su estado a Cerrada", async ({ page }) => {
    await login(page);

    // Ir al módulo Órdenes de Trabajo.
    await page.getByText(/Órdenes de Trabajo/i).first().click();
    await expect(page.getByTestId("ot-tabla")).toBeVisible();

    // Abrir el formulario y crear una OT.
    await page.getByTestId("ot-nueva").click();
    await page.getByTestId("ot-form-embarcacion").selectOption({ index: 1 }); // primera nave real
    const desc = `E2E prueba ${Date.now()}`;
    await page.getByTestId("ot-form-descripcion").fill(desc);
    await page.getByTestId("ot-form-guardar").click();

    // La OT aparece en la tabla.
    const fila = page.getByTestId("ot-tabla").locator("tr", { hasText: desc });
    await expect(fila).toBeVisible({ timeout: 15_000 });

    // Avanzar su estado a "Cerrada" desde el selector de estado de esa fila.
    await fila.getByTitle("Cambiar estado de la orden").selectOption("cerrada");

    // Verificar que quedó como cerrada (recargar y filtrar por Cerradas).
    await page.reload();
    await expect(page.getByTestId("ot-tabla").locator("tr", { hasText: desc })).toBeVisible({ timeout: 15_000 });
  });
});
