# Priorización de Casos

**Objetivo:** comparar 2-3 casos con una escala 1-5 para elegir un caso viable dentro del cronograma del semestre. El objetivo no es ganar puntos, sino revelar restricciones y decidir con evidencia.

## Matriz de evaluación

| Caso | Valor | Datos | Factibilidad | Riesgo | Despliegue | Total | Decisión |
|---|---|---|---|---|---|---|---|
| A. Tasador de Autos con IA (foto + kilometraje -> precio) | 4 | 4 | 4 | 3 | 3 | 18 | **Elegir** |
| B. PromptForge (tutor gamificado de Prompt Engineering) | 3 | 2 | 3 | 2 | 4 | 14 | Descartar |
| C. Predicción de precios de vivienda — zona sur de La Paz | 4 | 2 | 2 | 2 | 4 | 14 | Descartar |

## Justificación — Caso A: Tasador de Autos con IA (elegido)

- **Valor (4):** usuario claro (alguien que quiere tasar su auto al instante subiendo una foto); resultado medible y fácil de demostrar en una presentación.
- **Datos (4):** el Craigslist Vehicles Dataset (Kaggle, ~426,880 filas) trae marca, modelo, año y odometer directamente; se puede complementar con Cars.com Used Car Listings o el US Used Cars Dataset para ampliar cobertura y variables (historial de accidentes, tipo de motor). Único caso de los tres con una fuente de datos ya verificada y suficiente en volumen.
- **Factibilidad (4):** las 5 fases (entrenamiento, precálculo nocturno, visión con Gemini, backend, interfaz) son alcanzables en el cronograma del semestre con herramientas estándar (Scikit-Learn/XGBoost + MLflow, SQLite/Redis, cron/Airflow, Node.js/Express, React Native + Expo).
- **Riesgo (3):** el dataset base tiene ~23-36% de valores nulos según la columna, lo que exige limpieza cuidadosa; además hay dependencia de la API de Gemini para el componente de visión (costo y disponibilidad).
- **Despliegue (3):** requiere coordinar dos piezas (job nocturno + servicio en tiempo real), más complejo que un CRUD simple, pero con herramientas bien documentadas (cron/Airflow + Express).

## Justificación — Caso B: PromptForge (descartado)

- **Valor (3):** el beneficio para el usuario final (estudiantes aprendiendo Prompt Engineering) es incierto — no está validado si realmente mejora el aprendizaje frente a otras formas de practicar.
- **Datos (2):** no existe un pipeline de alimentación de datos propiamente dicho; el proyecto depende de una carga manual constante de registro de interacciones y evaluaciones (LLM as a Judge), lo que conlleva mucho trabajo de registro sin una fuente de datos estructurada que crezca sola.
- **Factibilidad (3):** técnicamente abordable (integración con LLM vía API), pero el esfuerzo de curación/registro manual compite con el tiempo del equipo.
- **Riesgo (2):** el riesgo principal es de valor — invertir el semestre en una herramienta educativa cuyo impacto real en el aprendizaje no está comprobado.
- **Despliegue (4):** despliegue relativamente simple (app web + API de LLM), sin requerimientos de cómputo especiales.

## Justificación — Caso C: Predicción de precios de vivienda, zona sur de La Paz (descartado)

- **Valor (4):** caso de valor claro y medible (estimación de precios para compradores/vendedores/inmobiliarias en una zona específica).
- **Datos (2):** la restricción principal. La obtención de datos de precios de vivienda en la zona sur de La Paz es conflictiva y compleja — no hay una fuente pública estructurada y confiable, y armar un dataset propio (scraping de portales inmobiliarios, relevamiento manual) es lento e incierto en calidad.
- **Factibilidad (2):** directamente limitada por el problema de datos; sin una fuente confiable y continua, la alimentación del modelo durante el semestre es difícil de sostener.
- **Riesgo (2):** alto riesgo de que el proyecto quede bloqueado por falta de datos utilizables a mitad de semestre.
- **Despliegue (4):** despliegue sencillo una vez entrenado el modelo (regresión sobre datos tabulares), sin mayores complicaciones técnicas.

## Aporte real del modelo (por caso)

Más allá del puntaje, esto es lo que cada caso implicaría construir a nivel de modelo — clave porque el requisito de MLOps exige que el equipo entrene/ajuste un modelo propio, no solo consumir una API externa.

- **Caso A — Tasador de Autos:** aporte real y verificable. Se entrena un modelo de regresión propio (Scikit-Learn/XGBoost) sobre datos reales de mercado, con métricas de error medibles (MAE/RMSE) y un pipeline de reentrenamiento/precálculo que MLOps puede instrumentar de punta a punta. Gemini se usa solo como componente de visión (clasificación de la foto), no como el modelo que predice el precio — la separación entre "modelo propio" y "servicio externo" es clara y defendible.

- **Caso B — PromptForge:** aporte de modelo débil. El "modelo" es en realidad un LLM de terceros (Gemini/Bedrock/Grok) usado como Judge vía prompting — no hay entrenamiento ni fine-tuning propio, por lo que no hay versiones de modelo que registrar ni pesos que actualizar. El trabajo de MLOps se reduce a loguear prompts/respuestas, lo cual no demuestra ciclo de vida real de un modelo propio.

- **Caso C — Predicción de precios de vivienda:** aporte de modelo real en teoría (regresión/gradient boosting entrenado con datos tabulares propios), pero el aporte queda condicionado a resolver primero el problema de datos — sin una fuente estable, no hay con qué entrenar ni reentrenar por ciclos.

## Restricción principal registrada

**Datos y dependencia externa.** El Caso A es el único con una fuente de datos ya verificada y de volumen suficiente (Craigslist Vehicles Dataset + complementos), a diferencia del Caso B (sin pipeline de datos, solo registro manual) y el Caso C (sin fuente confiable de datos inmobiliarios). El riesgo remanente del Caso A es la dependencia de la API de Gemini para el componente de visión, que debe monitorearse (costo, disponibilidad, formato de respuesta).
