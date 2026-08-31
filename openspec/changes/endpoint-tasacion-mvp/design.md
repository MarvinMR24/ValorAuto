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
- **Timeout fijo (10s) sin reintento en el MVP**, en vez de reintentos con backoff. Rationale: simplicidad para el MVP; un reintento automático podría duplicar costo de Gemini sin garantía de éxito. Alternativa considerada (reintento único) queda como mejora futura si QA mide que los timeouts son frecuentes.
- **Sin fallback a cálculo en vivo** cuando la combinación no está precalculada: el MVP depende 100% del job nocturno (`src/pipeline`). Rationale: mantener el MVP acotado a un solo camino de cálculo de precio; el fallback en vivo requeriría exponer el modelo de precio como servicio síncrono, lo cual es un cambio de arquitectura mayor.
- **Umbral de confianza de Gemini = 0.6**, como constante de configuración de `src/api` (no hardcodeada en `src/vision`), para poder ajustarlo sin tocar el componente de visión.

## Risks / Trade-offs

- [Riesgo] Sin cálculo en vivo, cualquier combinación marca+modelo+año+rango-km no cubierta por el precálculo nocturno resulta en `404` para el usuario final, incluso si el modelo podría estimarla. → Mitigación: monitorear en QA qué % de requests caen en `combinacion_no_precalculada` y usarlo como input para ampliar el espacio de combinaciones precalculadas.
- [Riesgo] El umbral de confianza 0.6 es una estimación inicial, no calibrada con datos reales de Gemini sobre el dataset de autos. → Mitigación: registrar `confianza` de cada request en logs/QA para recalibrar el umbral con datos reales antes de producción.
- [Trade-off] Sin reintento automático ante timeout de Gemini, el usuario puede necesitar reintentar manualmente. Se acepta para mantener el MVP simple; se revisita si QA mide una tasa alta de timeouts.

## Open Questions

- ¿El umbral de confianza 0.6 y el timeout de 10s se validan con datos reales de Gemini antes de cerrar Build, o se calibran después con QA? (No cambia el contrato de la spec, solo el valor de las constantes.)
