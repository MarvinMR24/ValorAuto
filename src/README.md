# Src

Código fuente del pipeline de ValorAuto (ver `docs/clickup_estructura.md` — lista Architecture/Build para el detalle de cada fase).

- `model/` — entrenamiento y evaluación del modelo de precio propio (Scikit-Learn/XGBoost), con tracking de experimentos y registro de modelos en MLflow.
- `pipeline/` — job de precálculo nocturno (cron/Airflow) que regenera la tabla de precios a partir del modelo registrado en MLflow.
- `vision/` — integración con Gemini como componente de visión (identificación del vehículo a partir de la foto). No es el modelo que predice el precio.
- `api/` — servicio Node.js/Express que expone el endpoint de tasación.
