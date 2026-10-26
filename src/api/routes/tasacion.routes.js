import { Router } from 'express';
import { tasarPorTexto, tasarPorImagen } from '../controllers/tasacion.controller.js';
import { validateTextTasacion } from '../middlewares/validateTextTasacion.middleware.js';
import { uploadTasacionMiddleware } from '../middlewares/upload.middleware.js';
import { tasacionRateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

/**
 * @swagger
 * /tasacion:
 *   post:
 *     tags:
 *       - Tasación por Texto
 *     summary: Tasar vehículo mediante texto libre o JSON estructurado
 *     description: >
 *       Recibe un payload JSON (`application/json`) con el campo `texto` describiendo el vehículo
 *       (ej. `"Toyota Corolla 2020 con 45000 km"`), normaliza los atributos con Gemini y consulta
 *       el precio precalculado en SQLite (`data/precalc.db`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - texto
 *             properties:
 *               texto:
 *                 type: string
 *                 example: "Toyota Corolla 2020 con 45000 km en excelente estado"
 *                 description: Descripción en texto del vehículo a tasar
 *               kilometraje:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 1000000
 *                 example: 45000
 *                 description: Kilometraje opcional si ya no está incluido en el texto
 *     responses:
 *       200:
 *         description: Tasación por texto calculada exitosamente
 *       400:
 *         description: Datos de entrada inválidos o kilometraje fuera de rango
 *       404:
 *         description: Combinación de vehículo no precalculada en la base de datos
 *       422:
 *         description: Vehículo inexistente o no reconocible en el mercado automotriz
 *       429:
 *         description: Límite de peticiones por minuto excedido (Rate Limiting)
 */
router.post(
  '/tasacion',
  tasacionRateLimiter,
  validateTextTasacion,
  tasarPorTexto
);

/**
 * @swagger
 * /tasacion/imagen:
 *   post:
 *     tags:
 *       - Tasación por Imagen (Visión)
 *     summary: Tasar vehículo a partir de una fotografía (Gemini Vision)
 *     description: >
 *       Recibe un formulario `multipart/form-data` con el archivo en el campo `imagen`
 *       (JPG, PNG o WEBP) y opcionalmente el `kilometraje`. Identifica marca, modelo,
 *       año, carrocería y estado estético mediante Gemini Vision y consulta el precio en SQLite.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - imagen
 *             properties:
 *               imagen:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen del vehículo (JPG, PNG o WEBP, máx. 8 MB)
 *               kilometraje:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 1000000
 *                 example: 45000
 *                 description: Kilometraje actual del vehículo en km (opcional, por defecto 50,000 km)
 *     responses:
 *       200:
 *         description: Tasación por imagen calculada exitosamente
 *       400:
 *         description: Falta la imagen, formato MIME inválido o error 400 INVALID_ARGUMENT
 *       404:
 *         description: Combinación de vehículo no precalculada en la base de datos
 *       422:
 *         description: No se pudo identificar un vehículo en la imagen o confianza visual insuficiente
 *       429:
 *         description: Límite de peticiones por minuto excedido (Rate Limiting)
 */
router.post(
  '/tasacion/imagen',
  tasacionRateLimiter,
  uploadTasacionMiddleware,
  tasarPorImagen
);

// Alias para cuando el router se monta directamente sobre '/tasacion'
router.post(
  '/',
  tasacionRateLimiter,
  validateTextTasacion,
  tasarPorTexto
);

router.post(
  '/imagen',
  tasacionRateLimiter,
  uploadTasacionMiddleware,
  tasarPorImagen
);

export default router;
