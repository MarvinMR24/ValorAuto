"""Componente de EDA: tipos de dato y valores nulos (celda 2 de LimpiezaValorAUTO.ipynb original)."""

import matplotlib.pyplot as plt
import pandas as pd

from src.model import config


def reporte_nulos(df: pd.DataFrame) -> pd.DataFrame:
    """Devuelve una tabla con la cantidad y el % de nulos por columna (solo columnas con nulos > 0)."""
    nulos = df.isnull().sum()
    porcentaje = (nulos / len(df)) * 100
    reporte = pd.DataFrame({"valores_faltantes": nulos, "porcentaje": porcentaje})
    return reporte[reporte["valores_faltantes"] > 0].sort_values(by="porcentaje", ascending=False)


def graficar_nulos(df: pd.DataFrame, out_dir=None) -> str:
    """Gráfico de barras horizontal con el % de nulos por columna. Guarda PNG y devuelve la ruta."""
    reporte = reporte_nulos(df)
    out_dir = out_dir or config.GRAPHICS_EDA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "01_nulos_por_columna.png"

    if reporte.empty:
        return None

    fig, ax = plt.subplots(figsize=(10, max(4, 0.4 * len(reporte))))
    ax.barh(reporte.index, reporte["porcentaje"], color="#B00020")
    ax.set_xlabel("% de valores faltantes")
    ax.set_title("Valores nulos por columna (dataset crudo)")
    ax.invert_yaxis()
    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)
