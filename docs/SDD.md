# Diagrama de Secuencia del Sistema (SSD) - Tasador de Autos con IA

Este documento detalla el Diagrama de Secuencia del Sistema para el **Caso A: Tasador de Autos con IA**, destacando la coordinación entre el servicio de inferencia en tiempo real y el proceso de precálculo/reentrenamiento nocturno.

## Código PlantUML

Puedes usar el siguiente código en cualquier renderizador de PlantUML (como PlantText o extensiones de VS Code) para visualizar el diagrama.

```plantuml
@startuml
skinparam style strictuml
skinparam maxMessageSize 150

actor "Usuario" as user
participant "Interfaz\n(Streamlit)" as ui
participant "Backend API\n(FastAPI)" as api
participant "Componente de Visión\n(API de Gemini)" as gemini
participant "Modelo ML Propio\n(Scikit-Learn/XGBoost)" as ml
database "Almacenamiento\n(SQLite/Redis)" as db
actor "Orquestador\n(cron/Airflow)" as airflow

== Flujo 1: Tasación en Tiempo Real ==
user -> ui : Sube foto del auto e ingresa kilometraje
ui -> api : POST /tasar (foto, kilometraje)
activate api

api -> gemini : Envía foto para extracción de características
activate gemini
gemini --> api : Retorna clasificación (marca, modelo, año, estado)
deactivate gemini

api -> db : Consulta precálculos o historial (opcional)
activate db
db --> api : Retorna datos de caché
deactivate db

api -> ml : Ejecuta inferencia con características + kilometraje
activate ml
ml --> api : Retorna precio estimado (basado en modelo propio)
deactivate ml

api --> ui : Devuelve tasación final
deactivate api
ui --> user : Muestra precio estimado en pantalla

== Flujo 2: Pipeline Nocturno (Precálculo y MLOps) ==
airflow -> db : Inicia job programado (extracción de datos nuevos)
activate airflow
db --> airflow : Retorna lotes de datos
airflow -> ml : Dispara pipeline de reentrenamiento/precálculo
activate ml
ml -> ml : Calcula métricas de error (MAE/RMSE)
ml --> db : Actualiza pesos del modelo y precálculos en caché
deactivate ml
deactivate airflow

@enduml
```
![Diagrama SSD](https://lh3.googleusercontent.com/d/1bbgqnWbbQ5e3SqpA3oqkydUVphqy03bV)
## Detalles del Flujo del Sistema

### 1. Tasación en Tiempo Real (Sincrónico)
* **Interacción Inicial:** El usuario interactúa con una interfaz construida en Streamlit, proporcionando los inputs requeridos: una fotografía del vehículo y su kilometraje.
* **Procesamiento de Visión:** FastAPI recibe la petición y delega la imagen a la API de Gemini, que actúa exclusivamente como clasificador visual para extraer atributos clave (marca, modelo, año).
* **Predicción del Modelo:** Una vez que FastAPI tiene los atributos visuales y el kilometraje, consulta al modelo de regresión propio (entrenado con Scikit-Learn o XGBoost sobre el dataset de Craigslist). Esta separación técnica garantiza que la predicción del precio dependa del modelo propio y no del LLM.

### 2. Precálculo y MLOps Nocturno (Asincrónico)
* **Orquestación:** Utilizando cron o Airflow, el sistema automatiza un trabajo en segundo plano para procesar datos fuera del horario pico.
* **Actualización:** Este flujo se encarga de reentrenar el modelo, calcular métricas medibles como el MAE/RMSE y guardar resultados o cachés en SQLite o Redis para agilizar las respuestas del día siguiente.
