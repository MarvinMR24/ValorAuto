## 1. Validación de entrada (src/api)

- [x] 1.1 Implementar validación de `kilometraje` (entero, `0..500000` — ajustado, ver spec) y verificar con pruebas que valores fuera de rango responden `400` con `error: "kilometraje_invalido"`
- [x] 1.2 Implementar validación de imagen (`jpg`/`png`/`webp`, ≤5MB — ajustado, ver spec) y verificar con pruebas que un formato/tamaño inválido responde `400` con `error: "imagen_invalida"`

## 2. Integración con visión (src/vision + src/api)

- [x] 2.1 Definir/validar el esquema de salida `{marca, modelo, anio, confianza}` de `src/vision` y verificar con un test que un JSON fuera de esquema es detectado
- [x] 2.2 Implementar el umbral de confianza (0.6, configurable) en `src/api` y verificar con pruebas que `confianza < 0.6` responde `422` con `error: "vehiculo_no_identificado"`
- [x] 2.3 Implementar timeout configurable (25s por defecto — ajustado, ver design.md) en la llamada a Gemini y verificar con un test (mock de latencia/error 5xx) que responde `503` con `error: "vision_no_disponible"`

## 3. Consulta a la tabla precalculada (src/api)

- [x] 3.1 Implementar la consulta a la tabla precalculada por `marca+modelo+anio+rango_km` (con fallback precalculado por marca+año, ADR-0010) y verificar con un test que una combinación inexistente responde `404` con `error: "combinacion_no_precalculada"`
- [x] 3.2 Implementar el cálculo de `precio_min`/`precio_max` a partir del MAE registrado para la combinación y verificar con un test que el rango se calcula correctamente sobre un caso conocido

## 4. Respuesta exitosa y contrato del endpoint

- [x] 4.1 Implementar `POST /tasacion` end-to-end (entrada válida -> visión -> tabla precalculada -> respuesta `200`) y verificar con un test de integración que la respuesta exitosa incluye `marca`, `modelo`, `anio`, `precio_estimado`, `precio_min`, `precio_max`
- [x] 4.2 Verificar que ninguna credencial ni llave de la API de Gemini queda en el repositorio (revisión manual + `git diff` antes del PR, regla de `docs/team_charter.md`)

## 5. QA

- [x] 5.1 Cubrir con pruebas automatizadas los 5 casos de error de `specs/tasacion/spec.md` (kilometraje inválido, imagen inválida, vehículo no identificado, visión no disponible, combinación no precalculada) y verificar que todos pasan en CI/local
- [ ] 5.2 *(parcial: p95 del backend con Gemini simulado = 1 ms; falta medir con Gemini real y GEMINI_API_KEY configurada)* Medir latencia p95 del endpoint en un set de prueba local y registrar el resultado frente al SLA propuesto en `requirements/REQ-001-validado.md` (p95 < 5s) como evidencia, no como bloqueo

## 6. Búsqueda por modelo y calidad del precálculo (ADR-0010)

- [x] 6.1 Agregar `model_base` como feature del modelo de precio y verificar la mejora (R² 0.832 → 0.860, MAE 3563 → 3243)
- [x] 6.2 Generar una fila representativa por `(marca, model_base, año, tipo, km)` en `precalc.db` y verificar con `tests/test_features_precalculo.py`
- [x] 6.3 Recortar precios precalculados a ≥ 500 USD y verificar con test
- [x] 6.4 Buscar por modelo en `src/api` con niveles `modelo` → `marca_anio_tipo` → `marca_anio` y verificar con tests (`src/api/test/tasacion.test.js`)
- [ ] 6.5 Registrar en el Model Registry (DagsHub) el modelo con `model_base` como nueva versión `Production` (notebook 02 o `scripts/train_new_models.py`)

Evidencia de verificación (2026-10-26): `bun test` 31/31, pytest 4/4 (`test_model_pipeline.py`) + 12/12 (`test_features_precalculo.py`), prueba de contrato contra el servidor real con `precalc.db` real 32/32, `docker compose up api` healthy con 80.520 filas.
