# ADR-0008 — Separación código/orquestación: componentes en `src/`, notebooks delgados en `notebooks/`

**Estado:** Aceptada
**Fecha:** Sprint 3 (reemplaza los notebooks monolíticos de `src/model/` y `src/pipeline/`)
**Relacionado:** `src/model/`, `src/pipeline/`, `notebooks/`, `docs/adr/0005-mlflow-tracking-model-registry.md`, `docs/adr/0007-sqlite-lectura-rapida.md`, `docs/risk-register.md` (R7), `docs/evidence/baseline-modelo.md`

## Contexto

La primera versión del modelo vivía en 4 notebooks "gordos": `LimpiezaValorAUTO.ipynb`, `XGBoost_Scikit_Learn.ipynb`, `train_baseline.ipynb` y `generate_combinations.ipynb`, cada uno con toda su lógica (limpieza, EDA, entrenamiento, precálculo) escrita directamente en celdas de Jupyter. Al revisar el código completo de los cuatro para este cambio aparecieron problemas concretos, no hipotéticos:

- **Reproducibilidad rota:** `train_baseline.ipynb` entrenaba Random Forest con `n_estimators=50, max_depth=10`; `XGBoost_Scikit_Learn.ipynb` entrenaba el mismo modelo con `n_estimators=100, max_depth=15`. Dos notebooks, dos fuentes de verdad distintas para el mismo hiperparámetro, sin ningún mecanismo que avisara del desacuerdo.
- **Rutas frágiles:** las rutas a los datos eran relativas al directorio de trabajo (`'../../data/...'`). Al mover cualquier notebook de carpeta (como pasó al reorganizar `notebooks/` dentro de `src/` en un cambio anterior), las rutas se rompían silenciosamente.
- **Dos pipelines de precálculo compitiendo:** `XGBoost_Scikit_Learn.ipynb` generaba su propio `predict_combinations.py`, que predice sobre filas reales del dataset; `generate_combinations.ipynb` genera una grilla sintética de combinaciones y la guarda en SQLite. Son dos enfoques distintos a la misma tarea, y solo el segundo está alineado con el diagrama C4 y los ADR-0003/0007 ya publicados.
- **Sin EDA como componente propio:** el análisis exploratorio vivía mezclado dentro de `LimpiezaValorAUTO.ipynb`, sin separación por tipo de exploración, y sin guardar ninguna imagen (solo `print()` y gráficos que se perdían al cerrar el notebook).
- **Destino de datos inconsistente:** `LimpiezaValorAUTO.ipynb` guardaba el dataset limpio en `data/processed/`, pero el entrenamiento (y DVC) siempre leyeron de `data/vehicles/`. Nada consumía lo que caía en `data/processed/`.

## Decisión

Se separa **lógica reutilizable** de **orquestación**, en tres piezas:

1. **Componentes en `src/model/` y `src/pipeline/`:** funciones puras de Python (reciben DataFrames/paths, devuelven resultados) organizadas por responsabilidad — `data_loading.py`, `cleaning.py`, `eda/` (un módulo por tipo de exploración: `nulos.py`, `distribuciones.py`, `categorias.py`, `correlaciones.py`, `outliers.py`), `features.py`, `training.py`, `evaluation.py` en `src/model/`; `combinations.py` y `precalculo.py` en `src/pipeline/`. Este código es importable y, en principio, testeable por separado de cualquier notebook.
2. **Notebooks delgados en `notebooks/`:** `01_eda.ipynb`, `02_entrenamiento.ipynb`, `03_precalculo.ipynb` solo importan funciones de `src/` y las encadenan en orden; no contienen lógica de negocio propia (ni reglas de limpieza, ni hiperparámetros, ni cálculo de métricas escritos inline).
3. **Rutas basadas en `pathlib.Path(__file__).resolve()`**, no en el directorio de trabajo: `src/model/config.py` calcula `REPO_ROOT` a partir de su propia ubicación en el árbol de archivos, y todas las rutas (dataset, `mlflow.db`, `src/graphics/`, `precalc.db`) se derivan de ahí. No importa desde dónde se ejecute el notebook.

Como consecuencia directa del punto 1, **`src/model/config.py` centraliza todos los valores estáticos**: semilla aleatoria (`RANDOM_SEED = 42`), tamaño de split (`TEST_SIZE = 0.2`), reglas de limpieza (rangos de precio/año/odómetro), columnas de features/target, e hiperparámetros por modelo (`MODEL_HYPERPARAMS`). El conflicto de Random Forest se resuelve manteniendo los valores de `train_baseline.ipynb` (`n_estimators=50, max_depth=10`), porque son los que ya están documentados como evidencia oficial en `docs/evidence/baseline-modelo.md`; adoptar los de `XGBoost_Scikit_Learn.ipynb` habría invalidado esa evidencia ya entregada sin volver a correr el entrenamiento. Ahora solo existe un lugar donde ese número puede cambiar.

Los cuatro notebooks viejos se retiran del árbol (`git rm`) una vez que su lógica quedó absorbida en `src/`; el historial de git los conserva igual, así que no se pierde nada.

## Alternativas consideradas

- **Dejar los notebooks como están y solo documentar el problema:** se descartó porque no resuelve nada — el bug de hiperparámetros seguiría existiendo la próxima vez que alguien reentrene desde cualquiera de los dos notebooks originales.
- **Un solo notebook gigante que haga todo (limpieza + EDA + entrenamiento + precálculo):** más simple de ejecutar de punta a punta, pero reintroduce el problema original a otra escala: lógica de negocio mezclada con orquestación, sin poder reutilizar ni una sola función desde, por ejemplo, un futuro test automatizado o un script de reentrenamiento programado.
- **Mover la lógica a `src/` pero mantener rutas relativas al notebook (`'../data/...'`):** se descartó porque es exactamente la causa raíz de la ruptura de rutas que ya ocurrió una vez en este proyecto al reorganizar carpetas; `pathlib.Path(__file__).resolve()` es insensible a desde dónde se ejecute el notebook.
- **Variables de entorno para los hiperparámetros en vez de un `config.py`:** se descartó por ser más difícil de versionar y revisar en una PR (un `.py` con valores literales se lee y se diffea directamente; variables de entorno requieren documentación aparte de qué existe y cuáles son sus valores por defecto).

## Consecuencias

- Dos personas pueden reentrenar el modelo con los mismos parámetros sin copiar-pegar código entre notebooks: el bug de Random Forest que motivó este cambio ya no puede repetirse, porque solo hay una definición de `MODEL_HYPERPARAMS`.
- Los notebooks en `notebooks/` dependen de poder importar `src/` (requieren correrse con el repo como raíz del `sys.path`, o desde la carpeta `notebooks/` con el bootstrap que agrega `REPO_ROOT` al `sys.path`); si en el futuro se agregan tests automatizados, pueden importar exactamente las mismas funciones que los notebooks, sin duplicar lógica.
- Se pierde la conveniencia de "todo en un solo archivo para revisar" — ahora entender el pipeline completo requiere mirar `notebooks/` y `src/model/`/`src/pipeline/` en conjunto. Se compensa con `src/README.md`, que describe qué hace cada módulo.
- El pipeline se corrió de punta a punta contra el dataset real completo (426,880 filas crudas) el 2026-09-17, colocando `data/raw/vehicles.csv` manualmente en el repositorio (el remoto de DagsHub sigue privado, R1 en `docs/risk-register.md`, así que otro miembro del equipo que clone el repo desde cero todavía necesita ese acceso o el archivo a mano). Esa corrida encontró y corrigió dos problemas reales que solo aparecen ejecutando, no leyendo el código: la celda de bootstrap de los notebooks calculaba `REPO_ROOT` con `Path.cwd().parent`, que asume que Jupyter se lanzó con cwd en `notebooks/` — falla si se ejecuta desde la raíz del repo (como con `nbconvert` o `papermill`); se reemplazó por una búsqueda hacia arriba desde `Path.cwd()` hasta encontrar `src/` y `notebooks/`, sin asumir un cwd fijo. Y `load_raw()` cargaba las 26 columnas del CSV crudo (varias de texto libre/URLs que nadie usa) con `engine='python'`, lo que agota la memoria en una máquina con RAM limitada (3.8 GB) antes de terminar de leer un CSV de 1.4 GB; se resolvió con `usecols` restringido a las 9 columnas que el pipeline realmente usa, sobre el engine C por defecto (9 segundos y 280 MB de pico en vez de un proceso silenciosamente matado por el OOM killer).
