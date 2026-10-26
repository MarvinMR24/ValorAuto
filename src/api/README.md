# ValorAuto Backend REST API

API REST de alto rendimiento construida en **Express** sobre el runtime ultra-rápido **Bun** para el proyecto **ValorAuto** (Tasador Inteligente de Vehículos con IA y Machine Learning).

El backend orquesta la identificación visual del vehículo mediante **Google Gemini Vision** y consulta la estimación de precio de mercado a través del módulo desacoplado **PricingService** (que consulta la base **SQLite** `data/precalc.db` precalculada offline por el pipeline de MLOps con tolerancia a fallos mediante Fuzzy Matching).

---

## 🏛️ Arquitectura y Cumplimiento de ADRs

La solución respeta estrictamente los Architecture Decision Records (ADRs) del proyecto:

1. **[ADR-0001: Backend en Node.js/Express](../../docs/adr/0001-backend-nodejs-express.md)**
   - El backend orquesta exclusivamente la llamada a Gemini y la consulta a la base de datos indexada. No ejecuta inferencias pesadas de ML en el hilo del request HTTP.
2. **[ADR-0003: Precálculo nocturno de precios](../../docs/adr/0003-precalculo-nocturno-vs-tiempo-real.md)**
   - El endpoint `POST /tasacion` consulta la tabla precalculada con latencias de consulta menores a 5 ms.
3. **[ADR-0004: Gemini solo como componente de visión](../../docs/adr/0004-gemini-vision-vs-modelo-propio.md)**
   - Gemini se utiliza **exclusivamente para clasificar marca, modelo y año**. **Gemini NUNCA estima ni predice precios**. El precio proviene 100% de la base de datos offline generada por el modelo de ML (XGBoost).
4. **[ADR-0007: SQLite como base de lectura rápida](../../docs/adr/0007-sqlite-lectura-rapida.md)**
   - Conexión de solo lectura singleton con `bun:sqlite` nativo (o `better-sqlite3`), indexada por `(manufacturer, year, type)`.

---

## 🚀 Nuevas Capacidades y Mejoras de Arquitectura

### 1. Normalización y Coincidencia Flexible (Fuzzy Matching)
- **Módulo:** [`src/api/utils/normalizer.js`](utils/normalizer.js)
- **Estandarización:** Convierte a minúsculas, remueve tildes/diacríticos y caracteres especiales.
- **Diccionario de Alias:** Mapea automáticamente variaciones y coloquialismos automotrices (`chevy` -> `chevrolet`, `vw` -> `volkswagen`, `mercedes` / `merc` -> `mercedes-benz`, `bimmer` -> `bmw`, `pickup` -> `truck`, `camioneta` -> `truck`).
- **Fuzzy Matching con Fuse.js:** Realiza búsqueda difusa con umbral estricto contra las marcas existentes en `data/precalc.db`, evitando falsos `404` ante errores tipográficos leves (ej: `tooyota` -> `toyota`).

### 2. Validación Estricta con Zod y Seguridad
- **Esquema Zod:** [`src/api/middlewares/validation.middleware.js`](middlewares/validation.middleware.js)
  - `odometer`: Valida enteros entre `0` y `500,000` km.
  - `file`: Valida presencia física, formato MIME (`image/jpeg`, `image/png`, `image/webp`) y tamaño máximo de **5 MB**.
- **Cabeceras HTTP Seguras:** Protegido con **Helmet** (`helmet({ contentSecurityPolicy: false })`).
- **Rate Limiting:** [`src/api/middlewares/rateLimiter.middleware.js`](middlewares/rateLimiter.middleware.js) limita las peticiones a `POST /tasacion` a un máximo de **10 peticiones por minuto por IP** (`HTTP 429 Too Many Requests`), protegiendo la cuota de la API de Google Gemini.

### 3. Caching Inteligente para Gemini (Hashing SHA-256)
- **Servicio:** [`src/api/services/cacheService.js`](services/cacheService.js)
- Utiliza **LRUCache** indexada por el hash criptográfico SHA-256 del búfer de la imagen.
- Si se envía la misma fotografía, el backend responde de inmediato desde la memoria RAM (latencia < 5 ms) sin invocar la API externa de Gemini, reduciendo costos de cuota y tiempos de espera.

### 4. Observabilidad y Logging Estructurado con Pino
- **Módulo:** [`src/api/utils/logger.js`](utils/logger.js)
- Emite logs estructurados en formato **JSON** estándar, aptos para Datadog, Grafana Loki, CloudWatch o Google Cloud Logging.
- Registra el desglose de latencia individual por fase:
  - Tiempo de procesamiento / hit de caché (`cacheDurationMs` / `fromCache`).
  - Tiempo de respuesta de Gemini Vision (`visionDurationMs`).
  - Tiempo de consulta en base de datos SQLite (`pricingDurationMs`).
  - Latencia total de la solicitud (`duracion_total_ms`).
- Inyecta cabeceras de observabilidad en la respuesta: `X-Response-Time-Ms` y `X-Vision-Cache: HIT|MISS`.

### 5. Diagnóstico Integral y Métricas (`GET /health`)
- Diagnóstico en tiempo real que reporta:
  - `status: "OK"` (o `DEGRADED` si la base de datos falla).
  - Estado y conteo de filas de la base SQLite (`status: connected`, `precalculatedRows`, `knownBrands`).
  - Estado de la API Key de Gemini (presencia y enmascaramiento seguro e.g. `AQ.Ab8RN...TQ`).
  - Uptime del proceso en segundos.
  - Estadísticas de uso del caché LRU (`size`, `hits`, `misses`, `hitRate`).
  - Consumo de memoria RAM del runtime (`rssMb`, `heapUsedMb`).

### 6. Documentación Interactiva Swagger / OpenAPI (`GET /docs`)
- Documentación viva interactiva montada en **`http://localhost:3000/docs`** mediante **Swagger UI**.
- Especificación OpenAPI 3.0 exportable en JSON puro en **`GET /docs.json`**.

---

## 📁 Estructura del Código (`src/api`)

```text
src/api/
├── .env                             # Variables de entorno activas (Gemini Key, DB, Puertos)
├── .env.example                     # Plantilla de variables de entorno
├── package.json                     # Dependencias y scripts adaptados a Bun
├── bun.lock                         # Lockfile reproducible de Bun
├── index.js                         # Servidor Express, Helmet, Swagger UI, Health check
├── config/
│   └── config.js                    # Configuración centralizada, límites y rutas
├── utils/
│   ├── logger.js                    # Logging estructurado en JSON con Pino y Pino-HTTP
│   └── normalizer.js                # Normalización de texto, alias y Fuzzy Matching (Fuse.js)
├── middlewares/
│   ├── upload.middleware.js         # Multer en memoria (5 MB, JPG/PNG/WEBP)
│   ├── validation.middleware.js     # Validación estricta con esquemas Zod
│   ├── rateLimiter.middleware.js    # Rate limiting (10 req/min por IP con express-rate-limit)
│   └── error.middleware.js          # Manejador centralizado de errores HTTP y 404
├── services/
│   ├── cacheService.js              # Caché LRU en memoria con hash criptográfico SHA-256
│   ├── gemini.service.js            # Visión con @google/genai (Gemini 3.5 Flash) y caché
│   ├── sqlite.service.js            # Conexión singleton de solo lectura a precalc.db con Fuzzy Match
│   └── pricingService.js           # Módulo desacoplado de pricing y punto de integración para ML
├── controllers/
│   └── tasacion.controller.js       # Orquestador del flujo, métricas de fase y respuestas HTTP
├── routes/
│   └── tasacion.routes.js           # Rutas del endpoint POST /tasacion
├── docs/
│   └── swagger.js                   # Especificación OpenAPI 3.0 completa
├── scripts/
│   └── seed_demo_db.js              # Poblado de vehículos de muestra en data/precalc.db
├── test/
│   ├── tasacion.test.js             # 24 tests de integración, Zod, Swagger, Health, Cache y Normalizer
│   └── pricingService.test.js       # 3 tests unitarios del módulo de precios
└── tests/
    ├── download-and-test.js         # Suite E2E: descarga 5 autos reales y valida Gemini Vision
    └── fixtures/                    # Imágenes descargadas para pruebas
```

---

## ⚙️ Variables de Entorno (`.env`)

```env
PORT=3000
NODE_ENV=development

# Clave de la API de Google Gemini (Visión) - ADR-0004
GEMINI_API_KEY=tu_api_key_aqui

# Modelo de Gemini para visión (gemini-3.5-flash)
GEMINI_MODEL=gemini-3.5-flash

# Umbral mínimo de confianza visual para aceptar la identificación (0.0 a 1.0)
VISION_CONFIDENCE_THRESHOLD=0.6

# Timeout para la llamada a la API de Gemini en milisegundos
VISION_TIMEOUT_MS=25000

# Ruta a la base de datos SQLite con los precios precalculados (ADR-0007)
DB_PATH=../../data/precalc.db

# Error medio absoluto (MAE) de referencia del modelo en Producción (USD)
BASELINE_MAE=3778

# Activar fallback heurístico si la combinación no está en SQLite (para desarrollo continuo)
ALLOW_PRICE_FALLBACK=false
```

---

## 📖 Especificación de Endpoints

### 1. `POST /tasacion`
Calcula la tasación de mercado para un vehículo a partir de su fotografía y kilometraje.

- **Headers:** `Content-Type: multipart/form-data`
- **Rate Limit:** Máximo 10 peticiones / minuto por IP.
- **Campos del Formulario:**
  - `imagen` *(archivo, obligatorio)*: Fotografía frontal/lateral del vehículo (`JPG`, `PNG` o `WEBP`, máx. **5 MB**). También se admiten `image`, `photo` o `file`.
  - `odometer` *(entero, obligatorio)*: Kilometraje actual entre `0` y `500,000` km. También se admite como `kilometraje`.

#### Respuesta Exitosa (`200 OK`):
```json
{
  "marca": "toyota",
  "modelo": "corolla",
  "anio": 2015,
  "precio_estimado": 13400,
  "precio_min": 9622,
  "precio_max": 17178,
  "rango_km_consultado": 50000,
  "confianza_vision": 0.95,
  "fuente_precio": "sqlite_precalculo",
  "_metricas": {
    "duracion_total_ms": 118.4,
    "duracion_vision_ms": 105.1,
    "duracion_pricing_ms": 3.2,
    "cache_hit": false
  }
}
```

#### Respuestas de Error:
- **`400 Bad Request`:** Parámetro faltante, kilometraje fuera de rango (0..500k) o imagen que supera los 5 MB.
- **`404 Not Found`:** Combinación de vehículo no encontrada en SQLite (retorna datos del auto identificado).
- **`422 Unprocessable Entity`:** La imagen no corresponde a un automóvil o confianza visual < 0.60.
- **`429 Too Many Requests`:** Límite de 10 peticiones por minuto por IP superado.
- **`503 Service Unavailable`:** Timeout o indisponibilidad temporal del servicio externo de visión.

---

### 2. `GET /health`
Diagnóstico operativo del backend, base de datos y métricas en vivo.

```json
{
  "status": "OK",
  "timestamp": "2026-10-26T02:50:00.000Z",
  "service": "ValorAuto REST API",
  "uptimeSeconds": 1420.5,
  "runtime": "Bun v1.4.2",
  "database": {
    "status": "connected",
    "path": "data/precalc.db",
    "precalculatedRows": 10,
    "knownBrands": 4
  },
  "geminiApi": {
    "configured": true,
    "maskedKey": "AQ.Ab8RN...TQ",
    "model": "gemini-3.5-flash"
  },
  "cache": {
    "size": 5,
    "max": 500,
    "hits": 14,
    "misses": 5,
    "hitRate": "73.7%"
  },
  "memory": {
    "rssMb": 68.4,
    "heapUsedMb": 28.1,
    "heapTotalMb": 35.6
  }
}
```

---

### 3. `GET /docs` y `GET /docs.json`
- **`http://localhost:3000/docs`**: Interfaz visual e interactiva de Swagger UI para probar endpoints desde el navegador.
- **`http://localhost:3000/docs.json`**: Especificación OpenAPI 3.0 en formato JSON estandarizado.

---

## 🛠️ Comandos de Ejecución con Bun

```bash
# 1. Instalar dependencias
cd src/api
bun install

# 2. Levantar servidor en modo desarrollo con recarga automática (--watch)
bun run dev

# 3. Levantar servidor en modo producción
bun run start

# 4. Ejecutar la suite completa de pruebas unitarias e integración (27 tests)
bun test

# 5. Ejecutar suite E2E con descarga de imágenes reales e inferencia Gemini
bun run test:e2e

# 6. Repoblar la base de datos local SQLite de prueba
bun run seed
```

---

## 🧪 Pruebas con cURL

### Tasación con imagen:
```bash
curl -X POST http://localhost:3000/tasacion \
  -F "imagen=@tests/fixtures/car_1_toyota.jpg" \
  -F "odometer=50000"
```

### Consultar Health Check:
```bash
curl http://localhost:3000/health
```

### Descargar especificación OpenAPI:
```bash
curl http://localhost:3000/docs.json
```
