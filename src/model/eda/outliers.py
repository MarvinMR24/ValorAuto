"""Componente de EDA nuevo: boxplots de precio y odómetro antes/después de limpiar.

No existía en LimpiezaValorAUTO.ipynb original (que limpiaba sin mostrar el
efecto visualmente). Se agrega para dejar evidencia visual del filtrado de
outliers, no solo el conteo de filas descartadas en el reporte de cleaning.py.
"""

import matplotlib.pyplot as plt
import pandas as pd

from src.model import config


def graficar_outliers(df_raw: pd.DataFrame, df_clean: pd.DataFrame, out_dir=None) -> str:
    """Boxplots de precio y odómetro, crudo vs. limpio. Guarda PNG y devuelve la ruta."""
    out_dir = out_dir or config.GRAPHICS_EDA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "05_outliers_antes_despues.png"

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    axes[0, 0].boxplot(df_raw["price"].dropna())
    axes[0, 0].set_title("Precio — crudo")
    axes[0, 1].boxplot(df_clean["price"])
    axes[0, 1].set_title("Precio — limpio")

    axes[1, 0].boxplot(df_raw["odometer"].dropna())
    axes[1, 0].set_title("Odómetro — crudo")
    axes[1, 1].boxplot(df_clean["odometer"])
    axes[1, 1].set_title("Odómetro — limpio")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
