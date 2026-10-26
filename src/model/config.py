"""
Valores estáticos del pipeline de modelo (ADR-0008).

Todo lo que antes vivía hardcodeado y duplicado entre notebooks (semilla,
tamaño de split, reglas de limpieza, hiperparámetros por modelo) vive acá en
un único lugar. Si dos personas entrenan el modelo, ambas usan exactamente
estos valores: eso es lo que hace reproducible el entrenamiento.

Las rutas se calculan a partir de la ubicación de este archivo (pathlib),
no del directorio de trabajo desde donde se ejecuta el notebook. Así no
importa si el notebook corre desde notebooks/, desde src/model/ o desde
cualquier otro lado: siempre encuentra el dataset, el mlflow.db y las
carpetas de salida en el mismo lugar real dentro del repo.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# --- Raíz del repositorio ---------------------------------------------
# src/model/config.py -> parents[0]=src/model, parents[1]=src, parents[2]=raíz
REPO_ROOT = Path(__file__).resolve().parents[2]

# Carga variables de entorno desde .env en la raíz del repo (si existe).
# Nunca se commitea (.gitignore); documentado en .env.example. Si no hay
# .env o no está MLFLOW_TRACKING_URI seteada, se cae al sqlite local más
# abajo, así que el proyecto sigue funcionando offline sin configurar nada.
load_dotenv(REPO_ROOT / ".env")

# --- Reproducibilidad ----------------------------------------------------
RANDOM_SEED = 42
TEST_SIZE = 0.2

# --- Reglas de limpieza (ver docs/evidence/baseline-modelo.md) -----------
PRICE_MIN = 500
PRICE_MAX = 100_000
YEAR_MIN = 1990
YEAR_MAX = 2024
ODOMETER_MAX = 350_000

# --- Features y target -----------------------------------------------
# condition/cylinders/size se agregaron después de una prueba empírica (no
# intuición): con las mismas reglas de limpieza/split/hiperparámetros, XGBoost
# bajó de RMSE=6458/MAE=4081/R2=0.792 a RMSE=6085/MAE=3778/R2=0.815 al
# agregarlas (ver docs/evidence/baseline-modelo.md). Se probó además cylinders
# como número extraído del string ("8 cylinders" -> 8.0) en vez de categoría:
# dio prácticamente el mismo resultado (RMSE=6091), así que se dejó como
# categoría por simplicidad, igual que las demás. Ojo: condition/cylinders/size
# tienen 40-72% de nulos en el dataset crudo; el SimpleImputer los rellena con
# la moda, lo cual funciona para entrenar pero tiene una consecuencia real en
# el pipeline de precálculo (ver src/pipeline/combinations.py y ADR-0009).
#
# model_base (modelo normalizado, ver features.normalizar_modelo y ADR-0010)
# se agregó con la misma metodología: con los hiperparámetros v3, R2 pasó de
# 0.832 a 0.858 y MAE de 3563 a 3263. Además es lo que permite que el backend
# distinga un Corolla de un Camry al buscar en precalc.db.
FEATURES = ["year", "odometer", "manufacturer", "model_base", "fuel", "transmission", "drive", "type", "condition", "cylinders", "size"]
NUM_FEATURES = ["year", "odometer"]
CAT_FEATURES = ["manufacturer", "model_base", "fuel", "transmission", "drive", "type", "condition", "cylinders", "size"]
TARGET = "price"

# --- Normalización de `model` (texto libre de Craigslist) -----------------
# Espejo exacto en src/api/utils/normalizer.js (normalizeModel).
MODELO_PREFIJOS_DOS_PALABRAS = {"grand", "town", "range", "santa", "land", "model"}
MODELO_ALIASES = {"f150": "f-150", "f250": "f-250", "f350": "f-350", "crv": "cr-v", "hrv": "hr-v", "rav-4": "rav4"}
MIN_FRECUENCIA_CATEGORIA = 20

# --- Hiperparámetros por modelo -------------------------------------------
# Random Forest usa los valores de train_baseline.ipynb (50/10), no los de
# XGBoost_Scikit_Learn.ipynb (100/15): son los que ya están documentados
# como evidencia oficial en docs/evidence/baseline-modelo.md. Ver ADR-0008.
MODEL_HYPERPARAMS = {
    "Baseline_LinearRegression": {},
    "Model_RandomForest": {
        "n_estimators": 50,
        "max_depth": 10,
        "random_state": RANDOM_SEED,
        "n_jobs": -1,
    },
    "Model_XGBoost": {
        "n_estimators": 100,
        "max_depth": 8,
        "learning_rate": 0.1,
        "random_state": RANDOM_SEED,
        "n_jobs": -1,
    },
}

# --- Rutas de datos --------------------------------------------------
DATA_DIR = REPO_ROOT / "data"
DATA_RAW_PATH = DATA_DIR / "raw" / "vehicles.csv"
DATA_VEHICLES_DIR = DATA_DIR / "vehicles"
DATA_CLEAN_PATH = DATA_VEHICLES_DIR / "vehicles_clean.csv"  # ruta oficial: la que versiona DVC (ADR-0006)

# --- MLflow ------------------------------------------------------------
# Por defecto usa el sqlite local (mlflow.db), igual que antes. Si se define
# MLFLOW_TRACKING_URI en el entorno (vía .env, ver .env.example) apunta en
# cambio al MLflow remoto hospedado en DagsHub (SNARF3/ValorAutoData), cuyo
# almacenamiento de artifacts es "mlflow-artifacts:/<uuid>" servido por
# DagsHub (no una ruta de archivo local) — esto resuelve de raíz el riesgo
# R15 (artifact_location con ruta absoluta no portable entre máquinas).
MLFLOW_DB_PATH = REPO_ROOT / "mlflow.db"
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", f"sqlite:///{MLFLOW_DB_PATH}")
MLFLOW_EXPERIMENT_NAME = "ValorAuto_Model_Comparison"
MODEL_REGISTRY_NAME = "ValorAuto_Model"
MODEL_PRODUCTION_STAGE = "Production"

# --- Gráficos ------------------------------------------------------------
GRAPHICS_DIR = REPO_ROOT / "src" / "graphics"
GRAPHICS_EDA_DIR = GRAPHICS_DIR / "eda"
GRAPHICS_EVAL_DIR = GRAPHICS_DIR / "evaluacion"
