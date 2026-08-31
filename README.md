# ValorAuto

Tasador de Autos con IA — sube una foto y el kilometraje de un auto y obtén su precio de mercado al instante.

**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Caso elegido:** ver [`docs/priorizacion_casos.md`](docs/priorizacion_casos.md)

## Estructura

- [`docs/`](docs/) — documentación de equipo, priorización de casos y estructura de ClickUp.
- [`data/`](data/) — datasets crudos y procesados.
- [`src/`](src/) — pipeline: modelo de precio (MLflow), precálculo nocturno, visión (Gemini), API (Node.js/Express).
- [`app/`](app/) — app móvil (React Native + Expo).

## Documentación

**Equipo y proceso**
- [`docs/team_charter.md`](docs/team_charter.md) — integrantes, disponibilidad, canales de comunicación, reglas de PR, manejo de bloqueos, reglas de integridad/uso de IA y Definition of Done.
- [`docs/priorizacion_casos.md`](docs/priorizacion_casos.md) — matriz de priorización con los 3 casos evaluados (Tasador de Autos, PromptForge, precios de vivienda) y la justificación de por qué se eligió el Caso A.
- [`docs/clickup_estructura.md`](docs/clickup_estructura.md) — estructura del tablero de ClickUp (listas Discovery→Data→Architecture→Build→QA→Deploy→Risk), campos obligatorios por tarea y ejemplos.

**Contexto de proyecto** ([`docs/contexto/`](docs/contexto/))
- [`docs/contexto/contexto_proyecto.md`](docs/contexto/contexto_proyecto.md) — Product Goal, calendario de los 7 sprints y las 22 historias de usuario del backlog completo (criterios de aceptación, riesgos, dependencias, fechas) y el stack técnico decidido.
- [`docs/contexto/prompts_evaluacion_sprints.md`](docs/contexto/prompts_evaluacion_sprints.md) — un prompt por sprint para auditar, al cierre de cada uno, si sus historias cumplen realmente el criterio de aceptación (con evidencia, no autoevaluación).
- [`docs/contexto/prompts_inicializacion_sprints.md`](docs/contexto/prompts_inicializacion_sprints.md) — un prompt por sprint para scaffoldear (solo estructura/config, sin lógica de negocio) cada componente antes de empezar su Build.

**Requerimientos y OpenSpec**
- [`requirements/REQ-001-validado.md`](requirements/REQ-001-validado.md) — análisis de riesgos/ambigüedades del requerimiento del endpoint de tasación y la resolución propuesta para cada uno, previo a versionarlo en OpenSpec.
- [`openspec/changes/endpoint-tasacion-mvp/`](openspec/changes/endpoint-tasacion-mvp/) — spec versionada del endpoint de tasación (`proposal.md`, `specs/tasacion/spec.md`, `design.md`, `tasks.md`): contrato del `POST /tasacion`, casos de error y decisiones de diseño.

**Evidencia**
- [`docs/evidence/lab-claude-openspec.md`](docs/evidence/lab-claude-openspec.md) — evidencia del laboratorio de Claude Code + OpenSpec: qué se generó con IA, qué se verificó y el estado del Gate del REQ-001.

Gestión de tareas en ClickUp: workspace **Tio Sam S.R.L**, carpeta **Tasador de Autos con IA — LAB_01 TSI**.
