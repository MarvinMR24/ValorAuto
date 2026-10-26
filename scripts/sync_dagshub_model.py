"""
Entrena el modelo de producción (XGBoost v3 + model_base, ADR-0010), lo registra
en el Model Registry de MLflow en DagsHub como `Production` (archivando la
versión anterior) y regenera data/precalc.db con ESE mismo pipeline, para que
la base que lee el backend y el modelo registrado sean siempre el mismo.

    docker compose --profile tools run --rm training python3 -m scripts.sync_dagshub_model

Requiere en el .env de la raíz MLFLOW_TRACKING_URI/USERNAME/PASSWORD de DagsHub.
"""
import os
import sys
import subprocess
import dagshub
import mlflow
import pandas as pd
from xgboost import XGBRegressor
from mlflow.tracking import MlflowClient

from src.model import config, features  # carga el .env de la raíz (load_dotenv en src/model/config.py)

# Autenticación de DagsHub con el token del .env (nunca en el código, ver .env.example):
# MLFLOW_TRACKING_PASSWORD es el token de DagsHub (Settings -> Tokens).
_token = os.getenv("DAGSHUB_TOKEN") or os.getenv("MLFLOW_TRACKING_PASSWORD")
if not _token:
    sys.exit("Falta el token de DagsHub: define MLFLOW_TRACKING_PASSWORD (o DAGSHUB_TOKEN) en el .env de la raíz.")
dagshub.auth.add_app_token(_token)
dagshub.init(repo_owner='SNARF3', repo_name='ValorAutoData', mlflow=True)

from scripts.train_new_models import train_and_log_custom
from src.pipeline import combinations, precalculo

def run():
    print("Cargando dataset...")
    # Se lee completo: model_base se deriva de `model` en features.split_data (ADR-0010)
    df_clean = pd.read_csv(config.DATA_CLEAN_PATH)
    X_train, X_test, y_train, y_test = features.split_data(df_clean)
    preprocessor = features.build_preprocessor()

    mlflow.set_experiment(config.MLFLOW_EXPERIMENT_NAME)
    name = "XGBoost_v3_model_base"
    print(f"Entrenando {name}...")

    estimator = XGBRegressor(
        n_estimators=150,
        max_depth=9,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1
    )

    res = train_and_log_custom(
        name=name,
        pipeline_estimator=estimator,
        preprocessor=preprocessor,
        X_train=X_train,
        X_test=X_test,
        y_train=y_train,
        y_test=y_test,
        params={"n_estimators": 150, "max_depth": 9, "learning_rate": 0.08, "subsample": 0.8, "colsample_bytree": 0.8},
        tags={"dagshub_sync": "true", "stage": "Production", "adr": "ADR-0010"}
    )

    client = MlflowClient()
    run_id = res["run_id"]
    model_uri = f"runs:/{run_id}/model"

    print(f"Creando version en Model Registry para {config.MODEL_REGISTRY_NAME}...")
    reg = client.create_model_version(
        name=config.MODEL_REGISTRY_NAME,
        source=model_uri,
        run_id=run_id
    )
    print(f"Version creada: {reg.version}")

    client.transition_model_version_stage(
        name=config.MODEL_REGISTRY_NAME,
        version=reg.version,
        stage=config.MODEL_PRODUCTION_STAGE,
        archive_existing_versions=True
    )
    print(f"Version {reg.version} promovida a Production con exito.")

    # precalc.db con el mismo pipeline que se acaba de registrar (sin divergencias)
    df_res = precalculo.calcular_precios(res["pipeline"], combinations.generar_combinaciones(df_clean))
    ruta = precalculo.guardar_sqlite(df_res)
    precalculo.graficar_resumen_precalculo(df_res)
    print(f"precalc.db regenerado con la version {reg.version}: {len(df_res):,} filas en {ruta}")
    print(f"Metricas test -> RMSE={res['rmse']:.2f} MAE={res['mae']:.2f} R2={res['r2']:.4f} | run_id={run_id}")

if __name__ == "__main__":
    run()
