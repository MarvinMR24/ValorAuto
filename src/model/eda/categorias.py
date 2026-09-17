"""Componente de EDA: top marcas y modelos (celda 5 de LimpiezaValorAUTO.ipynb original)."""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

TOP_N = 20


def graficar_top_categorias(df_clean: pd.DataFrame, out_dir=None) -> str:
    """Top 20 marcas y top 20 modelos con mayor presencia en el dataset. Guarda PNG y devuelve la ruta."""
    from src.model import config

    out_dir = out_dir or config.GRAPHICS_EDA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "03_top_marcas_modelos.png"

    fig, axes = plt.subplots(2, 1, figsize=(16, 12))

    top_marcas = df_clean["manufacturer"].value_counts().head(TOP_N)
    sns.barplot(x=top_marcas.values, y=top_marcas.index, ax=axes[0], hue=top_marcas.index, palette="viridis", legend=False)
    axes[0].set_title(f"Top {TOP_N} marcas con mayor presencia en el dataset")
    axes[0].set_xlabel("Cantidad de vehículos")
    axes[0].set_ylabel("Marca (manufacturer)")

    top_modelos = df_clean["model"].value_counts().head(TOP_N)
    sns.barplot(x=top_modelos.values, y=top_modelos.index, ax=axes[1], hue=top_modelos.index, palette="magma", legend=False)
    axes[1].set_title(f"Top {TOP_N} modelos con mayor presencia en el dataset")
    axes[1].set_xlabel("Cantidad de vehículos")
    axes[1].set_ylabel("Modelo (model)")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
