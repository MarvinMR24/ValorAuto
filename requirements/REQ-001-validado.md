# REQ-001 — Endpoint de tasación (MVP núcleo del Caso A)

**Proyecto:** ValorAuto — Tasador de Autos con IA
**Estado:** Propuesta analizada por Claude Code — pendiente de firma del equipo (ver sección de Validación)
**Relacionado:** `docs/priorizacion_casos.md` (Caso A), `docs/clickup_estructura.md` (listas Architecture/Build), OpenSpec change [`endpoint-tasacion-mvp`](../openspec/changes/endpoint-tasacion-mvp/)

---

## 1. Requerimiento — borrador ambiguo

> Como usuario, quiero subir una foto de mi auto y su kilometraje, y que el sistema me devuelva el precio de mercado, para saber cuánto vale mi auto al instante.

Este es el borrador inicial tal como se plantea en `README.md` y `app/README.md`, sin detalle de contrato, límites ni manejo de fallas.

## 2. Análisis — riesgos y ambigüedades detectadas por Claude Code

| # | Ambigüedad / riesgo | Por qué importa |
|---|---|---|
| A1 | ¿Qué formato exacto devuelve Gemini (marca, modelo, año) y qué pasa si devuelve un JSON incompleto o fuera de formato? | `src/vision` alimenta directamente la búsqueda en la tabla precalculada; un formato inconsistente rompe el pipeline (riesgo ya registrado en `clickup_estructura.md`, lista Risk). |
| A2 | ¿El precio siempre sale de la tabla precalculada nocturna, o hay cálculo en vivo si la combinación (marca+modelo+año+rango de km) no existe todavía? | Define si `src/api` depende 100% del job nocturno o necesita un camino de fallback. |
| A3 | ¿Qué pasa si Gemini no logra identificar el vehículo (foto borrosa, ángulo malo, objeto que no es un auto)? | No hay definido un caso de error "no se pudo identificar el vehículo" en ningún doc existente. |
| A4 | ¿Qué pasa si la API de Gemini falla, hace timeout o excede cuota? | Dependencia externa ya marcada como riesgo (`priorizacion_casos.md`, Riesgo 3) pero sin comportamiento definido a nivel de contrato del endpoint. |
| A5 | Rango válido de kilometraje (¿se acepta 0? ¿hay tope máximo? ¿decimales?) | Sin cota, un valor absurdo (ej. km negativo o 99999999) puede romper la búsqueda en la tabla precalculada. |
| A6 | Límite de tamaño/formato de imagen aceptado | Afecta costo y latencia de la llamada a Gemini. |
| A7 | ¿Se acepta más de una foto por request? | El README habla de "una foto" en singular; no está confirmado si el MVP soporta múltiples ángulos. |
| A8 | ¿El precio se devuelve como valor puntual o como rango (min-max)? | Afecta tanto el contrato de `src/api` como la interfaz (`app/`). |
| A9 | ¿El endpoint requiere autenticación o es anónimo para el MVP? | No mencionado en ningún doc; afecta diseño de `src/api`. |
| A10 | SLA de tiempo de respuesta aceptado (dado que depende de una llamada externa a Gemini) | Sin definir, QA no tiene contra qué medir latencia del endpoint. |

## 3. Validación — resolución propuesta (pendiente de confirmación del equipo)

> Las siguientes resoluciones son una propuesta de Claude Code para destrabar el MVP con el menor alcance posible. **El equipo debe revisarlas y confirmarlas o ajustarlas** antes de considerar este REQ como cerrado (regla de integridad de IA en `docs/team_charter.md`: "las decisiones de IA asistida se declaran y el equipo responde por el resultado").

| # | Resolución propuesta | Alcance |
|---|---|---|
| A1 | Gemini debe devolver JSON estricto `{marca, modelo, anio, confianza}`. Si el JSON no valida contra ese esquema, `src/api` responde `422` con `error: "vision_format_error"` y no se llama al modelo de precio. | MVP |
| A2 | El MVP solo consulta la tabla precalculada. Si la combinación no existe, se responde `404` con `error: "combinacion_no_precalculada"` (sin cálculo en vivo). Cálculo en vivo queda fuera de alcance de este REQ. | MVP — fallback en vivo es un REQ futuro |
| A3 | Si `confianza` de Gemini está bajo un umbral (propuesto: 0.6) o el JSON no identifica un vehículo, se responde `422` con `error: "vehiculo_no_identificado"`. | MVP |
| A4 | Timeout de 10s a la llamada a Gemini; ante timeout o error 5xx se responde `503` con `error: "vision_no_disponible"`. Sin reintentos automáticos en el MVP. | MVP |
| A5 | Kilometraje válido: entero, `0 <= km <= 1,000,000`. Fuera de rango → `400` con `error: "kilometraje_invalido"`. | MVP |
| A6 | Una sola imagen por request, formatos `jpg/png`, máx. 8 MB. Fuera de esos límites → `400` con `error: "imagen_invalida"`. | MVP |
| A7 | Una sola foto por request en el MVP (no se soportan múltiples ángulos). Multi-foto queda como mejora futura. | MVP |
| A8 | El endpoint devuelve un valor puntual (`precio_estimado`) más un rango de referencia (`precio_min`, `precio_max`) calculado a partir del error del modelo (MAE), no un solo número sin contexto. | MVP |
| A9 | Sin autenticación en el MVP (endpoint público); se revisita si el caso pasa a producción real. | MVP — riesgo aceptado y registrado |
| A10 | SLA propuesto: p95 < 5s incluyendo la llamada a Gemini. Si no se cumple en pruebas de QA, se documenta como riesgo, no bloquea el MVP. | MVP |

## 4. Criterios de aceptación (para `openspec/changes/endpoint-tasacion-mvp`)

1. `POST /tasacion` acepta `multipart/form-data` con una imagen (`jpg/png`, ≤8MB) y un campo `kilometraje` (entero, 0–1,000,000).
2. Ante entrada inválida (imagen o kilometraje fuera de los límites del punto A5/A6), responde `400` con un código de error explícito.
3. Ante fallo o timeout de Gemini, responde `503` sin exponer detalles internos del proveedor.
4. Ante vehículo no identificable o confianza baja, responde `422` con `error: "vehiculo_no_identificado"`.
5. Ante combinación marca+modelo+año+rango de km sin precalcular, responde `404` con `error: "combinacion_no_precalculada"`.
6. En el caso exitoso, responde `200` con `{marca, modelo, anio, precio_estimado, precio_min, precio_max}`.
7. Tiene pruebas automatizadas para cada uno de los casos 2–6 (regla de Definition of Done en `docs/team_charter.md`: "si modifica código, ejecuta pruebas").
8. No se registran credenciales ni llaves de la API de Gemini en el repositorio (regla de integridad de `docs/team_charter.md`).

## 5. Gate — listo para desarrollo

- [x] Requerimiento tiene borrador (paso 1)
- [x] Riesgos y ambigüedades detectados (paso 2)
- [ ] Equipo confirmó o ajustó las resoluciones de la sección 3 (paso 3) — **pendiente**
- [x] Spec versionada en OpenSpec (paso 4): `openspec/changes/endpoint-tasacion-mvp/`
- [ ] Gate abierto para Build — se abre automáticamente cuando el punto anterior quede marcado

Uso de IA: este documento fue generado con Claude Code a partir de los documentos existentes del equipo (`README.md`, `docs/priorizacion_casos.md`, `docs/clickup_estructura.md`, `docs/team_charter.md`). El análisis de riesgos (sección 2) y las resoluciones propuestas (sección 3) deben ser revisados por el equipo antes de mover cualquier tarea de Build asociada a este REQ.
