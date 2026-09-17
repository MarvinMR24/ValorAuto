# Src

Código fuente del pipeline de ValorAuto (ver `docs/architecture/C4-ValorAuto.md` para el diagrama de componentes y [ADR-0008](../docs/adr/0008-separacion-componentes-notebooks-delgados.md) para la justificación de esta estructura).

Desde este cambio, la lógica reutilizable vive en módulos `.py` importables; los notebooks que la orquestan están en [`notebooks/`](../notebooks/), en la raíz del repo, no dentro de `src/`.

- [`model/`](model/) — limpieza del dataset, EDA y entrenamiento del modelo de precio propio (Scikit-Learn/XGBoost), con tracking de experimentos y registro de modelos en MLflow.
  - `config.py` — valores estáticos para reproducibilidad: `REPO_ROOT` (calculado con `pathlib.Path(__file__).resolve()`, no depende del directorio de trabajo), semilla aleatoria, tamaño de split, reglas de limpieza (rangos de precio/año/odómetro), columnas de features/target, hiperparámetros por modelo, nombres de experimento y modelo en MLflow.
  - `data_loading.py` — `load_raw()` / `load_clean()`, lectura del CSV crudo y del limpio. `load_raw()` restringe la lectura a las 12 columnas que el pipeline realmente usa (`usecols`, ver `RAW_COLUMNAS_USADAS` — incluye `condition`/`cylinders`/`size` desde [ADR-0009](../docs/adr/0009-features-condition-cylinders-size.md)) en vez de las 26 del CSV original: el crudo trae varias columnas de texto libre/URLs sin uso (descripción, URLs, VIN) que en ~427k filas multiplican el uso de memoria; esto es lo que permite correr el pipeline en una máquina con RAM limitada.
  - `cleaning.py` — `clean_dataset()` aplica las reglas de filtrado de `config.py` y devuelve un reporte; `save_clean()` guarda el resultado en `data/vehicles/vehicles_clean.csv` (destino único, alineado con lo que lee DVC — antes existía una inconsistencia con `data/processed/`, ver ADR-0008).
  - `eda/` — un módulo por tipo de exploración, cada uno genera y guarda su gráfico en `src/graphics/eda/`: `nulos.py` (nulos por columna), `distribuciones.py` (histogramas precio/año/odómetro), `categorias.py` (top marcas/modelos), `correlaciones.py` (heatmap de correlación), `outliers.py` (boxplots antes/después de limpieza).
  - `features.py` — `build_preprocessor()` (ColumnTransformer numérico/categórico) y `split_data()`.
  - `training.py` — `train_and_log()` arma un `sklearn.Pipeline` (preprocesador + modelo) y lo entrena con `pipeline.fit(X_train, ...)`: la imputación y el one-hot encoding se ajustan solo con datos de train dentro del pipeline, nunca con el dataset completo antes del split, para evitar data leakage; cada modelo clona su propio preprocesador en vez de compartir un objeto ya ajustado. `train_all_models()` corre los 3 modelos candidatos (Linear Regression, Random Forest, XGBoost); `promote_best_model()` registra y promueve a "Production" el de menor RMSE (`archive_existing_versions=True`, ver [ADR-0005](../docs/adr/0005-mlflow-tracking-model-registry.md)). Esta es la línea base oficial del proyecto (ver `docs/evidence/baseline-modelo.md`).
  - `evaluation.py` — gráficos de evaluación guardados en `src/graphics/evaluacion/` y logueados como artifacts del run de MLflow correspondiente: comparación de métricas, predicho vs. real, residuos, curva de aprendizaje, importancia de features.
- [`pipeline/`](pipeline/) — job de precálculo nocturno (cron/Airflow) que regenera la tabla de precios a partir del modelo registrado en MLflow.
  - `config.py` — reexporta configuración compartida de `src.model.config` y agrega lo propio del precálculo: rangos de kilometraje, columnas de índice, ruta de `data/precalc.db`.
  - `combinations.py` — `generar_combinaciones()` construye la grilla sintética marca/modelo/año × rango de kilometraje. `config.FEATURES` incluye `condition`/`cylinders`/`size` (mejoran el modelo, [ADR-0009](../docs/adr/0009-features-condition-cylinders-size.md)) pero el flujo en vivo no las puede observar todavía (Gemini solo identifica marca/modelo/año, [ADR-0004](../docs/adr/0004-gemini-vision-vs-modelo-propio.md)): a cada combinación se le asigna la moda de esas columnas en el dataset de entrenamiento como valor representativo fijo, en vez de expandir la grilla (ver riesgo R14 en `docs/risk-register.md`).
  - `precalculo.py` — `cargar_modelo_production()` carga el modelo desde el Model Registry; `calcular_precios()` predice sobre la grilla; `guardar_sqlite()` escribe `data/precalc.db` de forma atómica (archivo temporal + `os.replace`, mitiga el riesgo R7 de `docs/risk-register.md`); `graficar_resumen_precalculo()` guarda un resumen en `src/graphics/pipeline/`.
- [`graphics/`](graphics/) — imágenes generadas por el EDA, la evaluación y el precálculo (`eda/`, `evaluacion/`, `pipeline/`). Se committean al repo (no están en `.gitignore`) para que queden disponibles como evidencia sin tener que volver a correr el pipeline.
- [`vision/`](vision/) — integración con Gemini como componente de visión (identificación del vehículo a partir de la foto). No es el modelo que predice el precio.
- [`api/`](api/) — servicio Node.js/Express que expone el endpoint de tasación (`POST /tasacion`), ver contrato en `openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md`.

## Cómo correr el pipeline de modelo localmente

Los notebooks delgados viven en [`notebooks/`](../notebooks/) y se ejecutan desde ahí (o desde la raíz del repo); internamente agregan `REPO_ROOT` al `sys.path` para poder importar `src.model` y `src.pipeline` sin depender del directorio de trabajo.

```bash
pip install -r requirements.txt
dvc pull data/vehicles/vehicles_clean.csv.dvc   # trae el dataset limpio desde DagsHub

jupyter notebook notebooks/01_eda.ipynb             # limpieza + EDA, guarda imágenes en src/graphics/eda/
jupyter notebook notebooks/02_entrenamiento.ipynb   # entrena y registra los 3 modelos, promueve el mejor a "Production"
jupyter notebook notebooks/03_precalculo.ipynb      # genera data/precalc.db con el modelo "Production"

mlflow ui --backend-store-uri sqlite:///mlflow.db  # ver experimentos en http://localhost:5000
```

## MLflow remoto vía DagsHub (opcional, resuelve R15)

Por defecto, si no hay `.env`, `MLFLOW_TRACKING_URI` cae al sqlite local (comportamiento de siempre, sin cambios). Para que las corridas (con sus artifacts, no solo las métricas) queden en el MLflow que DagsHub expone automáticamente para `SNARF3/ValorAutoData` en vez de en tu máquina:

```bash
cp .env.example .env   # en la raíz del repo, completar usuario y token de DagsHub
```

`src/model/config.py` carga ese `.env` automáticamente (`load_dotenv()`) antes de definir `MLFLOW_TRACKING_URI`. Ningún otro archivo cambia: `training.py`, `src/pipeline/precalculo.py` y `src/pipeline/config.py` ya consumen `config.MLFLOW_TRACKING_URI`, así que heredan el remoto nuevo sin tocarlos. Ver [ADR-0005](../docs/adr/0005-mlflow-tracking-model-registry.md) y el riesgo R15 en `docs/risk-register.md`.

## Alternativa: MLflow (y el reentrenamiento) en Docker

Si no querés instalar MLflow (u otras dependencias) directamente en tu máquina, `docker-compose.yml` en la raíz del repo levanta todo en un contenedor. El repo se monta como volumen (`.:/app`, no una copia), así que lo que el contenedor lee o escribe (`mlflow.db`, `mlruns/`, `data/precalc.db`, `src/graphics/`) queda directamente en esta carpeta:

```bash
docker compose up mlflow            # UI de MLflow en http://localhost:5001 (no 5000: en Mac suele estar tomado por AirPlay Receiver)
docker compose run --rm training    # reentrena los 3 modelos y regenera precalc.db, dentro del contenedor
```

**Nota (ver riesgo R15 en `docs/risk-register.md`):** el `mlflow.db` actual se generó ejecutando los notebooks en el entorno de ejecución usado para este cambio (una sandbox en la nube), no en este contenedor ni en ninguna laptop del equipo. MLflow graba la ruta absoluta de los artifacts al crear cada experimento, así que el tab "Artifacts" de esas corridas ya existentes puede no cargar (los gráficos como tal están a salvo en `src/graphics/`, versionados en git). Las métricas (RMSE/MAE/R2) se ven bien igual. Para que quede portable de una vez, basta correr `docker compose run --rm training` una vez: al recrearse desde dentro del contenedor, la ruta que graba MLflow pasa a ser siempre `/app/...`, estable sin importar la máquina, mientras el equipo siga reentrenando con este mismo contenedor.
