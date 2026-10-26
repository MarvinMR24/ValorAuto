import { geminiService } from '../services/gemini.service.js';
import { pricingService } from '../services/pricingService.js';
import { formatDisplayName } from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

/**
 * Controlador de Tasación (TasacionController).
 * Separa la lógica en dos métodos especializados:
 * 1. tasarPorTexto  -> POST /tasacion (application/json con el campo 'texto' o atributos estructurados)
 * 2. tasarPorImagen -> POST /tasacion/imagen (multipart/form-data con el campo 'imagen')
 */

/**
 * Método 1: Tasación basada en Texto (POST /tasacion).
 * Orquesta:
 * - Pre-validación sintáctica (validateTextTasacion middleware).
 * - Normalización semántica, corrección ortográfica y verificación de existencia con Gemini.
 * - Consulta al Modelo ML Local / Base Precalculada (data/precalc.db, ADR-0003 y ADR-0007).
 * - Respuesta JSON Estandarizada.
 */
export async function tasarPorTexto(req, res) {
  const requestStartTime = performance.now();

  try {
    const input = req.validatedInput || {
      texto: req.body?.texto || req.body?.text || '',
      marca: req.body?.marca || req.body?.vehiculo?.marca || '',
      modelo: req.body?.modelo || req.body?.vehiculo?.modelo || '',
      anio: req.body?.anio || req.body?.vehiculo?.anio,
      kilometraje:
        req.body?.kilometraje ??
        req.body?.odometer ??
        req.body?.vehiculo?.kilometraje ??
        (req.body?.texto ? 50000 : undefined),
      tipo: req.body?.tipo || req.body?.vehiculo?.tipo || '',
      estado_estetico: req.body?.estado_estetico || req.body?.vehiculo?.estado_estetico || '',
      descripcion: req.body?.descripcion || req.body?.texto || '',
    };

    if (
      !input.texto &&
      (input.kilometraje === undefined ||
        input.kilometraje === null ||
        Number.isNaN(Number(input.kilometraje)))
    ) {
      return res.status(400).json({
        success: false,
        error: 'kilometraje_invalido',
        message: 'El kilometraje debe ser un número entero entre 0 y 1,000,000.',
      });
    }

    // =========================================================================
    // FASE 2: Normalización, Corrección Ortográfica y Verificación con Gemini
    // =========================================================================
    let geminiResult;
    try {
      geminiResult = await geminiService.normalizeAndValidateVehicleText(input);
    } catch (geminiErr) {
      if (geminiErr.statusCode === 400 || geminiErr.status === 'INVALID_ARGUMENT') {
        logger.warn(
          { error: geminiErr.message, code: geminiErr.code },
          '[TasacionController] Argumento inválido en tasación por texto (400)'
        );
        return res.status(400).json({
          success: false,
          error: geminiErr.code || 'datos_invalidos',
          status: 'INVALID_ARGUMENT',
          message: geminiErr.message || 'Los datos enviados no son válidos.',
        });
      }

      if (
        geminiErr.code === 'vehiculo_no_identificado' ||
        geminiErr.code === 'vision_format_error'
      ) {
        logger.warn(
          { error: geminiErr.message, code: geminiErr.code },
          '[TasacionController] Vehículo no identificado por Gemini (422)'
        );
        return res.status(422).json({
          success: false,
          error: geminiErr.code,
          message:
            geminiErr.message ||
            'No se pudo verificar el vehículo ingresado. Por favor ingresa una marca y modelo reconocibles.',
        });
      }

      if (geminiErr.statusCode === 503 || geminiErr.code === 'vision_no_disponible') {
        logger.error(
          { error: geminiErr.message },
          '[TasacionController] Servicio de Gemini no disponible (503)'
        );
        return res.status(503).json({
          success: false,
          error: 'vision_no_disponible',
          message:
            geminiErr.message ||
            'El servicio de verificación de vehículos no está disponible temporalmente.',
        });
      }

      throw geminiErr;
    }

    // Si Gemini determinó que el auto NO existe en el mercado real o es irreconocible
    if (
      !geminiResult.existe_vehiculo ||
      !geminiResult.es_reconocible ||
      geminiResult.confidence < 0.60
    ) {
      logger.warn(
        { input, motivo: geminiResult.motivo_rechazo },
        '[TasacionController] Vehículo rechazado por inexistencia en el mercado (422)'
      );
      return res.status(422).json({
        success: false,
        error: 'vehiculo_no_identificado',
        message:
          geminiResult.motivo_rechazo ||
          'El vehículo ingresado no existe en el mercado automotriz o no pudo ser reconocido como un modelo real.',
        detalles: {
          correcciones_aplicadas: geminiResult.correcciones_aplicadas,
          confianza: geminiResult.confidence,
        },
      });
    }

    const {
      marca,
      manufacturer_key,
      modelo,
      model_key,
      anio,
      kilometraje: geminiKm,
      tipo,
      estado_estetico,
    } = geminiResult.vehiculo;

    const kilometraje = Number(input.kilometraje ?? geminiKm ?? 50000);

    // =========================================================================
    // FASE 3: Consulta al Modelo ML Local / Base Precalculada (data/precalc.db)
    // =========================================================================
    const priceResult = await pricingService.estimatePrice({
      manufacturer: manufacturer_key || marca,
      model: model_key || modelo,
      year: anio,
      type: tipo,
      condition: estado_estetico,
      odometer: kilometraje,
    });

    const totalDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
    const pricingDurationMs = priceResult?.pricingDurationMs ?? 0;
    const geminiDurationMs = geminiResult?.durationMs ?? 0;

    // Si no está precalculado en la base de datos (ADR-0003)
    if (!priceResult) {
      return res.status(404).json({
        success: false,
        error: 'combinacion_no_precalculada',
        message: `No se encontró una tasación precalculada para ${marca} ${modelo} (${anio}).`,
        vehiculo_identificado: {
          marca,
          modelo,
          anio,
          tipo,
          confianza: geminiResult.confidence,
        },
      });
    }

    logger.info(
      {
        modo: 'texto',
        vehiculo: { marca, modelo, anio, kilometraje, tipo, estado_estetico },
        tasacion: {
          precio_estimado: priceResult.precio_estimado,
          confianza: priceResult.confianza,
          origen_precio: priceResult.origen_precio,
        },
        metricas: {
          tiempo_respuesta_ms: totalDurationMs,
          duracion_gemini_ms: geminiDurationMs,
          duracion_pricing_ms: pricingDurationMs,
          cache_hit: Boolean(geminiResult.fromCache),
        },
      },
      '[TasacionController] Tasación por texto completada exitosamente'
    );

    res.setHeader('X-Response-Time-Ms', totalDurationMs.toString());
    res.setHeader('X-Gemini-Cache', geminiResult.fromCache ? 'HIT' : 'MISS');
    res.setHeader('X-Pricing-Origin', priceResult.origen_precio);

    return res.status(200).json({
      success: true,
      veredicto: 'vehiculo_valido_y_tasado',
      correcciones_ia: geminiResult.correcciones_aplicadas,
      vehiculo: {
        marca,
        modelo,
        anio,
        kilometraje,
        tipo,
        estado_estetico,
      },
      tasacion: {
        precio_estimado: priceResult.precio_estimado,
        precio_min: priceResult.precio_min,
        precio_max: priceResult.precio_max,
        moneda: priceResult.moneda || 'USD',
        confianza: priceResult.confianza,
        confianza_porcentaje: priceResult.confianza_porcentaje,
        origen_precio: priceResult.origen_precio,
      },
      metadatos: {
        tiempo_respuesta_ms: totalDurationMs,
        nota: priceResult.nota,
        confianza_normalizacion: geminiResult.confidence,
        correcciones_aplicadas: geminiResult.correcciones_aplicadas,
        rango_km_consultado: priceResult.rango_km,
        cache_hit: Boolean(geminiResult.fromCache),
        desglose_tiempos_ms: {
          gemini_ms: geminiDurationMs,
          pricing_ms: pricingDurationMs,
        },
      },
      marca,
      modelo,
      anio,
      precio_estimado: priceResult.precio_estimado,
      precio_min: priceResult.precio_min,
      precio_max: priceResult.precio_max,
      rango_km_consultado: priceResult.rango_km,
      confianza_normalizacion: geminiResult.confidence,
      fuente_precio: priceResult.origen_precio,
      _metricas: {
        duracion_total_ms: totalDurationMs,
        duracion_gemini_ms: geminiDurationMs,
        duracion_pricing_ms: pricingDurationMs,
        cache_hit: Boolean(geminiResult.fromCache),
      },
    });
  } catch (error) {
    const errorDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
    logger.error(
      { error: error.message, stack: error.stack, durationMs: errorDurationMs },
      '[TasacionController] Error no manejado en tasarPorTexto'
    );

    return res.status(500).json({
      success: false,
      error: 'error_interno',
      message: 'Ocurrió un error inesperado al procesar la tasación por texto.',
      detalle: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * Método 2: Tasación basada en Visión / Imagen (POST /tasacion/imagen).
 * Orquesta:
 * - Validación estricta de presencia de la imagen en la petición (campo 'imagen').
 * - Reconocimiento visual con Gemini Vision (limpieza base64, validación exacta de mimeType y control de errores 400 vs 429/503).
 * - Consulta al Modelo ML Local / Base Precalculada (data/precalc.db).
 * - Respuesta JSON Estandarizada.
 */
export async function tasarPorImagen(req, res) {
  const requestStartTime = performance.now();

  try {
    // 1. Validar que la imagen esté presente en la petición
    const file =
      req.vehicleImage ||
      req.file ||
      req.files?.imagen?.[0] ||
      req.files?.image?.[0] ||
      req.files?.photo?.[0] ||
      req.files?.foto?.[0] ||
      req.files?.file?.[0];

    const base64BodyImage =
      typeof req.body?.imagen === 'string' && req.body.imagen.trim().length > 0
        ? req.body.imagen.trim()
        : null;

    if ((!file || !file.buffer || file.buffer.length === 0) && !base64BodyImage) {
      return res.status(400).json({
        success: false,
        error: 'imagen_invalida',
        message: 'No se ha proporcionado ninguna imagen del vehículo en el campo "imagen".',
      });
    }

    // 2. Validar kilometraje si fue enviado (opcional en /tasacion/imagen; por defecto 50,000 km)
    const rawOdometer = req.body?.kilometraje ?? req.body?.odometer ?? req.odometer;
    let kilometraje = 50000;

    if (rawOdometer !== undefined && rawOdometer !== null && rawOdometer !== '') {
      const parsedKm = Number(rawOdometer);
      if (
        Number.isNaN(parsedKm) ||
        !Number.isFinite(parsedKm) ||
        parsedKm < 0 ||
        parsedKm > 1000000
      ) {
        return res.status(400).json({
          success: false,
          error: 'kilometraje_invalido',
          message: 'El kilometraje debe ser un número entero entre 0 y 1,000,000.',
        });
      }
      kilometraje = Math.round(parsedKm);
    }

    const imageInput = file ? file.buffer : base64BodyImage;
    const mimeType = file?.mimetype || req.body?.mimeType || 'image/jpeg';

    // 3. Reconocimiento de Vehículo con Gemini Vision (ADR-0004)
    let visionResult;
    try {
      visionResult = await geminiService.identifyVehicle(imageInput, mimeType);
    } catch (visionErr) {
      // Si Gemini o la validación arroja error 400 / INVALID_ARGUMENT, devolver 400 claro al cliente
      if (
        visionErr.statusCode === 400 ||
        visionErr.status === 'INVALID_ARGUMENT' ||
        visionErr.code === 'imagen_invalida'
      ) {
        logger.warn(
          { error: visionErr.message, status: visionErr.status || 400 },
          '[TasacionController] Imagen rechazada con 400 INVALID_ARGUMENT'
        );
        return res.status(400).json({
          success: false,
          error: 'imagen_invalida',
          status: 'INVALID_ARGUMENT',
          message:
            visionErr.message ||
            'La imagen enviada no es válida o su formato no es compatible con Gemini Vision.',
        });
      }

      if (
        visionErr.code === 'vehiculo_no_identificado' ||
        visionErr.code === 'vision_format_error' ||
        visionErr.statusCode === 422
      ) {
        logger.warn(
          { error: visionErr.message, code: visionErr.code },
          '[TasacionController] Vehículo no identificado en la imagen (422)'
        );
        return res.status(422).json({
          success: false,
          error: visionErr.code || 'vehiculo_no_identificado',
          message:
            visionErr.message ||
            'No se pudo identificar un vehículo válido en la imagen proporcionada.',
        });
      }

      if (visionErr.statusCode === 503 || visionErr.code === 'vision_no_disponible') {
        logger.error(
          { error: visionErr.message },
          '[TasacionController] Servicio de Gemini Vision no disponible (503)'
        );
        return res.status(503).json({
          success: false,
          error: 'vision_no_disponible',
          message:
            visionErr.message ||
            'El servicio de visión por computadora no está disponible temporalmente.',
        });
      }

      throw visionErr;
    }

    const marca = formatDisplayName(visionResult.manufacturer);
    const modelo = formatDisplayName(visionResult.model);
    const anio = visionResult.year;
    const tipo = visionResult.type || 'sedan';
    const estado_estetico = visionResult.condition || 'good';

    // 4. Consulta al Modelo ML Local / Base Precalculada (data/precalc.db)
    const priceResult = await pricingService.estimatePrice({
      manufacturer: visionResult.manufacturer,
      model: visionResult.model,
      year: anio,
      type: tipo,
      condition: estado_estetico,
      odometer: kilometraje,
    });

    const totalDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
    const pricingDurationMs = priceResult?.pricingDurationMs ?? 0;
    const visionDurationMs = visionResult?.visionDurationMs ?? 0;

    if (!priceResult) {
      return res.status(404).json({
        success: false,
        error: 'combinacion_no_precalculada',
        message: `No se encontró una tasación precalculada para ${marca} ${modelo} (${anio}).`,
        vehiculo_identificado: {
          marca,
          modelo,
          anio,
          tipo,
          confianza_visual: visionResult.confidence,
        },
      });
    }

    logger.info(
      {
        modo: 'imagen',
        vehiculo: { marca, modelo, anio, kilometraje, tipo, estado_estetico },
        tasacion: {
          precio_estimado: priceResult.precio_estimado,
          confianza: priceResult.confianza,
          origen_precio: priceResult.origen_precio,
        },
        metricas: {
          tiempo_respuesta_ms: totalDurationMs,
          duracion_vision_ms: visionDurationMs,
          duracion_pricing_ms: pricingDurationMs,
          cache_hit: Boolean(visionResult.fromCache),
        },
      },
      '[TasacionController] Tasación por imagen completada exitosamente'
    );

    res.setHeader('X-Response-Time-Ms', totalDurationMs.toString());
    res.setHeader('X-Gemini-Cache', visionResult.fromCache ? 'HIT' : 'MISS');
    res.setHeader('X-Pricing-Origin', priceResult.origen_precio);

    return res.status(200).json({
      success: true,
      veredicto: 'vehiculo_valido_y_tasado',
      correcciones_ia: [],
      vehiculo: {
        marca,
        modelo,
        anio,
        kilometraje,
        tipo,
        estado_estetico,
      },
      tasacion: {
        precio_estimado: priceResult.precio_estimado,
        precio_min: priceResult.precio_min,
        precio_max: priceResult.precio_max,
        moneda: priceResult.moneda || 'USD',
        confianza: priceResult.confianza,
        confianza_porcentaje: priceResult.confianza_porcentaje,
        origen_precio: priceResult.origen_precio,
      },
      metadatos: {
        tiempo_respuesta_ms: totalDurationMs,
        nota: priceResult.nota,
        confianza_visual: visionResult.confidence,
        rango_km_consultado: priceResult.rango_km,
        image_hash: visionResult.imageHash,
        cache_hit: Boolean(visionResult.fromCache),
        desglose_tiempos_ms: {
          vision_ms: visionDurationMs,
          pricing_ms: pricingDurationMs,
        },
      },
      marca,
      modelo,
      anio,
      precio_estimado: priceResult.precio_estimado,
      precio_min: priceResult.precio_min,
      precio_max: priceResult.precio_max,
      rango_km_consultado: priceResult.rango_km,
      confianza_visual: visionResult.confidence,
      fuente_precio: priceResult.origen_precio,
      _metricas: {
        duracion_total_ms: totalDurationMs,
        duracion_vision_ms: visionDurationMs,
        duracion_pricing_ms: pricingDurationMs,
        cache_hit: Boolean(visionResult.fromCache),
      },
    });
  } catch (error) {
    const errorDurationMs = Math.round((performance.now() - requestStartTime) * 100) / 100;
    logger.error(
      { error: error.message, stack: error.stack, durationMs: errorDurationMs },
      '[TasacionController] Error no manejado en tasarPorImagen'
    );

    return res.status(500).json({
      success: false,
      error: 'error_interno',
      message: 'Ocurrió un error inesperado al procesar la tasación por imagen.',
      detalle: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export const TasacionController = {
  tasarPorTexto,
  tasarPorImagen,
};

// Alias por retrocompatibilidad
export const tasarVehiculo = tasarPorTexto;

export default TasacionController;
