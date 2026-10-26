# scripts/

## `nightly_retrain.py` — job nocturno con chequeo de cambios (Opción B)

En vez de reentrenar a ciegas cada noche, compara el hash del dataset
(`data/vehicles/vehicles_clean.csv.dvc`) contra el último con el que se
reentrenó, y solo corre los 3 notebooks (`01_eda` → `02_entrenamiento` →
`03_precalculo`) si hubo un cambio real subido a DagsHub. Ver ADR-0003 y
el docstring del script para el detalle completo.

```bash
python3 scripts/nightly_retrain.py
```

### Automatizarlo con cron

```bash
crontab -e
# agregar esta línea (ajustar la ruta absoluta al repo):
0 3 * * * cd /ruta/absoluta/al/repo && /usr/bin/python3 scripts/nightly_retrain.py >> scripts/nightly_retrain.log 2>&1
```

**Estado real (honesto, no inflado):** el script y la lógica de detección
de cambios están implementados y probados corriéndolo dos veces seguidas
(la segunda no reentrena). La línea de cron de arriba todavía no está
corriendo en ningún servidor 24/7 — nadie del equipo tiene una máquina
prendida permanentemente para la defensa. Ver HU #15 en ClickUp: marcada
como avanzada, no como completada al 100%.

`scripts/.last_dataset_hash` y `scripts/nightly_retrain.log` son estado
local generado por el script — están en `.gitignore`, no se versionan.
