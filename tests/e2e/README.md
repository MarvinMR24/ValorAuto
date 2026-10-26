# Pruebas E2E (Playwright)

Validan el flujo integrado desde el usuario hasta la respuesta, con todas las piezas reales: la app (build web de `app/`), la API en Docker, `precalc.db` y Gemini.

| Prueba | Recorrido |
|---|---|
| `app.spec.mjs` · flujo principal | Inicio → "Ingresar datos" → selector con catálogo real → Toyota Corolla 2015, 85.000 km → precio + fallas comunes → "Volver" conserva el formulario |
| `app.spec.mjs` · precio de referencia | Modelo que no está en el precálculo → nota "precio de referencia" (fallback marca + año) |
| `app.spec.mjs` · errores | Año sin precio (404) y kilometraje fuera de rango, con mensajes visibles |
| `api-foto.spec.mjs` · flujo con foto | Foto real de un Corolla 2015 → `POST /identificar` (Gemini) → `POST /tasacion/datos` → `GET /revision`; verifica que no aparezcan precios en la revisión. Se salta si el backend no tiene `GEMINI_API_KEY` |

El flujo con foto se prueba a nivel API porque la versión web no tiene cámara nativa. Es la misma secuencia de llamadas que hace la app en el teléfono.

## Cómo correrlas

```bash
docker compose up -d api                 # desde la raíz del repo
cd tests/e2e
npm install
npx playwright install chromium          # una sola vez
npm run build:app                        # build web de la app apuntando a http://localhost:3000
npm test                                 # 4 pruebas; reporte HTML en reporte/ (npx playwright show-report reporte)
```

Para apuntar a otro backend: `API_URL=http://<IP>:3000 npm run build:app && API_URL=http://<IP>:3000 npm test`.

Con Node 26 hace falta Playwright ≥ 1.63 (fijado en `package.json`): las versiones anteriores se cuelgan al cargar archivos `.mjs`.

Foto de prueba: `fixtures/corolla_2015.jpg`, CC BY-SA 4.0. Atribución en [`fixtures/ATRIBUCION.md`](fixtures/ATRIBUCION.md).
