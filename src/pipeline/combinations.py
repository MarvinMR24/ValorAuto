"""Generación de combinaciones únicas marca/modelo/año/km para el precálculo nocturno."""

import pandas as pd

from src.model import features
from src.pipeline import config


def generar_combinaciones(df: pd.DataFrame) -> pd.DataFrame:
    """Extrae combinaciones únicas reales del dataset y las multiplica por cada
    escenario de kilometraje en config.ODOMETER_RANGES (mismo criterio que
    generate_combinations.ipynb original).

    Desde ADR-0010 la clave de búsqueda del backend es (manufacturer,
    model_base, year, type): Gemini identifica marca/modelo/año/tipo pero no
    fuel/transmission/drive. Por eso, para cada clave se guarda una sola
    configuración representativa: la más frecuente en el dataset, con su
    cantidad de anuncios en `n_anuncios`. Así el backend nunca tiene que
    elegir arbitrariamente entre variantes (el antiguo `LIMIT 1` sin orden).

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
    df = features.agregar_model_base(df)
    configuraciones = (
        df.dropna(subset=config.CAT_FEATURES_COMBINACIONES)
        .groupby(config.CAT_FEATURES_COMBINACIONES, as_index=False)
        .size()
        .rename(columns={"size": "n_anuncios"})
    )
    # La configuración más común de cada clave de búsqueda (desempate estable por orden de columnas)
    unicas = (
        configuraciones.sort_values(["n_anuncios", *config.CAT_FEATURES_COMBINACIONES], ascending=[False] + [True] * len(config.CAT_FEATURES_COMBINACIONES))
        .drop_duplicates(subset=list(config.CLAVE_BUSQUEDA), keep="first")
        .reset_index(drop=True)
    )

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
    return df_predict[config.FEATURES + ["n_anuncios"]]
