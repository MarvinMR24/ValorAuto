# ADR-0004 — Gemini solo como componente de visión

**Estado:** Aceptada
**Fecha:** Sprint 0 (`docs/priorizacion_casos.md`, sección "Aporte real del modelo")
**Relacionado:** `src/vision/`, `docs/team_charter.md`

## Contexto

El requisito de MLOps del curso exige que el equipo entrene y registre un modelo propio, con ciclo de vida verificable (versiones, métricas, reentrenamiento). Usar un LLM externo como el que predice el precio directamente no demostraría ese ciclo de vida propio.

## Decisión

**Google Gemini se usa exclusivamente para identificar el vehículo** (marca, modelo, año) a partir de la foto. El precio lo calcula siempre el modelo propio (Scikit-Learn/XGBoost, ver [ADR-0005](0005-mlflow-tracking-model-registry.md)), nunca Gemini.

## Alternativas consideradas

- **Gemini (o cualquier LLM) estimando el precio directamente vía prompting:** se descartó explícitamente porque no hay entrenamiento ni versiones de modelo que registrar (mismo problema identificado para el Caso B, PromptForge, en `docs/priorizacion_casos.md`), lo que no cumpliría el requisito de MLOps del curso ni dejaría métricas de error (MAE/RMSE) verificables.
- **Modelo propio de clasificación de imágenes (CNN entrenada por el equipo) para identificar el vehículo:** se descartó por tiempo y datos: entrenar un clasificador de imágenes de autos con suficiente precisión (marca/modelo/año) requiere un dataset de imágenes etiquetadas que el equipo no tiene, y el cronograma del semestre no lo permite. Gemini como servicio de visión ya resuelve esto con buena precisión sin ese costo.

## Consecuencias

- Dependencia de un proveedor externo (costo, disponibilidad, límites de cuota) para la identificación del vehículo, riesgo ya registrado en `docs/priorizacion_casos.md` y `docs/risk-register.md`.
- Necesidad de manejar formatos de respuesta inconsistentes o vehículos no identificables (ver `requirements/REQ-001-validado.md`, resoluciones A1 y A3).
- La API key de Gemini debe manejarse como variable de entorno, nunca hardcodeada ni versionada en el repo (regla de integridad en `docs/team_charter.md`).
- Riesgo de IA a vigilar: alucinaciones de Gemini (identificar mal el vehículo con alta confianza reportada) — registrado en `docs/risk-register.md`.
