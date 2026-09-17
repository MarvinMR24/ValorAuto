"""Componente de EDA: distribuciones de precio, año y odómetro (celda 4 de LimpiezaValorAUTO.ipynb original)."""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from src.model import config


def graficar_distribuciones(df_clean: pd.DataFrame, out_dir=None) -> str:
    """Histogramas de precio, año y odómetro sobre el dataset ya limpio. Guarda PNG y devuelve la ruta."""
    out_dir = out_dir or config.GRAPHICS_EDA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "02_distribuciones.png"

    fig, axes = plt.subplots(1, 3, figsize=(20, 6))

    sns.histplot(df_clean["price"], bins=50, kde=True, ax=axes[0], color="blue")
    axes[0].set_title("Distribución del Precio (USD)")
    axes[0].set_xlabel("Precio")

    sns.histplot(df_clean["year"], bins=34, kde=False, ax=axes[1], color="green")
    axes[1].set_title("Distribución del Año de Fabricación")
    axes[1].set_xlabel("Año")

    sns.histplot(df_clean["odometer"], bins=50, kde=True, ax=axes[2], color="orange")
    axes[2].set_title("Distribución del Kilometraje (Odómetro)")
    axes[2].set_xlabel("Odómetro (Millas)")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
