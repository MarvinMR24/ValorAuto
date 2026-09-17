"""
Entrenamiento y registro de modelos en MLflow (Model Engineering, CRISP-ML(Q)).

Los tres modelos y sus hiperparámetros vienen de src/model/config.py
(MODEL_HYPERPARAMS): no hay valores sueltos acá, así que reentrenar desde
cualquier notebook usa siempre los mismos parámetros (ver ADR-0008).
"""

import subprocess

import numpy as np
import mlflow
import mlflow.data
import mlflow.sklearn
from mlflow.tracking import MlflowClient
from sklearn.base import clone
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor

from src.model import config

MODEL_CLASSES = {
    "Baseline_LinearRegression": LinearRegression,
    "Model_RandomForest": RandomForestRegressor,
    "Model_XGBoost": XGBRegressor,
}


def eval_metrics(y_true, y_pred):
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    return rmse, mae, r2


def train_and_log(name, preprocessor, X_train, X_test, y_train, y_test):
    """Entrena un modelo, lo evalúa, y registra parámetros/métricas/modelo en MLflow.

    El preprocesador (imputación + one-hot encoding) va DENTRO del Pipeline
    de sklearn, no se ajusta antes por separado: así `pipeline.fit(X_train, ...)`
    calcula medianas/categorías/columnas one-hot solo con datos de train, y
    `pipeline.predict(X_test)` reutiliza esos mismos parámetros para transformar
    test, sin que ninguna estadística de test se filtre al ajuste (data leakage).
    Se clona `preprocessor` en cada llamada para que cada modelo tenga su propia
    instancia ajustada de forma independiente, en vez de compartir un mismo
    objeto mutable entre los tres modelos de `train_all_models`.

    Devuelve un dict con el pipeline ya ajustado y las predicciones sobre
    test, para que evaluation.py pueda graficar sin tener que reentrenar.
    """
    params = config.MODEL_HYPERPARAMS[name]
    estimator = MODEL_CLASSES[name](**params)
    pipeline = Pipeline(steps=[("preprocessor", clone(preprocessor)), ("model", estimator)])

    with mlflow.start_run(run_name=name) as run:
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        rmse, mae, r2 = eval_metrics(y_test, y_pred)

        # Trazabilidad del dataset (rúbrica EC01, sección B "Datos"): registra
        # de qué dataset exacto salieron train/test (ruta, filas, columnas,
        # hash/digest), no solo lo que dice docs/evidence/baseline-modelo.md
        # en texto. Aparece en la pestaña "Datasets" de cada corrida en MLflow.
        train_df = X_train.copy()
        train_df[config.TARGET] = y_train.values
        test_df = X_test.copy()
        test_df[config.TARGET] = y_test.values
        dataset_source = str(config.DATA_CLEAN_PATH.relative_to(config.REPO_ROOT))
        mlflow.log_input(
            mlflow.data.from_pandas(train_df, source=dataset_source, targets=config.TARGET, name="vehicles_train"),
            context="training",
        )
        mlflow.log_input(
            mlflow.data.from_pandas(test_df, source=dataset_source, targets=config.TARGET, name="vehicles_test"),
            context="testing",
        )

        mlflow.log_params(params)
        mlflow.log_metric("rmse", rmse)
        mlflow.log_metric("mae", mae)
        mlflow.log_metric("r2", r2)

        # Tags informativos: que se pueda ver desde MLflow (no solo desde
        # config.py) con qué features y de qué commit salió cada corrida.
        mlflow.set_tag("features", ",".join(config.FEATURES))
        mlflow.set_tag("n_features", len(config.FEATURES))
        mlflow.set_tag("random_seed", config.RANDOM_SEED)
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, stderr=subprocess.DEVNULL
            ).decode().strip()
            mlflow.set_tag("git_commit", commit)
        except Exception:
            pass  # sin git disponible (p.ej. en un contenedor sin .git montado): no es crítico

        mlflow.sklearn.log_model(sk_model=pipeline, artifact_path="model", serialization_format="cloudpickle")

        return {
            "name": name,
            "run_id": run.info.run_id,
            "pipeline": pipeline,
            "rmse": rmse,
            "mae": mae,
            "r2": r2,
            "y_pred": y_pred,
        }


def train_all_models(X_train, X_test, y_train, y_test, preprocessor):
    """Entrena los 3 modelos definidos en config.MODEL_HYPERPARAMS y devuelve sus resultados."""
    mlflow.set_tracking_uri(config.MLFLOW_TRACKING_URI)
    mlflow.set_experiment(config.MLFLOW_EXPERIMENT_NAME)

    return {
        name: train_and_log(name, preprocessor, X_train, X_test, y_train, y_test)
        for name in config.MODEL_HYPERPARAMS
    }


def promote_best_model(results: dict) -> tuple[str, str]:
    """Registra en el Model Registry y promueve a Production el modelo con menor RMSE.

    `archive_existing_versions=True` es necesario: por defecto,
    `transition_model_version_stage` NO archiva la versión que ya estaba en
    "Production", así que reentrenar dos veces sin este flag deja varias
    versiones marcadas "Production" al mismo tiempo (bug real que se
    encontró probando esto: `cargar_modelo_production()` en
    src/pipeline/precalculo.py pide justamente "la" versión Production, y esa
    ambigüedad es exactamente lo que este flag evita).
    """
    best_name = min(results, key=lambda n: results[n]["rmse"])
    best = results[best_name]

    client = MlflowClient()
    model_uri = f"runs:/{best['run_id']}/model"
    registered = mlflow.register_model(model_uri=model_uri, name=config.MODEL_REGISTRY_NAME)
    client.transition_model_version_stage(
        name=config.MODEL_REGISTRY_NAME,
        version=registered.version,
        stage=config.MODEL_PRODUCTION_STAGE,
        archive_existing_versions=True,
    )
    return best_name, registered.version
