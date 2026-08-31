# Tasador de Autos con IA — Contexto de Proyecto (LAB_01 TSI)

**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Workspace ClickUp:** Grupo Tio Sam S.R.L
**Espacio → Carpeta:** Tasador de Autos con IA — LAB_01 TSI
**Equipo:** Marwin, Samuel Denis Villca Castro, Leonardo Delgado Medrano

Este documento consolida el Product Goal, el calendario de sprints y el backlog completo con las 22 historias de usuario, criterios de aceptación, riesgos, dependencias y fechas de los 7 sprints. Es la fuente de verdad de contexto de proyecto: pégalo (o referencia esta ruta) al iniciar una sesión de Claude Code que necesite entender el alcance completo del proyecto.

Para los prompts que verifican, sprint a sprint, si cada historia realmente cumple su criterio de aceptación, ver [`prompts_evaluacion_sprints.md`](prompts_evaluacion_sprints.md). Para los prompts de inicialización/scaffolding de cada etapa, ver [`prompts_inicializacion_sprints.md`](prompts_inicializacion_sprints.md).

> **Nota de stack (actualizada tras Sprint 0/decisión de Architecture):** el stack técnico decidido y vigente es **MLflow** para tracking/registro de modelos, **Node.js/Express** para el backend (`src/api`), y **React Native + Expo** para la app móvil (`app/`). Las historias de Sprint 4 y 5 más abajo ya están actualizadas con este stack.

---

## Product Goal

Para un usuario que quiere vender o comprar un auto usado en Bolivia, que necesita saber rápido y sin fricción cuánto vale un vehículo, el **Tasador de Autos IA** es una aplicación móvil de tasación instantánea que identifica el auto a partir de una foto (marca, modelo, año) y, junto con el kilometraje ingresado, entrega un precio de mercado en milisegundos, gracias a un motor de precios precalculado cada madrugada.

**Resultado de valor:** el usuario obtiene un precio de referencia confiable en segundos, sin buscar manualmente en catálogos/clasificados y sin esperar el cómputo de un modelo de ML en vivo.

**Criterios de éxito verificables:**
- Un usuario sube una foto real de un auto + su kilometraje y recibe un precio en menos de 3 segundos de principio a fin (incluyendo la llamada a Gemini).
- El precio devuelto corresponde a una combinación (marca, modelo, año, rango de km) que existe en la tabla precalculada — sin cálculo de ML en el momento de la consulta.
- El job nocturno de precálculo corre automáticamente todos los días a las 3:00 AM sin intervención manual, y la tabla de precios se mantiene actualizada.
- El flujo completo (foto → identificación → precio) funciona end-to-end en al menos 5 pruebas con autos y kilometrajes distintos, demostrable en un demo en vivo.

---

## Calendario de sprints (vigente desde el 31 de agosto de 2026)

| Sprint | Nombre | Fechas | Duración |
|---|---|---|---|
| 0 | Setup y Discovery | 31 ago – 13 sep | 2 semanas |
| 1 | Datos | 14 – 27 sep | 2 semanas |
| 2 | Modelo de Precio | 28 sep – 11 oct | 2 semanas |
| 3 | Motor Nocturno MLOps | 12 – 25 oct | 2 semanas |
| 4 | Visión (Gemini) + Backend Express (Node.js) | 26 oct – 8 nov | 2 semanas |
| 5 | App Móvil | 9 – 15 nov | 1 semana |
| 6 | Integración, Despliegue y Demo | 16 – 22 nov | 1 semana |

Notas de planificación: Sprint 0 se extendió a 2 semanas (más margen para setup/discovery); Sprints 5 y 6 se comprimieron a 1 semana cada uno para compensar el arranque más tardío del proyecto.

---

## Sprint 0 — Setup y Discovery (31 ago–13 sep)

### 1. Formar equipo y completar Team Charter v1
- **Historia de usuario:** Como equipo, quiero formar el equipo y completar el Team Charter v1 para tener claridad de roles, reglas y comunicación antes de codificar.
- **Criterio de aceptación:** Team Charter publicado en ClickUp Docs con integrantes, disponibilidad, canales, reglas de PR, manejo de bloqueos, integridad/uso de IA y Definition of Done.
- **Prioridad:** Urgente · **Asignados:** Marwin, Samuel, Leonardo · **Vence:** 5 sep
- **Riesgo:** Roles/expectativas poco claras generan fricción o duplicación de trabajo en sprints siguientes.
- **Bloqueo:** No bloqueado.

### 2. Matriz de priorización de casos y elección del caso
- **Historia de usuario:** Como equipo, quiero comparar 2-3 casos de proyecto con criterios visibles para elegir el que mejor se ajusta al objetivo del curso y al tiempo disponible.
- **Criterio de aceptación:** Matriz de priorización con al menos 3 criterios, comparación de Caso A/B/C, decisión final y restricción principal registrada.
- **Prioridad:** Urgente · **Asignados:** Marwin, Samuel, Leonardo · **Vence:** 9 sep
- **Riesgo:** Elegir un caso sin datos suficientes o sin considerar el tiempo real del equipo puede forzar un cambio de alcance a mitad de curso.
- **Bloqueo:** No bloqueado — resuelto (Caso A elegido).

### 3. Setup de repositorio, ClickUp y entorno de desarrollo
- **Historia de usuario:** Como equipo, quiero un repositorio Git y entorno de desarrollo configurados para empezar a codificar de forma ordenada y reproducible.
- **Criterio de aceptación:** Repo en GitHub con estructura de carpetas (data/, model/, api/, frontend/, scripts/), README inicial, .gitignore y requirements.txt/Dockerfile funcional. Integración GitHub↔ClickUp activada.
- **Prioridad:** Urgente · **Asignado:** Marwin · **Vence:** 13 sep
- **Riesgo:** Sin convención de commits/ramas desde el inicio, la trazabilidad hacia ClickUp se vuelve manual y propensa a errores.
- **Bloqueo:** No bloqueado.

---

## Sprint 1 — Datos (14–27 sep)

### 4. Descargar y explorar Craigslist Vehicles Dataset
- **Historia de usuario:** Como data scientist, quiero descargar y explorar el Craigslist Vehicles Dataset de Kaggle para entender su calidad y cobertura.
- **Criterio de aceptación:** Dataset descargado en `data/raw/`; notebook de EDA con nulos, tipos, distribución de precio/marca/modelo/año/odómetro.
- **Prioridad:** Alta · **Asignado:** Samuel · **Vence:** 17 sep
- **Riesgo:** Dataset con poca cobertura de marcas/modelos comunes en Bolivia puede afectar la calidad de las predicciones.
- **Bloqueo:** No bloqueado.

### 5. Evaluar e incorporar datasets complementarios (Cars.com, US Used Cars)
- **Historia de usuario:** Como data scientist, quiero evaluar datasets complementarios (Cars.com, US Used Cars) para enriquecer marcas/modelos poco representados.
- **Criterio de aceptación:** Al menos 1 dataset adicional evaluado; decisión documentada (se incorpora o no y por qué) en el README de data/.
- **Prioridad:** Normal · **Asignado:** Marwin · **Vence:** 20 sep
- **Riesgo:** Mezclar datasets con esquemas distintos sin normalizar puede introducir ruido al entrenamiento.
- **Bloqueo:** No bloqueado — depende de #4.

### 6. Limpieza y unificación del dataset final
- **Historia de usuario:** Como data scientist, quiero limpiar y unificar el dataset final (nulos, outliers, formatos de marca/modelo) para tener una base confiable de entrenamiento.
- **Criterio de aceptación:** Dataset limpio guardado en `data/processed/`; reglas de limpieza documentadas en el notebook o script.
- **Prioridad:** Alta · **Asignado:** Leonardo · **Vence:** 24 sep
- **Riesgo:** Limpieza demasiado agresiva puede eliminar combinaciones marca/modelo/año válidas y reducir la cobertura del motor de precios.
- **Bloqueo:** No bloqueado — depende de #5.

### 7. Versionar dataset final
- **Historia de usuario:** Como data scientist, quiero versionar el dataset final para poder reproducir experimentos.
- **Criterio de aceptación:** Dataset final con versión/tag (fecha o DVC); referenciado en el repo.
- **Prioridad:** Normal · **Asignado:** Samuel · **Vence:** 27 sep
- **Riesgo:** Sin versión fija, un reentrenamiento posterior puede dar resultados no reproducibles.
- **Bloqueo:** No bloqueado — depende de #6.

---

## Sprint 2 — Modelo de Precio (28 sep–11 oct)

### 8. Feature engineering (marca, modelo, año, odómetro)
- **Historia de usuario:** Como data scientist, quiero hacer feature engineering (marca, modelo, año, odómetro) para preparar las variables del modelo.
- **Criterio de aceptación:** Features codificadas (encoding de marca/modelo, año numérico, odómetro normalizado); dataset de entrenamiento (X, y) listo.
- **Prioridad:** Alta · **Asignado:** Marwin · **Vence:** 1 oct
- **Riesgo:** Un encoding mal elegido para marca/modelo (alta cardinalidad) puede degradar el desempeño del modelo.
- **Bloqueo:** No bloqueado — depende de #7.

### 9. Entrenar modelo baseline (regresión lineal)
- **Historia de usuario:** Como data scientist, quiero entrenar un modelo baseline (regresión lineal) para tener una referencia mínima de desempeño.
- **Criterio de aceptación:** Modelo entrenado; métrica base (MAE/RMSE) registrada en el notebook.
- **Prioridad:** Alta · **Asignado:** Leonardo · **Vence:** 4 oct
- **Riesgo:** Sin baseline, no hay forma objetiva de saber si XGBoost realmente mejora el resultado.
- **Bloqueo:** No bloqueado — depende de #8.

### 10. Entrenar modelo XGBoost/Scikit-Learn y comparar métricas
- **Historia de usuario:** Como data scientist, quiero entrenar modelos más robustos (XGBoost / Scikit-Learn) y comparar métricas contra el baseline.
- **Criterio de aceptación:** Al menos 2 modelos entrenados; tabla comparativa de métricas (MAE, RMSE, R²) documentada.
- **Prioridad:** Alta · **Asignado:** Samuel · **Vence:** 8 oct
- **Riesgo:** Sobreajuste (overfitting) si no se separan correctamente train/test/validation.
- **Bloqueo:** No bloqueado — depende de #9.

### 11. Registrar experimentos y seleccionar modelo final
- **Historia de usuario:** Como data scientist, quiero registrar los experimentos y seleccionar el modelo final para dejarlo listo para producción.
- **Criterio de aceptación:** Modelo final serializado (.pkl/.json) en model/ y registrado en el MLflow Model Registry con una versión identificable; métricas finales y justificación de la elección documentadas.
- **Prioridad:** Alta · **Asignado:** Marwin · **Vence:** 11 oct
- **Riesgo:** Elegir el modelo final sin considerar el tiempo de inferencia puede complicar el precálculo masivo del Sprint 3.
- **Bloqueo:** No bloqueado — depende de #10.

---

## Sprint 3 — Motor Nocturno MLOps (12–25 oct)

### 12. Script de generación de combinaciones marca/modelo/año/km
- **Historia de usuario:** Como sistema, quiero un script que genere todas las combinaciones posibles de marca/modelo/año/rango de km para precalcular precios sobre todas ellas.
- **Criterio de aceptación:** Script genera un dataframe/lista con todas las combinaciones válidas (marca × modelo × año × bucket de km).
- **Prioridad:** Alta · **Asignado:** Leonardo · **Vence:** 15 oct
- **Riesgo:** Un espacio de combinaciones demasiado grande puede hacer inviable el precálculo nocturno en tiempo razonable.
- **Bloqueo:** No bloqueado — depende de #11.

### 13. Script de precálculo de precios con el modelo entrenado
- **Historia de usuario:** Como sistema, quiero un script que use el modelo entrenado para calcular el precio de cada combinación generada.
- **Criterio de aceptación:** Script carga el modelo desde el MLflow Model Registry, recorre las combinaciones y produce una tabla combinación→precio; corre sin errores sobre el dataset completo.
- **Prioridad:** Alta · **Asignado:** Samuel · **Vence:** 18 oct
- **Riesgo:** Tiempo de cómputo excesivo si el modelo no soporta inferencia batch eficiente.
- **Bloqueo:** No bloqueado — depende de #12.

### 14. Diseñar y poblar base de lectura rápida (SQLite/Redis)
- **Historia de usuario:** Como sistema, quiero guardar la tabla de precios en una base de lectura ultrarrápida (SQLite o Redis) para que las consultas del backend sean instantáneas.
- **Criterio de aceptación:** Tabla de precios cargada en SQLite/Redis; índice por (marca, modelo, año, rango_km); query de prueba responde en menos de 50ms.
- **Prioridad:** Alta · **Asignado:** Marwin · **Vence:** 22 oct
- **Riesgo:** Un mal diseño de índice puede volver lenta la búsqueda justo en el paso crítico de latencia.
- **Bloqueo:** No bloqueado — depende de #13.

### 15. Automatizar job nocturno (cron/Airflow) a las 3:00 AM
- **Historia de usuario:** Como equipo de operaciones, quiero automatizar el job nocturno (cron o Airflow) para que los precios se actualicen solos todos los días a las 3:00 AM sin intervención manual.
- **Criterio de aceptación:** Job programado (cron/Airflow DAG) que ejecuta generación de combinaciones + precálculo + carga a la BD; log de ejecución exitosa.
- **Prioridad:** Normal · **Asignado:** Leonardo · **Vence:** 25 oct
- **Riesgo:** Fallos silenciosos del job nocturno dejarían la app sirviendo precios desactualizados sin que nadie lo note.
- **Bloqueo:** No bloqueado — depende de #14.

---

## Sprint 4 — Visión (Gemini) + Backend Express (Node.js) (26 oct–8 nov)

### 16. Configurar API de Gemini y prompt de identificación de vehículo
- **Historia de usuario:** Como desarrollador, quiero configurar la API de Gemini (API key + librería google-generativeai) para poder invocarla desde el backend.
- **Criterio de aceptación:** Llave de Google AI Studio configurada como variable de entorno (no hardcodeada); librería instalada; llamada de prueba exitosa a gemini-1.5-flash.
- **Prioridad:** Urgente · **Asignado:** Samuel · **Vence:** 29 oct
- **Riesgo:** Exponer la API key en el repo (hardcodeada o en un commit) es un riesgo de seguridad e integridad.
- **Bloqueo:** No bloqueado.

### 17. Validar formato JSON estricto de respuesta de Gemini
- **Historia de usuario:** Como desarrollador, quiero un prompt estricto para gemini-1.5-flash que identifique marca, modelo y rango de año a partir de una foto, y validar que la respuesta siempre venga en JSON estricto.
- **Criterio de aceptación:** Prompt probado con al menos 5 fotos distintas; parser valida las claves marca/modelo/rango_de_año; maneja errores si Gemini responde texto libre o campos faltantes (retry o fallback).
- **Prioridad:** Alta · **Asignado:** Marwin · **Vence:** 1 nov
- **Riesgo:** Respuestas inconsistentes de Gemini pueden romper el flujo del backend si no hay manejo de errores robusto.
- **Bloqueo:** No bloqueado — depende de #16.

### 18. Construir endpoint Express (Node.js) (foto + kilometraje → precio)
- **Historia de usuario:** Como usuario, quiero un endpoint que reciba una foto y el kilometraje, mande la foto a Gemini, y cruce el resultado con la tabla precalculada para obtener el precio.
- **Criterio de aceptación:** Endpoint POST (ej. /tasacion) en Node.js/Express recibe multipart/form-data (imagen + km); llama a Gemini; busca por (marca, modelo, año, rango_km) en SQLite/Redis; responde JSON con precio o error claro si la combinación no existe.
- **Prioridad:** Urgente · **Asignado:** Leonardo · **Vence:** 5 nov
- **Riesgo:** Combinaciones no encontradas en la tabla (auto muy nuevo/raro) necesitan un fallback claro para no romper la experiencia del usuario.
- **Bloqueo:** No bloqueado — depende de #14 y #17.

### 19. Pruebas de integración Gemini + Express + base de precios
- **Historia de usuario:** Como equipo, quiero pruebas de integración de Gemini + Express + base de precios para asegurar que todo el flujo funcione junto antes de conectar el frontend.
- **Criterio de aceptación:** Suite de pruebas end-to-end con al menos 5 fotos reales; casos exitosos y casos de error (combinación no encontrada, JSON inválido de Gemini) cubiertos.
- **Prioridad:** Alta · **Asignado:** Samuel · **Vence:** 8 nov
- **Riesgo:** Sin pruebas de integración, errores de conexión entre componentes solo se detectarían al conectar el frontend, retrasando el Sprint 5.
- **Bloqueo:** No bloqueado — depende de #18.

---

## Sprint 5 — App Móvil (9–15 nov)

### 20. Diseño de UI móvil (cámara/galería, campo de km, botón Tasar Auto)
- **Historia de usuario:** Como usuario, quiero una pantalla donde pueda subir una foto (cámara o galería), ingresar el kilometraje y presionar "Tasar Auto".
- **Criterio de aceptación:** Pantalla en React Native (Expo) con selector de imagen (`expo-image-picker`, cámara o galería), campo numérico de km, botón "Tasar Auto"; validación básica (foto y km obligatorios); probada en un dispositivo/emulador real vía Expo Go.
- **Prioridad:** Alta · **Asignados:** Leonardo, Samuel · **Vence:** 10 nov
- **Riesgo:** Si no se prueba en dispositivo móvil real, la cámara/galería puede no funcionar igual que en el emulador.
- **Bloqueo:** No bloqueado — depende de #19.

### 21. Implementar app móvil y conexión con Express
- **Historia de usuario:** Como usuario, quiero ver el precio estimado en pantalla después de presionar "Tasar Auto", conectado al backend real, con estado de carga mientras se procesa.
- **Criterio de aceptación:** Al hacer clic, la app React Native llama al endpoint Express real (no un mock); se muestra spinner/loading y luego el precio o un mensaje de error; demo end-to-end funcional en Expo Go o build de desarrollo.
- **Prioridad:** Urgente · **Asignado:** Marwin · **Vence:** 12 nov
- **Riesgo:** Latencia de red o de Gemini no manejada visualmente puede dar sensación de app "colgada".
- **Bloqueo:** No bloqueado — depende de #20.

### 22. Recomendaciones de problemas comunes según marca/modelo/año
- **Historia de usuario:** Como usuario, quiero ver recomendaciones de problemas comunes del auto identificado (marca/modelo/año) para saber qué revisar de forma prioritaria.
- **Criterio de aceptación:** Al mostrar el precio, se listan 2-3 problemas comunes conocidos para esa marca/modelo/año (fuente: dataset curado o prompt adicional a Gemini).
- **Prioridad:** Baja (mejora de valor agregado, no bloquea el camino crítico) · **Asignado:** Leonardo · **Vence:** 15 nov
- **Riesgo:** No es parte del camino crítico; solo debe abordarse si el resto del backlog está resuelto.
- **Bloqueo:** No bloqueado — depende de que Sprint 4 (backend) y las primeras tareas de Sprint 5 (frontend) estén completos.

---

## Sprint 6 — Integración, Despliegue y Demo (16–22 nov)

Sin tareas/historias definidas todavía. Reservado para integración final end-to-end, despliegue y preparación de la demo en vivo. **Pendiente:** crear tareas específicas antes de que inicie el sprint (16 nov).

---

## Cadena de dependencias (resumen técnico)

```
Sprint 0: Team Charter → Priorización de caso → Setup repo
Sprint 1: Craigslist Dataset → Datasets complementarios → Limpieza → Versionado
Sprint 2: Feature engineering → Baseline → XGBoost → Selección modelo final
Sprint 3: Combinaciones → Precálculo → Base SQLite/Redis → Cron nocturno
Sprint 4: Config Gemini → Prompt/JSON estricto ─┐
          Base SQLite/Redis (Sprint 3) ─────────┴→ Endpoint Express → Pruebas integración
Sprint 5: (Pruebas integración) → UI móvil (React Native/Expo) → App móvil + conexión Express → Recomendaciones (nice-to-have)
Sprint 6: (todo lo anterior) → Integración, despliegue, demo
```

## Stack técnico

- **Datos:** Craigslist Vehicles Dataset (Kaggle), Cars.com, US Used Cars
- **Modelo:** Scikit-Learn (baseline regresión lineal), XGBoost
- **MLOps:** MLflow (tracking de experimentos, registro/versionado de modelos)
- **Visión:** Google Gemini (gemini-1.5-flash) vía `google-generativeai`
- **Backend:** Node.js + Express
- **Almacenamiento de lectura rápida:** SQLite o Redis
- **Automatización:** cron / Apache Airflow (job nocturno 3:00 AM)
- **Frontend:** app móvil en React Native + Expo (cámara/galería vía `expo-image-picker`)
- **Repo:** GitHub, con integración GitHub↔ClickUp
