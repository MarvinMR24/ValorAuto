import { z } from 'zod';
import { config } from '../config/config.js';

/**
 * Esquema de validación estricta con Zod para el endpoint POST /tasacion
 *
 * Reglas de negocio:
 * - odometer: Entero positivo coherente entre 0 y 500,000 km.
 * - imagen: Archivo presente, tipo MIME permitido (JPG, PNG, WEBP) y tamaño <= 5 MB.
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

/**
 * Middleware para POST /identificar: solo valida la imagen (sin kilometraje).
 */
export function validateImagenSolo(req, res, next) {
  const file = req.vehicleImage || req.file;
  if (!file) {
    return res.status(400).json({
      error: 'imagen_invalida',
      message: 'No se ha proporcionado ninguna imagen del vehículo.',
    });
  }
  const result = tasacionInputSchema.shape.file.safeParse({
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
  });
  if (!result.success) {
    return res.status(400).json({
      error: 'imagen_invalida',
      message: result.error.issues[0]?.message || 'La imagen no es válida.',
      detalles: result.error.issues,
    });
  }
  req.vehicleImage = file;
  next();
}

const textoRequerido = (campo) =>
  z.string({ message: `El campo ${campo} es obligatorio.` }).trim().min(1, `El campo ${campo} es obligatorio.`).max(60);

const anioActual = new Date().getFullYear() + 1;

/**
 * Esquema de POST /tasacion/datos (flujo "Ingresar datos" de la app).
 * Mismos límites de kilometraje que POST /tasacion.
 */
export const tasacionDatosSchema = z.object({
  marca: textoRequerido('marca'),
  modelo: textoRequerido('modelo'),
  anio: z.coerce
    .number({ message: 'El año debe ser un número entero.' })
    .int('El año debe ser un número entero.')
    .min(1900, 'El año no es válido.')
    .max(anioActual, 'El año no es válido.'),
  kilometraje: tasacionInputSchema.shape.odometer,
  tipo: z.string().trim().max(30).optional().nullable(),
});

export function validateTasacionDatos(req, res, next) {
  const body = req.body || {};
  const parsed = tasacionDatosSchema.safeParse({
    ...body,
    kilometraje:
      body.kilometraje === undefined || body.kilometraje === null || body.kilometraje === ''
        ? undefined
        : Number(body.kilometraje),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = issue?.path?.[0];
    return res.status(400).json({
      error: campo === 'kilometraje' ? 'kilometraje_invalido' : 'datos_invalidos',
      message: issue?.message || 'Los datos del vehículo no son válidos.',
      campo,
      detalles: parsed.error.issues,
    });
  }
  req.vehiculo = parsed.data;
  next();
}

/**
 * Query de GET /revision: marca, modelo y año.
 */
export function validateRevisionQuery(req, res, next) {
  const parsed = tasacionDatosSchema.pick({ marca: true, modelo: true, anio: true }).safeParse(req.query || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: 'datos_invalidos',
      message: issue?.message || 'Se requieren marca, modelo y año.',
      campo: issue?.path?.[0],
    });
  }
  req.vehiculo = parsed.data;
  next();
}
