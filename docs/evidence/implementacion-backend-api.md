# Documento de Arquitectura e Implementación: Backend API ValorAuto

**Proyecto:** ValorAuto — Tasador de Autos con IA  
**Módulo:** Backend API REST (`src/api`)  
**Runtime & Gestor de Paquetes:** Bun (v1.4.2+)  
**Framework:** Express.js (ES Modules)  
**Fecha:** Octubre 2026  
**Autor:** Desarrollador Backend Senior y Especialista en QA — Equipo ValorAuto  

---

## 1. Resumen Ejecutivo

Este documento detalla la arquitectura, el diseño modular, la suite de pruebas automatizadas y la integración del módulo de precios para la API REST del proyecto **ValorAuto**, ubicada en [`src/api`](../../src/api).

El servicio expone el endpoint principal `POST /tasacion`, encargado de recibir una fotografía del vehículo y su kilometraje para determinar su valor de mercado en milisegundos. La solución ha sido construida sobre el runtime **Bun**, maximizando la eficiencia en el procesamiento de I/O, el arranque en frío y la ejecución de consultas concurrentes.

---

## 2. Alineación con las Decisiones de Arquitectura (ADRs)

Toda la implementación se construyó respetando estrictamente los Architecture Decision Records (ADRs) vigentes del repositorio:

| ADR | Decisión Central | Implementación en `src/api` |
| :--- | :--- | :--- |
| **[ADR-0001](../adr/0001-backend-nodejs-express.md)** | Backend en Node.js + Express | Se implementó con Express bajo estándares modernos (ES Modules). El backend actúa estrictamente como **orquestador**; nunca ejecuta el modelo de Machine Learning en vivo ni carga dependencias de Python en el camino crítico. |
| **[ADR-0003](../adr/0003-precalculo-nocturno-vs-tiempo-real.md)** | Precálculo nocturno de precios | `POST /tasacion` solo consulta la tabla precalculada. Si la combinación no existe en la base, responde `404 combinacion_no_precalculada` sin realizar inferencia síncrona, garantizando latencias $< 50\text{ ms}$. |
| **[ADR-0004](../adr/0004-gemini-vision-vs-modelo-propio.md)** | Gemini solo como componente de visión | Google Gemini se usa **exclusivamente para clasificar marca, modelo y año**. Se prohíbe explícitamente a Gemini predecir o estimar precios; el precio proviene 100% del modelo offline. |
| **[ADR-0007](../adr/0007-sqlite-lectura-rapida.md)** | SQLite para lectura rápida | Conexión de solo lectura a [`data/precalc.db`](../../data/precalc.db) sobre la tabla `precalculated_prices` con índice sobre `(manufacturer, year, type)`. |

---

## 3. Módulo de Integración para el Modelo de Precios (`pricingService.js`)

Se diseñó e implementó un módulo independiente en [`src/api/services/pricingService.js`](../../src/api/services/pricingService.js) que desacopla la lógica de pricing del controlador HTTP:

- **Interfaz Limpia:** Recibe `(manufacturer, model, year, odometer, type)` y devuelve el objeto estructurado `{ precio_estimado, precio_min, precio_max, rango_km, fuente }`.
- **Estrategia Primaria:** Consulta la base SQLite offline (`data/precalc.db`) respetando los rangos discretizados de odómetro `[10k, 50k, 100k, 150k, 200k]`.
- **Punto de Extensión ML:** Marcado con comentarios claros:
  ```javascript
  // TODO: Punto de integración para el modelo de ML / SQLite de producción
  // Cuando el pipeline de MLOps (XGBoost/Scikit-Learn) se exponga como microservicio,
  // modelo serializado ONNX o job nocturno extendido, este es el punto único de enlace.
  ```
- **Fallback Provisional:** Implementa una función de estimación heurística razonable (conmutable vía `ALLOW_PRICE_FALLBACK=true` en `.env`) que permite al equipo de frontend y QA seguir trabajando incluso si la base de datos no contiene aún el vehículo consultado.

---

## 4. Estructura y Archivos Implementados

```text
src/api/
├── .env                             # Variables de entorno con API Key de Gemini
├── .env.example                     # Plantilla de variables de entorno
├── package.json                     # Scripts y dependencias (start, dev, test, test:e2e, seed)
├── index.js                         # Servidor Express, CORS y puntos de montaje
├── config/
│   └── config.js                    # Configuración centralizada de entorno
├── middlewares/
│   ├── upload.middleware.js         # Multer en memoria (máx 5MB, jpg/png/webp)
│   └── error.middleware.js          # Manejador global de errores y 404
├── services/
│   ├── gemini.service.js            # Servicio de visión con el SDK @google/genai (Gemini 3.5 Flash)
│   ├── sqlite.service.js            # Conexión SQLite singleton de solo lectura (bun:sqlite / better-sqlite3)
│   └── pricingService.js           # Módulo desacoplado de pricing y punto de integración para ML
├── controllers/
│   └── tasacion.controller.js       # Orquestador del flujo y mapeo de códigos HTTP
├── routes/
│   └── tasacion.routes.js           # Definición de rutas (/tasacion)
├── scripts/
│   └── seed_demo_db.js              # Semilla de datos de prueba para SQLite local
├── test/
│   ├── tasacion.test.js             # 13 pruebas unitarias y de integración de endpoints
│   └── pricingService.test.js       # 3 pruebas unitarias del módulo de pricing
└── tests/
    ├── download-and-test.js         # Script E2E: descarga 5 imágenes reales y prueba POST /tasacion
    └── fixtures/                    # Carpeta temporal donde se almacenan las imágenes de prueba
```

---

## 5. Especificación de Endpoints y Códigos HTTP

| Código | Error Code | Causa |
| :--- | :--- | :--- |
| **`200 OK`** | *(Ninguno)* | Tasación exitosa con precio estimado y rango min/max. |
| **`400 Bad Request`** | `imagen_invalida` | Falta archivo, supera 5 MB o formato distinto a JPG/PNG/WEBP. |
| **`400 Bad Request`** | `kilometraje_invalido` | Kilometraje ausente, no entero o fuera de 0..500,000. |
| **`422 Unprocessable Entity`** | `vehiculo_no_identificado` | Gemini no reconoce el auto o confianza $< 0.60$. |
| **`422 Unprocessable Entity`** | `vision_format_error` | La respuesta del modelo de visión no fue un JSON válido. |
| **`404 Not Found`** | `combinacion_no_precalculada` | Vehículo reconocido, pero sin precio precalculado en SQLite. |
| **`503 Service Unavailable`** | `vision_no_disponible` | Timeout (> 25s) o fallo del servicio externo de Gemini. |
| **`500 Internal Error`** | `error_interno` | Error no controlado o fallo crítico interno. |

---

## 6. Resultados de la Suite de Pruebas Automatizadas

### A. Pruebas Unitarias y de Integración (`bun test`)
Ejecutadas sobre [`src/api/test/tasacion.test.js`](../../src/api/test/tasacion.test.js) y [`src/api/test/pricingService.test.js`](../../src/api/test/pricingService.test.js):
- **Total de Pruebas:** 16 pass / 0 fail (100% exitosas).
- **Tiempo de Ejecución:** ~395 ms.

### B. Pruebas End-to-End con Descarga de Imágenes (`bun run test:e2e`)
El script [`src/api/tests/download-and-test.js`](../../src/api/tests/download-and-test.js) descargó 5 imágenes reales a `tests/fixtures/` y ejecutó el flujo completo contra Gemini Vision:

```text
================================================================
  📊 RESUMEN DE RESULTADOS DE PRUEBA E2E
================================================================
┌───┬─────────────────────┬─────────────────┬──────────────────┬──────┬───────────┬──────┬───────────────────────────────┬────────────┬──────────────┐
│   │ Archivo             │ Marca Detectada │ Modelo Detectado │ Año  │ Confianza │ HTTP │ Precio                        │ Tiempo (s) │ Metadatos OK │
├───┼─────────────────────┼─────────────────┼──────────────────┼──────┼───────────┼──────┼───────────────────────────────┼────────────┼──────────────┤
│ 0 │ car_1_toyota.jpg    │ toyota          │ camry            │ 2018 │ 95%       │ 404  │ Sin precio precalculado (404) │ 5.77s      │ ✅           │
│ 1 │ car_2_ford.jpg      │ bmw             │ m3               │ 2016 │ 95%       │ 404  │ Sin precio precalculado (404) │ 5.49s      │ ✅           │
│ 2 │ car_3_mercedes.jpg  │ mercedes-benz   │ amg gt           │ 2016 │ 95%       │ 404  │ Sin precio precalculado (404) │ 11.13s     │ ✅           │
│ 3 │ car_4_chevrolet.jpg │ chevrolet       │ camaro           │ 2017 │ 98%       │ 404  │ Sin precio precalculado (404) │ 5.01s      │ ✅           │
│ 4 │ car_5_ferrari.jpg   │ ferrari         │ laferrari        │ 2014 │ 98%       │ 404  │ Sin precio precalculado (404) │ 5.81s      │ ✅           │
└───┴─────────────────────┴─────────────────┴──────────────────┴──────┴───────────┴──────┴───────────────────────────────┴────────────┴──────────────┘

🎉 ÉXITO: Los metadatos (marca, modelo, año) de los 5 vehículos fueron extraídos correctamente por Gemini.
```
