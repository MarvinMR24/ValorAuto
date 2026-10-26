import { geminiService } from '../services/gemini.service.js';
import { pricingService } from '../services/pricingService.js';
import { logger } from '../utils/logger.js';

/**
 * Consulta el precio precalculado y arma la respuesta 200/404 del contrato de
 * tasación (spec tasacion). La usan POST /tasacion (con datos de visión) y
 * POST /tasacion/datos (datos ingresados a mano, sin visión).
 */
export async function responderPrecio(res, {
  manufacturer,
  model,
  year,
  type = null,
  odometer,
  confidence = null,
  fromCache = false,
  visionDurationMs = 0,
  imageHash = null,
  requestStartTime = performance.now(),
}) {
  // 3. Consulta de precio mediante el servicio desacoplado de pricing (ADR-0003, ADR-0007)
  const priceResult = await pricingService.estimatePrice({
    manufacturer,
    model,
    year,
    type,
    odometer,
  });

  const totalDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
  const pricingDurationMs = priceResult?.pricingDurationMs ?? 0;

  // 404 Not Found: Combinación de vehículo no encontrada en SQLite o modelo
  if (!priceResult) {
    logger.info(
      {
        manufacturer,
        model,
        year,
        odometer,
        visionDurationMs,
        pricingDurationMs,
        totalDurationMs,
        fromCache,
      },
      '[TasacionController] Combinación no precalculada en SQLite (404)'
    );

    return res.status(404).json({
      error: 'combinacion_no_precalculada',
      message: `No se encontró una tasación precalculada para ${manufacturer} ${model} (${year}).`,
      vehiculo_identificado: {
        marca: manufacturer,
        modelo: model,
        anio: year,
        confianza: confidence,
      },
      _metricas: {
        duracion_total_ms: totalDurationMs,
        duracion_vision_ms: visionDurationMs,
        duracion_pricing_ms: pricingDurationMs,
        cache_hit: fromCache,
      },
    });
  }

  // Registro estructurado con métricas de cada fase en Pino
  logger.info(
    {
      marca: manufacturer,
      modelo: model,
      anio: year,
      odometer,
      precio_estimado: priceResult.precio_estimado,
      fuente: priceResult.fuente,
      metricas: {
        duracion_total_ms: totalDurationMs,
        duracion_vision_ms: visionDurationMs,
        duracion_pricing_ms: pricingDurationMs,
        cache_hit: fromCache,
        image_hash: imageHash,
      },
    },
    '[TasacionController] Tasación procesada con éxito'
  );

  // Cabeceras HTTP de observabilidad
  res.setHeader('X-Response-Time-Ms', totalDurationMs.toString());
  res.setHeader('X-Vision-Cache', fromCache ? 'HIT' : 'MISS');

  // 4. Respuesta exitosa (200 OK) respetando el contrato de spec.md
  return res.status(200).json({
    marca: manufacturer,
    modelo: model,
    anio: year,
    precio_estimado: priceResult.precio_estimado,
    precio_min: priceResult.precio_min,
    precio_max: priceResult.precio_max,
    rango_km_consultado: priceResult.rango_km,
    coincidencia: priceResult.coincidencia,
    confianza_vision: confidence,
    fuente_precio: priceResult.fuente,
    _metricas: {
      duracion_total_ms: totalDurationMs,
      duracion_vision_ms: visionDurationMs,
      duracion_pricing_ms: pricingDurationMs,
      cache_hit: fromCache,
    },
  });
}

/**
 * Controlador para la ruta POST /tasacion.
 * Orquesta la secuencia con observabilidad y logging estructurado:
 * 1. Validación de entrada (a cargo del middleware Zod).
 * 2. Identificación del vehículo con Gemini Vision + Caching SHA-256 (ADR-0004).
 * 3. Estimación de precio mediante PricingService + SQLite (ADR-0003, ADR-0007).
 * 4. Respuesta estructurada al cliente con métricas de latencia de cada fase.
 */
export async function tasarVehiculo(req, res, next) {
  const requestStartTime = performance.now();

  try {
    const file = req.vehicleImage;
    const odometer = req.odometer;

    // 1. Verificación defensiva de parámetros requeridos (400 Bad Request)
    if (!file || !file.buffer) {
      return res.status(400).json({
        error: 'imagen_invalida',
        message: 'No se ha proporcionado la imagen del vehículo.',
      });
    }

    if (odometer === undefined || odometer === null) {
      return res.status(400).json({
        error: 'kilometraje_invalido',
        message: 'El kilometraje es requerido.',
      });
    }

    // 2. Identificación del vehículo mediante Gemini Vision con Caching por Hash (ADR-0004)
    let visionResult;
    try {
      visionResult = await geminiService.identifyVehicle(file.buffer, file.mimetype);
    } catch (visionErr) {
      // 400: Gemini rechazó la imagen (INVALID_ARGUMENT), no tiene sentido reintentar
      if (visionErr.code === 'imagen_invalida') {
        return res.status(400).json({ error: 'imagen_invalida', message: visionErr.message });
      }

      // 422 Unprocessable Entity: El vehículo no fue reconocido o baja confianza
      if (
        visionErr.code === 'vehiculo_no_identificado' ||
        visionErr.code === 'vision_format_error'
      ) {
        logger.warn(
          { error: visionErr.message, code: visionErr.code },
          '[TasacionController] Vehículo no identificado por visión'
        );
        return res.status(422).json({
          error: visionErr.code,
          message:
            visionErr.message ||
            'No se pudo identificar el vehículo en la fotografía. Intenta con una imagen más clara y frontal.',
        });
      }

      // Si es error de disponibilidad o timeout de visión externa
      if (visionErr.statusCode === 503 || visionErr.code === 'vision_no_disponible') {
        logger.error(
          { error: visionErr.message },
          '[TasacionController] Servicio de visión externo no disponible'
        );
        return res.status(503).json({
          error: 'vision_no_disponible',
          message:
            visionErr.message ||
            'El servicio de visión no está disponible actualmente. Inténtalo de nuevo más tarde.',
        });
      }

      throw visionErr;
    }

    const {
      manufacturer,
      model,
      year,
      type,
      confidence,
      fromCache,
      visionDurationMs,
      imageHash,
    } = visionResult;

    // 3 y 4. Precio precalculado + respuesta 200/404 (compartido con POST /tasacion/datos)
    return await responderPrecio(res, {
      manufacturer,
      model,
      year,
      type,
      odometer,
      confidence,
      fromCache,
      visionDurationMs,
      imageHash,
      requestStartTime,
    });
  } catch (error) {
    const errorDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        durationMs: errorDurationMs,
      },
      '[TasacionController] Error no manejado en tasación'
    );

    return res.status(500).json({
      error: 'error_interno',
      message: 'Ocurrió un error inesperado al procesar la tasación.',
      detalle: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export default tasarVehiculo;

/**
 * Controlador de POST /tasacion/datos: flujo "Ingresar datos" de la app.
 * Mismo contrato de respuesta que POST /tasacion, sin llamada a Gemini.
 */
export async function tasarConDatos(req, res) {
  const requestStartTime = performance.now();
  try {
    const { marca, modelo, anio, kilometraje, tipo } = req.vehiculo;
    return await responderPrecio(res, {
      manufacturer: marca,
      model: modelo,
      year: anio,
      type: tipo ?? null,
      odometer: kilometraje,
      requestStartTime,
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, '[TasacionController] Error no manejado en tasación por datos');
    return res.status(500).json({
      error: 'error_interno',
      message: 'Ocurrió un error inesperado al procesar la tasación.',
    });
  }
}
