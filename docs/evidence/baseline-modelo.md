# Evidencia — Modelo de Precio y Comparación de Experimentos

**Tracking MLflow:** [DagsHub MLflow Tracking](https://dagshub.com/SNARF3/ValorAutoData.mlflow/#/experiments/0) (Experimento: `ValorAuto_Model_Comparison`, ID: `0`)  
**Model Registry:** [DagsHub Model Registry — `ValorAuto_Model`](https://dagshub.com/SNARF3/ValorAutoData.mlflow/#/models/ValorAuto_Model)  
**Versión en Producción:** **Versión 3** (`Pipeline_XGBoost_Tuned_Depth9`) — Etiqueta/Stage: **`Production`**  
**Dataset:** `data/vehicles/vehicles_clean.csv`, versionado con DVC ([ADR-0006](../adr/0006-dvc-dagshub-versionamiento-datos.md)) sobre el remoto DagsHub `https://dagshub.com/SNARF3/ValorAutoData.dvc`.  
**Split:** 80% Entrenamiento / 20% Prueba (`TEST_SIZE=0.2`, `RANDOM_SEED=42`, centralizado en `src/model/config.py` — ver [ADR-0008](../adr/0008-separacion-componentes-notebooks-delgados.md)).  
**Features:** `year`, `odometer`, `manufacturer`, `fuel`, `transmission`, `drive`, `type`, `condition`, `cylinders`, `size` — **target:** `price` (10 features con preprocesamiento anti data-leakage dentro de `sklearn.pipeline.Pipeline`).  

---

## 1. Tabla Comparativa de Modelos y Experimentos

Todos los modelos fueron entrenados bajo el mismo protocolo de evaluación reproducible (`RANDOM_SEED=42`), registrando métricas, parámetros de hiperoptimización, dataset inputs y artefactos directamente en DagsHub MLflow:

| Modelo / Pipeline | RMSE (USD) | MAE (USD) | $R^2$ Score | Estado / Registro MLflow |
|---|---|---|---|---|
| **Baseline Linear Regression** | 8,107.91 | 5,587.19 | 0.6716 | Registrado como run base |
| **Pipeline Ridge (L2 Regularized, $\alpha=10.0$)** | 8,092.34 | 5,585.12 | 0.6729 | Registrado como run |
| **Random Forest** (n=50, max_depth=10) | 7,048.09 | 4,566.73 | 0.7518 | Registrado como run |
| **Model XGBoost** (Baseline: n=100, max_depth=8) | 6,085.26 | 3,777.90 | 0.8150 | Registrado (Versión 1) |
| **Pipeline HistGradientBoosting** (Scikit-Learn) | 5,984.10 | 3,912.45 | 0.8211 | Registrado como run |
| **Pipeline XGBoost Tuned Depth 9** | **5,518.22** | **3,426.10** | **0.8482** | **Versión 3 — Promovido a `Production`** |

---

## 2. Análisis y Justificación Técnica del Modelo Ganador

El modelo **`Pipeline_XGBoost_Tuned_Depth9`** superó ampliamente a todas las demás arquitecturas evaluadas:
1. **Reducción sustancial del error**: Redujo el MAE a **\$3,426.10 USD** (una mejora de más de **\$351 USD** frente al baseline de XGBoost y más de **\$2,160 USD** frente a la regresión lineal).
2. **Capacidad explicativa ($R^2 = 0.8482$)**: El modelo explica casi el **85% de la varianza** en el precio de los vehículos usados, capturando no linealidades complejas entre kilometraje, antigüedad y tipo de tracción/combustible.
3. **Hiperparámetros óptimos**:
   - `n_estimators`: 150
   - `max_depth`: 9
   - `learning_rate`: 0.08
   - `subsample`: 0.8
   - `colsample_bytree`: 0.8
4. **Eficiencia de inferencia para MLOps**: La inferencia por lotes sobre las **50,640 combinaciones** del catálogo tomó apenas **0.58 segundos**, permitiendo que el motor nocturno de precálculo genere la base SQLite sin demoras.

---

## 3. Artefactos Gráficos de Evaluación

Los gráficos actualizados de evaluación residen en el repositorio y están vinculados en los runs de MLflow:
- **Comparación de Modelos:** [`src/graphics/evaluacion/01_comparacion_modelos.png`](../../src/graphics/evaluacion/01_comparacion_modelos.png) (Gráfico de barras comparativo de RMSE, MAE y $R^2$).
- **Dispersión Predicho vs. Real:** [`src/graphics/evaluacion/02_predicho_vs_real_Model_XGBoost.png`](../../src/graphics/evaluacion/02_predicho_vs_real_Model_XGBoost.png).
- **Análisis de Residuos:** [`src/graphics/evaluacion/03_residuos_Model_XGBoost.png`](../../src/graphics/evaluacion/03_residuos_Model_XGBoost.png).
- **Importancia de Features:** [`src/graphics/evaluacion/05_importancia_features_Model_XGBoost.png`](../../src/graphics/evaluacion/05_importancia_features_Model_XGBoost.png).
- **Resumen de Precálculo Masivo:** [`src/graphics/pipeline/resumen_precalculo.png`](../../src/graphics/pipeline/resumen_precalculo.png).

---

## 4. Consumo en Producción (Arquitectura Desacoplada)

El modelo en producción no realiza inferencia pesada en vivo durante la llamada HTTP del usuario (lo que causaría latencia inaceptable para la app móvil). En su lugar:
1. El script [`scripts/recalc_precalc_db.py`](../../scripts/recalc_precalc_db.py) ejecuta la inferencia batch con el modelo `Production` y almacena los precios en [`data/precalc.db`](../../data/precalc.db) con un swap atómico (`os.replace`) para evitar corrupción de datos ([ADR-0007](../adr/0007-sqlite-lectura-rapida.md)).
2. El backend Node.js (`POST /tasacion`) consulta la base SQLite indexada por `(manufacturer, year, type)`, respondiendo con latencias promedio de **0.61 ms** (muy por debajo del límite de 50 ms de la rúbrica).
3. El margen de tasación (`precio_min` y `precio_max`) utiliza un rango de tolerancia proporcional calibrado con el MAE de este modelo (\$3,426 USD).

---

## 5. Limitación Conocida y Trazabilidad de Riesgo

- **Riesgo R2 (Mercado boliviano vs. EE. UU.):** El dataset fuente proviene de anuncios de vehículos en Norteamérica. En el [Risk Register](../risk-register.md) se formaliza este riesgo como aceptado para el MVP, recomendando a futuro la aplicación de un factor de paridad de importación regional para el mercado boliviano.

## 6. Actualización 2026-10-26 — `model_base` y precálculo por modelo (ADR-0010)

Verificación independiente de la receta v3 (re-entrenada en Docker con el mismo split y semilla) y efecto de agregar el modelo del auto como feature:

| Pipeline | RMSE (USD) | MAE (USD) | $R^2$ |
|---|---|---|---|
| XGBoost Tuned Depth 9, 10 features (re-medido) | 5,798 | 3,563 | 0.8320 |
| **XGBoost Tuned Depth 9 + `model_base` (11 features)** | **5,301** | **3,243** | **0.8596** |

La re-medición de la v3 sin `model_base` dio algo por debajo de lo reportado en la tabla de la sección 1 (0.8482). El nuevo `data/precalc.db` (80,520 filas, 40 marcas, 1,827 modelos base) se generó con `scripts/recalc_precalc_db.py`. Todos los precios son ≥ 500 USD: antes había 4 negativos. El backend usa MAE = 3,243 para `precio_min`/`precio_max`. **Pendiente:** registrar este modelo como nueva versión `Production` en el Model Registry.
