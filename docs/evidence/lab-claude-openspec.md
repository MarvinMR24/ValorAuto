# Evidencia — Lab Claude Code + OpenSpec

**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Fecha:** 2026-08-20
**Ejecutado por:** Marvin Mollo (asistido por Claude Code)

## Objetivo del laboratorio

Usar Claude Code para analizar y validar un requerimiento de ValorAuto antes de pedir código, siguiendo el flujo enseñado: **Requerimiento (borrador ambiguo) → Análisis (Claude Code detecta riesgos) → Validación (humano resuelve ambigüedades) → OpenSpec (spec versionada) → Gate (listo para desarrollo)**.

## Qué se configuró

| Entregable | Ubicación | Estado |
|---|---|---|
| OpenSpec inicializado | [`openspec/config.yaml`](../../openspec/config.yaml) | Hecho — CLI `@fission-ai/openspec@1.10.0`, schema `spec-driven`, idioma `es`, configurado para Claude Code |
| Skills genéricas de OpenSpec | `.claude/skills/openspec-*` (6 skills) | Generadas automáticamente por `openspec init --tools claude` |
| Skills locales del taller | [`.claude/skills/tsi-analizar-requerimiento`](../../.claude/skills/tsi-analizar-requerimiento/SKILL.md), [`.claude/skills/tsi-gate-desarrollo`](../../.claude/skills/tsi-gate-desarrollo/SKILL.md) | Hecho — cubren los pasos que las skills genéricas de OpenSpec no cubren: detectar riesgos sobre un borrador ambiguo, y auditar el gate antes de pasar a Build |
| REQ validado | [`requirements/REQ-001-validado.md`](../../requirements/REQ-001-validado.md) | Análisis completo — **validación humana pendiente** (ver más abajo) |
| Spec versionada | [`openspec/changes/endpoint-tasacion-mvp/`](../../openspec/changes/endpoint-tasacion-mvp/) (`proposal.md`, `specs/tasacion/spec.md`, `design.md`, `tasks.md`) | Completo — `openspec validate endpoint-tasacion-mvp` pasa |

## Requerimiento trabajado: REQ-001 — Endpoint de tasación (MVP)

- **Borrador ambiguo:** "Como usuario, quiero subir una foto de mi auto y su kilometraje, y que el sistema me devuelva el precio de mercado" (tomado literalmente de `README.md`/`app/README.md`).
- **Riesgos detectados por Claude Code (10):** formato de salida de Gemini, fallback si no hay combinación precalculada, vehículo no identificable, falla/timeout de Gemini, rango válido de kilometraje, límite de imagen, múltiples fotos, precio puntual vs. rango, autenticación, SLA de latencia. Detalle completo en `requirements/REQ-001-validado.md`, sección 2.
- **Resolución propuesta por Claude Code:** una respuesta concreta por cada riesgo, acotando el alcance al MVP mínimo (sin cálculo en vivo, sin reintentos, sin autenticación, umbral de confianza 0.6, timeout 10s). Detalle en `requirements/REQ-001-validado.md`, sección 3.

## Uso de IA (declaración según `docs/team_charter.md`)

- **Generado con IA (Claude Code):** el análisis de riesgos/ambigüedades del REQ-001, la propuesta de resolución para cada una, los 4 artefactos de la change de OpenSpec (`proposal.md`, `specs/tasacion/spec.md`, `design.md`, `tasks.md`), y las dos skills locales `tsi-*`.
- **Verificaciones ejecutadas:** `openspec status --change endpoint-tasacion-mvp` (4/4 artefactos completos) y `openspec validate endpoint-tasacion-mvp` (válido) — ambos con salida limpia, sin errores.
- **No generado con IA / pendiente de humano:** la confirmación de las 10 resoluciones propuestas en REQ-001 sección 3. Ninguna tarea de Build debería moverse en ClickUp para este REQ hasta que el equipo confirme o ajuste esas resoluciones — esa es la condición de "Validación" en la sección Gate del REQ.
- **Sin datos personales, secretos ni llaves de API** ingresados en el repositorio ni en la conversación con la IA, conforme a `docs/team_charter.md`.

## Estado del Gate (paso 5)

- [x] Requerimiento con borrador
- [x] Análisis de riesgos
- [ ] Validación humana del equipo — **pendiente**, ver `requirements/REQ-001-validado.md` sección 3
- [x] Spec versionada en OpenSpec
- [ ] Gate abierto para Build — se abre en cuanto el punto anterior se confirme

## Siguiente acción

1. El equipo revisa y confirma (o ajusta) las 10 resoluciones de `requirements/REQ-001-validado.md` sección 3.
2. Al confirmarse, se actualiza la sección Gate del REQ y de este documento.
3. Se crean las tareas de Build en ClickUp a partir de `openspec/changes/endpoint-tasacion-mvp/tasks.md`, con dueño, sprint y criterio de aceptación (`docs/clickup_estructura.md`).
