# Pruebas E2E (Playwright)

```bash
npx playwright install chromium   # una vez (descarga el navegador)
npm run e2e                        # corre los specs (levanta el dev server solo)
npm run e2e:ui                     # modo interactivo
```

- **smoke.spec.js** — no requiere login: verifica que la app monta (arranque/login).
- **ot-flow.spec.js** — flujo autenticado de Órdenes de Trabajo (crear OT → avanzar
  estado a Cerrada). Se **omite** salvo que definas credenciales de PRUEBA:

```bash
# idealmente contra una DB de staging, no producción
E2E_EMAIL=tester@empresa.cl E2E_PASSWORD=*** npm run e2e
# opcional: E2E_BASE_URL=https://staging.tu-cmms.app
```

Los componentes exponen `data-testid` (`ot-nueva`, `ot-form-embarcacion`,
`ot-form-descripcion`, `ot-form-guardar`, `ot-tabla`) para selectores estables.
Si el formulario de login cambia, ajusta los selectores en `login()` de `ot-flow.spec.js`.
