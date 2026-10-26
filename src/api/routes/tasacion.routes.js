import { Router } from 'express';
import { tasarVehiculo, tasarConDatos } from '../controllers/tasacion.controller.js';
import { obtenerCatalogo, identificarVehiculo, obtenerRevision } from '../controllers/vehiculo.controller.js';
import { uploadTasacionMiddleware } from '../middlewares/upload.middleware.js';
import {
  validateTasacionBody,
  validateImagenSolo,
  validateTasacionDatos,
  validateRevisionQuery,
} from '../middlewares/validation.middleware.js';
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

/**
 * Endpoints de la app (change app-dos-flujos-tasacion):
 * - POST /tasacion/datos: flujo "Ingresar datos" (JSON, sin Gemini, sin rate limit).
 * - POST /identificar: flujo "Usar una foto", solo visión para prellenar el formulario.
 * - GET /catalogo: marcas/modelos/años para los selectores.
 * - GET /revision: fallas comunes y puntos a revisar (Gemini texto o checklist genérico).
 * Los que pueden llamar a Gemini comparten el rate limit de /tasacion (cuota de Gemini).
 */
router.post('/tasacion/datos', validateTasacionDatos, tasarConDatos);
router.post('/identificar', tasacionRateLimiter, uploadTasacionMiddleware, validateImagenSolo, identificarVehiculo);
router.get('/catalogo', obtenerCatalogo);
router.get('/revision', tasacionRateLimiter, validateRevisionQuery, obtenerRevision);

// Alias para cuando se monta como sub-ruta en '/tasacion' o '/'
router.post(
  '/',
  tasacionRateLimiter,
  uploadTasacionMiddleware,
  validateTasacionBody,
  tasarVehiculo
);

export default router;
