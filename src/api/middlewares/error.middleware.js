/**
 * Middleware para rutas no encontradas (404)
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'recurso_no_encontrado',
    message: `La ruta ${req.method} ${req.originalUrl} no existe en este servidor.`,
  });
}

/**
 * Middleware global de manejo de errores (500)
 */
export function globalErrorHandler(err, req, res, next) {
  console.error('[ErrorGlobal]', err);

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'error_interno';

  res.status(statusCode).json({
    error: errorCode,
    message: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
