import { config } from '../config/config.js';

/**
 * Especificación OpenAPI 3.0.0 para ValorAuto REST API
 */
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ValorAuto REST API',
    version: '1.2.0',
    description: `
**API de Tasación Inteligente de Vehículos con Visión Artificial y Machine Learning**

Arquitectura y principios de diseño:
- **ADR-0001:** Backend modular sobre Node.js/Express optimizado para el runtime ultra-rápido **Bun**.
- **ADR-0003:** Inferencia en tiempo real (<200 ms) alimentada por precálculo nocturno de modelos ML.
- **ADR-0004:** Gemini Vision exclusivo para extracción visual de metadata (marca, modelo, año).
- **ADR-0007:** SQLite optimizado para lectura indexada con fallback heurístico.
- **Seguridad & Rendimiento:** Rate limiting (10 req/min), validación con Zod, Helmet y caché SHA-256 en memoria.
    `.trim(),
    contact: {
      name: 'Equipo de Arquitectura ValorAuto',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Servidor local de desarrollo / pruebas',
    },
  ],
  paths: {
    '/tasacion': {
      post: {
        summary: 'Tasar vehículo mediante fotografía y kilometraje',
        description: `
Recibe la imagen de un vehículo y su kilometraje actual.
1. Valida el formato y tamaño (JPG/PNG/WEBP <= 5 MB, kilometraje 0..500,000).
2. Computa el hash SHA-256 de la imagen para consultar el caché en memoria (LRU Cache).
3. Si es una nueva imagen, consulta a Gemini Vision para clasificar marca, modelo y año.
4. Consulta la base de datos de precios precalculados SQLite (data/precalc.db) con Fuzzy Matching.
5. Devuelve la estimación con intervalo de confianza basado en el error MAE del modelo.
        `.trim(),
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['imagen', 'odometer'],
                properties: {
                  imagen: {
                    type: 'string',
                    format: 'binary',
                    description: 'Fotografía del vehículo (JPG, PNG o WEBP, máx 5 MB). También se admiten los campos "image", "photo" o "file".',
                  },
                  odometer: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 500000,
                    example: 52000,
                    description: 'Kilometraje actual del vehículo en kilómetros. También se admite como "kilometraje".',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tasación calculada exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TasacionResponse',
                },
                example: {
                  marca: 'toyota',
                  modelo: 'corolla',
                  anio: 2018,
                  precio_estimado: 14500,
                  precio_min: 10722,
                  precio_max: 18278,
                  rango_km_consultado: 50000,
                  confianza_vision: 0.95,
                  fuente_precio: 'sqlite_precalculo',
                  _metricas: {
                    duracion_total_ms: 124.5,
                    duracion_vision_ms: 110.2,
                    duracion_pricing_ms: 4.8,
                    cache_hit: false,
                  },
                },
              },
            },
          },
          '400': {
            description: 'Parámetros inválidos (falta imagen, formato no admitido, kilometraje fuera de rango 0..500,000)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'kilometraje_invalido',
                  message: 'El kilometraje debe ser coherente (máximo 500,000 km).',
                },
              },
            },
          },
          '404': {
            description: 'Combinación de vehículo no encontrada en la base de datos de precios precalculados',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'combinacion_no_precalculada',
                  message: 'No se encontró una tasación precalculada para peugeot 208 (2019).',
                  vehiculo_identificado: {
                    marca: 'peugeot',
                    modelo: '208',
                    anio: 2019,
                    confianza: 0.92,
                  },
                },
              },
            },
          },
          '422': {
            description: 'Vehículo no identificado en la imagen o confianza insuficiente (< 0.60)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'vehiculo_no_identificado',
                  message: 'No se pudo identificar el vehículo en la fotografía. Intenta con una imagen más clara y frontal.',
                },
              },
            },
          },
          '429': {
            description: 'Límite de peticiones por minuto excedido (Rate Limiting)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'limite_excedido',
                  message: 'Has superado el límite de 10 peticiones por minuto. Por favor espera antes de volver a consultar.',
                },
              },
            },
          },
          '503': {
            description: 'Servicio de visión externo no disponible o timeout de red agotado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
                example: {
                  error: 'vision_no_disponible',
                  message: 'El servicio de visión no está disponible actualmente. Inténtalo de nuevo más tarde.',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Diagnóstico de salud del servicio, base de datos y métricas del sistema',
        description: 'Reporta el estado operativo general, verificación de SQLite, clave de Gemini, estadísticas de caché y memoria.',
        responses: {
          '200': {
            description: 'Diagnóstico de salud exitoso',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthResponse',
                },
                example: {
                  status: 'OK',
                  timestamp: '2026-10-26T01:30:00.000Z',
                  service: 'ValorAuto REST API',
                  uptimeSeconds: 3600,
                  runtime: 'Bun v1.4.2',
                  database: {
                    status: 'connected',
                    path: 'data/precalc.db',
                    precalculatedRows: 10,
                    knownBrands: 4,
                  },
                  geminiApi: {
                    configured: true,
                    maskedKey: 'AQ.Ab8RN...TQ',
                    model: 'gemini-3.5-flash',
                  },
                  cache: {
                    size: 15,
                    max: 500,
                    hits: 42,
                    misses: 15,
                    hitRate: '73.7%',
                  },
                  memory: {
                    rssMb: 64.2,
                    heapTotalMb: 32.1,
                    heapUsedMb: 24.5,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      TasacionResponse: {
        type: 'object',
        properties: {
          marca: { type: 'string', example: 'toyota' },
          modelo: { type: 'string', example: 'corolla' },
          anio: { type: 'integer', example: 2018 },
          precio_estimado: { type: 'number', example: 14500 },
          precio_min: { type: 'number', example: 10722 },
          precio_max: { type: 'number', example: 18278 },
          rango_km_consultado: { type: 'integer', example: 50000 },
          confianza_vision: { type: 'number', example: 0.95 },
          fuente_precio: { type: 'string', example: 'sqlite_precalculo' },
          _metricas: {
            type: 'object',
            properties: {
              duracion_total_ms: { type: 'number' },
              duracion_vision_ms: { type: 'number' },
              duracion_pricing_ms: { type: 'number' },
              cache_hit: { type: 'boolean' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'kilometraje_invalido' },
          message: { type: 'string', example: 'El kilometraje debe ser coherente.' },
          detalles: { type: 'array', items: { type: 'object' } },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'OK' },
          timestamp: { type: 'string' },
          service: { type: 'string' },
          uptimeSeconds: { type: 'number' },
          runtime: { type: 'string' },
          database: { type: 'object' },
          geminiApi: { type: 'object' },
          cache: { type: 'object' },
          memory: { type: 'object' },
        },
      },
    },
  },
};

export default swaggerSpec;
