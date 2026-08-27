## 1. Validación de entrada (src/api)

- [ ] 1.1 Implementar validación de `kilometraje` (entero, `0..1000000`) y verificar con pruebas que valores fuera de rango responden `400` con `error: "kilometraje_invalido"`
- [ ] 1.2 Implementar validación de imagen (`jpg`/`png`, ≤8MB) y verificar con pruebas que un formato/tamaño inválido responde `400` con `error: "imagen_invalida"`

## 2. Integración con visión (src/vision + src/api)

- [ ] 2.1 Definir/validar el esquema de salida `{marca, modelo, anio, confianza}` de `src/vision` y verificar con un test que un JSON fuera de esquema es detectado
- [ ] 2.2 Implementar el umbral de confianza (0.6, configurable) en `src/api` y verificar con pruebas que `confianza < 0.6` responde `422` con `error: "vehiculo_no_identificado"`
- [ ] 2.3 Implementar timeout de 10s en la llamada a Gemini y verificar con un test (mock de latencia/error 5xx) que responde `503` con `error: "vision_no_disponible"`

## 3. Consulta a la tabla precalculada (src/api)

- [ ] 3.1 Implementar la consulta a la tabla precalculada por `marca+modelo+anio+rango_km` y verificar con un test que una combinación inexistente responde `404` con `error: "combinacion_no_precalculada"`
- [ ] 3.2 Implementar el cálculo de `precio_min`/`precio_max` a partir del MAE registrado para la combinación y verificar con un test que el rango se calcula correctamente sobre un caso conocido

## 4. Respuesta exitosa y contrato del endpoint

- [ ] 4.1 Implementar `POST /tasacion` end-to-end (entrada válida -> visión -> tabla precalculada -> respuesta `200`) y verificar con un test de integración que la respuesta exitosa incluye `marca`, `modelo`, `anio`, `precio_estimado`, `precio_min`, `precio_max`
- [ ] 4.2 Verificar que ninguna credencial ni llave de la API de Gemini queda en el repositorio (revisión manual + `git diff` antes del PR, regla de `docs/team_charter.md`)

## 5. QA

- [ ] 5.1 Cubrir con pruebas automatizadas los 5 casos de error de `specs/tasacion/spec.md` (kilometraje inválido, imagen inválida, vehículo no identificado, visión no disponible, combinación no precalculada) y verificar que todos pasan en CI/local
- [ ] 5.2 Medir latencia p95 del endpoint en un set de prueba local y registrar el resultado frente al SLA propuesto en `requirements/REQ-001-validado.md` (p95 < 5s) como evidencia, no como bloqueo
