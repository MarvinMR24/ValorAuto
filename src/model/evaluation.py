"""
Evaluación de modelos con gráficos (Model Evaluation, CRISP-ML(Q)).

En vez de solo imprimir RMSE/MAE/R2 en consola (como train_baseline.ipynb
original), cada función acá genera un gráfico, lo guarda en
src/graphics/evaluacion/ Y lo loguea como artifact del run de MLflow
correspondiente (mlflow.tracking.MlflowClient.log_artifact), así queda
asociado a la corrida exacta que lo produjo, no solo suelto en disco.
"""

import matplotlib.pyplot as plt
import numpy as np
from mlflow.tracking import MlflowClient
from sklearn.model_selection import learning_curve

from src.model import config


def _guardar_y_loguear(fig, out_path, run_id=None):
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    if run_id:
        MlflowClient().log_artifact(run_id, str(out_path))
    return str(out_path)


def graficar_comparacion_metricas(results: dict, out_dir=None) -> str:
    """Barras comparando RMSE/MAE/R2 entre los modelos entrenados (reemplaza los prints sueltos)."""
    out_dir = out_dir or config.GRAPHICS_EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "01_comparacion_modelos.png"

    nombres = list(results.keys())
    rmse = [results[n]["rmse"] for n in nombres]
    mae = [results[n]["mae"] for n in nombres]
    r2 = [results[n]["r2"] for n in nombres]

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    axes[0].bar(nombres, rmse, color="#1168BD")
    axes[0].set_title("RMSE (menor es mejor)")
    axes[0].tick_params(axis="x", rotation=30)

    axes[1].bar(nombres, mae, color="#2E7D32")
    axes[1].set_title("MAE (menor es mejor)")
    axes[1].tick_params(axis="x", rotation=30)

    axes[2].bar(nombres, r2, color="#B00020")
    axes[2].set_title("R2 (mayor es mejor)")
    axes[2].tick_params(axis="x", rotation=30)

    plt.tight_layout()
    return _guardar_y_loguear(fig, out_path)


def graficar_predicho_vs_real(y_test, y_pred, model_name: str, run_id=None, out_dir=None) -> str:
    """Scatter de precio predicho vs. precio real, con la diagonal ideal (predicción perfecta)."""
    out_dir = out_dir or config.GRAPHICS_EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"02_predicho_vs_real_{model_name}.png"

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(y_test, y_pred, alpha=0.3, s=10, color="#1168BD")
    limite = [min(y_test.min(), y_pred.min()), max(y_test.max(), y_pred.max())]
    ax.plot(limite, limite, color="#B00020", linestyle="--", label="Predicción perfecta")
    ax.set_xlabel("Precio real")
    ax.set_ylabel("Precio predicho")
    ax.set_title(f"Predicho vs. real — {model_name}")
    ax.legend()

    plt.tight_layout()
    return _guardar_y_loguear(fig, out_path, run_id)


def graficar_residuos(y_test, y_pred, model_name: str, run_id=None, out_dir=None) -> str:
    """Residuos (real - predicho) vs. precio predicho, para ver si el error crece con el precio."""
    out_dir = out_dir or config.GRAPHICS_EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"03_residuos_{model_name}.png"

    residuos = y_test - y_pred

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.scatter(y_pred, residuos, alpha=0.3, s=10, color="#2E7D32")
    ax.axhline(0, color="#B00020", linestyle="--")
    ax.set_xlabel("Precio predicho")
    ax.set_ylabel("Residuo (real - predicho)")
    ax.set_title(f"Residuos — {model_name}")

    plt.tight_layout()
    return _guardar_y_loguear(fig, out_path, run_id)


def graficar_curva_aprendizaje(pipeline, X, y, model_name: str, run_id=None, out_dir=None) -> str:
    """Curva de aprendizaje: score de train/validación contra el tamaño de la muestra de entrenamiento.

    Usa sklearn.model_selection.learning_curve sobre el pipeline completo
    (preprocesamiento + modelo), con neg_mean_absolute_error como score.
    """
    out_dir = out_dir or config.GRAPHICS_EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"04_curva_aprendizaje_{model_name}.png"

    # cv=2 y n_jobs=1 (no cv=3/n_jobs=-1): con las columnas categóricas nuevas
    # (condition/cylinders/size, ver ADR-0009) el ColumnTransformer produce más
    # columnas one-hot y Random Forest tarda bastante más por fit; n_jobs=-1 en
    # learning_curve además compite por núcleos con el propio n_jobs=-1 interno
    # de Random Forest (sobre-suscripción), lo cual no ayuda. cv=2 sigue siendo
    # una curva de aprendizaje válida, solo un poco más ruidosa que con cv=3.
    train_sizes, train_scores, val_scores = learning_curve(
        pipeline,
        X,
        y,
        train_sizes=np.linspace(0.1, 1.0, 5),
        cv=2,
        scoring="neg_mean_absolute_error",
        n_jobs=1,
        random_state=config.RANDOM_SEED,
    )

    train_mae = -train_scores.mean(axis=1)
    val_mae = -val_scores.mean(axis=1)

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(train_sizes, train_mae, marker="o", label="MAE en entrenamiento", color="#1168BD")
    ax.plot(train_sizes, val_mae, marker="o", label="MAE en validación", color="#B00020")
    ax.set_xlabel("Cantidad de muestras de entrenamiento")
    ax.set_ylabel("MAE")
    ax.set_title(f"Curva de aprendizaje — {model_name}")
    ax.legend()

    plt.tight_layout()
    return _guardar_y_loguear(fig, out_path, run_id)


def graficar_importancia_features(pipeline, model_name: str, run_id=None, out_dir=None):
    """Importancia de features para modelos basados en árboles (Random Forest, XGBoost).

    Para Linear Regression no hay feature_importances_; la función devuelve
    None sin fallar (no todos los modelos tienen esta noción).
    """
    modelo = pipeline.named_steps["model"]
    if not hasattr(modelo, "feature_importances_"):
        return None

    out_dir = out_dir or config.GRAPHICS_EVAL_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"05_importancia_features_{model_name}.png"

    nombres = pipeline.named_steps["preprocessor"].get_feature_names_out()
    importancias = modelo.feature_importances_
    orden = np.argsort(importancias)[-15:]  # top 15

    fig, ax = plt.subplots(figsize=(9, 7))
    ax.barh(np.array(nombres)[orden], importancias[orden], color="#1168BD")
    ax.set_xlabel("Importancia")
    ax.set_title(f"Importancia de features (top 15) — {model_name}")

    plt.tight_layout()
    return _guardar_y_loguear(fig, out_path, run_id)
