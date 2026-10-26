"""
Regenera data/precalc.db con el modelo ganador (v3: XGBoost Tuned Depth 9, R2=0.8482).
Realiza el precálculo masivo sobre todas las combinaciones reales del dataset limpio
y realiza el swap atómico en SQLite.
"""

import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pandas as pd
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor

from src.model import config as m_config, features
from src.pipeline import combinations, precalculo, config as p_config

def main():
    print("1. Cargando dataset limpio...")
    t0 = time.time()
    df_clean = pd.read_csv(p_config.DATA_CLEAN_PATH)
    print(f"Dataset cargado: {len(df_clean):,} registros en {time.time() - t0:.2f}s")

    print("2. Generando combinaciones únicas de vehículos y rangos de km...")
    df_combos = combinations.generar_combinaciones(df_clean)
    print(f"Combinaciones generadas: {len(df_combos):,} registros")

    print("3. Ajustando Pipeline XGBoost Tuned (v3) sobre train split...")
    X_train, X_test, y_train, y_test = features.split_data(df_clean)
    preprocessor = features.build_preprocessor()

    xgb_winner = XGBRegressor(
        n_estimators=150,
        max_depth=9,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=m_config.RANDOM_SEED,
        n_jobs=-1
    )

    pipeline = Pipeline(steps=[("preprocessor", preprocessor), ("model", xgb_winner)])
    t1 = time.time()
    pipeline.fit(X_train, y_train)
    print(f"Modelo entrenado en {time.time() - t1:.2f}s")

    print("4. Realizando inferencia batch sobre las combinaciones...")
    t2 = time.time()
    df_resultado = precalculo.calcular_precios(pipeline, df_combos)
    print(f"Inferencia completada en {time.time() - t2:.2f}s")
    print(df_resultado[["manufacturer", "year", "odometer", "type", "predicted_price"]].head(5))

    print("5. Guardando atómicamente en SQLite (precalc.db)...")
    db_path = precalculo.guardar_sqlite(df_resultado)
    print(f"Base de datos actualizada con éxito en: {db_path}")

    print("6. Generando gráfico de resumen de precálculo...")
    img_path = precalculo.graficar_resumen_precalculo(df_resultado)
    print(f"Gráfico guardado en: {img_path}")

    # Test query speed
    import sqlite3
    conn = sqlite3.connect(db_path)
    t_query0 = time.time()
    cur = conn.cursor()
    cur.execute("SELECT predicted_price FROM precalculated_prices WHERE manufacturer='toyota' AND year=2015 AND odometer=50000 LIMIT 1")
    res = cur.fetchone()
    q_time_ms = (time.time() - t_query0) * 1000
    conn.close()
    print(f"Test query: toyota 2015 50k km -> Precio: ${res[0]:,.2f} USD (Tiempo query: {q_time_ms:.2f} ms)")

if __name__ == "__main__":
    main()
