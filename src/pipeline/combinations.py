"""Generación de combinaciones únicas marca/modelo/año/km para el precálculo nocturno."""

import pandas as pd

from src.pipeline import config


def generar_combinaciones(df: pd.DataFrame) -> pd.DataFrame:
    """Extrae combinaciones únicas reales del dataset y las multiplica por cada
    escenario de kilometraje en config.ODOMETER_RANGES (mismo criterio que
    generate_combinations.ipynb original).

    config.FEATURES tiene más columnas que config.CAT_FEATURES_COMBINACIONES
    (ver ADR-0009): condition/cylinders/size mejoran el modelo, pero el flujo
    en vivo no las puede observar todavía (Gemini solo identifica marca/modelo/
    año/confianza, ver ADR-0004) y armar la grilla con su producto cruzado real
    multiplicaría el tamaño de precalc.db varias veces. En vez de eso, a cada
    combinación se le asigna el valor más común (moda) de esas columnas en el
    dataset de entrenamiento, como valor representativo fijo. Es una
    simplificación explícita, no una omisión: documentada en
    docs/evidence/baseline-modelo.md y en el risk register (R14).
    """
    unicas = df[config.CAT_FEATURES_COMBINACIONES].drop_duplicates().dropna()

    columnas_no_observables = [c for c in config.FEATURES if c not in config.CAT_FEATURES_COMBINACIONES and c != "odometer"]
    for col in columnas_no_observables:
        moda = df[col].mode(dropna=True)
        if not moda.empty:
            unicas[col] = moda.iloc[0]

    piezas = []
    for odo in config.ODOMETER_RANGES:
        pieza = unicas.copy()
        pieza["odometer"] = odo
        piezas.append(pieza)

    df_predict = pd.concat(piezas, ignore_index=True)
    return df_predict[config.FEATURES]
