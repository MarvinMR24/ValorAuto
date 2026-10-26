import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * Configuración de Pino para Logging Estructurado en JSON
 * Permite observabilidad nativa para contenedores, CloudWatch, Datadog y GCP Cloud Logging.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: {
    service: 'valorauto-api',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Middleware HTTP para registro de solicitudes y respuestas con Pino
 */
export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      // Evitar sobrecargar logs con health checks frecuentes o documentación estática
      return req.url === '/health' && process.env.NODE_ENV !== 'development';
    },
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `HTTP ${req.method} ${req.url} finalizado con código ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `HTTP ${req.method} ${req.url} falló con código ${res.statusCode}: ${err.message}`;
  },
});

export default logger;
