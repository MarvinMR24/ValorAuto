"""Carga de datos crudos y limpios. Ver src/model/config.py para las rutas."""

import pandas as pd

from src.model import config

# Columnas realmente usadas en todo el pipeline (cleaning.py, eda/*.py, features.py):
# price/year/odometer/manufacturer/model para limpieza y EDA, más fuel/transmission/
# drive/type/condition/cylinders/size para el entrenamiento (config.FEATURES). El
# CSV crudo de Craigslist trae 26 columnas, varias de texto libre o URLs (url,
# region_url, image_url, description, VIN, posting_date) que nadie en el pipeline
# usa y que en un dataset de ~427k filas multiplican varias veces el uso de
# memoria; restringir con `usecols` es lo que permite correr el EDA/entrenamiento
# en una máquina con RAM limitada.
RAW_COLUMNS_USADAS = [
    "price", "year", "odometer", "manufacturer", "model",
    "fuel", "transmission", "drive", "type", "condition", "cylinders", "size",
]


def load_raw(path=None) -> pd.DataFrame:
    """Carga el dataset crudo de Craigslist (vehicles.csv, data/raw/).

    Usa `usecols=RAW_COLUMNS_USADAS` (ver nota arriba) y el engine C por
    defecto de pandas (más rápido y liviano en memoria que engine='python',
    que se usaba antes); `on_bad_lines='skip'` sigue descartando filas
    malformadas, igual que en LimpiezaValorAUTO.ipynb original.
    """
    csv_path = path or config.DATA_RAW_PATH
    return pd.read_csv(csv_path, usecols=RAW_COLUMNS_USADAS, on_bad_lines="skip")


def load_clean(path=None) -> pd.DataFrame:
    """Carga el dataset ya limpio (data/vehicles/vehicles_clean.csv, versionado con DVC)."""
    csv_path = path or config.DATA_CLEAN_PATH
    return pd.read_csv(csv_path, on_bad_lines="skip")
