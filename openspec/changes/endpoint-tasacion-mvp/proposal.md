## Why

ValorAuto (Caso A) todavía no tiene un contrato definido para el flujo núcleo del producto: subir una foto y el kilometraje de un auto y recibir un precio de mercado. `README.md` y `app/README.md` describen el flujo en una frase, pero ningún documento fija el contrato del endpoint, los límites de entrada ni el manejo de fallas de la dependencia externa (Gemini). Sin ese contrato, `src/api`, `src/vision` y `app/` no tienen un límite claro de responsabilidad, y QA no tiene contra qué verificar (`docs/clickup_estructura.md`, lista QA). Este cambio cierra ese vacío antes de empezar el Build del MVP.

## What Changes

- Se define el contrato del endpoint `POST /tasacion`: entrada (`imagen`, `kilometraje`), salida (`precio_estimado`, `precio_min`, `precio_max`, `marca`, `modelo`, `anio`) y todos los casos de error (imagen/kilometraje inválido, vehículo no identificable, Gemini no disponible, combinación no precalculada).
- Se fijan límites de entrada que hoy no existen en ningún doc: tamaño/formato de imagen, rango válido de kilometraje, una sola foto por request.
- Se fija el comportamiento ante fallas de Gemini (timeout 10s, sin reintentos en el MVP) y ante combinaciones no cubiertas por el precálculo nocturno (sin cálculo en vivo en el MVP).
- Explícitamente fuera de alcance del MVP: autenticación de usuario, múltiples fotos por request, cálculo de precio en vivo cuando la combinación no está precalculada.

## Capabilities

### New Capabilities
- `tasacion`: contrato del endpoint de tasación (`POST /tasacion`) — validación de entrada, orquestación de la llamada a visión (Gemini), consulta a la tabla precalculada y forma de la respuesta/errores.

### Modified Capabilities

(ninguna — `tasacion` es una capability nueva, no hay specs previas en `openspec/specs/`)

## Impact

- **Código afectado:** `src/api` (nuevo endpoint), `src/vision` (contrato de salida de Gemini que `src/api` consume), `app/` (consumidor del contrato de respuesta/errores).
- **Dependencias:** API de Gemini (costo, disponibilidad — riesgo ya registrado en `docs/priorizacion_casos.md`).
- **Datos:** depende de que `src/pipeline` haya precalculado la combinación marca+modelo+año+rango de km consultada.
- **Sin impacto en:** entrenamiento del modelo de precio (`src/model`) ni en el job nocturno en sí — este REQ consume su resultado, no lo modifica.
