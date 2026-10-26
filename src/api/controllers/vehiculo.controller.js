import { geminiService } from '../services/gemini.service.js';
import { sqliteService } from '../services/sqlite.service.js';
import { logger } from '../utils/logger.js';

/**
 * GET /catalogo: marcas, modelos por marca y rango de años de precalc.db,
 * para los selectores del formulario de la app.
 */
export async function obtenerCatalogo(req, res) {
  try {
    const catalogo = await sqliteService.getCatalog();
    if (!catalogo) {
      return res.status(503).json({
        error: 'catalogo_no_disponible',
        message: 'La base precalculada no está disponible todavía.',
      });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(catalogo);
  } catch (error) {
    logger.error({ error: error.message }, '[VehiculoController] Error al armar el catálogo');
    return res.status(500).json({ error: 'error_interno', message: 'No se pudo obtener el catálogo.' });
  }
}

/**
 * POST /identificar: solo visión (sin precio). La app la usa en el flujo
 * "Usar una foto" para prellenar el formulario, que el usuario puede corregir.
 * Mismos errores 422/503 que POST /tasacion.
 */
export async function identificarVehiculo(req, res) {
  try {
    const vision = await geminiService.identifyVehicle(req.vehicleImage.buffer, req.vehicleImage.mimetype);
    res.setHeader('X-Vision-Cache', vision.fromCache ? 'HIT' : 'MISS');
    return res.status(200).json({
      marca: vision.manufacturer,
      modelo: vision.model,
      anio: vision.year,
      tipo: vision.type ?? null,
      confianza: vision.confidence,
    });
  } catch (err) {
    if (err.code === 'vehiculo_no_identificado' || err.code === 'vision_format_error') {
      return res.status(422).json({
        error: err.code,
        message: err.message || 'No se pudo identificar el vehículo en la fotografía.',
      });
    }
    if (err.statusCode === 503 || err.code === 'vision_no_disponible') {
      logger.error({ error: err.message }, '[VehiculoController] Servicio de visión no disponible');
      return res.status(503).json({
        error: 'vision_no_disponible',
        message: 'El servicio de visión no está disponible actualmente. Inténtalo de nuevo más tarde.',
      });
    }
    logger.error({ error: err.message, stack: err.stack }, '[VehiculoController] Error no manejado en identificación');
    return res.status(500).json({ error: 'error_interno', message: 'Ocurrió un error inesperado al identificar el vehículo.' });
  }
}

/**
 * GET /revision: fallas comunes y puntos a revisar primero (ADR-0011).
 * Siempre responde 200: si Gemini falla, el servicio devuelve el checklist genérico.
 */
export async function obtenerRevision(req, res) {
  const { marca, modelo, anio } = req.vehiculo;
  const revision = await geminiService.generateInspectionTips({ marca, modelo, anio });
  return res.status(200).json({ marca, modelo, anio, ...revision });
}
