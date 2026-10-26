# ADR-0007 — SQLite como base de lectura rápida (no Redis, por ahora)

**Estado:** Aceptada
**Fecha:** Sprint 3 (implementada originalmente en `src/pipeline/generate_combinations.ipynb`, ahora en `src/pipeline/precalculo.py`, ver [ADR-0008](0008-separacion-componentes-notebooks-delgados.md))
**Relacionado:** `data/precalc.db`, `docs/clickup_estructura.md`

## Contexto

La tabla de precios precalculada necesita servir consultas por (marca, modelo, año, rango de km) en menos de 50ms para no romper el criterio de latencia del endpoint. `docs/clickup_estructura.md` dejaba esta decisión abierta como "SQLite vs. Redis".

## Decisión

Se usa **SQLite** (`data/precalc.db`) con un índice sobre `(manufacturer, year, type)`, generado y poblado por `src/pipeline/precalculo.py` (orquestado desde `notebooks/03_precalculo.ipynb`).

## Alternativas consideradas

- **Redis:** más rápido para lecturas puramente en memoria y con soporte nativo de expiración/cache, pero requiere levantar un servicio adicional (proceso, puerto, persistencia configurada aparte) que el equipo tendría que operar y desplegar. Se descartó para el MVP porque SQLite ya cumple el objetivo de latencia (consulta indexada, sin red de por medio) sin esa complejidad operativa extra, y es un archivo único fácil de regenerar cada noche.
- **Consulta directa a un archivo CSV/Parquet en cada request:** se descartó de entrada por ser sensiblemente más lento que una consulta indexada en una base real, sobre todo con el volumen completo de combinaciones del dataset.

## Consecuencias

- El archivo `data/precalc.db` se regenera completo cada noche (no incremental). El riesgo de dejar una tabla parcial o corrupta si el pipeline falla a medias (registrado en `docs/risk-register.md` como R7) ya está **mitigado**: `src/pipeline/precalculo.py::guardar_sqlite()` escribe primero a un archivo temporal y hace `os.replace()` (swap atómico) al final, así que un fallo a la mitad nunca deja `data/precalc.db` en un estado parcial.
- Si más adelante el proyecto pasa a producción real con múltiples instancias del backend, Redis (o Postgres) sigue siendo la migración natural para lectura concurrente a mayor escala; queda anotado como mejora futura, no como decisión cerrada para siempre.
