# ADR-0012 — Exclusión de RAG y de agentes autónomos

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Relacionado:** [ADR-0003](0003-precalculo-nocturno-vs-tiempo-real.md), [ADR-0004](0004-gemini-vision-vs-modelo-propio.md), [ADR-0011](0011-gemini-checklist-inspeccion.md), riesgos R18, R19 y R21 en [`docs/risk-register.md`](../risk-register.md)

## Contexto

ValorAuto usa IA generativa (Gemini) en dos puntos acotados:
1. Identificar marca, modelo y año a partir de una foto (`POST /identificar`, ADR-0004).
2. Generar fallas comunes y lo que conviene revisar primero (`GET /revision`, ADR-0011).

El precio **nunca** sale del LLM: sale del modelo XGBoost propio, precalculado en `precalc.db` (ADR-0003).

La guía de la 2.ª defensa pide justificar explícitamente, con un ADR, si se exploraron y descartaron RAG o agentes. Se evaluaron estas dos alternativas para el MVP:

- **RAG (Retrieval-Augmented Generation):** indexar una base documental (manuales, boletines de servicio, foros de fallas por modelo) en un vector store y que Gemini responda `/revision` citando esos documentos.
- **Agente autónomo:** un LLM con herramientas (consultar `precalc.db`, buscar en la web, volver a llamar a visión) que decide solo qué pasos seguir para "tasar el auto".

## Decisión

**No se usa RAG ni agentes en el MVP.**

### Por qué no RAG
- **No hay corpus propio que recuperar.** El dato central del producto (el precio) ya es estructurado y determinístico (`precalc.db`). Para `/revision`, el equipo no tiene un corpus de fallas por modelo con licencia de uso: scrapear foros o manuales tiene el mismo problema legal que los datasets R16/R17.
- **Costo y complejidad sin ganancia medible todavía.** RAG suma un vector store, embeddings, chunking y un pipeline de ingesta que hay que versionar y evaluar. Sin un golden set (R21) no se podría demostrar que mejora respecto de Gemini solo.
- **El riesgo que RAG mitigaría ya está acotado de otra forma.** Las fallas se presentan como orientativas, el JSON se valida contra un esquema, hay un filtro de salida que prohíbe precios (R18) y un respaldo genérico marcado como tal (ADR-0011).

### Por qué no agentes
- **El flujo es fijo y corto:** foto → identificación → (el usuario corrige) → precio → revisión. No hay planificación abierta que justifique que un LLM decida los pasos.
- **Determinismo y trazabilidad:** con un agente, el camino hasta el precio variaría entre ejecuciones y sería más difícil de testear, auditar y explicar en la defensa. Con orquestación explícita en `src/api`, cada paso tiene su endpoint, su contrato (`openspec/`) y sus tests.
- **Seguridad:** un agente con herramientas amplía la superficie de prompt injection, porque el texto del usuario podría disparar acciones. El diseño actual nunca ejecuta nada a partir de la salida del LLM.
- **Latencia y cuota:** varias vueltas al LLM por tasación multiplicarían el costo y agravarían la saturación de Gemini observada (R4).

## Cuándo reconsiderarlo
- **RAG para `/revision`:** si se consigue un corpus con licencia (boletines oficiales del fabricante o una base de fallas abierta) y el golden set muestra que Gemini solo se equivoca en una proporción relevante de los modelos más consultados.
- **Agente:** solo si el producto pasa a tareas abiertas, por ejemplo "encuéntrame el mejor auto de menos de US$ 10.000 cerca de mí", que hoy están fuera de alcance.

## Consecuencias
- La IA generativa queda en dos llamadas de un solo paso, sin herramientas y con salida estructurada y validada.
- El componente generativo se evalúa con un golden set (pendiente, R21) en lugar de con métricas de recuperación propias de RAG.
