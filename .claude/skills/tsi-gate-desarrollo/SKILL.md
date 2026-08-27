---
name: tsi-gate-desarrollo
description: Verifica si un REQ de ValorAuto está listo para pasar a Build (paso 5, "Gate", de la metodología del taller) y, si falta algo, dice exactamente qué falta. Usar antes de mover una tarea a la lista Build en ClickUp, antes de empezar a escribir código para un REQ, o cuando alguien pregunta "¿está listo X para desarrollo?".
license: MIT
metadata:
  author: tsi
  version: "1.0"
---

Gate de la metodología "primero especificar, después desarrollar": ningún REQ pasa a Build sin cumplir los 4 puntos de abajo. Este skill no escribe código ni edita `src/` — solo audita y reporta.

## Qué verificar para un REQ dado (ej. `REQ-001`)

1. **Borrador y análisis existen**: `requirements/REQ-<NNN>-validado.md` existe y tiene secciones de Requerimiento (borrador) y Análisis (riesgos/ambigüedades). Si no existe, el gate está cerrado — sugerir `tsi-analizar-requerimiento`.

2. **Validación humana confirmada**: en la sección "Validación" del REQ, ningún punto debe quedar marcado como "pendiente de confirmación del equipo". Si alguno sigue pendiente, el gate está cerrado en ese punto — listar exactamente cuáles.

3. **Spec versionada en OpenSpec**: existe una change en `openspec/changes/<nombre>/` (o spec archivada en `openspec/specs/`) que referencia el REQ, con `openspec status --change "<nombre>"` reportando los 4 artefactos (`proposal`, `specs`, `design`, `tasks`) completos. Verificar con:
   ```bash
   openspec status --change "<nombre>" --json
   openspec validate "<nombre>"
   ```
   Si `openspec validate` falla o algún artefacto no está `done`, el gate está cerrado — reportar el error tal cual lo devuelve el comando.

4. **Evidencia registrada**: existe una entrada correspondiente en `docs/evidence/` (o el REQ referencia una) que documenta el uso de IA y las decisiones tomadas, según `docs/team_charter.md`.

## Salida esperada

Reportar como checklist, uno de estos dos resultados:

- **Gate abierto**: los 4 puntos cumplidos. Actualizar la sección "Gate" del REQ marcando "listo para desarrollo" y decir explícitamente que la tarea correspondiente puede moverse a Build en ClickUp (con dueño, sprint y criterio de aceptación, según `docs/clickup_estructura.md`).
- **Gate cerrado**: listar punto por punto qué falta y quién debe resolverlo (el equipo para validación humana, Claude Code para completar artefactos de OpenSpec, etc.). No avanzar a Build.

## Guardrails

- Nunca marques el gate como abierto si la validación humana (punto 2) sigue pendiente, aunque el resto esté completo — ese es exactamente el error que la metodología busca evitar ("Hazme el sistema" antes de validar).
- No inventes que existe una change de OpenSpec o una entrada de evidencia sin verificarlo con el comando/archivo real.
