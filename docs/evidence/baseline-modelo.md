# Evidencia — Línea Base del Modelo de Precio

**Notebook:** [`notebooks/02_entrenamiento.ipynb`](../../notebooks/02_entrenamiento.ipynb) (orquesta `src/model/features.py`, `training.py`, `evaluation.py`; hiperparámetros centralizados en `src/model/config.py` — ver [ADR-0008](../adr/0008-separacion-componentes-notebooks-delgados.md))
**Dataset:** `data/vehicles/vehicles_clean.csv`, generado por `notebooks/01_eda.ipynb` a partir de `data/raw/vehicles.csv` (Craigslist Vehicles Dataset, 426,880 filas crudas); versionado con DVC ([ADR-0006](../adr/0006-dvc-dagshub-versionamiento-datos.md))
**Split:** 281,604 muestras de entrenamiento / 70,401 de prueba (352,005 filas limpias en total, `TEST_SIZE=0.2`, `RANDOM_SEED=42`, ver `src/model/config.py`)
**Features:** `year`, `odometer`, `manufacturer`, `fuel`, `transmission`, `drive`, `type`, `condition`, `cylinders`, `size` — **target:** `price` (10 features; `condition`/`cylinders`/`size` se agregaron después de validar empíricamente que mejoran el resultado, ver [ADR-0009](../adr/0009-features-condition-cylinders-size.md))
**Tracking:** MLflow, configurable vía `.env` (remoto en DagsHub o `sqlite:///mlflow.db` local como fallback), experimento `ValorAuto_Model_Comparison` (ver [ADR-0005](../adr/0005-mlflow-tracking-model-registry.md))
**Corrida:** ejecución real de punta a punta (`01_eda.ipynb` → `02_entrenamiento.ipynb` → `03_precalculo.ipynb`) el 2026-09-17. Esta tabla refleja la segunda corrida real, después de agregar `condition`/`cylinders`/`size` como features (ver [ADR-0009](../adr/0009-features-condition-cylinders-size.md)); la primera corrida (7 features) queda documentada como comparación en ese mismo ADR.

## Línea base reproducible

Esta es la línea base reproducible del proyecto: un pipeline ejecutable de principio a fin, con una métrica de error analizada, aunque el resultado todavía no sea el definitivo.

## Resultados

| Modelo | RMSE | MAE | R² |
|---|---|---|---|
| Linear Regression (baseline) | 8107.91 | 5587.19 | 0.6716 |
| Random Forest (n_estimators=50, max_depth=10) | 7048.09 | 4566.73 | 0.7518 |
| **XGBoost** | **6085.26** | **3777.90** | **0.8150** |

Comparado con la corrida anterior de 7 features (RMSE=6458.02/MAE=4080.77/R²=0.7917 en XGBoost), agregar `condition`/`cylinders`/`size` bajó el RMSE ~5.8% y el MAE ~7.4%, con mejora consistente en los 3 modelos, no solo en el mejor (detalle completo del experimento controlado en [ADR-0009](../adr/0009-features-condition-cylinders-size.md)).

## Análisis

XGBoost obtiene el menor error en las tres métricas y se promovió automáticamente a la etiqueta **Production** en el MLflow Model Registry (`ValorAuto_Model`, versión 1), que es la versión que consulta `notebooks/03_precalculo.ipynb` (vía `src/pipeline/precalculo.py`) para generar la tabla de precios precalculada (78,915 combinaciones calculadas en esta corrida).

El MAE de ~3778 USD sobre un dataset de precios de EE. UU. (Craigslist) es un punto de partida razonable para un modelo baseline con feature engineering mínimo (sin interacciones entre variables, sin tratamiento especial de outliers más allá de la limpieza inicial), pero no es todavía un resultado "bueno" en términos absolutos. Se registra así, sin maquillar el número.

## Limitación conocida (ver Risk Register)

El dataset es del mercado de EE. UU., no del boliviano. El error reportado aquí no necesariamente representa el error que tendría el modelo prediciendo precios de autos usados en Bolivia. Este riesgo está registrado como **R2** en [`docs/risk-register.md`](../risk-register.md), sin mitigación implementada todavía.

## Próximos pasos para mejorar la línea base

- Ajuste de hiperparámetros de XGBoost (esta corrida usa valores por defecto/mínimos).
- Feature engineering adicional (antigüedad del vehículo en vez de año absoluto, interacción marca×tipo).
- Evaluar si se necesita un ajuste o dataset complementario para el mercado boliviano (riesgo R2).

## Nota sobre reproducibilidad de estas cifras

Esta tabla refleja la primera ejecución real del pipeline completo contra el dataset íntegro (426,880 filas crudas de Craigslist), corrida el 2026-09-17. Versiones anteriores de este documento mostraban una tabla con un split de "80,500 entrenamiento / 20,125 prueba" (100,625 filas en total) que **no se pudo reproducir** con el código de limpieza y split documentado en este mismo repositorio (`src/model/cleaning.py` y `src/model/features.py::split_data`, portados 1:1 de `LimpiezaValorAUTO.ipynb` y `train_baseline.ipynb`, ver ADR-0008): aplicando esas mismas reglas sobre el dataset crudo completo se obtienen 352,005 filas limpias, no ~100,625, incluso descartando además cualquier fila con un valor nulo en alguna de las features (218,858 filas en ese caso). Ninguna combinación de las reglas de limpieza documentadas reproduce el número anterior.

La explicación más probable es que esa tabla anterior se escribió en una sesión sin acceso real al dataset (el remoto de DagsHub original no daba acceso de push al resto del equipo, riesgo **R1** en `docs/risk-register.md`, ya resuelto migrando a un remoto propio), es decir, sin una corrida real que la respalde. Se reemplaza aquí por la primera corrida verificable de punta a punta, con el dataset, el código y los resultados trazables entre sí. El orden entre modelos (XGBoost < Random Forest < Linear Regression en error) se mantiene igual que antes, lo cual es consistente con que la arquitectura del pipeline sea correcta; solo cambian los valores exactos por el tamaño real del dataset usado.

**Dataset usado en esta corrida:** `data/raw/vehicles.csv` se colocó manualmente en el repositorio local para esta ejecución. Con el remoto migrado (`SNARF3/ValorAutoData`, R1 mitigado), cualquier integrante del equipo puede reproducir esta misma tabla desde un clon limpio corriendo `dvc pull` + los 3 notebooks (misma semilla, mismo dataset).
