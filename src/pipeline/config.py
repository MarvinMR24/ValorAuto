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
    REPO_ROOT,
)

# --- Rutas propias del pipeline -----------------------------------------
DATA_CLEAN_PATH = REPO_ROOT / "data" / "vehicles" / "vehicles_clean.csv"
PRECALC_DB_PATH = REPO_ROOT / "data" / "precalc.db"
GRAPHICS_PIPELINE_DIR = GRAPHICS_DIR / "pipeline"

# --- Simulación de kilometraje (igual a generate_combinations.ipynb original) ---
ODOMETER_RANGES = [10_000, 50_000, 100_000, 150_000, 200_000]
CAT_FEATURES_COMBINACIONES = ["year", "manufacturer", "fuel", "transmission", "drive", "type"]

# --- SQLite ------------------------------------------------------------
TABLE_NAME = "precalculated_prices"
INDEX_COLUMNS = ("manufacturer", "year", "type")
