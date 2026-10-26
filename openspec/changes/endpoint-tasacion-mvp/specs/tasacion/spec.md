## Purpose

Define el contrato observable del endpoint de tasación de ValorAuto: qué entrada acepta, qué respuesta exitosa produce y qué error devuelve ante cada falla (imagen o kilometraje inválido, vehículo no identificable, Gemini no disponible, combinación sin precalcular). Versión alineada con la implementación de `src/api` y con ADR-0010 (búsqueda por modelo); los valores que cambiaron respecto del borrador de REQ-001 están marcados como "Ajuste".

## ADDED Requirements

### Requirement: Entrada del endpoint de tasación
El sistema SHALL exponer `POST /tasacion` que acepta `multipart/form-data` con exactamente una imagen en el campo `imagen` y un campo `kilometraje`. Por compatibilidad, el backend también MUST aceptar la imagen en los campos `image`, `photo` o `file` y el kilometraje en `odometer`; los clientes nuevos (app/) MUST usar `imagen` y `kilometraje`.

La imagen MUST ser `image/jpeg`, `image/png` o `image/webp` y pesar como máximo 5 MB. El kilometraje MUST ser un entero entre `0` y `500000` (inclusive).

> Ajuste respecto de REQ-001 (A5/A6): el borrador proponía 8 MB, solo jpg/png y hasta 1.000.000 km. La implementación (`src/api/config/config.js`) quedó en 5 MB, jpg/png/webp y 500.000 km; el equipo adopta esos valores como contrato (las fotos de celular actuales entran holgadas en 5 MB, WEBP es lo que exportan varias galerías Android, y el precálculo solo cubre hasta 200.000 km).

#### Scenario: Kilometraje fuera de rango
- **WHEN** el cliente envía `kilometraje` negativo, mayor a `500000`, decimal, no numérico o ausente
- **THEN** el sistema responde `400` con `{"error": "kilometraje_invalido", "message": "..."}`
- **AND** no se llama a Gemini

#### Scenario: Imagen inválida
- **WHEN** el cliente no envía imagen, envía un formato distinto de jpg/png/webp o una imagen de más de 5 MB
- **THEN** el sistema responde `400` con `{"error": "imagen_invalida", "message": "..."}`
- **AND** no se llama a Gemini

### Requirement: Identificación del vehículo con visión
El sistema SHALL identificar el vehículo llamando a Gemini (ADR-0004), que MUST devolver JSON con el esquema `{manufacturer, model, year, type, confidence}` (claves en inglés, valores en minúsculas). Gemini MUST NOT estimar precios. El umbral de confianza MUST ser configurable (`VISION_CONFIDENCE_THRESHOLD`, por defecto `0.6`) y el timeout MUST ser configurable (`VISION_TIMEOUT_MS`, por defecto `25000` ms), sin reintentos automáticos. El resultado de una identificación exitosa MUST cachearse en memoria por hash SHA-256 de la imagen (24 h). Antes de enviarla a Gemini, la imagen MUST optimizarse en el servidor (orientación EXIF, máximo `IMAGE_MAX_DIMENSION` px por lado, JPEG calidad `IMAGE_JPEG_QUALITY`), y su tipo real MUST detectarse por magic bytes. Si el modelo principal responde 429/503, el sistema MUST reintentar una vez con `GEMINI_FALLBACK_MODEL`; un 400/`INVALID_ARGUMENT` de Gemini MUST NOT reintentarse y responde `400 imagen_invalida`.

> Ajuste respecto de REQ-001 (A1/A4): el esquema quedó con claves en inglés para coincidir con las columnas de `precalc.db`, y el timeout por defecto en 25 s porque Gemini con imagen supera los 10 s con cierta frecuencia; sigue siendo configurable.

#### Scenario: Respuesta de visión con formato inválido
- **WHEN** Gemini responde algo que no es JSON parseable
- **THEN** el sistema responde `422` con `{"error": "vision_format_error"}`

#### Scenario: Vehículo no identificado o confianza baja
- **WHEN** Gemini no devuelve `manufacturer`, `model` o `year`, o `confidence` es menor al umbral
- **THEN** el sistema responde `422` con `{"error": "vehiculo_no_identificado"}`

#### Scenario: Gemini no disponible
- **WHEN** la llamada a Gemini falla (5xx, red, cuota), supera el timeout o no hay `GEMINI_API_KEY` configurada
- **THEN** el sistema responde `503` con `{"error": "vision_no_disponible"}` sin exponer detalles internos del proveedor

### Requirement: Consulta a la tabla precalculada
El sistema SHALL obtener el precio exclusivamente de `precalc.db` (ADR-0003, ADR-0007), sin inferencia en vivo. El kilometraje MUST discretizarse al escalón precalculado más cercano de `[10000, 50000, 100000, 150000, 200000]`. La marca MUST normalizarse (alias + fuzzy matching contra las marcas de la tabla) y el modelo MUST normalizarse a `model_base` con la misma regla que el pipeline (ADR-0010).

La búsqueda MUST seguir este orden e informar el nivel usado en `coincidencia`:
1. `modelo`: fila de `(manufacturer, model_base, year, odometer)`; si hay varias, la del mismo tipo de carrocería que reportó Gemini (`truck` ≡ `pickup`) y luego la de más `n_anuncios`.
2. `marca_anio_tipo`: si el modelo no está, promedio ponderado por `n_anuncios` de `(manufacturer, year, type, odometer)`.
3. `marca_anio`: si tampoco hay ese tipo, promedio ponderado de `(manufacturer, year, odometer)`.

#### Scenario: Combinación no precalculada
- **WHEN** no existe ninguna fila para la marca y el año identificados (en ningún nivel)
- **THEN** el sistema responde `404` con `{"error": "combinacion_no_precalculada", "vehiculo_identificado": {marca, modelo, anio, confianza}}`

#### Scenario: El modelo influye en el precio
- **WHEN** se tasan dos modelos distintos de la misma marca, año, tipo y kilometraje que existen en la tabla (ej. toyota corolla vs camry 2015 sedan)
- **THEN** cada uno recibe el precio de su propia fila con `coincidencia: "modelo"`

### Requirement: Respuesta exitosa
El sistema SHALL responder `200` con al menos `{marca, modelo, anio, precio_estimado, precio_min, precio_max}`, más `rango_km_consultado`, `coincidencia`, `confianza_vision`, `fuente_precio` y `_metricas`. `precio_min`/`precio_max` MUST calcularse como `precio_estimado ∓ MAE` del modelo que generó la tabla (`BASELINE_MAE`, hoy `3243` USD), con `precio_min >= 0`. Ningún precio precalculado MUST ser menor a 500 USD (piso aplicado en `src/pipeline/precalculo.py`).

#### Scenario: Tasación exitosa
- **WHEN** la entrada es válida, Gemini identifica el vehículo con confianza suficiente y existe la combinación
- **THEN** el sistema responde `200` con `precio_min <= precio_estimado <= precio_max`

### Requirement: Protección del endpoint
El sistema SHALL limitar `POST /tasacion` a 10 peticiones por minuto por IP para proteger la cuota de Gemini, y MUST exponer `GET /health` con el estado de la base precalculada y de la configuración de Gemini (con la llave enmascarada).

#### Scenario: Límite de peticiones
- **WHEN** una IP supera 10 peticiones en un minuto
- **THEN** el sistema responde `429` con `{"error": "limite_excedido"}`

#### Scenario: Base precalculada ausente
- **WHEN** `precalc.db` no existe en `DB_PATH`
- **THEN** `GET /health` responde `503` con `status: "DEGRADED"`
