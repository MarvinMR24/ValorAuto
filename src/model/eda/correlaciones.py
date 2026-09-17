"""Componente de EDA nuevo: correlación entre variables numéricas y el precio.

No existía en LimpiezaValorAUTO.ipynb original; se agrega para completar el
análisis exploratorio (mejora pedida sobre el EDA existente).
"""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from src.model import config

NUM_COLS_PARA_CORRELACION = ["price", "year", "odometer"]


def graficar_correlaciones(df_clean: pd.DataFrame, out_dir=None) -> str:
    """Heatmap de correlación entre precio, año y odómetro. Guarda PNG y devuelve la ruta."""
    out_dir = out_dir or config.GRAPHICS_EDA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "04_correlaciones.png"

    cols = [c for c in NUM_COLS_PARA_CORRELACION if c in df_clean.columns]
    corr = df_clean[cols].corr()

    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", vmin=-1, vmax=1, ax=ax)
    ax.set_title("Correlación entre precio, año y odómetro")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
