import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Intentar cargar .env desde src/api/.env y luego desde la raíz del repositorio
const localEnvPath = path.resolve(__dirname, '..', '.env');
const rootEnvPath = path.resolve(__dirname, '..', '..', '..', '.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

// Resolver ruta absoluta para data/precalc.db
const defaultDbPath = path.resolve(__dirname, '..', '..', '..', 'data', 'precalc.db');
const resolvedDbPath = process.env.DB_PATH
  ? path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.resolve(__dirname, '..', process.env.DB_PATH)
  : defaultDbPath;

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    confidenceThreshold: parseFloat(process.env.VISION_CONFIDENCE_THRESHOLD || '0.6'),
    timeoutMs: parseInt(process.env.VISION_TIMEOUT_MS || '25000', 10),
  },
  database: {
    path: resolvedDbPath,
    tableName: 'precalculated_prices',
    odometerRanges: [10000, 50000, 100000, 150000, 200000],
  },
  model: {
    // MAE reportado en la línea base de producción (docs/evidence/baseline-modelo.md)
    baselineMae: parseFloat(process.env.BASELINE_MAE || '3778'),
  },
  upload: {
    maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB según especificaciones de seguridad
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  },
  odometer: {
    min: 0,
    max: 500000, // Máximo 500,000 km
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // Máximo 10 peticiones por minuto por IP
  },
  cache: {
    maxItems: 500,
    ttlMs: 24 * 60 * 60 * 1000, // 24 horas
  },
};
