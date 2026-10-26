# ADR-0001 — Backend en Node.js + Express

**Estado:** Aceptada
**Fecha:** Sprint 0 (confirmada al mergear la rama `marwin`, ver `docs/contexto/contexto_proyecto.md`)
**Relacionado:** `docs/SDD.md`, `docs/architecture/C4-ValorAuto.md`, `openspec/changes/endpoint-tasacion-mvp/`

## Contexto

`src/api` necesita exponer un único endpoint (`POST /tasacion`) que reciba `multipart/form-data` (imagen + kilometraje), llame a la API de Gemini y consulte la tabla precalculada en SQLite. El equipo (Marwin, Samuel, Leonardo) tenía experiencia previa con JavaScript/Node.js en proyectos anteriores (XCollegeNexus, Kuska/Asistia), mientras que Python quedó reservado para el pipeline de datos/modelo (`src/model`, `src/pipeline`).

## Decisión

El backend se implementa en **Node.js + Express**.

## Alternativas consideradas

- **FastAPI (Python):** hubiera permitido compartir lenguaje con el pipeline de ML y usar directamente el modelo serializado sin pasar por el Model Registry de MLflow vía red. Se descartó porque el equipo tiene más práctica reciente con Express, y porque mantener el backend en Node.js separa con más claridad la responsabilidad: `src/api` solo orquesta (Gemini + SQLite), nunca ejecuta el modelo de ML directamente — el modelo corre exclusivamente en el pipeline nocturno (`src/pipeline`), no en el camino síncrono del endpoint.
- **Flask (Python):** mismas ventajas/desventajas que FastAPI, sin el beneficio de validación de tipos automática que sí tiene FastAPI; se descartó por la misma razón de separación de responsabilidades.

## Consecuencias

- El SDK de Gemini para Node.js (`@google/genai`) es la vía oficial de integración con `src/vision`.
- El backend nunca carga directamente el modelo de Scikit-Learn/XGBoost ni el cliente de MLflow; solo lee `data/precalc.db` (SQLite), que ya fue poblado por el pipeline de Python. Esto evita mezclar runtimes de ML dentro del proceso Node.js.
- Riesgo aceptado: si en el futuro se necesita cálculo de precio en vivo (fuera del alcance del MVP, ver `openspec/changes/endpoint-tasacion-mvp/design.md`), habría que exponer el modelo como un servicio Python aparte o usar un puente (ej. child process, gRPC) desde Node.js.
