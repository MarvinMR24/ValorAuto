# ValorAuto

Tasador de Autos con IA — sube una foto y el kilometraje de un auto y obtén su precio de mercado al instante.

**Curso:** Taller de Sistemas Inteligentes — LAB_01 (SIS-352)
**Caso elegido:** ver [`docs/priorizacion_casos.md`](docs/priorizacion_casos.md)
**Estado actual:** Sprint 1 (Datos) en curso. Línea base del modelo ya entrenada y registrada (ver [Evidencia de línea base](docs/evidence/baseline-modelo.md)).

## Stack decidido

| Capa | Tecnología | ADR |
|---|---|---|
| App móvil | React Native + Expo | [ADR-0002](docs/adr/0002-frontend-react-native-expo.md) |
| Backend | Node.js + Express | [ADR-0001](docs/adr/0001-backend-nodejs-express.md) |
| Visión | Google Gemini API | [ADR-0004](docs/adr/0004-gemini-vision-vs-modelo-propio.md) |
| Modelo de precio | Scikit-Learn / XGBoost | [Evidencia de línea base](docs/evidence/baseline-modelo.md) |
| Tracking / Registry | MLflow | [ADR-0005](docs/adr/0005-mlflow-tracking-model-registry.md) |
| Precálculo (lectura rápida) | SQLite | [ADR-0007](docs/adr/0007-sqlite-lectura-rapida.md) |
| Orquestación nocturna | cron / Airflow | [ADR-0003](docs/adr/0003-precalculo-nocturno-vs-tiempo-real.md) |
| Versionamiento de datos | DVC + DagsHub | [ADR-0006](docs/adr/0006-dvc-dagshub-versionamiento-datos.md) |

## Estructura

- [`docs/`](docs/) — documentación de equipo, arquitectura, ADRs, riesgos y evidencias.
- [`data/`](data/) — datasets crudos y procesados (ver [`data/README.md`](data/README.md) para el estado de versionamiento).
- [`src/`](src/) — componentes reutilizables: modelo de precio (`model/`, con `eda/` separado por tipo de exploración), precálculo nocturno (`pipeline/`), visión (`vision/`), API (`api/`), gráficos generados (`graphics/`). Ver [`src/README.md`](src/README.md).
- [`notebooks/`](notebooks/) — notebooks delgados que orquestan las funciones de `src/` (`01_eda.ipynb`, `02_entrenamiento.ipynb`, `03_precalculo.ipynb`). Ver [ADR-0008](docs/adr/0008-separacion-componentes-notebooks-delgados.md).
- [`app/`](app/) — app móvil (React Native + Expo). Ver [`app/README.md`](app/README.md).
- [`openspec/`](openspec/) — specs versionadas de features (ej. `endpoint-tasacion-mvp`).

## Documentación

- [`docs/team_charter.md`](docs/team_charter.md) — equipo, canales, reglas de PR e integridad.
- [`docs/priorizacion_casos.md`](docs/priorizacion_casos.md) — matriz de priorización de casos y justificación del Caso A.
- [`docs/clickup_estructura.md`](docs/clickup_estructura.md) — estructura de ClickUp (listas, campos obligatorios, ejemplos de tarea).
- [`docs/contexto/contexto_proyecto.md`](docs/contexto/contexto_proyecto.md) — Product Goal, calendario de sprints y backlog completo (22 historias de usuario).
- [`docs/architecture/C4-ValorAuto.md`](docs/architecture/C4-ValorAuto.md) — diagramas C4 (contexto y contenedores) del sistema.
- [`docs/architecture/secuencia-tasacion.md`](docs/architecture/secuencia-tasacion.md) — diagrama de secuencia de los dos flujos (tasación en vivo y pipeline nocturno).
- [`docs/adr/`](docs/adr/) — Architecture Decision Records de cada elección de stack.
- [`docs/crisp-mlq.md`](docs/crisp-mlq.md) — mapeo de las fases de CRISP-ML(Q) a la estructura del repo.
- [`docs/risk-register.md`](docs/risk-register.md) — riesgos técnicos, de datos, de IA y operacionales, priorizados.
- [`docs/uso-ia.md`](docs/uso-ia.md) — declaración de uso de IA generativa en el proyecto.
- [`docs/evidence/`](docs/evidence/) — evidencia ejecutada (línea base del modelo, laboratorio de OpenSpec).

Gestión de tareas en ClickUp: workspace **Tio Sam S.R.L**, carpeta **Tasador de Autos con IA — LAB_01 TSI**.

## Cómo reproducir el avance actual

Requiere Python 3.10+, Node.js 18+ y una cuenta con acceso al remoto de DagsHub del proyecto (ver nota de acceso más abajo).

```bash
git clone https://github.com/SNARF3/ValorAuto.git
cd ValorAuto

# 1. Dataset (versionado con DVC, ver docs/adr/0006)
pip install dvc
dvc pull data/vehicles/vehicles_clean.csv.dvc

# 2. Pipeline de modelo: EDA -> entrenamiento -> precálculo (notebooks delgados, ver ADR-0008)
pip install -r requirements.txt
jupyter notebook notebooks/01_eda.ipynb            # limpieza + EDA, guarda imágenes en src/graphics/eda/
jupyter notebook notebooks/02_entrenamiento.ipynb  # entrena 3 modelos, registra en MLflow, promueve el mejor a Production
# ver métricas y corridas en vivo:
mlflow ui --backend-store-uri sqlite:///mlflow.db   # http://localhost:5000

# 3. Precálculo nocturno (usa el modelo "Production" registrado en el paso anterior)
jupyter notebook notebooks/03_precalculo.ipynb

# 4. App móvil (esqueleto, ver app/README.md)
cd app
npm install
npx expo start
```

**Nota de acceso a datos:** el remoto de DagsHub es `https://dagshub.com/SNARF3/ValorAutoData` (migrado desde `LEONGO037/ValorAuto`, ver [ADR-0006](docs/adr/0006-dvc-dagshub-versionamiento-datos.md)). Si `dvc pull`/`dvc push` fallan con error de autenticación, configurá tu token de DagsHub localmente (nunca se commitea):

```bash
dvc remote modify origin --local auth basic
dvc remote modify origin --local user <tu-usuario-dagshub>
dvc remote modify origin --local password <tu-token-dagshub>
```

**MLflow remoto (opcional, resuelve R15):** por defecto MLflow usa el sqlite local (`mlflow.db`) y todo funciona igual que antes. Para que las corridas (con sus artifacts) queden en el MLflow hospedado en DagsHub en vez de en tu máquina, copiá `.env.example` a `.env` en la raíz y completá tu usuario/token de DagsHub — ver [ADR-0005](docs/adr/0005-mlflow-tracking-model-registry.md).

**Alternativa sin instalar nada:** `docker compose up mlflow` levanta la UI de MLflow en un contenedor (`http://localhost:5001`, no 5000 — ver nota en `docker-compose.yml`) y `docker compose run --rm training` reentrena los 3 modelos y regenera `data/precalc.db`, sin instalar MLflow ni las demás dependencias en tu máquina — ver [`src/README.md`](src/README.md#alternativa-mlflow-y-el-reentrenamiento-en-docker) y el riesgo R15 en `docs/risk-register.md`.

`src/api` (Node.js/Express) todavía no tiene código propio más allá del scaffold (`src/api/.gitkeep`) — corresponde a Sprint 4 del [backlog](docs/contexto/contexto_proyecto.md).
