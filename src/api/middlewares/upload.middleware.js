import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// Usamos almacenamiento en memoria (Buffer) para procesar directamente la imagen hacia Gemini
// sin dejar archivos residuales en disco (ideal para microservicios / contenedores sin estado).
const storage = multer.memoryStorage();

const MIME_POR_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const fileFilter = (req, file, cb) => {
  // Algunos clientes móviles (expo/fetch) pueden mandar la parte sin Content-Type:
  // en ese caso se deduce el tipo por la extensión del nombre de archivo.
  if (!file.mimetype || file.mimetype === 'application/octet-stream') {
    const extension = (file.originalname || '').split('.').pop()?.toLowerCase();
    file.mimetype = MIME_POR_EXTENSION[extension] || file.mimetype;
  }
  if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Formato de imagen no permitido. Solo se aceptan archivos JPG, PNG y WEBP.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes, // 5 MB
  },
  fileFilter,
});

/**
 * Middleware para procesar la subida multipart/form-data:
 * - Acepta el archivo de imagen en los campos 'imagen', 'image', 'photo' o 'file'.
 * - Controla límites de tamaño físico (5 MB) y tipos MIME.
 */
export const uploadTasacionMiddleware = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: 'imagen', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploadFields(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'imagen_invalida',
          message: `La imagen excede el límite permitido de ${config.upload.maxFileSizeBytes / (1024 * 1024)} MB.`,
        });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          error: 'imagen_invalida',
          message: err.message,
        });
      }
      return res.status(400).json({
        error: 'imagen_invalida',
        message: `Error al procesar el archivo: ${err.message}`,
      });
    }

    // Identificar el archivo subido en cualquiera de los campos posibles
    const files = req.files;
    const file =
      files?.imagen?.[0] ||
      files?.image?.[0] ||
      files?.photo?.[0] ||
      files?.file?.[0] ||
      req.file;

    if (file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
      const { buffer, mimetype } = await optimizeImageBuffer(file.buffer, file.mimetype);
      file.originalSize = file.size;
      file.buffer = buffer;
      file.mimetype = mimetype;
    }

    req.vehicleImage = file;
    next();
  });
};

/**
 * Optimiza la imagen en memoria antes de enviarla a Gemini (portado de la rama sam):
 * respeta la orientación EXIF, la reduce a IMAGE_MAX_DIMENSION px (800) por lado
 * sin agrandarla y la recomprime a JPEG (calidad IMAGE_JPEG_QUALITY, mozjpeg).
 * Unos pocos MB pasan a ~40-150 KB: menos latencia y la caché SHA-256 reconoce
 * la misma foto aunque llegue recomprimida. Si sharp no puede leer el buffer
 * (p. ej. un fixture de prueba), devuelve el original sin tocar.
 *
 * @param {Buffer} rawBuffer
 * @param {string} mimetype
 * @returns {Promise<{ buffer: Buffer, mimetype: string }>}
 */
export async function optimizeImageBuffer(rawBuffer, mimetype) {
  const opciones = config.upload.optimization;
  if (!opciones?.enabled || rawBuffer.length < 512) {
    return { buffer: rawBuffer, mimetype };
  }
  try {
    const buffer = await sharp(rawBuffer)
      .rotate()
      .resize({ width: opciones.maxDimension, height: opciones.maxDimension, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: opciones.jpegQuality, mozjpeg: true })
      .toBuffer();
    logger.debug(
      { originalBytes: rawBuffer.length, optimizedBytes: buffer.length },
      '[UploadMiddleware] Imagen optimizada para Gemini Vision'
    );
    return { buffer, mimetype: 'image/jpeg' };
  } catch {
    return { buffer: rawBuffer, mimetype };
  }
}
