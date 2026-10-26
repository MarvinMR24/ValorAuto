import { Router } from 'express';
import { tasarVehiculo } from '../controllers/tasacion.controller.js';
import { uploadTasacionMiddleware } from '../middlewares/upload.middleware.js';
import { validateTasacionBody } from '../middlewares/validation.middleware.js';
import { tasacionRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

/**
 * POST /tasacion
 * Endpoint principal de tasación.
 *
 * Flujo de ejecución seguro:
 * 1. tasacionRateLimiter: Limita a 10 req/min por IP (Anti-DDoS y protección de cuota Gemini).
 * 2. uploadTasacionMiddleware: Procesa multipart/form-data con Multer (máx 5 MB, JPG/PNG/WEBP).
 * 3. validateTasacionBody: Validación estricta con Zod (odometer 0..500000, buffer, tipo MIME).
 * 4. tasarVehiculo: Orquestación de Gemini Vision (con caché SHA-256), SQLite precalculado y métricas.
 */
router.post(
  '/tasacion',
  tasacionRateLimiter,
  uploadTasacionMiddleware,
  validateTasacionBody,
  tasarVehiculo
);

// Alias para cuando se monta como sub-ruta en '/tasacion' o '/'
router.post(
  '/',
  tasacionRateLimiter,
  uploadTasacionMiddleware,
  validateTasacionBody,
  tasarVehiculo
);

export default router;
