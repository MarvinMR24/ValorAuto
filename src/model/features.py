"""Preprocesamiento y split de datos para entrenamiento (Model Engineering, CRISP-ML(Q))."""

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.model import config


def build_preprocessor() -> ColumnTransformer:
    """Pipeline de imputación + one-hot encoding, igual al de train_baseline.ipynb original."""
    num_transformer = SimpleImputer(strategy="median")
    cat_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer(transformers=[
        ("num", num_transformer, config.NUM_FEATURES),
        ("cat", cat_transformer, config.CAT_FEATURES),
    ])


def split_data(df_clean):
    """Selecciona FEATURES/TARGET de config.py y separa train/test con RANDOM_SEED/TEST_SIZE fijos."""
    df_ml = df_clean[config.FEATURES + [config.TARGET]].dropna(subset=[config.TARGET])
    X = df_ml[config.FEATURES]
    y = df_ml[config.TARGET]
    return train_test_split(X, y, test_size=config.TEST_SIZE, random_state=config.RANDOM_SEED)
