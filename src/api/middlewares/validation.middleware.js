import { z } from 'zod';
import { config } from '../config/config.js';

/**
 * Esquema de validación estricta con Zod para el endpoint POST /tasacion
 *
 * Reglas de negocio (ADR-0001 / OpenSpec):
 * - odometer / kilometraje: Entero positivo en el rango de 0 a 1,000,000 km.
 * - imagen: Archivo presente en memoria, tipo MIME permitido (JPG, PNG, WEBP) y tamaño <= 8 MB.
 */
export const tasacionInputSchema = z.object({
  odometer: z
    .number({
      required_error: 'El campo de kilometraje (odometer) es obligatorio.',
      invalid_type_error: 'El kilometraje debe ser un número entero.',
    })
    .int('El kilometraje debe ser un número entero.')
    .min(config.odometer.min, `El kilometraje debe ser mayor o igual a ${config.odometer.min}.`)
    .max(
      config.odometer.max,
      `El kilometraje debe ser coherente (máximo ${config.odometer.max.toLocaleString()} km).`
    ),
  file: z.object(
    {
      buffer: z.custom((val) => Buffer.isBuffer(val) && val.length > 0, {
        message: 'El búfer de la imagen es inválido o está vacío.',
      }),
      mimetype: z.enum(['image/jpeg', 'image/png', 'image/jpg', 'image/webp'], {
        errorMap: () => ({
          message: 'Formato de imagen no permitido. Solo se aceptan archivos JPG, PNG y WEBP.',
        }),
      }),
      size: z
        .number()
        .max(
          config.upload.maxFileSizeBytes,
          `La imagen excede el límite permitido de ${config.upload.maxFileSizeBytes / (1024 * 1024)} MB.`
        ),
    },
    {
      required_error: 'No se ha proporcionado ninguna imagen del vehículo.',
      invalid_type_error: 'No se ha proporcionado ninguna imagen del vehículo.',
    }
  ),
});

/**
 * Middleware que ejecuta la validación con Zod después de que Multer haya procesado el payload.
 */
export function validateTasacionBody(req, res, next) {
  // Identificar archivo desde los campos procesados por Multer
  const file = req.vehicleImage || req.file;

  // Extraer kilometraje soportando tanto 'kilometraje' como 'odometer'
  const rawOdometer = req.body?.kilometraje ?? req.body?.odometer;

  // Si no hay archivo
  if (!file) {
    return res.status(400).json({
      error: 'imagen_invalida',
      message: 'No se ha proporcionado ninguna imagen del vehículo.',
    });
  }

  // Si no hay kilometraje
  if (rawOdometer === undefined || rawOdometer === null || rawOdometer === '') {
    return res.status(400).json({
      error: 'kilometraje_invalido',
      message: 'El campo de kilometraje (odometer) es obligatorio.',
    });
  }

  const parsedOdometer = Number(rawOdometer);

  // Ejecutar validación con Zod
  const validationResult = tasacionInputSchema.safeParse({
    odometer: parsedOdometer,
    file: {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    },
  });

  if (!validationResult.success) {
    const issues = validationResult.error.issues;
    const odometerIssue = issues.find((i) => i.path.includes('odometer'));
    const fileIssue = issues.find((i) => i.path.includes('file'));

    if (odometerIssue) {
      return res.status(400).json({
        error: 'kilometraje_invalido',
        message: odometerIssue.message,
        detalles: issues,
      });
    }

    if (fileIssue) {
      return res.status(400).json({
        error: 'imagen_invalida',
        message: fileIssue.message,
        detalles: issues,
      });
    }

    return res.status(400).json({
      error: 'datos_invalidos',
      message: 'Los parámetros enviados no cumplen con el esquema de validación.',
      detalles: issues,
    });
  }

  // Asignar datos validados y transformados
  req.odometer = validationResult.data.odometer;
  req.vehicleImage = file;

  next();
}
