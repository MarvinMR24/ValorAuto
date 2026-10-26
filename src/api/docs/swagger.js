import { config } from '../config/config.js';

/**
 * Especificación OpenAPI 3.0.3 para ValorAuto REST API
 * Documenta los dos endpoints claramente diferenciados:
 * - POST /tasacion        (Tasación por Texto con payload JSON y campo 'texto')
 * - POST /tasacion/imagen (Tasación por Imagen con multipart/form-data y campo 'imagen')
 */
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ValorAuto REST API',
    version: '2.1.0',
    description: `
**API de Tasación Inteligente de Vehículos (Texto y Visión con Gemini + Modelo ML Precalculado en SQLite)**

Endpoints disponibles de valoración:
1. **\`POST /tasacion\` (Tasación por Texto):** Recibe un payload \`application/json\` con el campo \`texto\` (o atributos desglosados), normaliza ortografía y verifica la existencia real del automóvil con Google Gemini (\`${config.geminiModel}\`), y consulta la tasación precalculada en SQLite (\`data/precalc.db\`).
2. **\`POST /tasacion/imagen\` (Tasación por Imagen):** Recibe un formulario \`multipart/form-data\` con la fotografía del auto en el campo \`imagen\`, limpia el base64, valida el \`mimeType\` exacto y extrae marca, modelo, año, carrocería y estado estético con Gemini Vision para consultar el precio en SQLite.
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
  tags: [
    {
      name: 'Tasación por Texto',
      description: 'Valoración de vehículos a partir de descripción textual en JSON (POST /tasacion)',
    },
    {
      name: 'Tasación por Imagen (Visión)',
      description: 'Valoración de vehículos a partir de una fotografía mediante Gemini Vision (POST /tasacion/imagen)',
    },
    {
      name: 'Diagnóstico',
      description: 'Salud del sistema, estado de SQLite, caché y métricas',
    },
  ],
  paths: {
    '/tasacion': {
      post: {
        tags: ['Tasación por Texto'],
        summary: 'Tasar vehículo por texto (JSON con campo "texto")',
        description: `
Recibe una descripción en texto del vehículo mediante \`application/json\` (campo \`texto\` o campos estructurados).
- Corrige errores ortográficos (ej. *"Toyotta Corola"* -> *"Toyota Corolla"*).
- Verifica que el modelo exista comercialmente (rechaza vehículos ficticios con \`422\`).
- Consulta el precio estimado en SQLite (\`data/precalc.db\`).
        `.trim(),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['texto'],
                properties: {
                  texto: {
                    type: 'string',
                    example: 'Toyotta Corola 2020 con 45000 km sedan excelente estado',
                    description: 'Descripción textual del vehículo (marca, modelo, año, kilometraje, estado)',
                  },
                  kilometraje: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 1000000,
                    example: 45000,
                    description: 'Kilometraje en km (opcional si ya se incluye dentro de "texto")',
                  },
                  marca: {
                    type: 'string',
                    example: 'Toyota',
                    description: 'Marca del vehículo (opcional en modo estructurado)',
                  },
                  modelo: {
                    type: 'string',
                    example: 'Corolla',
                    description: 'Modelo del vehículo (opcional en modo estructurado)',
                  },
                  anio: {
                    type: 'integer',
                    example: 2020,
                    description: 'Año de fabricación entre 1980 y actual + 1 (opcional)',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tasación por texto calculada exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TasacionResponse',
                },
              },
            },
          },
          '400': {
            description: 'Datos inválidos (texto vacío/basura, kilometraje fuera de rango 0..1,000,000 o INVALID_ARGUMENT)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Combinación de vehículo no encontrada en la base precalculada (ADR-0003)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '422': {
            description: 'Vehículo inexistente en el mercado automotriz o irreconocible',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '429': {
            description: 'Límite de peticiones por minuto excedido (Rate Limiting: 10 req/min)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/tasacion/imagen': {
      post: {
        tags: ['Tasación por Imagen (Visión)'],
        summary: 'Tasar vehículo por fotografía (multipart/form-data con campo "imagen")',
        description: `
Recibe la fotografía de un vehículo mediante \`multipart/form-data\` en el campo \`imagen\`.
- Valida que la imagen esté presente y que su \`mimeType\` sea exactamente \`image/jpeg\`, \`image/png\` o \`image/webp\`.
- Limpia prefijos \`data:image/...;base64,\` antes de invocar Gemini Vision.
- Si Gemini devuelve \`400\` o \`INVALID_ARGUMENT\`, responde inmediatamente \`400\` al cliente sin reintentar. Solo reintenta ante errores \`429\` o \`503\`.
- Consulta el precio estimado en SQLite (\`data/precalc.db\`).
        `.trim(),
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['imagen'],
                properties: {
                  imagen: {
                    type: 'string',
                    format: 'binary',
                    description: 'Fotografía del vehículo (formatos admitidos: JPG, PNG, WEBP, máx. 8 MB)',
                  },
                  kilometraje: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 1000000,
                    example: 45000,
                    description: 'Kilometraje actual del vehículo en km (opcional, por defecto 50,000 km)',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tasación por imagen calculada exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TasacionResponse',
                },
              },
            },
          },
          '400': {
            description: 'Imagen ausente, formato MIME no permitido o error 400 INVALID_ARGUMENT de Gemini Vision',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '404': {
            description: 'Vehículo identificado visualmente pero sin combinación precalculada en SQLite',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '422': {
            description: 'No se pudo identificar un vehículo en la imagen o confianza visual insuficiente (< 0.60)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '429': {
            description: 'Límite de peticiones por minuto excedido (Rate Limiting: 10 req/min)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Diagnóstico'],
        summary: 'Diagnóstico de salud del servicio, base de datos y métricas del sistema',
        responses: {
          '200': {
            description: 'Diagnóstico de salud exitoso',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthResponse',
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
          success: { type: 'boolean', example: true },
          vehiculo: {
            type: 'object',
            properties: {
              marca: { type: 'string', example: 'Toyota' },
              modelo: { type: 'string', example: 'Corolla' },
              anio: { type: 'integer', example: 2020 },
              kilometraje: { type: 'integer', example: 45000 },
              tipo: { type: 'string', example: 'sedan' },
              estado_estetico: { type: 'string', example: 'good' },
            },
          },
          tasacion: {
            type: 'object',
            properties: {
              precio_estimado: { type: 'number', example: 15500 },
              precio_min: { type: 'number', example: 11722 },
              precio_max: { type: 'number', example: 19278 },
              moneda: { type: 'string', example: 'USD' },
              confianza: { type: 'number', example: 0.85 },
              confianza_porcentaje: { type: 'string', example: '85%' },
              origen_precio: {
                type: 'string',
                enum: ['modelo_ml', 'gemini_fallback'],
                example: 'modelo_ml',
              },
            },
          },
          metadatos: {
            type: 'object',
            properties: {
              tiempo_respuesta_ms: { type: 'number', example: 1250 },
              nota: {
                type: 'string',
                example: 'Precio calculado exitosamente con el modelo ML local.',
              },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'imagen_invalida' },
          status: { type: 'string', example: 'INVALID_ARGUMENT' },
          message: { type: 'string', example: 'No se ha proporcionado ninguna imagen del vehículo en el campo "imagen".' },
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
