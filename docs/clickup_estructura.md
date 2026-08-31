# Estructura de ClickUp

**Proyecto:** Tasador de Autos con IA (foto + kilometraje -> precio de mercado instantáneo)

## Listas (tablero mínimo)

`Discovery -> Data -> Architecture -> Build -> QA -> Deploy -> Risk`

Cada lista representa un tipo de trabajo. La tarea se crea o se mueve donde corresponde, pero siempre debe tener dueño, sprint, criterio de aceptación y enlace a evidencia.

| Lista | Uso en este proyecto |
|---|---|
| **Discovery** | Definición del problema, usuarios, Product Goal, matriz de priorización de casos (Tasador de Autos vs. PromptForge vs. Predicción de precios de vivienda — Tasador de Autos elegido) |
| **Data** | Descarga y limpieza del Craigslist Vehicles Dataset (Kaggle), evaluación de datasets complementarios (Cars.com, US Used Cars Dataset), manejo de nulos en marca/modelo/año/odometer, normalización de categorías de marca/modelo |
| **Architecture** | Diagrama del pipeline completo (entrenamiento -> precálculo nocturno -> Gemini como visión -> Express -> app móvil), ADRs (ej. SQLite vs. Redis para lectura rápida, Airflow vs. cron). Stack de MLOps decidido: MLflow para tracking de experimentos y registro de modelos. Debe dejar explícito qué parte es modelo propio entrenado (predictor de precio) vs. componente externo consumido (Gemini como "ojos") |
| **Build** | Entrenamiento del modelo (Scikit-Learn/XGBoost) con tracking en MLflow, script de generación de combinaciones y precálculo, integración con la API de Gemini, endpoint de Node.js/Express, app móvil (React Native + Expo) |
| **QA** | Evaluación del modelo (métricas de error: MAE, RMSE) registradas en MLflow, pruebas del endpoint de Express, verificación de que el JSON de Gemini siempre cumple el formato esperado |
| **Deploy** | Automatización del job nocturno (Airflow o cron a las 3:00 AM), contenedores, despliegue de la app y la base de lectura rápida |
| **Risk** | Cobertura de datos incompleta en el dataset base, dependencia de la API de Gemini (costo, disponibilidad), consistencia entre la tabla precalculada y las combinaciones que Gemini puede devolver |

## Campos obligatorios por tarea

- **Sprint**
- **Dueño**
- **Criterio de aceptación**
- **Enlace a evidencia**
- **Riesgo asociado**
- **Estado de bloqueo**

## Ejemplo de tarea

```
Título: Entrenar modelo de precio (marca, modelo, año, odometer)
Lista: Build
Sprint: Sprint 2
Dueño: [a definir]
Criterio de aceptación: modelo entrenado con XGBoost, métricas de error
  (MAE/RMSE) registradas y comparadas contra un baseline simple.
Evidencia: enlace al experimento en MLflow (run ID, métricas, versión de modelo registrada)
Riesgo asociado: cobertura de nulos en el dataset base (odometer ~64% non-null)
Estado de bloqueo: sin bloqueo
```

```
Título: Automatizar job nocturno de precálculo (3:00 AM)
Lista: Deploy
Sprint: Sprint 4
Dueño: [a definir]
Criterio de aceptación: cron/Airflow ejecuta el script de precálculo todos
  los días, la tabla de precios en SQLite/Redis se actualiza sin intervención manual.
Evidencia: log de ejecución + captura del job corriendo en el horario esperado
Riesgo asociado: tiempo de ejecución del precálculo si el espacio de combinaciones es muy grande
Estado de bloqueo: sin bloqueo
```
