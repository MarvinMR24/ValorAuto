# Imagen unica para el pipeline de ValorAuto: sirve tanto para levantar la UI
# de MLflow (servicio "mlflow" en docker-compose.yml) como para reentrenar el
# modelo dentro del contenedor (servicio "training"), de forma que ambos usen
# siempre la misma version de las librerias y el mismo WORKDIR (/app), lo cual
# importa para que las rutas que MLflow graba (backend store + artifact root)
# sean siempre las mismas sin importar en que maquina corra el contenedor.
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

# mlflow se fija a la version exacta ya usada para generar mlflow.db
# (ver docs/adr/0005-mlflow-tracking-model-registry.md); una version distinta
# puede pedir "mlflow db upgrade" o fallar al leer runs existentes. nbconvert
# no esta en requirements.txt (gap real, ver docs/risk-register.md) pero hace
# falta para ejecutar los notebooks sin abrir Jupyter.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir mlflow==3.16.1 nbconvert==7.16.4

EXPOSE 5000
