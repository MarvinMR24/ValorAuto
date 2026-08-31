# Prompts de inicialización por sprint — ValorAuto

**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Fuente de contexto:** [`contexto_proyecto.md`](contexto_proyecto.md) (stack decidido: MLflow, Node.js/Express, React Native + Expo)

Un prompt de **inicialización** por cada sprint/etapa (0–6), pensado para pegarse en Claude Code **al comienzo** de esa etapa, antes de implementar cualquier historia de usuario. Cada prompt scaffoldea la estructura mínima (carpetas, dependencias, configuración, un smoke test) para esa etapa — no implementa lógica de negocio. El objetivo es que cada componente arranque con una arquitectura limpia y consistente, y que las historias de [`contexto_proyecto.md`](contexto_proyecto.md) se implementen sobre una base ya ordenada, no sobre estructura + lógica mezcladas desde el primer commit.

**Regla común a todos los prompts** (inclúyela o recuérdala si el prompt se trunca):
> Esto es solo inicialización/scaffolding: crea estructura de carpetas, archivos de configuración, manifiestos de dependencias y, como máximo, un smoke test o health-check que demuestre que el wiring funciona. NO implementes la lógica de negocio de las historias de usuario — eso se hace en tareas de Build separadas, historia por historia. Sigue las convenciones y rutas ya usadas en el repo (`docs/contexto/contexto_proyecto.md`, `src/README.md`, `app/README.md`, `docs/clickup_estructura.md`). Si algo del contexto no está claro, pregunta antes de inventar una convención nueva.

---

## Sprint 0 — Setup y Discovery (31 ago–13 sep)

*Ya ejecutado (ver `README.md`, `docs/team_charter.md`, `docs/priorizacion_casos.md`). Se incluye por completitud/reproducibilidad, ej. si se necesita rearmar el repo desde cero.*

```
Inicializa la estructura base del repositorio ValorAuto. Solo scaffolding, sin
lógica de negocio.

1. Crea la estructura de carpetas: data/raw/, data/processed/, src/model/,
   src/pipeline/, src/vision/, src/api/, app/, con un .gitkeep o README.md corto
   en cada una explicando su propósito (usa src/README.md y app/README.md como
   referencia del propósito de cada carpeta).
2. Crea un .gitignore para un proyecto mixto Python + Node.js + Expo (venv/,
   __pycache__/, node_modules/, .env, mlruns/, *.pkl, .expo/, dist/).
3. Deja un README.md raíz con la estructura del proyecto y enlaces a docs/.
4. No configures todavía MLflow, Express ni Expo — eso se inicializa en los
   prompts de Sprint 2, 4 y 5 respectivamente.

Verifica al final: `git status` limpio, estructura de carpetas coincide con
src/README.md y app/README.md.
```

---

## Sprint 1 — Datos (14–27 sep)

```
Inicializa el entorno de trabajo de datos para ValorAuto. Solo scaffolding, sin
lógica de limpieza ni de EDA todavía.

1. Crea un entorno Python aislado para el trabajo de datos (venv o similar) con
   un requirements-data.txt: pandas, numpy, jupyter, kagglehub (o kaggle), 
   matplotlib/seaborn para EDA.
2. Crea data/raw/ y data/processed/ si no existen (con .gitkeep, sin commitear
   datasets pesados — agrégalos a .gitignore).
3. Crea notebooks/01_eda_craigslist.ipynb vacío (solo el esqueleto: imports,
   una celda de "cargar dataset" con un TODO, sin ejecutar limpieza real).
4. Crea scripts/download_dataset.py con la firma de la función de descarga
   (parámetros: dataset, destino) y un TODO — no implementes la descarga real
   todavía si requiere credenciales de Kaggle que no están configuradas.

Verifica al final: `pip install -r requirements-data.txt` corre sin errores;
el notebook abre sin errores de import.
```

---

## Sprint 2 — Modelo de Precio (28 sep–11 oct)

```
Inicializa el módulo de modelo de precio con MLflow como MLOps de ValorAuto.
Solo scaffolding, sin entrenar el modelo real todavía.

1. En src/model/, crea requirements-model.txt: scikit-learn, xgboost, pandas,
   mlflow, joblib.
2. Configura MLflow localmente: docker-compose.mlflow.yml (o servicio dentro de
   un docker-compose.yml raíz) que levante `mlflow server` con backend store
   SQLite y artifact store en un volumen local (./mlruns o ./mlflow-artifacts).
   Documenta el comando para levantarlo en src/model/README.md.
3. Crea src/model/train.py con el esqueleto: carga de datos desde
   data/processed/, split train/test, un bloque `with mlflow.start_run():` que
   loguea parámetros y métricas dummy (ej. una constante), y
   mlflow.sklearn.log_model(...) comentado con un TODO. No implementes feature
   engineering ni el entrenamiento real (eso es Sprint 2 Build, historias 8-11).
4. Crea src/model/evaluate.py con la firma de una función `evaluate(model, X,
   y) -> dict` (MAE, RMSE, R²) sin implementación real.
5. Agrega mlruns/ y *.pkl al .gitignore si no están.

Verifica al final: `mlflow server` levanta y su UI responde en localhost; correr
train.py registra al menos un run dummy visible en el MLflow Tracking UI.
```

---

## Sprint 3 — Motor Nocturno MLOps (12–25 oct)

```
Inicializa el motor de precálculo nocturno de ValorAuto. Solo scaffolding, sin
implementar la generación de combinaciones ni el precálculo real todavía.

1. En src/pipeline/, crea tres módulos con solo la firma de sus funciones
   principales y un TODO, sin lógica real:
   - generate_combinations.py — función `generate_combinations() -> DataFrame`
   - precompute_prices.py — función `precompute_prices(combinations, model) ->
     DataFrame`, que carga el modelo desde el MLflow Model Registry (usa
     mlflow.sklearn.load_model con una URI de modelo como parámetro, no
     hardcodeada)
   - load_to_db.py — función `load_to_db(prices_df, db_path)` apuntando a
     SQLite (usa una constante de configuración para la ruta, no hardcodeada
     en el módulo)
2. Crea el esquema de la tabla de precios (schema.sql o script Python
   equivalente): columnas marca, modelo, anio, rango_km, precio_estimado, mae,
   con índice compuesto por (marca, modelo, anio, rango_km).
3. Crea el esqueleto del job nocturno: un DAG de Airflow (o un script
   run_nightly.py si se usa cron) con las 3 tareas encadenadas en orden
   (generar → precalcular → cargar) pero cada tarea llamando solo a las
   funciones stub del paso 1 — no la lógica real.
4. Documenta en src/pipeline/README.md cómo se agenda (cron a las 3:00 AM o
   Airflow DAG) y cómo correrlo manualmente para pruebas.

Verifica al final: el DAG/script corre de punta a punta sin errores usando las
funciones stub (aunque no calcule precios reales todavía); el esquema SQL se
puede aplicar sobre una base SQLite vacía sin errores.
```

---

## Sprint 4 — Visión (Gemini) + Backend Express (Node.js) (26 oct–8 nov)

```
Inicializa el backend Node.js/Express y el módulo de visión de ValorAuto. Solo
scaffolding, sin implementar la lógica de negocio del endpoint de tasación
todavía (eso es Build, historias 16-19; el contrato completo está en
openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md).

1. En src/api/, corre `npm init` y agrega dependencias: express, cors, dotenv,
   multer (subida de imagen), y como dev dependencies: nodemon, jest o vitest.
2. Estructura de carpetas dentro de src/api/: routes/, controllers/,
   services/, middleware/, config/. Un archivo por responsabilidad, sin mezclar
   capas.
3. Crea src/api/app.js (o index.js) con la app de Express configurada
   (cors, express.json(), manejo de errores centralizado) y un endpoint
   GET /health que responde `{status: "ok"}` — es el único endpoint funcional
   en esta etapa.
4. Crea src/api/config/env.js (o .env + dotenv) con las variables esperadas:
   GEMINI_API_KEY, PORT, PRICES_DB_PATH — sin valores reales, y un .env.example
   commiteado (nunca .env real, ver docs/team_charter.md sobre secretos).
5. En src/vision/, crea el módulo identifyVehicle(imageBuffer) con la firma
   de la función (recibe buffer de imagen, retorna Promise<{marca, modelo,
   anio, confianza}>) y un TODO — sin llamar a Gemini todavía.
6. Crea la carpeta de rutas para POST /tasacion como stub: valida que llegue
   multipart/form-data con imagen + kilometraje y responde 501 "not
   implemented" — deja el contrato de entrada ya validado por middleware
   (reutilizable en Build) pero sin orquestar Gemini ni la tabla de precios.

Verifica al final: `npm install` y `npm run dev` levantan el servidor sin
errores; GET /health responde 200; POST /tasacion responde 501 en vez de
crashear.
```

---

## Sprint 5 — App Móvil, React Native + Expo (9–15 nov)

```
Inicializa la app móvil de ValorAuto con React Native + Expo. Solo scaffolding
de pantallas y navegación, sin conectar al backend real todavía (eso es
Build, historia 21).

1. En app/, inicializa el proyecto Expo (`npx create-expo-app@latest .` o
   equivalente si app/ ya tiene contenido) con TypeScript si el equipo lo
   prefiere, o JavaScript si prioriza velocidad.
2. Instala expo-image-picker (cámara/galería) y axios (o fetch nativo) para
   la llamada al backend.
3. Estructura mínima: screens/TasadorScreen.js (o .tsx), components/ para
   piezas reutilizables (ImagePickerButton, KmInput), services/api.js con un
   cliente axios apuntando a una variable de entorno API_BASE_URL (usa
   expo-constants o app.config.js, nunca hardcodeada).
4. En TasadorScreen, arma la UI descrita en la historia 20 (selector de
   imagen, campo numérico de km, botón "Tasar Auto") con validación básica de
   campos obligatorios, pero el submit debe llamar a una función stub
   `tasarAuto()` en services/api.js que retorna un precio fijo simulado
   (mock), no una llamada real a src/api todavía.
5. Configura app.json/app.config.js con nombre, ícono placeholder y los
   permisos de cámara/galería necesarios para iOS/Android.

Verifica al final: `npx expo start` levanta y la app corre en Expo Go (o
emulador) sin errores; se puede seleccionar una foto, ingresar km, y el botón
"Tasar Auto" muestra el precio simulado del stub.
```

---

## Sprint 6 — Integración, Despliegue y Demo (16–22 nov)

```
Inicializa la configuración de integración y despliegue de ValorAuto. Solo
scaffolding de configuración, no despliegue real todavía (y ten en cuenta que
las historias de este sprint aún no están definidas en el backlog — confirma
con el equipo antes de asumir el alcance final).

1. Crea un docker-compose.yml raíz que orqueste los servicios ya
   inicializados: mlflow (Sprint 2), api (Express, Sprint 4), y la base de
   precios (SQLite como volumen, o un servicio Redis si el equipo migró a
   Redis en Sprint 3).
2. Crea un .env.example raíz que liste todas las variables de entorno de
   todos los servicios (GEMINI_API_KEY, PORT, PRICES_DB_PATH, MLFLOW_TRACKING_URI)
   sin valores reales.
3. Crea un script scripts/smoke_test.sh (o .js) que levante los servicios con
   docker-compose y verifique que GET /health de la API responde 200 — el
   smoke test más simple posible, no el flujo completo de tasación (eso
   requiere Build ya terminado).
4. Deja un docs/despliegue.md con los pasos para levantar el entorno completo
   localmente, como base para documentar luego el despliegue real.

Verifica al final: `docker-compose up` levanta todos los servicios sin
errores; scripts/smoke_test.sh pasa contra el entorno local.
```
