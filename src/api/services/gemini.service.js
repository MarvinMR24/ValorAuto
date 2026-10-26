import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config.js';
import { cacheService } from './cacheService.js';
import { normalizeText, normalizeVehicleType } from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

export class GeminiVisionService {
  constructor() {
    this.apiKey = config.gemini.apiKey;
    this.modelName = config.gemini.model;
    this.confidenceThreshold = config.gemini.confidenceThreshold;
    this.timeoutMs = config.gemini.timeoutMs;
    this.cache = cacheService;

    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.ai = null;
    }
  }

  /**
   * Procesa la imagen del vehículo con Gemini Vision implementando caching por hash SHA-256.
   * ADR-0004: Gemini se usa EXCLUSIVAMENTE para clasificar marca, modelo y año.
   * NUNCA debe estimar precios.
   *
   * @param {Buffer} imageBuffer - Buffer de la imagen cargada
   * @param {string} mimeType - Formato MIME (ej: image/jpeg, image/png, image/webp)
   * @returns {Promise<{ manufacturer: string, model: string, year: number, type?: string, confidence: number, fromCache: boolean, visionDurationMs: number, imageHash: string }>}
   */
  async identifyVehicle(imageBuffer, mimeType = 'image/jpeg') {
    const startTime = performance.now();

    // 1. Cálculo del hash criptográfico SHA-256 para el sistema de caching
    const imageHash = this.cache.generateImageHash(imageBuffer);

    // 2. Comprobación en caché en memoria (LRU Cache)
    if (imageHash) {
      const cachedResult = this.cache.get(imageHash);
      if (cachedResult) {
        const cacheDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
        logger.info({ imageHash, durationMs: cacheDurationMs }, '[GeminiVision] Cache HIT: Extracción recuperada de memoria');
        return {
          ...cachedResult,
          fromCache: true,
          visionDurationMs: cacheDurationMs,
          imageHash,
        };
      }
    }

    // 3. Verificación de credenciales si hubo cache-miss
    if (!this.ai) {
      const err = new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
      err.code = 'vision_no_disponible';
      err.statusCode = 503;
      throw err;
    }

    const promptText = `
Actúa como un clasificador visual de vehículos para el sistema ValorAuto.
Analiza detenidamente la fotografía adjunta e identifica los atributos del automóvil.

REGLAS ESTRICTAS DE RESPUESTA:
1. Responde ÚNICAMENTE un objeto JSON válido, sin delimitadores adicionales de markdown ni texto introductorio.
2. Formato exacto requerido:
{
  "manufacturer": "marca en minúsculas (ej: toyota, ford, chevrolet, honda)",
  "model": "modelo en minúsculas (ej: corolla, civic, f-150, camry)",
  "year": 2018,
  "type": "tipo de carrocería en minúsculas si es evidente (ej: sedan, suv, truck, coupe, hatchback, van)",
  "confidence": 0.95
}
3. REGLA FUNDAMENTAL DE ARQUITECTURA (ADR-0004): NO calcules, predigas ni menciones precios bajo ninguna circunstancia. El precio es calculado exclusivamente por el modelo propio en la base de datos offline.
4. Si la imagen NO corresponde a un automóvil, es ilegible, borrosa o no es posible determinar la marca y modelo con suficiente certeza, asigna "confidence": 0.0 o valores null.
`.trim();

    const base64Image = imageBuffer.toString('base64');

    // Timeout configurable (REQ-001 / ADR-0004)
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error('Tiempo de espera agotado al consultar el servicio de visión.');
        error.code = 'vision_no_disponible';
        error.statusCode = 503;
        reject(error);
      }, this.timeoutMs);
      timer.unref?.();
    });

    const callPromise = (async () => {
      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Image,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const rawText = response.text || '';
        return this._parseAndValidateResponse(rawText);
      } catch (err) {
        if (err.code === 'vehiculo_no_identificado' || err.code === 'vision_format_error') {
          throw err;
        }

        const visionError = new Error(`Fallo en el servicio de visión: ${err.message}`);
        visionError.code = 'vision_no_disponible';
        visionError.statusCode = 503;
        throw visionError;
      }
    })();

    const result = await Promise.race([callPromise, timeoutPromise]);
    const visionDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Guardar en caché el resultado exitoso
    if (imageHash) {
      this.cache.set(imageHash, result);
      logger.info({ imageHash, durationMs: visionDurationMs }, '[GeminiVision] Cache MISS: Inferencia visual guardada en caché');
    }

    return {
      ...result,
      fromCache: false,
      visionDurationMs,
      imageHash,
    };
  }

  /**
   * Parsea y valida el JSON devuelto por Gemini.
   */
  _parseAndValidateResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      const err = new Error('La respuesta del modelo de visión fue vacía.');
      err.code = 'vision_format_error';
      err.statusCode = 422;
      throw err;
    }

    // Limpieza de bloques de código markdown si los hubiera
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const err = new Error('La respuesta del modelo de visión no contiene un JSON válido.');
      err.code = 'vision_format_error';
      err.statusCode = 422;
      throw err;
    }

    const { manufacturer, model, year, type, confidence } = parsed;

    // Validar presencia y tipos mínimos
    const confNumber = Number(confidence ?? 0);
    const yearNumber = Number(year ?? 0);

    if (
      !manufacturer ||
      !model ||
      !yearNumber ||
      Number.isNaN(yearNumber) ||
      Number.isNaN(confNumber)
    ) {
      const err = new Error('No se pudo identificar completamente la marca, modelo o año del vehículo.');
      err.code = 'vehiculo_no_identificado';
      err.statusCode = 422;
      throw err;
    }

    // Umbral de confianza exigido (0.6 según ADR-0004 / spec.md)
    if (confNumber < this.confidenceThreshold) {
      const err = new Error(
        `Confianza de identificación insuficiente (${confNumber.toFixed(2)} < ${this.confidenceThreshold}).`
      );
      err.code = 'vehiculo_no_identificado';
      err.statusCode = 422;
      throw err;
    }

    return {
      manufacturer: normalizeText(String(manufacturer)),
      model: normalizeText(String(model)),
      year: Math.round(yearNumber),
      type: normalizeVehicleType(type),
      confidence: confNumber,
    };
  }
}

export const geminiService = new GeminiVisionService();
export default geminiService;
