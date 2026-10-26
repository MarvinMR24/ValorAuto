# Diagrama de Secuencia — Tasación de Autos con IA

Secuencia real del MVP (2026-10-26): los dos flujos de la app, el manejo de errores de Gemini y el pipeline que deja los precios precalculados. Para la vista de contenedores y componentes ver [`C4-ValorAuto.md`](C4-ValorAuto.md). Contratos: [`specs/tasacion`](../../openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md) y [`specs/app-tasacion`](../../openspec/changes/app-dos-flujos-tasacion/specs/app-tasacion/spec.md).

## Flujo 1 — Tasación desde la app

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant App as App (Expo Go)
    participant API as API (Bun/Express)
    participant G as Gemini
    participant DB as precalc.db

    U->>App: Abre la app y elige un flujo
    App->>API: GET /catalogo
    API->>DB: marcas y modelos por popularidad
    API-->>App: {marcas, modelos, anio_min, anio_max}

    alt "Usar una foto"
        U->>App: Toma o elige una foto
        App->>App: Achica la foto a 1280 px (JPEG 0.7)
        App->>API: POST /identificar (multipart, campo imagen)
        API->>API: Valida tamaño/tipo, sharp → 800 px, magic bytes, caché SHA-256
        API->>G: imagen + prompt (JSON estricto, sin precios)
        alt Modelo principal saturado (429/503)
            API->>G: Reintento único con el modelo de respaldo
        end
        G-->>API: {manufacturer, model, year, type, confidence}
        API-->>App: 200 {marca, modelo, anio, tipo, confianza} o 400/422/503
        App->>U: Prellena el formulario (editable) o muestra el error
    end

    U->>App: Revisa o completa marca, modelo, año y km → "Ver precio"
    App->>API: POST /tasacion/datos {marca, modelo, anio, kilometraje, tipo?}
    API->>API: Zod: km 0..500.000, año válido, marca/modelo sin caracteres de instrucciones
    API->>DB: (marca, model_base, año, km≈) → si no hay: promedio marca+año(+tipo)
    API-->>App: 200 {precio_estimado, precio_min, precio_max, coincidencia} o 404
    App->>U: Precio y rango (nota si es "precio de referencia")

    App->>API: GET /revision?marca&modelo&anio
    API->>G: prompt de texto con el vehículo delimitado como dato
    G-->>API: {fallas_comunes, revisar_primero}
    API->>API: Valida el esquema y descarta ítems que mencionen precios o dinero
    API-->>App: 200 {…, fuente: "gemini" | "generico"} (siempre 200)
    App->>U: Fallas comunes y qué revisar primero · botón Volver
```

## Flujo 2 — Pipeline de ML (a demanda; el cron nocturno no está desplegado)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Equipo
    participant T as Contenedor training
    participant D as DagsHub (DVC + MLflow)
    participant DB as precalc.db

    Dev->>T: docker compose run --rm training python3 -m scripts.sync_dagshub_model
    T->>D: dvc pull (vehicles_clean.csv, 352.005 filas)
    T->>T: split 80/20 (seed 42), model_base, XGBoost v3
    T->>D: log de métricas (RMSE/MAE/R²) + modelo
    T->>D: create_model_version → v4 → Production (archiva la anterior)
    T->>DB: mismo pipeline → 80.520 combinaciones, piso US$ 500, swap atómico
    Note over DB: El API la lee en modo solo lectura (reiniciar el contenedor tras regenerar)
```

## Detalles

- **Tasación (síncrona):** el precio nunca lo calcula Gemini ni un modelo en vivo. Sale de `precalc.db` (ADR-0003, ADR-0004). Gemini solo identifica el auto y genera el texto de la revisión. Si falla, el usuario sigue con "Ingresar datos" y la revisión cae al checklist genérico.
- **Pipeline (asíncrono):** `scripts/nightly_retrain.py` está listo para correr cada noche (solo reentrena si cambió el hash del dataset), pero hoy no hay un servidor 24/7 que lo agende. Mientras tanto se ejecuta a demanda con el comando de arriba.
