const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { checkDatabaseHealth, buscarTasacion } = require('./db');
const { identificarVehiculo } = require('./services/geminiService');

const app = express();

app.use(cors());
app.use(express.json());

// Configuración de Multer: en memoria, máximo 8MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024 // 8 MB
  }
});

// ----------------------------------------------------
// Healthchecks: Liveness & Readiness
// ----------------------------------------------------

// Liveness: verifica que el proceso Node.js responde
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness: verifica que la base de datos precalculada existe y tiene registros
app.get('/ready', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.connected && dbHealth.records > 0) {
    return res.status(200).json({
      status: 'ready',
      database: dbHealth
    });
  }
  return res.status(503).json({
    status: 'unavailable',
    database: dbHealth,
    error: 'La base de datos precalculada no está disponible o no tiene registros'
  });
});

// ----------------------------------------------------
// Endpoint Core: POST /tasacion
// ----------------------------------------------------
app.post('/tasacion', (req, res) => {
  upload.single('foto')(req, res, async (err) => {
    // 1. Validación de multer (límite de tamaño u otros)
    if (err) {
      return res.status(400).json({
        error: 'imagen_invalida',
        detalle: 'La imagen excede el límite máximo de 8MB o el formato es incorrecto'
      });
    }

    const file = req.file;
    const kilometrajeRaw = req.body.kilometraje;

    // 2. Validación de presencia y formato de imagen
    if (!file) {
      return res.status(400).json({
        error: 'imagen_invalida',
        detalle: 'Se requiere una imagen en el campo "foto"'
      });
    }

    const mimeValido = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype);
    if (!mimeValido) {
      return res.status(400).json({
        error: 'imagen_invalida',
        detalle: 'Solo se permiten imágenes en formato JPG o PNG'
      });
    }

    // 3. Validación de kilometraje: entero entre 0 y 1,000,000
    if (kilometrajeRaw === undefined || kilometrajeRaw === null || kilometrajeRaw === '') {
      return res.status(400).json({
        error: 'kilometraje_invalido',
        detalle: 'El campo "kilometraje" es obligatorio'
      });
    }

    const km = Number(kilometrajeRaw);
    if (!Number.isInteger(km) || km < 0 || km > 1000000) {
      return res.status(400).json({
        error: 'kilometraje_invalido',
        detalle: 'El kilometraje debe ser un número entero entre 0 y 1,000,000'
      });
    }

    // 4. Inferencia de visión con Gemini
    let visionResult;
    try {
      // Soporte para mock en tests vía header
      const mockHeader = req.headers['x-mock-vision'];
      const mockResult = mockHeader ? JSON.parse(mockHeader) : null;

      visionResult = await identificarVehiculo(file.buffer, file.mimetype, mockResult);
    } catch (error) {
      if (error.message === 'VISION_FORMAT_ERROR') {
        return res.status(422).json({
          error: 'vision_format_error',
          detalle: 'La respuesta del modelo de visión no cumple el esquema esperado'
        });
      }
      return res.status(503).json({
        error: 'vision_no_disponible',
        detalle: 'El servicio de visión no está disponible en este momento'
      });
    }

    // 5. Validar umbral de confianza y campos de visión
    const { marca, modelo, anio, confianza } = visionResult || {};
    const confianzaMinima = 0.6;

    if (!marca || !modelo || !anio || typeof confianza !== 'number' || confianza < confianzaMinima) {
      return res.status(422).json({
        error: 'vehiculo_no_identificado',
        detalle: 'No fue posible identificar con suficiente confianza el vehículo en la fotografía'
      });
    }

    // 6. Consultar base de datos precalculada
    const tasacion = await buscarTasacion(marca, modelo, Number(anio), km);

    if (!tasacion) {
      return res.status(404).json({
        error: 'combinacion_no_precalculada',
        vehiculo_identificado: { marca, modelo, anio, kilometraje: km },
        detalle: 'No se encontró un precio precalculado para esta combinación de vehículo y kilometraje'
      });
    }

    // 7. Respuesta exitosa (200 OK)
    return res.status(200).json({
      marca: tasacion.marca,
      modelo: tasacion.modelo,
      anio: tasacion.anio,
      odometer: tasacion.odometer,
      precio_estimado: tasacion.precio_estimado,
      precio_min: tasacion.precio_min,
      precio_max: tasacion.precio_max
    });
  });
});

module.exports = app;
