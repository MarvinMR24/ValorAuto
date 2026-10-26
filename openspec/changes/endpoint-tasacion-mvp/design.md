## Context

`src/api` (Node.js/Express) orquesta dos dependencias: `src/vision` (Gemini, identifica el vehículo desde la foto) y la tabla precalculada que genera `src/pipeline` en el job nocturno. Ver `proposal.md - Why` para la motivación; ver `specs/tasacion/spec.md` para el contrato completo.

## Goals / Non-Goals

**Goals:**
- Dejar clara la secuencia de orquestación entre validación de entrada, visión y consulta a la tabla precalculada, y en qué punto cada error se genera.
- Fijar dónde vive cada regla de validación (imagen, kilometraje, umbral de confianza) para que Build no la reinvente por módulo.

**Non-Goals:**
- No decide el stack de tracking/MLOps (ya cubierto en `docs/clickup_estructura.md`, lista Architecture).
- No define el cálculo de precio en vivo para combinaciones sin precalcular (fuera de alcance del MVP, ver `proposal.md`).

## Decisions

- **Orden de validación:** primero se valida `imagen`/`kilometraje` (síncrono, sin costo externo), luego se llama a Gemini, y solo si Gemini identifica el vehículo se consulta la tabla precalculada. Rationale: evita gastar cuota de Gemini en requests que de todas formas van a fallar por entrada inválida.
- **Timeout configurable (`VISION_TIMEOUT_MS`, 25 s por defecto) sin reintento en el MVP**, en vez de reintentos con backoff. Rationale: simplicidad para el MVP; un reintento automático podría duplicar costo de Gemini sin garantía de éxito. El borrador proponía 10 s; se subió a 25 s porque Gemini con imagen supera los 10 s con cierta frecuencia y un 503 es peor experiencia que esperar. Alternativa considerada (reintento único) queda como mejora futura si QA mide que los timeouts son frecuentes.
- **Sin fallback a cálculo en vivo** cuando la combinación no está precalculada: el MVP depende 100% del job nocturno (`src/pipeline`). Rationale: mantener el MVP acotado a un solo camino de cálculo de precio; el fallback en vivo requeriría exponer el modelo de precio como servicio síncrono, lo cual es un cambio de arquitectura mayor.
- **Búsqueda por modelo con fallback precalculado (ADR-0010):** la clave es `(manufacturer, model_base, year, odometer)`; si el modelo no está, se usa el promedio ponderado por `n_anuncios` de marca+año(+tipo). La respuesta informa el nivel en `coincidencia`. Rationale: el modelo es lo que más distingue el precio dentro de una marca (R² 0.832 → 0.860 al agregarlo como feature) y el fallback evita 404 cuando Gemini nombra un modelo que no aparece en el dataset, sin salir del precálculo.
- **Límites de entrada = los de la implementación** (5 MB, jpg/png/webp, 0..500.000 km), en vez de los del borrador (8 MB, jpg/png, 0..1.000.000). Rationale: el precálculo solo cubre hasta 200.000 km y 5 MB alcanza para fotos de celular; ver "Ajuste" en la spec.
- **Umbral de confianza de Gemini = 0.6**, como constante de configuración de `src/api` (no hardcodeada en `src/vision`), para poder ajustarlo sin tocar el componente de visión.

## Risks / Trade-offs

- [Riesgo] Sin cálculo en vivo, cualquier combinación marca+modelo+año+rango-km no cubierta por el precálculo nocturno resulta en `404` para el usuario final, incluso si el modelo podría estimarla. → Mitigación: monitorear en QA qué % de requests caen en `combinacion_no_precalculada` y usarlo como input para ampliar el espacio de combinaciones precalculadas.
- [Riesgo] El umbral de confianza 0.6 es una estimación inicial, no calibrada con datos reales de Gemini sobre el dataset de autos. → Mitigación: registrar `confianza` de cada request en logs/QA para recalibrar el umbral con datos reales antes de producción.
- [Trade-off] Sin reintento automático ante timeout de Gemini, el usuario puede necesitar reintentar manualmente. Se acepta para mantener el MVP simple; se revisita si QA mide una tasa alta de timeouts.

## Open Questions

- ¿El umbral de confianza 0.6 y el timeout de 10s se validan con datos reales de Gemini antes de cerrar Build, o se calibran después con QA? (No cambia el contrato de la spec, solo el valor de las constantes.)
