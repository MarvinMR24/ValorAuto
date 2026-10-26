"""
Limpieza del dataset crudo (Data Engineering en CRISP-ML(Q), ver docs/crisp-mlq.md).

Reglas portadas 1:1 de LimpiezaValorAUTO.ipynb (celda 3), ahora centralizadas
acá y parametrizadas desde src/model/config.py en vez de estar hardcodeadas
en una celda de notebook.
"""

import pandas as pd

from src.model import config


def clean_dataset(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Aplica las reglas de limpieza y devuelve (df_limpio, reporte).

    El reporte deja explícito cuántas filas se descartaron y por qué regla,
    en vez de solo imprimirlo en consola: sirve como evidencia documentada
    (ver docs/evidence/baseline-modelo.md) y es lo que consume la celda de
    notebook para mostrar el resumen.
    """
    filas_iniciales = len(df)
    reporte = {"filas_iniciales": filas_iniciales}

    df_clean = df.copy()

    # 1. Outliers de precio: autos entre PRICE_MIN y PRICE_MAX
    antes = len(df_clean)
    df_clean = df_clean[(df_clean["price"] > config.PRICE_MIN) & (df_clean["price"] < config.PRICE_MAX)]
    reporte["descartadas_por_precio"] = antes - len(df_clean)

    # 2. Años ilógicos o nulos
    antes = len(df_clean)
    df_clean = df_clean.dropna(subset=["year"])
    df_clean = df_clean[(df_clean["year"] >= config.YEAR_MIN) & (df_clean["year"] <= config.YEAR_MAX)]
    reporte["descartadas_por_anio"] = antes - len(df_clean)

    # 3. Odómetro ilógico o nulo
    antes = len(df_clean)
    df_clean = df_clean.dropna(subset=["odometer"])
    df_clean = df_clean[df_clean["odometer"] <= config.ODOMETER_MAX]
    reporte["descartadas_por_odometro"] = antes - len(df_clean)

    # 4. Marca/modelo nulos (necesarios para las visualizaciones y el encoding)
    antes = len(df_clean)
    df_clean = df_clean.dropna(subset=["manufacturer", "model"])
    reporte["descartadas_por_marca_modelo"] = antes - len(df_clean)

    reporte["filas_finales"] = len(df_clean)
    reporte["total_descartadas"] = filas_iniciales - len(df_clean)
    reporte["porcentaje_descartado"] = round(100 * reporte["total_descartadas"] / filas_iniciales, 2)

    return df_clean, reporte


def save_clean(df_clean: pd.DataFrame, path=None) -> str:
    """Guarda el dataset limpio en data/vehicles/ (ruta que versiona DVC, ADR-0006).

    Antes LimpiezaValorAUTO.ipynb guardaba en data/processed/, pero el
    entrenamiento y DVC siempre leyeron de data/vehicles/: era una
    inconsistencia real (nada consumía lo que caía en data/processed/).
    """
    csv_path = path or config.DATA_CLEAN_PATH
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df_clean.to_csv(csv_path, index=False)
    return str(csv_path)
