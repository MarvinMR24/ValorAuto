"""
Pruebas automatizadas para el pipeline de ML y MLOps de ValorAuto (src/model y src/pipeline).
Verifica:
1. Existencia y formato de la base de datos precalculada (data/precalc.db).
2. Plausibilidad de los precios y coherencia de datos (predicted_price > 0).
3. Cobertura de las combinaciones precalculadas (tabla no vacía e índice creado).
4. Configuración de las 10 features (ADR-0009), limpieza (cleaning.py), preprocesador (features.py),
   grilla de combinaciones con imputación de modas (combinations.py) y escritura atómica (precalculo.py).
"""
import os
import sys
import sqlite3
import tempfile
import unittest
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.model.config import (
    FEATURES,
    NUM_FEATURES,
    CAT_FEATURES,
    RANDOM_SEED,
    TEST_SIZE,
    MODEL_HYPERPARAMS,
)
from src.model.cleaning import clean_dataset
from src.model.features import build_preprocessor
from src.pipeline.combinations import generar_combinaciones
from src.pipeline.precalculo import guardar_sqlite

DB_PATH = REPO_ROOT / "data" / "precalc.db"


def test_precalc_db_exists():
    """Verifica que la base de datos precalculada SQLite existe."""
    assert DB_PATH.exists(), f"No se encontró el archivo de base de datos en: {DB_PATH}"


def test_precalc_table_structure_and_records():
    """Verifica que la tabla precalculated_prices existe y contiene registros."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='precalculated_prices';")
    table = cursor.fetchone()
    assert table is not None, "La tabla 'precalculated_prices' no existe en precalc.db"

    cursor.execute("SELECT COUNT(*) FROM precalculated_prices;")
    count = cursor.fetchone()[0]
    assert count > 0, "La tabla 'precalculated_prices' está vacía"

    conn.close()


def test_precalc_values_plausibility():
    """Verifica que no haya precios nulos o no positivos y que existan las columnas requeridas."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(*) FROM precalculated_prices 
        WHERE predicted_price IS NULL 
           OR predicted_price <= 0;
    """)
    invalid_rows = cursor.fetchone()[0]
    assert invalid_rows == 0, f"Se encontraron {invalid_rows} registros con precios inválidos"

    cursor.execute("PRAGMA table_info(precalculated_prices);")
    columns = [row[1] for row in cursor.fetchall()]
    expected_cols = ["year", "odometer", "manufacturer", "fuel", "transmission", "drive", "type", "predicted_price"]
    for col in expected_cols:
        assert col in columns, f"Falta la columna requerida '{col}' en precalculated_prices"

    conn.close()


def test_query_specific_known_car():
    """Verifica que marcas comunes de autos existan en la tabla."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT manufacturer FROM precalculated_prices LIMIT 5;")
    marcas = [r[0] for r in cursor.fetchall()]
    assert len(marcas) > 0, "No se obtuvieron marcas de la tabla precalculada"

    cursor.execute("SELECT year, odometer, manufacturer, predicted_price FROM precalculated_prices LIMIT 1;")
    row = cursor.fetchone()
    assert isinstance(row[0], (int, float))
    assert isinstance(row[1], int)
    assert isinstance(row[2], str)
    assert row[3] > 0

    conn.close()


def test_adr0008_and_adr0009_model_config_and_features():
    """Verifica las 10 features (ADR-0009), semillas y preprocesador con SimpleImputer + OneHotEncoder."""
    expected_features = [
        "year", "odometer", "manufacturer", "fuel", "transmission",
        "drive", "type", "condition", "cylinders", "size",
    ]
    assert FEATURES == expected_features
    assert len(FEATURES) == 10
    assert RANDOM_SEED == 42
    assert TEST_SIZE == 0.2
    assert MODEL_HYPERPARAMS["Model_RandomForest"]["n_estimators"] == 50
    assert MODEL_HYPERPARAMS["Model_RandomForest"]["max_depth"] == 10

    preprocessor = build_preprocessor()
    cat_pipeline = preprocessor.transformers[1][1]
    assert "imputer" in cat_pipeline.named_steps
    assert "onehot" in cat_pipeline.named_steps


def test_cleaning_and_combinations_grid_imputation():
    """Verifica que clean_dataset y generar_combinaciones imputen la moda en condition, cylinders y size."""
    sample_df = pd.DataFrame([
        {
            "price": 15000, "year": 2018, "odometer": 45000,
            "manufacturer": "toyota", "model": "corolla", "fuel": "gas", "transmission": "automatic",
            "drive": "fwd", "type": "sedan", "condition": "good",
            "cylinders": "4 cylinders", "size": "mid-size",
        },
        {
            "price": 22000, "year": 2020, "odometer": 30000,
            "manufacturer": "toyota", "model": "corolla", "fuel": "gas", "transmission": "automatic",
            "drive": "fwd", "type": "sedan", "condition": "good",
            "cylinders": "4 cylinders", "size": "mid-size",
        },
    ])
    cleaned, reporte = clean_dataset(sample_df)
    assert len(cleaned) == 2
    assert reporte["filas_finales"] == 2

    grid = generar_combinaciones(cleaned)
    assert len(grid) == 10  # 2 combinaciones únicas x 5 rangos de odómetro
    assert set(FEATURES).issubset(set(grid.columns))
    assert (grid["condition"] == "good").all()
    assert (grid["cylinders"] == "4 cylinders").all()
    assert (grid["size"] == "mid-size").all()


def test_atomic_sqlite_write_with_index():
    """Verifica que guardar_sqlite realice escritura atómica (.tmp -> os.replace) y cree el índice (ADR-0007)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = Path(tmpdir) / "test_precalc.db"
        df = pd.DataFrame([
            {
                "year": 2020, "odometer": 50000, "manufacturer": "toyota",
                "fuel": "gas", "transmission": "automatic", "drive": "fwd",
                "type": "sedan", "condition": "good", "cylinders": "4 cylinders",
                "size": "mid-size", "predicted_price": 15500.0,
            }
        ])
        guardar_sqlite(df, db_path=tmp_db)
        assert tmp_db.exists()
        assert not tmp_db.with_suffix(".tmp").exists()

        conn = sqlite3.connect(str(tmp_db))
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_search';")
        idx = cur.fetchone()
        conn.close()
        assert idx is not None, "El índice idx_search sobre (manufacturer, year, type) no fue creado"


class TestValorAutoModelPipeline(unittest.TestCase):
    def test_01_precalc_db_exists(self):
        test_precalc_db_exists()

    def test_02_precalc_table_structure_and_records(self):
        test_precalc_table_structure_and_records()

    def test_03_precalc_values_plausibility(self):
        test_precalc_values_plausibility()

    def test_04_query_specific_known_car(self):
        test_query_specific_known_car()

    def test_05_adr0008_and_adr0009_model_config_and_features(self):
        test_adr0008_and_adr0009_model_config_and_features()

    def test_06_cleaning_and_combinations_grid_imputation(self):
        test_cleaning_and_combinations_grid_imputation()

    def test_07_atomic_sqlite_write_with_index(self):
        test_atomic_sqlite_write_with_index()


if __name__ == "__main__":
    unittest.main(verbosity=2)

