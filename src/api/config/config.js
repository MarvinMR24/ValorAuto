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
  dotenv.config({ path: localEnvPath, override: true });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
} else {
  dotenv.config({ override: true });
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
  get geminiApiKey() {
    return (process.env.GEMINI_API_KEY || '').trim();
  },
  get geminiModel() {
    return (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim();
  },
  gemini: {
    get apiKey() {
      return (process.env.GEMINI_API_KEY || '').trim();
    },
    get model() {
      return (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim();
    },
    confidenceThreshold: parseFloat(process.env.VISION_CONFIDENCE_THRESHOLD || '0.6'),
    timeoutMs: parseInt(process.env.VISION_TIMEOUT_MS || '45000', 10),
  },
  database: {
    path: resolvedDbPath,
    tableName: 'precalculated_prices',
    odometerRanges: [10000, 50000, 100000, 150000, 200000],
  },
  model: {
    name: 'Pipeline_XGBoost_Tuned_Depth9',
    registryName: 'ValorAuto_Model',
    // Umbral de confianza del 65% para decidir entre modelo_ml y gemini_fallback (si ALLOW_GEMINI_FALLBACK=true)
    mlConfidenceThreshold: parseFloat(process.env.ML_CONFIDENCE_THRESHOLD || '0.65'),
    // Por defecto false para cumplir estrictamente ADR-0003 y ADR-0004 (404 combinacion_no_precalculada sin inferencia en vivo)
    allowGeminiFallback: process.env.ALLOW_GEMINI_FALLBACK === 'true',
    // R2 score del modelo XGBoost en producción (docs/evidence/baseline-modelo.md)
    productionR2: parseFloat(process.env.MODEL_R2_SCORE || '0.8482'),
    // MAE reportado del modelo en producción (USD)
    baselineMae: parseFloat(process.env.BASELINE_MAE || '3778'),
  },
  upload: {
    maxFileSizeBytes: 8 * 1024 * 1024, // 8 MB según contrato OpenSpec y ADR-0001
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  },
  odometer: {
    min: 0,
    max: 1000000, // Rango válido: 0 a 1,000,000 km según contrato OpenSpec
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
