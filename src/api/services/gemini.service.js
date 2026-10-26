import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config.js';
import { cacheService } from './cacheService.js';
import { normalizeText, normalizeVehicleType } from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';
import { REVISION_GENERICA } from './revisionGenerica.js';
import { LRUCache } from 'lru-cache';

export class GeminiVisionService {
  constructor() {
    this.apiKey = config.gemini.apiKey;
    this.modelName = config.gemini.model;
    this.confidenceThreshold = config.gemini.confidenceThreshold;
    this.timeoutMs = config.gemini.timeoutMs;
    this.cache = cacheService;
    this.tipsCache = new LRUCache({ max: 500, ttl: config.cache?.ttlMs || 24 * 60 * 60 * 1000 });

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
   * Genera fallas comunes y puntos a revisar primero para un vehículo (ADR-0011).
   * Solo texto, sin imagen. Gemini NUNCA da precios (ADR-0004).
   * Resultado cacheado por marca|modelo|año. Ante cualquier falla devuelve el
   * checklist genérico (REVISION_GENERICA) con fuente 'generico': nunca lanza.
   *
   * @param {{ marca: string, modelo: string, anio: number }} vehiculo
   * @returns {Promise<{ fallas_comunes: Array<{titulo: string, detalle: string, severidad: string}>, revisar_primero: Array<{titulo: string, detalle: string}>, fuente: 'gemini' | 'generico' }>}
   */
  async generateInspectionTips({ marca, modelo, anio }) {
    const key = `${normalizeText(String(marca))}|${normalizeText(String(modelo))}|${Number(anio)}`;
    const cached = this.tipsCache.get(key);
    if (cached) return cached;

    const generico = { ...REVISION_GENERICA, fuente: 'generico' };
    if (!this.ai) return generico;

    const promptText = `
Eres un mecánico experto en autos usados que asesora a compradores para el sistema ValorAuto.
Vehículo: ${marca} ${modelo} ${anio}.

Responde ÚNICAMENTE un objeto JSON válido, en español, con este formato exacto:
{
  "fallas_comunes": [{"titulo": "texto corto", "detalle": "1-2 frases", "severidad": "alta|media|baja"}],
  "revisar_primero": [{"titulo": "texto corto", "detalle": "1-2 frases"}]
}

REGLAS:
1. "fallas_comunes": hasta 5 fallas conocidas y reportadas de ESTE modelo y generación, ordenadas de más a menos grave.
2. "revisar_primero": hasta 5 cosas a inspeccionar con prioridad al comprar este modelo usado, ordenadas por prioridad.
3. NO menciones precios, valores de mercado ni recomendaciones de compra (ADR-0004).
4. Si no conoces fallas específicas de este modelo, da las más típicas de su tipo y época, sin inventar datos técnicos precisos.
`.trim();

    try {
      const response = await this._withTimeout(
        this.ai.models.generateContent({
          model: this.modelName,
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        })
      );
      const tips = this._parseInspectionTips(response.text || '');
      const result = { ...tips, fuente: 'gemini' };
      this.tipsCache.set(key, result);
      return result;
    } catch (err) {
      logger.warn({ error: err.message, vehiculo: key }, '[GeminiVision] Revisión no disponible, se usa checklist genérico');
      return generico;
    }
  }

  _withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs);
        timer.unref?.();
      }),
    ]);
  }

  _parseInspectionTips(rawText) {
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    const severidades = new Set(['alta', 'media', 'baja']);
    const texto = (v) => (typeof v === 'string' ? v.trim() : '');
    const fallas = (Array.isArray(parsed.fallas_comunes) ? parsed.fallas_comunes : [])
      .map((f) => ({
        titulo: texto(f?.titulo),
        detalle: texto(f?.detalle),
        severidad: severidades.has(texto(f?.severidad).toLowerCase()) ? texto(f.severidad).toLowerCase() : 'media',
      }))
      .filter((f) => f.titulo)
      .slice(0, 5);
    const revisar = (Array.isArray(parsed.revisar_primero) ? parsed.revisar_primero : [])
      .map((r) => ({ titulo: texto(r?.titulo), detalle: texto(r?.detalle) }))
      .filter((r) => r.titulo)
      .slice(0, 5);
    if (fallas.length === 0 && revisar.length === 0) {
      throw new Error('Respuesta de revisión vacía o fuera de esquema');
    }
    return { fallas_comunes: fallas, revisar_primero: revisar };
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
