import os
import sys
import subprocess
import dagshub
import mlflow
import pandas as pd
from xgboost import XGBRegressor
from mlflow.tracking import MlflowClient

# Inicializar autenticación oficial de DagsHub
dagshub.auth.add_app_token('ef4d67bd55463e83ebd7d087f3eb5acf46b073ea')
dagshub.init(repo_owner='SNARF3', repo_name='ValorAutoData', mlflow=True)

from src.model import config, features
from scripts.train_new_models import train_and_log_custom

def run():
    print("Cargando dataset...")
    cols = config.FEATURES + [config.TARGET]
    df_clean = pd.read_csv(config.DATA_CLEAN_PATH, usecols=cols)
    X_train, X_test, y_train, y_test = features.split_data(df_clean)
    preprocessor = features.build_preprocessor()

    name = "XGBoost_Production_V2_Sync"
    print(f"Entrenando {name}...")

    estimator = XGBRegressor(
        n_estimators=150,
        max_depth=9,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
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
        params={"n_estimators": 150, "max_depth": 9, "learning_rate": 0.08},
        tags={"dagshub_sync": "true", "stage": "Production"}
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

if __name__ == "__main__":
    run()
