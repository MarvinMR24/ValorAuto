# ADR-0011 — Gemini también genera el checklist de inspección (texto)

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Relacionado:** [ADR-0004](0004-gemini-vision-vs-modelo-propio.md), `src/api/services/gemini.service.js` (`generateInspectionTips`), `src/api/services/revisionGenerica.js`, change `openspec/changes/app-dos-flujos-tasacion/`

## Contexto

La pantalla de resultado de la app tiene que mostrar, además del precio, las fallas comunes del modelo y qué revisar primero al comprarlo. ADR-0004 limitaba Gemini a identificar el vehículo en la foto. No hay en el repo un dataset de fallas por modelo, y armar uno a mano para unos 1.800 modelos base no es viable para el MVP.

## Decisión

Se amplía el uso de Gemini a un segundo caso: **generar en texto** (sin imagen) un JSON con hasta 5 fallas comunes, cada una con severidad, y hasta 5 puntos a revisar primero para marca+modelo+año (`GET /revision`).

Se mantiene la regla central de ADR-0004: **Gemini nunca da precios**. El prompt lo prohíbe explícitamente y el precio sigue saliendo solo de `precalc.db`.

Salvaguardas:
- La respuesta se valida contra un esquema; lo que no lo cumple se descarta.
- Se cachea 24 h por marca|modelo|año.
- Ante cualquier falla (sin key, timeout, 5xx o fuera de esquema) se devuelve un **checklist genérico fijo** con `fuente: "generico"`, y la app lo muestra con una nota. El endpoint nunca falla por culpa de Gemini.

## Alternativas consideradas

- **Lista curada a mano** para los modelos más comunes: no tiene costo, pero cubre pocos modelos y hay que escribir y mantener el contenido. Queda como mejora si el costo de Gemini se vuelve un problema.
- **No mostrar fallas:** se descarta porque es parte de lo que el equipo quiere que la app entregue.

## Consecuencias

- Hay una llamada de texto a Gemini por cada modelo distinto consultado; las siguientes salen de la caché.
- El contenido es orientativo y lo genera un LLM: puede ser impreciso. La app lo presenta como "fallas comunes" y no como diagnóstico.
