import rateLimit from 'express-rate-limit';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware de Rate Limiting para proteger el endpoint POST /tasacion
 * Limita a un máximo de 10 peticiones por minuto por dirección IP
 * para salvaguardar la cuota de la API de Google Gemini y evitar abusos.
 */
export const tasacionRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 60,000 ms (1 minuto)
  max: config.rateLimit.max, // 10 solicitudes
  standardHeaders: true, // Devuelve cabeceras `RateLimit-*` del estándar IETF
  legacyHeaders: false, // Desactiva cabeceras `X-RateLimit-*` obsoletas
  statusCode: 429,
  message: {
    error: 'limite_excedido',
    message: 'Has superado el límite de 10 peticiones por minuto. Por favor espera antes de volver a consultar.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      ip: req.ip,
      path: req.originalUrl,
      limit: options.max,
    }, 'Tasa de peticiones excedida en /tasacion');
    res.status(options.statusCode).json(options.message);
  },
  // Omitir en entorno de pruebas para no trabar tests concurrentes o de carga
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-ratelimit'],
});

export default tasacionRateLimiter;
