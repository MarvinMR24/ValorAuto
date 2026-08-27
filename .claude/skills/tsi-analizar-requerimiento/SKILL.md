---
name: tsi-analizar-requerimiento
description: Analiza un borrador de requerimiento ambiguo de ValorAuto y produce un documento requirements/REQ-NNN-validado.md con riesgos/ambigüedades detectados y una propuesta de resolución, antes de crear una change de OpenSpec. Usar cuando alguien del equipo trae una idea o requerimiento en una frase y todavía no está listo para pasar a Build.
license: MIT
metadata:
  author: tsi
  version: "1.0"
---

Metodología del Taller de Sistemas Inteligentes: **primero especificar, después desarrollar**. Este skill cubre los pasos 1 y 2 del flujo (Requerimiento -> Análisis); los pasos 3-5 (Validación humana, OpenSpec, Gate) son responsabilidad del equipo y del skill `tsi-gate-desarrollo`.

**No genera código ni abre una change de OpenSpec.** Solo produce el documento de análisis. Si el usuario pide "impleméntalo" en el mismo mensaje, ignora esa parte hasta que el REQ pase la validación humana.

## Pasos

1. **Recibir el borrador**: si el usuario no da un borrador de requerimiento (una frase tipo historia de usuario), pídeselo antes de continuar. No inventes el requerimiento por tu cuenta.

2. **Detectar riesgos y ambigüedades** (esto es lo que aporta este skill, no lo des por hecho en el borrador):
   - Casos de error / entradas inválidas no contempladas
   - Dependencias externas (Gemini, datasets) y su comportamiento ante falla
   - Límites no definidos (rangos, tamaños, formatos, tiempos de respuesta)
   - Alcance ambiguo (¿qué queda explícitamente fuera del MVP?)
   - Contradicciones con `docs/team_charter.md`, `docs/priorizacion_casos.md` o `docs/clickup_estructura.md`

   Apóyate en los documentos existentes del proyecto (`README.md`, `docs/`, `src/*/README.md`) para fundamentar cada riesgo — no repitas riesgos genéricos que no apliquen a ValorAuto.

3. **Proponer una resolución por cada ambigüedad**, acotando al mínimo alcance razonable (MVP). Marca cada propuesta como **pendiente de confirmación del equipo** — nunca la des por validada tú mismo; la validación humana es un paso separado (regla de integridad de IA en `docs/team_charter.md`).

4. **Escribir el documento** en `requirements/REQ-<NNN>-validado.md` (siguiente número disponible en `requirements/`), con esta estructura:
   - Requerimiento — borrador ambiguo
   - Análisis — riesgos y ambigüedades detectadas (tabla)
   - Validación — resolución propuesta, pendiente de confirmación del equipo (tabla)
   - Criterios de aceptación (numerados, testeables)
   - Gate — listo para desarrollo (checklist: borrador, análisis, validación del equipo, spec en OpenSpec, gate abierto)
   - Nota de uso de IA (qué generó Claude Code, qué falta que confirme el equipo)

5. **Indicar el siguiente paso**: decirle al usuario que revise la sección de Validación con el equipo y que, una vez confirmada, se puede crear la change correspondiente en OpenSpec (`openspec new change "<nombre>"` o el skill `openspec-propose`) referenciando este REQ.

## Guardrails

- No marques ningún punto de la sección de Validación como resuelto por el equipo si el equipo no lo confirmó en la conversación.
- No crees código ni edites `src/` desde este skill.
- Si el borrador ya tiene un REQ con el mismo tema en `requirements/`, avisa y pregunta si es una revisión del mismo REQ o uno nuevo.
