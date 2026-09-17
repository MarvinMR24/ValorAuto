"""
Cálculo de precios y escritura en SQLite (Data Engineering para el servicio, no
Deployment: ver docs/crisp-mlq.md).

La escritura es atómica: se arma la base en un archivo temporal y recién al
final se reemplaza el precalc.db real con os.replace(). Si el job se cae a
mitad de camino, el precalc.db que ya está sirviendo el backend queda
intacto en vez de quedar a medio escribir (resuelve el riesgo R7 del
risk register).
"""

import os
import sqlite3

import matplotlib.pyplot as plt
import mlflow
import mlflow.pyfunc
import numpy as np
import pandas as pd

from src.pipeline import config


def cargar_modelo_production():
    """Carga la versión 'Production' del modelo registrado en MLflow (config.MODEL_REGISTRY_NAME)."""
    mlflow.set_tracking_uri(config.MLFLOW_TRACKING_URI)
    model_uri = f"models:/{config.MODEL_REGISTRY_NAME}/{config.MODEL_PRODUCTION_STAGE}"
    return mlflow.pyfunc.load_model(model_uri)


def calcular_precios(model, df_combinaciones: pd.DataFrame) -> pd.DataFrame:
    """Corre inferencia batch (vectorizada) sobre todas las combinaciones."""
    predicciones = model.predict(df_combinaciones[config.FEATURES])
    df_resultado = df_combinaciones.copy()
    df_resultado["predicted_price"] = np.round(predicciones, 2)
    return df_resultado


def guardar_sqlite(df_resultado: pd.DataFrame, db_path=None) -> str:
    """Escribe la tabla de precios en SQLite de forma atómica (archivo temporal + os.replace)."""
    db_path = db_path or config.PRECALC_DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = db_path.with_suffix(".tmp")

    if tmp_path.exists():
        tmp_path.unlink()

    conn = sqlite3.connect(tmp_path)
    try:
        df_resultado.to_sql(config.TABLE_NAME, conn, if_exists="replace", index=False)
        columnas = ", ".join(config.INDEX_COLUMNS)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_search ON {config.TABLE_NAME} ({columnas})")
        conn.commit()
    finally:
        conn.close()

    os.replace(tmp_path, db_path)  # swap atómico: nunca deja el precalc.db real a medio escribir
    return str(db_path)


def graficar_resumen_precalculo(df_resultado: pd.DataFrame, out_dir=None) -> str:
    """Histograma de precios precalculados + conteo de combinaciones por marca, en vez de solo prints."""
    out_dir = out_dir or config.GRAPHICS_PIPELINE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "resumen_precalculo.png"

    top_marcas = df_resultado["manufacturer"].value_counts().head(15)

    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    axes[0].hist(df_resultado["predicted_price"], bins=50, color="#1168BD")
    axes[0].set_title("Distribución de precios precalculados")
    axes[0].set_xlabel("Precio estimado")

    axes[1].barh(top_marcas.index, top_marcas.values, color="#2E7D32")
    axes[1].invert_yaxis()
    axes[1].set_title("Combinaciones precalculadas por marca (top 15)")
    axes[1].set_xlabel("Cantidad de combinaciones")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
