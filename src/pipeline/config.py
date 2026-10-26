"""
Valores estáticos del pipeline de precálculo (ADR-0008).

Reutiliza lo que ya vive en src/model/config.py (FEATURES, REPO_ROOT, nombre
del modelo en el Registry) en vez de duplicarlo: una sola fuente de verdad
para ambos componentes.
"""

from src.model.config import (
    FEATURES,
    GRAPHICS_DIR,
    MLFLOW_TRACKING_URI,
    MODEL_PRODUCTION_STAGE,
    MODEL_REGISTRY_NAME,
    PRICE_MIN,
    REPO_ROOT,
)

# --- Rutas propias del pipeline -----------------------------------------
DATA_CLEAN_PATH = REPO_ROOT / "data" / "vehicles" / "vehicles_clean.csv"
PRECALC_DB_PATH = REPO_ROOT / "data" / "precalc.db"
GRAPHICS_PIPELINE_DIR = GRAPHICS_DIR / "pipeline"

# --- Simulación de kilometraje (igual a generate_combinations.ipynb original) ---
ODOMETER_RANGES = [10_000, 50_000, 100_000, 150_000, 200_000]
CAT_FEATURES_COMBINACIONES = ["year", "manufacturer", "model_base", "fuel", "transmission", "drive", "type"]
# Lo que el backend puede observar vía Gemini (ADR-0010): una fila por clave y km
CLAVE_BUSQUEDA = ("manufacturer", "model_base", "year", "type")

# --- Inferencia ----------------------------------------------------------
# Piso del precio precalculado: el mismo mínimo con el que se limpió el target
# (src/model/config.py). XGBoost extrapola precios negativos en combinaciones
# raras (ej. fiat 1991 con 200k km); nunca se le muestra eso al usuario.
PRECIO_MINIMO = PRICE_MIN

# --- SQLite ------------------------------------------------------------
TABLE_NAME = "precalculated_prices"
INDEX_COLUMNS = ("manufacturer", "model_base", "year", "odometer")
INDEX_FALLBACK_COLUMNS = ("manufacturer", "year", "type", "odometer")
