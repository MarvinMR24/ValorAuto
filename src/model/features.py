"""Preprocesamiento y split de datos para entrenamiento (Model Engineering, CRISP-ML(Q))."""

import re

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.model import config


def normalizar_modelo(modelo, marca=None):
    """Reduce el texto libre de `model` de Craigslist a su modelo base (ADR-0010).

    "silverado 1500 ltz" -> "silverado", "F150" -> "f-150", "grand cherokee
    laredo" -> "grand cherokee". El backend aplica exactamente la misma regla a
    lo que devuelve Gemini (src/api/utils/normalizer.js -> normalizeModel), así
    que si se cambia acá hay que cambiarla allá.
    """
    if modelo is None or (isinstance(modelo, float) and np.isnan(modelo)):
        return np.nan
    tokens = re.sub(r"[^a-z0-9\- ]", " ", str(modelo).lower()).split()
    if marca and tokens and tokens[0] == str(marca).lower():
        tokens = tokens[1:]
    if not tokens:
        return np.nan
    base = tokens[0]
    if base in config.MODELO_PREFIJOS_DOS_PALABRAS and len(tokens) > 1:
        base = f"{base} {tokens[1]}"
    return config.MODELO_ALIASES.get(base, base)


def agregar_model_base(df):
    """Agrega la columna `model_base` a partir de `model` (idempotente)."""
    if "model_base" in df.columns:
        return df
    df = df.copy()
    df["model_base"] = [normalizar_modelo(m, mf) for m, mf in zip(df["model"], df["manufacturer"])]
    return df


def build_preprocessor() -> ColumnTransformer:
    """Pipeline de imputación + one-hot encoding, igual al de train_baseline.ipynb original.

    Con `model_base` (~2.200 valores) el one-hot denso ocuparía varios GB, así que
    la salida es dispersa y las categorías con menos de MIN_FRECUENCIA_CATEGORIA
    filas se agrupan como "infrecuentes" (ADR-0010).
    """
    num_transformer = SimpleImputer(strategy="median")
    cat_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(
            handle_unknown="infrequent_if_exist",
            min_frequency=config.MIN_FRECUENCIA_CATEGORIA,
            sparse_output=True,
        )),
    ])
    return ColumnTransformer(transformers=[
        ("num", num_transformer, config.NUM_FEATURES),
        ("cat", cat_transformer, config.CAT_FEATURES),
    ])


def split_data(df_clean):
    """Selecciona FEATURES/TARGET de config.py y separa train/test con RANDOM_SEED/TEST_SIZE fijos."""
    df_clean = agregar_model_base(df_clean)
    df_ml = df_clean[config.FEATURES + [config.TARGET]].dropna(subset=[config.TARGET])
    X = df_ml[config.FEATURES]
    y = df_ml[config.TARGET]
    return train_test_split(X, y, test_size=config.TEST_SIZE, random_state=config.RANDOM_SEED)
