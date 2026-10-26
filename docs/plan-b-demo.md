# Plan B de la demo — ValorAuto (2.ª defensa, EC2)

La guía de defensa pide un plan B que **preserve la transparencia sin maquillar errores**: si algo falla en vivo, se muestra qué falló, por qué y qué evidencia lo respalda. Nunca se reemplaza la demo por capturas presentadas como si fueran en vivo.

## Antes de la defensa (30 min antes)

| Paso | Comando o acción | Esperado |
|---|---|---|
| 1. Versión congelada | `git checkout <tag de defensa>` (el tag acordado por el equipo) | El mismo commit que se probó |
| 2. Backend arriba | `docker compose up -d api` y luego `docker compose ps` | `valorauto-api` en *healthy* |
| 3. Smoke test | `CON_GEMINI=1 scripts/smoke_test.sh` | `OK: todo responde como se espera.` |
| 4. IP de la red del aula | `ipconfig getifaddr en0` y actualizar `app/.env` | La IP coincide con `EXPO_PUBLIC_API_URL` |
| 5. App | `cd app && npx expo start -c` y escanear el QR con Expo Go (SDK 58) | Abre la pantalla de inicio |
| 6. Smoke desde la IP del teléfono | `scripts/smoke_test.sh http://<IP>:3000` | OK (así se descarta el firewall) |
| 7. E2E | `cd tests/e2e && npm test` | 4 passed |
| 8. Datos de demo | Foto `tests/e2e/fixtures/corolla_2015.jpg` en el teléfono; caso manual: Toyota Corolla 2015, 85.000 km | — |

## Si algo falla en vivo

| Falla | Qué se ve | Plan B (transparente) |
|---|---|---|
| **Gemini saturado o caído** (`high demand`, 503) | La app muestra "El servicio de identificación por foto no está disponible ahora" | Se muestra el mensaje real y el log (`docker compose logs api \| grep Gemini`): primero se intenta el modelo de respaldo y después se responde 503. Se sigue con **"Ingresar datos"**, que no depende de Gemini (precio desde `precalc.db`). La revisión cae al checklist genérico marcado como tal. Es la degradación diseñada (R4). |
| **El teléfono no llega al backend** (cambió la red o hay firewall) | "No se pudo conectar con el servidor" | 1) `ipconfig getifaddr en0`, corregir `app/.env` y correr `npx expo start -c`. 2) Si la red del aula aísla los dispositivos, usar el hotspot del celular con la Mac conectada a él. 3) Como último recurso, `npx expo start --web` en la Mac (la misma app en el navegador contra el mismo backend), aclarando que es la versión web. |
| **Expo Go no abre el proyecto** | Error de SDK o de bundle | Actualizar Expo Go (SDK 58) o usar `npx expo start --tunnel`. Si no se resuelve: correr el E2E en vivo (`cd tests/e2e && npm test`), que recorre la misma interfaz en un navegador real contra el backend real, y abrir el reporte HTML (`npx playwright show-report reporte`). |
| **Docker no arranca** | `docker compose ps` vacío | Abrir Docker Desktop y correr `docker compose up -d api`; en ~10 s queda *healthy*. Mientras tanto, mostrar `GET /docs` (Swagger) apenas esté arriba. |
| **Una tasación da 404** | "Todavía no tenemos un precio para esa marca y año" | Es el contrato (ADR-0003, R9): no hay cálculo en vivo. Se explica y se prueba con una combinación cubierta. |

## Evidencia de respaldo (que no reemplaza la demo)

- Reporte del E2E con capturas: `tests/e2e/reporte/` (se genera con `npm test`).
- Corridas y modelo registrado en MLflow (DagsHub): `ValorAuto_Model` v4, *Production*, run `a59552af758a44b38b425585bce8c3f9`.
- Resultados de tests: `bun test` (API, 64), `docker compose --profile tools run --rm test-ml` (ML, 26), smoke test y E2E (4).
- Si se usan capturas o un video de respaldo, se presentan **explícitamente como grabación**, con fecha y commit.
