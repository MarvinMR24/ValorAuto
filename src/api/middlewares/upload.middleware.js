import multer from 'multer';
import { config } from '../config/config.js';

// Usamos almacenamiento en memoria (Buffer) para procesar directamente la imagen hacia Gemini
// sin dejar archivos residuales en disco (ideal para microservicios / contenedores sin estado).
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
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
    fileSize: config.upload.maxFileSizeBytes, // 8 MB (ADR-0001 / OpenSpec)
  },
  fileFilter,
});

/**
 * Middleware para procesar la subida multipart/form-data:
 * - Acepta el archivo de imagen en los campos 'imagen', 'image', 'photo' o 'file'.
 * - Controla límites de tamaño físico (8 MB) y tipos MIME.
 */
export const uploadTasacionMiddleware = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: 'imagen', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'foto', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploadFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'imagen_invalida',
          message: `La imagen excede el límite permitido de ${config.upload.maxFileSizeBytes / (1024 * 1024)} MB.`,
        });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          error: 'imagen_invalida',
          message: err.message,
        });
      }
      return res.status(400).json({
        success: false,
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
      files?.foto?.[0] ||
      files?.file?.[0] ||
      req.file;

    req.vehicleImage = file;
    next();
  });
};
