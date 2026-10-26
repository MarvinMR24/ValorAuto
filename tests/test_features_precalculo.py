"""
Pruebas de model_base (ADR-0010) y del precálculo: normalización del modelo,
una fila representativa por clave de búsqueda y recorte de precios negativos.
No dependen de MLflow ni del dataset completo.
"""
import numpy as np
import pandas as pd
import pytest

from src.model import features
from src.pipeline import combinations, config, precalculo


@pytest.mark.parametrize("modelo, marca, esperado", [
    ("silverado 1500 ltz", "chevrolet", "silverado"),
    ("F150 XLT", "ford", "f-150"),
    ("f-150", "ford", "f-150"),
    ("grand cherokee laredo", "jeep", "grand cherokee"),
    ("ram 1500", "ram", "1500"),
    ("Corolla LE", "toyota", "corolla"),
    ("CR-V EX", "honda", "cr-v"),
    ("model 3", "tesla", "model 3"),
])
def test_normalizar_modelo(modelo, marca, esperado):
    assert features.normalizar_modelo(modelo, marca) == esperado


def test_normalizar_modelo_vacio():
    assert pd.isna(features.normalizar_modelo(None))
    assert pd.isna(features.normalizar_modelo("  !!  "))


def _df_ejemplo():
    filas = [
        # 3 corollas 2015 gas/automatic y 1 hybrid: la representativa debe ser gas/automatic
        *[dict(manufacturer="toyota", model="corolla le", year=2015, fuel="gas", transmission="automatic", drive="fwd", type="sedan")] * 3,
        dict(manufacturer="toyota", model="corolla hybrid", year=2015, fuel="hybrid", transmission="automatic", drive="fwd", type="sedan"),
        dict(manufacturer="toyota", model="camry", year=2015, fuel="gas", transmission="automatic", drive="fwd", type="sedan"),
    ]
    df = pd.DataFrame(filas)
    df["condition"], df["cylinders"], df["size"], df["odometer"], df["price"] = "good", "4 cylinders", "compact", 50_000, 15_000
    return df


def test_combinaciones_una_fila_por_clave_y_km():
    combos = combinations.generar_combinaciones(_df_ejemplo())
    assert set(config.FEATURES) <= set(combos.columns)
    assert not combos.duplicated(subset=[*config.CLAVE_BUSQUEDA, "odometer"]).any()
    assert len(combos) == 2 * len(config.ODOMETER_RANGES)  # corolla + camry
    corolla = combos[(combos.model_base == "corolla") & (combos.odometer == 50_000)].iloc[0]
    assert corolla.fuel == "gas" and corolla.n_anuncios == 3  # la variante hybrid (1 anuncio) queda fuera


class _ModeloFalso:
    def __init__(self, precios):
        self.precios = precios

    def predict(self, X):
        return np.array(self.precios[: len(X)])


def test_calcular_precios_recorta_negativos():
    combos = combinations.generar_combinaciones(_df_ejemplo())
    precios = [-1537.61, 0.0, 12_345.678] + [9_000.0] * (len(combos) - 3)
    res = precalculo.calcular_precios(_ModeloFalso(precios), combos)
    assert res["predicted_price"].min() >= config.PRECIO_MINIMO
    assert res["predicted_price"].iloc[2] == 12_345.68
    assert res["year"].dtype.kind == "i"


def test_guardar_sqlite_crea_indices(tmp_path):
    combos = combinations.generar_combinaciones(_df_ejemplo())
    res = precalculo.calcular_precios(_ModeloFalso([10_000.0] * len(combos)), combos)
    db = precalculo.guardar_sqlite(res, db_path=tmp_path / "precalc.db")
    import sqlite3
    conn = sqlite3.connect(db)
    indices = {r[1] for r in conn.execute(f"PRAGMA index_list({config.TABLE_NAME})")}
    columnas = {r[1] for r in conn.execute(f"PRAGMA table_info({config.TABLE_NAME})")}
    conn.close()
    assert {"idx_search", "idx_fallback"} <= indices
    assert {"model_base", "n_anuncios", "predicted_price"} <= columnas
