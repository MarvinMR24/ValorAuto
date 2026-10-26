# ADR-0003 — Precálculo nocturno de precios (no cálculo en vivo)

**Estado:** Aceptada
**Fecha:** Sprint 0 (planificación de Sprint 3 en `docs/contexto/contexto_proyecto.md`)
**Relacionado:** `src/pipeline/` (`combinations.py`, `precalculo.py`), `notebooks/03_precalculo.ipynb`, `openspec/changes/endpoint-tasacion-mvp/design.md`

## Contexto

El criterio de éxito del Product Goal exige un precio en menos de 3 segundos de principio a fin, incluyendo la llamada a Gemini. Ejecutar el modelo de ML en el momento de la consulta agregaría latencia variable e impredecible al camino síncrono del endpoint.

## Decisión

Los precios se **precalculan cada madrugada (3:00 AM)** para todas las combinaciones (marca, modelo, año, rango de kilometraje) del dataset, y se guardan en una tabla de lectura rápida (SQLite, ver [ADR-0007](0007-sqlite-lectura-rapida.md)). El endpoint `POST /tasacion` solo consulta esa tabla; no ejecuta el modelo en vivo.

## Alternativas consideradas

- **Cálculo en vivo (inferencia síncrona en cada request):** se descartó porque expone el tiempo de inferencia del modelo (y el tiempo de red hacia un posible servicio de ML) directamente en la latencia percibida por el usuario, y complica la arquitectura al requerir exponer el modelo como servicio síncrono accesible desde `src/api` (Node.js). Queda registrado como mejora futura en `openspec/changes/endpoint-tasacion-mvp/design.md`.
- **Cálculo híbrido (precálculo + fallback en vivo si la combinación no existe):** se descartó para el MVP por simplicidad; el endpoint responde `404 combinacion_no_precalculada` en ese caso (ver `requirements/REQ-001-validado.md`, resolución A2). Es la mejora más probable después del MVP.

## Consecuencias

- Cualquier combinación no cubierta por el precálculo nocturno resulta en un `404` para el usuario, incluso si el modelo podría estimarla. Este riesgo ya está documentado en `openspec/changes/endpoint-tasacion-mvp/design.md` y en `docs/risk-register.md`.
- El sistema depende de que el job nocturno corra sin fallos; un fallo silencioso dejaría precios desactualizados sin que nadie lo note (riesgo priorizado en `docs/risk-register.md`).
- El pipeline debe soportar el volumen total de combinaciones del dataset en un tiempo razonable durante la ventana nocturna.
- **Job con chequeo de cambios agregado (2026-09-17):** correr los 3 notebooks todas las noches sin condición desperdicia cómputo cuando el dataset no cambió (y en un entorno académico, "todas las noches" en realidad significa "cada vez que alguien se acuerde de correrlo a mano"). `scripts/nightly_retrain.py` compara el hash MD5 del puntero `data/vehicles/vehicles_clean.csv.dvc` contra el último con el que se reentrenó (`scripts/.last_dataset_hash`); si no cambió, no hace nada. Si cambió, hace `dvc pull` y corre `01_eda.ipynb` → `02_entrenamiento.ipynb` → `03_precalculo.ipynb` en orden (mismo patrón que el servicio `training` de `docker-compose.yml`). Ver `scripts/README.md` para la línea de crontab (3:00 AM) y una nota honesta: el script está implementado y probado, pero no hay todavía una máquina corriendo ese cron 24/7 para la defensa.
