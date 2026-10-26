"""
Pruebas automatizadas para el pipeline de ML de ValorAuto.
Verifica:
1. Existencia y formato de la base de datos precalculada (data/precalc.db).
2. Plausibilidad de los precios y coherencia de datos (predicted_price > 0).
3. Cobertura de las combinaciones precalculadas (tabla no vacía).
4. Esquema de columnas coincidente con el pipeline nocturno.
"""
import os
import sqlite3
import pytest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = REPO_ROOT / "data" / "precalc.db"


def test_precalc_db_exists():
    """Verifica que la base de datos precalculada SQLite existe."""
    assert DB_PATH.exists(), f"No se encontró el archivo de base de datos en: {DB_PATH}"


def test_precalc_table_structure_and_records():
    """Verifica que la tabla precalculated_prices existe y contiene registros."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Verificar que la tabla existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='precalculated_prices';")
    table = cursor.fetchone()
    assert table is not None, "La tabla 'precalculated_prices' no existe en precalc.db"

    # Verificar cantidad de registros
    cursor.execute("SELECT COUNT(*) FROM precalculated_prices;")
    count = cursor.fetchone()[0]
    assert count > 0, "La tabla 'precalculated_prices' está vacía"

    conn.close()


def test_precalc_values_plausibility():
    """Verifica que no haya precios nulos o no positivos."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(*) FROM precalculated_prices 
        WHERE predicted_price IS NULL 
           OR predicted_price <= 0;
    """)
    invalid_rows = cursor.fetchone()[0]
    assert invalid_rows == 0, f"Se encontraron {invalid_rows} registros con precios inválidos"

    # Verificar columnas requeridas
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

    # Buscar un registro completo para verificar tipos de datos
    cursor.execute("SELECT year, odometer, manufacturer, predicted_price FROM precalculated_prices LIMIT 1;")
    row = cursor.fetchone()
    assert isinstance(row[0], (int, float))
    assert isinstance(row[1], int)
    assert isinstance(row[2], str)
    assert row[3] > 0

    conn.close()
