# Arquitectura C4 — ValorAuto

Diagramas C4 (Contexto, Contenedores y Componentes) del Tasador de Autos con IA, **actualizados al estado real del MVP en la 2.ª defensa (2026-10-26)**: lo que aparece acá existe en el código y corre en la demo. Lo que todavía no existe se marca como tal.

> Los diagramas vigentes son los Mermaid de este archivo (GitHub los renderiza). `valorauto-c4-container.xml` (draw.io) y `img/*.png` son la **versión de septiembre (Sprint 2)**: se conservan como historial y ya no reflejan los endpoints de la app, el modelo de respaldo ni la búsqueda por modelo.

## Nivel 1 — Contexto del sistema

```mermaid
flowchart TD
    Usuario(["Usuario<br/>[Persona]<br/>Quiere tasar un auto usado<br/>y saber qué revisar"])
    ValorAuto["ValorAuto<br/>[Sistema de software]<br/>Precio de mercado por foto o datos<br/>+ fallas comunes del modelo"]
    Gemini[["Google Gemini API<br/>[Sistema externo]<br/>Visión: identifica el auto<br/>Texto: fallas comunes<br/>(nunca precios)"]]
    DagsHub[["DagsHub<br/>[Sistema externo]<br/>DVC (dataset) + MLflow<br/>(experimentos y Model Registry)"]]

    Usuario -- "Foto o marca/modelo/año + km;<br/>recibe precio, rango y fallas" --> ValorAuto
    ValorAuto -- "Foto (≤800 px) o marca/modelo/año;<br/>recibe JSON validado" --> Gemini
    ValorAuto -- "dvc pull del dataset;<br/>registra runs y modelo Production" --> DagsHub

    style Usuario fill:#08427B,color:#fff,stroke:#073B6F
    style ValorAuto fill:#1168BD,color:#fff,stroke:#0B4884
    style Gemini fill:#999999,color:#fff,stroke:#6B6B6B
    style DagsHub fill:#999999,color:#fff,stroke:#6B6B6B
```

## Nivel 2 — Contenedores

Dos flujos: la **tasación en línea** (síncrona, líneas continuas) y el **pipeline de ML** (asíncrono, líneas punteadas), que deja el precio precalculado para que la consulta en vivo nunca espere a un modelo.

```mermaid
flowchart TD
    Usuario(["Usuario<br/>[Persona]"])

    subgraph VA["ValorAuto — docker compose"]
        direction TB
        App["App Móvil<br/>[React Native + Expo SDK 58, Expo Go]<br/>Inicio · Formulario (datos o foto) · Resultado"]
        Api["API Backend<br/>[Bun + Express, contenedor valorauto-api]<br/>/catalogo · /identificar · /tasacion/datos<br/>/revision · /tasacion · /health · /docs"]
        Precalc[("Base de Precálculo<br/>[SQLite - data/precalc.db]<br/>80.520 filas: marca+modelo_base+año+tipo+km → precio")]
        Pipeline["Pipeline de ML<br/>[Python - src/model, src/pipeline, scripts/, notebooks/]<br/>contenedor training"]
    end

    Gemini[["Google Gemini API<br/>gemini-3.1-flash-lite<br/>+ modelo de respaldo"]]
    DagsHub[["DagsHub<br/>DVC + MLflow Registry"]]

    Usuario -- "1. Elige 'Ingresar datos' o 'Usar una foto'" --> App
    App -- "2. GET /catalogo (marcas y modelos)" --> Api
    App -- "3a. POST /identificar (foto ≤1280 px)" --> Api
    Api -- "3b. foto optimizada (sharp, 800 px)" --> Gemini
    Gemini -- "3c. marca/modelo/año/tipo/confianza" --> Api
    App -- "4. POST /tasacion/datos (datos revisados + km)" --> Api
    Api -- "5. consulta por modelo o fallback marca+año" --> Precalc
    App -- "6. GET /revision (marca/modelo/año)" --> Api
    Api -- "7. prompt de texto con entrada validada" --> Gemini
    Api -- "8. precio, rango ±MAE, coincidencia, fallas" --> App

    Pipeline -. "A. dvc pull vehicles_clean.csv" .-> DagsHub
    Pipeline -. "B. entrena XGBoost + model_base,<br/>registra v4 como Production" .-> DagsHub
    Pipeline -. "C. escribe precalc.db con ese mismo modelo<br/>(swap atómico)" .-> Precalc

    style Usuario fill:#08427B,color:#fff,stroke:#073B6F
    style App fill:#1168BD,color:#fff,stroke:#0B4884
    style Api fill:#1168BD,color:#fff,stroke:#0B4884
    style Precalc fill:#1168BD,color:#fff,stroke:#0B4884
    style Pipeline fill:#1168BD,color:#fff,stroke:#0B4884
    style Gemini fill:#999999,color:#fff,stroke:#6B6B6B
    style DagsHub fill:#999999,color:#fff,stroke:#6B6B6B
```

**Lo que todavía no existe:** el pipeline se ejecuta a demanda (`docker compose run --rm training …`). `scripts/nightly_retrain.py` implementa la corrida nocturna con detección de cambios del dataset, pero **no hay ningún servidor 24/7 con cron** que la dispare (ver `scripts/README.md`). Tampoco hay despliegue en la nube: el MVP corre con Docker Compose en una máquina del equipo (R25).

## Nivel 3 — Componentes del API Backend (`src/api`)

```mermaid
flowchart LR
    subgraph MW["Middlewares"]
        RL["rateLimiter<br/>10 req/min/IP<br/>(solo rutas con Gemini)"]
        UP["upload<br/>multer 5 MB, jpg/png/webp<br/>+ sharp: EXIF, 800 px, JPEG q75"]
        VAL["validation (Zod)<br/>km 0..500.000, año, marca/modelo<br/>sin caracteres de instrucciones"]
    end
    subgraph CT["Controllers"]
        TC["tasacion.controller<br/>tasarVehiculo · tasarConDatos<br/>responderPrecio (200/404 compartido)"]
        VC["vehiculo.controller<br/>obtenerCatalogo · identificarVehiculo<br/>obtenerRevision"]
    end
    subgraph SV["Services"]
        GS["gemini.service<br/>identifyVehicle · generateInspectionTips<br/>_generarConRespaldo (429/503)<br/>magic bytes · filtro de precios"]
        PS["pricingService<br/>estimatePrice"]
        SQ["sqlite.service<br/>queryPrice (modelo → marca_anio_tipo → marca_anio)<br/>getCatalog"]
        CA["cacheService<br/>LRU SHA-256 de la imagen, 24 h"]
        NO["utils/normalizer<br/>alias, fuzzy match, normalizeModel<br/>(espejo de features.normalizar_modelo)"]
    end
    DB[("precalc.db")]
    GE[["Gemini"]]

    RL --> UP --> VAL --> TC & VC
    TC --> GS & PS
    VC --> GS & SQ
    PS --> SQ --> DB
    GS --> CA
    GS --> GE
    SQ --> NO
```

## Nivel 3 — Componentes del Pipeline de ML

```mermaid
flowchart TD
    subgraph EDA["01_eda.ipynb — ingestión, validación y limpieza"]
        DataLoading["data_loading.py<br/>load_raw(), load_clean()"]
        Cleaning["cleaning.py<br/>clean_dataset(): reglas de precio/año/km"]
        EdaMods["eda/ (5 módulos)<br/>nulos, distribuciones, categorías,<br/>correlaciones, outliers"]
    end
    subgraph TRAIN["02_entrenamiento.ipynb / scripts/ — features y modelo"]
        Features["features.py<br/>normalizar_modelo → model_base (ADR-0010)<br/>build_preprocessor() (one-hot disperso, min_freq 20)"]
        Training["training.py · scripts/sync_dagshub_model.py<br/>entrena, loguea en MLflow, promueve Production"]
        Evaluation["evaluation.py<br/>RMSE/MAE/R², residuos, curvas, importancia"]
    end
    subgraph PRECALC["03_precalculo.ipynb / scripts/ — precálculo"]
        Combinations["combinations.py<br/>1 fila representativa por<br/>(marca, model_base, año, tipo) × 5 km"]
        Precalculo["precalculo.py<br/>predicciones con piso de US$ 500,<br/>escritura atómica + índices"]
    end
    Config[("src/model/config.py · src/pipeline/config.py<br/>seed, split, features, hiperparámetros, rutas")]
    DagsHub[["DagsHub (DVC + MLflow)"]]
    Sqlite[("data/precalc.db")]

    DataLoading -. "dvc pull" .-> DagsHub
    DataLoading --> Cleaning --> Features --> Training --> Evaluation
    Training -- "run + Model Registry v4 Production" --> DagsHub
    Training -- "mismo pipeline" --> Precalculo
    Combinations --> Precalculo --> Sqlite
    Config -.-> EDA & TRAIN & PRECALC
```

## Componentes y responsabilidad

| Componente | Tecnología | Responsabilidad | Evidencia |
|---|---|---|---|
| App Móvil | React Native + Expo SDK 58 | Dos flujos ("Ingresar datos" y "Usar una foto") que terminan en la misma pantalla de resultado: precio, rango y fallas comunes. Achica la foto a 1280 px antes de subirla. | `app/`, E2E `tests/e2e/app.spec.mjs` |
| API Backend | Bun + Express (contenedor) | Valida la entrada, orquesta Gemini y la consulta a `precalc.db`, maneja errores (400/404/422/429/503) y expone el contrato público. | `src/api/`, Swagger en `/docs`, 64 tests |
| Servicio de visión y texto | Google Gemini (externo) | Identifica el vehículo por foto y genera fallas comunes. **Nunca da precios** (ADR-0004, ADR-0011): prompt, validación de esquema y filtro de salida. | `gemini.service.js`, `test/seguridad.test.js` |
| Base de Precálculo | SQLite `data/precalc.db` | Combinación → precio, con índices por modelo y por marca+año. La regenera el pipeline (no se versiona en git, R20). | `sqlite.service.js` |
| Pipeline de ML | Python (`src/model`, `src/pipeline`, `scripts/`, `notebooks/`) | Ingestión, limpieza, features (`model_base`), entrenamiento (XGBoost v3), evaluación y precálculo reproducibles. | 26 tests pytest, `docs/evidence/baseline-modelo.md` |
| MLflow + DVC | DagsHub | Dataset versionado (DVC). Experimentos y Model Registry: `ValorAuto_Model` **v4 Production** (R² 0.8596, MAE 3.243). | run `a59552af758a44b38b425585bce8c3f9` |

## Configuración y secretos

| Qué | Dónde | Versionado |
|---|---|---|
| Código | `src/`, `app/`, `scripts/`, `tests/` | Sí |
| Configuración por defecto | `src/api/config/config.js`, `src/model/config.py`, `docker-compose.yml` | Sí |
| Plantillas de variables | `.env.example`, `src/api/.env.example`, `app/.env.example` | Sí |
| Secretos (`GEMINI_API_KEY`, token de DagsHub) | `.env` en la raíz | **No** (`.gitignore`) |
| IP local de la app | `app/.env` | **No** |
| Datos generados (`precalc.db`, `mlflow.db`) | `data/`, raíz | **No** (se regeneran) |

## Decisiones que sustentan este diagrama

Cada elección tiene su ADR en [`docs/adr/`](../adr/) (0001–0012). Las más recientes:
- [ADR-0010](../adr/0010-model-base-feature-y-busqueda-por-modelo.md): `model_base` como feature y clave de búsqueda.
- [ADR-0011](../adr/0011-gemini-checklist-inspeccion.md): Gemini para el checklist de inspección.
- [ADR-0012](../adr/0012-exclusion-rag-y-agentes.md): por qué no se usa RAG ni agentes.

Los riesgos están en [`docs/risk-register.md`](../risk-register.md). La secuencia detallada de la tasación está en [`secuencia-tasacion.md`](secuencia-tasacion.md).
