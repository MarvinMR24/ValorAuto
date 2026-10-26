"""
Script para entrenar modelos adicionales con variaciones de pipeline e hiperparámetros,
registrando cada uno con métricas (RMSE, MAE, R2), parámetros, dataset y artefactos en DagsHub MLflow.
Al final, promueve al Model Registry (stage 'Production') al mejor modelo evaluado.
"""

import os
import subprocess
import numpy as np
import pandas as pd
import mlflow
import mlflow.data
import mlflow.sklearn
from mlflow.exceptions import MlflowException
from mlflow.tracking import MlflowClient

from sklearn.base import clone
from sklearn.pipeline import Pipeline
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from xgboost import XGBRegressor

from src.model import config, features
from src.model.training import eval_metrics
from src.pipeline import precalculo, combinations

def train_and_log_custom(name, pipeline_estimator, preprocessor, X_train, X_test, y_train, y_test, params=None, tags=None):
    pipeline = Pipeline(steps=[("preprocessor", clone(preprocessor)), ("model", pipeline_estimator)])

    with mlflow.start_run(run_name=name) as run:
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        rmse, mae, r2 = eval_metrics(y_test, y_pred)

        # Trazabilidad de dataset
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

        if params:
            mlflow.log_params(params)
        mlflow.log_metric("rmse", float(rmse))
        mlflow.log_metric("mae", float(mae))
        mlflow.log_metric("r2", float(r2))

        mlflow.set_tag("features", ",".join(config.FEATURES))
        mlflow.set_tag("n_features", len(config.FEATURES))
        mlflow.set_tag("random_seed", config.RANDOM_SEED)
        if tags:
            for k, v in tags.items():
                mlflow.set_tag(k, v)

        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, stderr=subprocess.DEVNULL
            ).decode().strip()
            mlflow.set_tag("git_commit", commit)
        except Exception:
            pass

        mlflow.sklearn.log_model(sk_model=pipeline, artifact_path="model", serialization_format="cloudpickle")

        print(f"[{name}] Completado -> RMSE: {rmse:.2f} | MAE: {mae:.2f} | R2: {r2:.4f} | Run ID: {run.info.run_id}")

        return {
            "name": name,
            "run_id": run.info.run_id,
            "pipeline": pipeline,
            "rmse": rmse,
            "mae": mae,
            "r2": r2,
            "y_pred": y_pred,
        }

def main():
    print(f"Conectando a MLflow Tracking: {config.MLFLOW_TRACKING_URI}")
    mlflow.set_tracking_uri(config.MLFLOW_TRACKING_URI)
    mlflow.set_experiment(config.MLFLOW_EXPERIMENT_NAME)

    print("Cargando dataset...")
    df_clean = pd.read_csv(config.DATA_CLEAN_PATH)
    X_train, X_test, y_train, y_test = features.split_data(df_clean)
    preprocessor = features.build_preprocessor()

    nuevos_modelos = [
        {
            "name": "Pipeline_Ridge_L2_Regularized",
            "estimator": Ridge(alpha=10.0, random_state=42),
            "params": {"alpha": 10.0, "solver": "auto", "model_type": "Ridge_L2"},
            "tags": {"pipeline_type": "linear_l2_regularized", "hypothesis": "Regularizacion L2 sobre alta dimensionalidad de one-hot encoding"}
        },
        {
            "name": "Pipeline_HistGradientBoosting",
            "estimator": HistGradientBoostingRegressor(max_iter=100, max_depth=10, random_state=42),
            "params": {"max_iter": 100, "max_depth": 10, "model_type": "HistGradientBoosting"},
            "tags": {"pipeline_type": "histogram_gradient_boosting", "hypothesis": "Binning rapido para capturar no-linealidades complejas"}
        },
        {
            "name": "Pipeline_XGBoost_Tuned_Depth9",
            "estimator": XGBRegressor(
                n_estimators=150,
                max_depth=9,
                learning_rate=0.08,
                subsample=0.85,
                colsample_bytree=0.85,
                random_state=42,
                n_jobs=-1
            ),
            "params": {
                "n_estimators": 150,
                "max_depth": 9,
                "learning_rate": 0.08,
                "subsample": 0.85,
                "colsample_bytree": 0.85,
                "model_type": "XGBoost_Optimized"
            },
            "tags": {"pipeline_type": "xgboost_hyperopt", "hypothesis": "Arboles mas profundos con regularizacion de submuestreo para mitigar sobreajuste"}
        }
    ]

    results = {}
    for item in nuevos_modelos:
        print(f"\nIniciando entrenamiento de: {item['name']}...")
        res = train_and_log_custom(
            name=item["name"],
            pipeline_estimator=item["estimator"],
            preprocessor=preprocessor,
            X_train=X_train,
            X_test=X_test,
            y_train=y_train,
            y_test=y_test,
            params=item["params"],
            tags=item["tags"]
        )
        results[item["name"]] = res

    # Comparación de modelos
    print("\n--- RESUMEN COMPARATIVO DE NUEVOS MODELOS ---")
    for name, r in results.items():
        print(f"{name:35} | RMSE: {r['rmse']:.2f} | MAE: {r['mae']:.2f} | R2: {r['r2']:.4f}")

    best_name = min(results, key=lambda n: results[n]["rmse"])
    best = results[best_name]
    print(f"\nMejor nuevo modelo obtenido: {best_name} (RMSE: {best['rmse']:.2f}, R2: {best['r2']:.4f})")

    # Si supera al modelo XGBoost baseline previo (RMSE 6085.26), se promueve a Production
    if best["rmse"] < 6085.26:
        print(f"Supera al modelo previo en Production. Promoviendo {best_name} a Production en DagsHub Model Registry...")
        client = MlflowClient()
        run_id = best["run_id"]
        model_uri = f"runs:/{run_id}/model"

        try:
            client.create_registered_model(config.MODEL_REGISTRY_NAME)
        except MlflowException:
            pass

        registered = client.create_model_version(
            name=config.MODEL_REGISTRY_NAME,
            source=model_uri,
            run_id=run_id,
        )
        client.transition_model_version_stage(
            name=config.MODEL_REGISTRY_NAME,
            version=registered.version,
            stage=config.MODEL_PRODUCTION_STAGE,
            archive_existing_versions=True,
        )
        print(f"Modelo promovido exitosamente como Versión {registered.version} en stage Production.")

        # Regenerar la base de datos precalculada con el nuevo mejor modelo
        print("\nRegenerando tabla SQLite precalculada con el nuevo mejor modelo...")
        df_comb = combinations.generar_combinaciones(df_clean)
        df_res = precalculo.calcular_precios(best["pipeline"], df_comb)
        precalculo.guardar_sqlite(df_res)
        print("Base de datos data/precalc.db actualizada con éxito.")
    else:
        print("El modelo previo continúa como Production.")

if __name__ == "__main__":
    main()
