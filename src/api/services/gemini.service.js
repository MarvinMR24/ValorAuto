import dns from 'node:dns';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config.js';
import { cacheService } from './cacheService.js';
import { optimizeImageBuffer } from '../middlewares/upload.middleware.js';
import {
  normalizeManufacturer,
  normalizeText,
  normalizeVehicleType,
  normalizeCondition,
} from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

// Forzar resolución IPv4 primero en Windows/Bun para evitar demoras de 20-40s por timeouts de IPv6 hacia googleapis.com
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Prompt conciso de baja latencia para clasificación visual (ADR-0004: sin estimación de precios)
const SYSTEM_PROMPT = `Clasifica el automóvil de la imagen y responde ÚNICAMENTE un JSON válido:
{"manufacturer":"marca en minúsculas","model":"modelo en minúsculas","year":2020,"type":"sedan|suv|truck|coupe|hatchback|van|wagon|convertible","condition":"excellent|like new|good|fair|salvage","confidence":0.95}
Reglas: "year" entero de 4 dígitos. PROHIBIDO calcular o mencionar precios (ADR-0004). Si no es un auto, usa "confidence":0.0.`;

const VALID_GEMINI_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export class GeminiVisionService {
  constructor() {
    this.apiKey = config.geminiApiKey;
    this.modelName = config.geminiModel;
    this.confidenceThreshold = config.gemini.confidenceThreshold;
    this.timeoutMs = config.gemini.timeoutMs;
    this.cache = cacheService;

    if (config.geminiApiKey) {
      // Desactivar los reintentos ocultos del SDK (attempts: 1) para controlar explícitamente 400 vs 429/503
      this.ai = new GoogleGenAI({
        apiKey: config.geminiApiKey,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
    } else {
      this.ai = null;
    }
  }

  /**
   * Detecta el tipo MIME real inspeccionando los magic bytes (cabecera binaria) del Buffer.
   *
   * @param {Buffer} buf
   * @returns {string|null}
   */
  _detectMimeTypeFromMagicBytes(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return null;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return 'image/png';
    }

    // WEBP: "RIFF" (0..3) + "WEBP" (8..11)
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return 'image/webp';
    }

    return null;
  }

  /**
   * Limpia el buffer o string base64 eliminando prefijos Data URI ("data:image/...;base64,")
   * y espacios o saltos de línea.
   *
   * @param {Buffer|string} imageInput
   * @returns {{ cleanBase64: string, binaryBuffer: Buffer, extractedMimeType: string|null }}
   */
  _cleanImageBase64(imageInput) {
    if (!imageInput) {
      const err = new Error('No se proporcionó ninguna imagen para analizar.');
      err.code = 'imagen_invalida';
      err.status = 'INVALID_ARGUMENT';
      err.statusCode = 400;
      throw err;
    }

    let extractedMimeType = null;
    let cleanBase64 = '';
    let binaryBuffer = null;

    if (Buffer.isBuffer(imageInput)) {
      if (imageInput.length === 0) {
        const err = new Error('El búfer de la imagen está vacío (0 bytes).');
        err.code = 'imagen_invalida';
        err.status = 'INVALID_ARGUMENT';
        err.statusCode = 400;
        throw err;
      }

      // Verificar si el Buffer contiene texto con prefijo Data URI ("data:image/...;base64,...")
      const preview = imageInput.subarray(0, 64).toString('utf8').trim();
      const dataUriMatch = preview.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);

      if (dataUriMatch) {
        extractedMimeType = dataUriMatch[1].toLowerCase();
        const rawStr = imageInput.toString('utf8').trim();
        cleanBase64 = rawStr
          .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
          .replace(/\s+/g, '');
        binaryBuffer = Buffer.from(cleanBase64, 'base64');
      } else {
        binaryBuffer = imageInput;
        cleanBase64 = imageInput
          .toString('base64')
          .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
          .replace(/\s+/g, '');
      }
    } else if (typeof imageInput === 'string') {
      const trimmed = imageInput.trim();
      const dataUriMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
      if (dataUriMatch) {
        extractedMimeType = dataUriMatch[1].toLowerCase();
      }
      cleanBase64 = trimmed
        .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '')
        .replace(/\s+/g, '');

      if (!cleanBase64) {
        const err = new Error('La cadena base64 de la imagen está vacía.');
        err.code = 'imagen_invalida';
        err.status = 'INVALID_ARGUMENT';
        err.statusCode = 400;
        throw err;
      }
      binaryBuffer = Buffer.from(cleanBase64, 'base64');
    } else {
      const err = new Error('Formato de imagen inválido. Se esperaba un Buffer o cadena base64.');
      err.code = 'imagen_invalida';
      err.status = 'INVALID_ARGUMENT';
      err.statusCode = 400;
      throw err;
    }

    if (!cleanBase64 || cleanBase64.length < 8) {
      const err = new Error('El contenido base64 de la imagen es inválido.');
      err.code = 'imagen_invalida';
      err.status = 'INVALID_ARGUMENT';
      err.statusCode = 400;
      throw err;
    }

    return { cleanBase64, binaryBuffer, extractedMimeType };
  }

  /**
   * Valida y normaliza el mimeType exacto de la imagen subida.
   *
   * @param {string} mimeType
   * @param {Buffer} binaryBuffer
   * @param {string|null} extractedMimeType
   * @returns {string}
   */
  _validateAndNormalizeMimeType(mimeType, binaryBuffer, extractedMimeType = null) {
    let resolvedMime = String(mimeType || extractedMimeType || '').toLowerCase().trim();

    // Normalizar 'image/jpg' o 'image/pjpeg' al estándar IANA 'image/jpeg' requerido por Gemini
    if (resolvedMime === 'image/jpg' || resolvedMime === 'image/pjpeg') {
      resolvedMime = 'image/jpeg';
    }

    // Detectar MIME real por magic bytes si está disponible
    const magicMime = this._detectMimeTypeFromMagicBytes(binaryBuffer);

    if (!resolvedMime && magicMime) {
      resolvedMime = magicMime;
    }

    if (!resolvedMime || !VALID_GEMINI_IMAGE_MIMES.has(resolvedMime)) {
      const err = new Error(
        `Formato MIME de imagen inválido o no soportado ("${mimeType || 'desconocido'}"). Solo se aceptan: image/jpeg, image/png, image/webp.`
      );
      err.code = 'imagen_invalida';
      err.status = 'INVALID_ARGUMENT';
      err.statusCode = 400;
      throw err;
    }

    // Si los magic bytes revelan otro formato de imagen válido distinto al declarado, usar el real para evitar 400 en Gemini
    if (magicMime && VALID_GEMINI_IMAGE_MIMES.has(magicMime) && magicMime !== resolvedMime) {
      logger.warn(
        { declaredMime: resolvedMime, actualMime: magicMime },
        '[GeminiVision] El mimeType declarado difiere de la firma binaria; usando el mimeType real de la imagen'
      );
      resolvedMime = magicMime;
    }

    return resolvedMime;
  }

  /**
   * Determina si un error devuelto por la API de Gemini es un error de cliente 400 o INVALID_ARGUMENT.
   * Estos errores JAMÁS deben reintentarse.
   */
  _isBadRequestOrInvalidArgument(err) {
    if (!err) return false;
    const status = err.status || err.code;
    const statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : null);
    const msg = String(err.message || '');

    return (
      statusCode === 400 ||
      status === 400 ||
      status === 'INVALID_ARGUMENT' ||
      err.code === 'INVALID_ARGUMENT' ||
      msg.includes('INVALID_ARGUMENT') ||
      msg.includes('"code":400') ||
      msg.includes('"code": 400') ||
      msg.includes('status: 400')
    );
  }

  /**
   * Determina si un error de la API de Gemini amerita reintento (ÚNICAMENTE 429 o 503).
   */
  _isRetryableError(err) {
    if (!err) return false;
    if (this._isBadRequestOrInvalidArgument(err)) return false;

    const status = err.status || err.code;
    const statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : null);
    const msg = String(err.message || '');

    return (
      statusCode === 429 ||
      statusCode === 503 ||
      status === 429 ||
      status === 503 ||
      status === 'RESOURCE_EXHAUSTED' ||
      status === 'UNAVAILABLE' ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('UNAVAILABLE')
    );
  }

  /**
   * FASE 1: Reconocimiento de Vehículo con Gemini Vision (ADR-0004).
   * Extrae marca, modelo, año sugerido, tipo de carrocería y estado estético estimado,
   * aplicando limpieza de base64, validación exacta de mimeType, normalización y caching por hash SHA-256.
   *
   * @param {Buffer|string} imageBuffer - Buffer o base64 de la imagen cargada
   * @param {string} mimeType - Formato MIME (ej: image/jpeg, image/png, image/webp)
   * @returns {Promise<{ manufacturer: string, model: string, year: number, type: string|null, condition: string, confidence: number, fromCache: boolean, visionDurationMs: number, imageHash: string }>}
   */
  async identifyVehicle(imageBuffer, mimeType = 'image/jpeg') {
    const startTime = performance.now();

    // 1. Limpiar base64 (remover "data:image/...;base64," si existe) y validar mimeType exacto
    const { binaryBuffer, extractedMimeType } = this._cleanImageBase64(imageBuffer);
    const validatedMimeType = this._validateAndNormalizeMimeType(
      mimeType,
      binaryBuffer,
      extractedMimeType
    );

    // 2. Optimizar buffer en memoria (redimensionar a máx 800px y comprimir JPEG) para reducir latencia a < 3s
    const { optimizedBuffer, optimizedMimeType } = await optimizeImageBuffer(
      binaryBuffer,
      validatedMimeType
    );

    // 3. Cálculo del hash criptográfico SHA-256 para el sistema de caching
    const imageHash = this.cache.generateImageHash(binaryBuffer);

    // 4. Comprobación en caché en memoria (LRU Cache)
    if (imageHash) {
      const cachedResult = this.cache.get(imageHash);
      if (cachedResult) {
        const cacheDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
        logger.info(
          { imageHash, durationMs: cacheDurationMs },
          '[GeminiVision] Cache HIT: Extracción visual recuperada de memoria'
        );
        return {
          ...cachedResult,
          fromCache: true,
          visionDurationMs: cacheDurationMs,
          imageHash,
        };
      }
    }

    // 5. Verificación de credenciales en vivo (SIN modo demo ni datos simulados - ADR-0004)
    if (!this.ai && config.geminiApiKey) {
      this.ai = new GoogleGenAI({
        apiKey: config.geminiApiKey,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
    }

    if (!this.ai) {
      const err = new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
      err.code = 'vision_no_disponible';
      err.statusCode = 503;
      throw err;
    }

    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        const error = new Error('Tiempo de espera agotado al consultar el servicio de visión.');
        error.code = 'vision_no_disponible';
        error.statusCode = 503;
        reject(error);
      }, this.timeoutMs);
      timerId.unref?.();
    });

    const callPromise = (async () => {
      const primaryModel = config.geminiModel;
      const highQuotaModels =
        primaryModel === 'gemini-3.1-flash-lite'
          ? ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']
          : [primaryModel, 'gemini-3.1-flash-lite'];

      let lastErr = null;

      for (const modelToUse of highQuotaModels) {
        try {
          // OPTIMIZACIÓN 1: Prohibido descomponer la imagen como texto en el prompt.
          // Se envía exclusivamente como objeto multimodal nativo inlineData dentro de contents.
          const response = await this.ai.models.generateContent({
            model: modelToUse,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: optimizedMimeType,
                      data: optimizedBuffer.toString('base64'),
                    },
                  },
                  { text: SYSTEM_PROMPT },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: config.gemini.temperature ?? 0.1,
              maxOutputTokens: config.gemini.maxOutputTokens ?? 200,
            },
          });

          const rawText = response.text || '';
          return this._parseAndValidateResponse(rawText);
        } catch (err) {
          // Errores de validación de dominio interno (422): no reintentar
          if (err.code === 'vehiculo_no_identificado' || err.code === 'vision_format_error') {
            throw err;
          }

          // REGLA ESTRICTA: Si Gemini responde con 400 o status "INVALID_ARGUMENT", NO reintentar jamás
          if (this._isBadRequestOrInvalidArgument(err)) {
            logger.warn(
              {
                model: modelToUse,
                status: err.status || 400,
                mimeType: validatedMimeType,
                error: err.message,
              },
              '[GeminiVision] Error 400 / INVALID_ARGUMENT en Gemini Vision. No se reintenta la petición.'
            );
            const clientError = new Error(
              'La imagen enviada fue rechazada por la API de visión (400 INVALID_ARGUMENT). Verifica que el archivo sea una imagen JPG, PNG o WEBP válida y no esté corrupta.'
            );
            clientError.code = 'imagen_invalida';
            clientError.status = 'INVALID_ARGUMENT';
            clientError.statusCode = 400;
            clientError.details = err.message;
            throw clientError;
          }

          // Solo aplicar reintentos cuando el error es 429 (Rate Limit) o 503 (Service Unavailable)
          if (!this._isRetryableError(err)) {
            logger.error(
              {
                model: modelToUse,
                status: err.status || err.statusCode,
                error: err.message,
              },
              '[GeminiVision] Error no recuperable en Gemini Vision. Abortando sin reintentos.'
            );
            const fatalError = new Error(`Error al consultar Gemini Vision: ${err.message}`);
            fatalError.code = 'vision_no_disponible';
            fatalError.statusCode = err.statusCode || 502;
            throw fatalError;
          }

          lastErr = err;
          logger.warn(
            {
              model: modelToUse,
              status: err.status || err.statusCode,
              error: err.message,
            },
            `[GeminiVision] Fallo temporal 429/503 en (${modelToUse}); reintentando con modelo de respaldo`
          );
        }
      }

      const visionError = new Error(
        `Fallo temporal en el servicio de visión (429/503): ${lastErr?.message || 'Servicio saturado'}`
      );
      visionError.code = 'vision_no_disponible';
      visionError.statusCode = 503;
      throw visionError;
    })();

    let result;
    try {
      result = await Promise.race([callPromise, timeoutPromise]);
    } finally {
      if (timerId) {
        clearTimeout(timerId);
      }
    }

    const visionDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Guardar en caché el resultado exitoso
    if (imageHash) {
      this.cache.set(imageHash, result);
      logger.info(
        { imageHash, model: config.geminiModel, durationMs: visionDurationMs },
        '[GeminiVision] Cache MISS: Inferencia visual guardada en caché'
      );
    }

    return {
      ...result,
      fromCache: false,
      visionDurationMs,
      imageHash,
    };
  }

  /**
   * Parsea, valida y normaliza el JSON de identificación devuelto por Gemini en la Fase 1.
   */
  _parseAndValidateResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      const err = new Error('La respuesta del modelo de visión fue vacía.');
      err.code = 'vision_format_error';
      err.statusCode = 422;
      throw err;
    }

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

    if (Array.isArray(parsed)) {
      parsed = parsed[0] || {};
    }

    const { manufacturer, model, year, type, condition, confidence } = parsed;

    const confNumber = Number(confidence ?? 0);
    let yearNumber = Number(year ?? 0);
    if (Number.isNaN(yearNumber) && typeof year === 'string') {
      const yearMatch = year.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) {
        yearNumber = Number(yearMatch[1]);
      }
    }

    if (
      !manufacturer ||
      !model ||
      !yearNumber ||
      Number.isNaN(yearNumber) ||
      Number.isNaN(confNumber)
    ) {
      const err = new Error('No se pudo identificar completamente la marca, modelo o año del vehículo en la imagen.');
      err.code = 'vehiculo_no_identificado';
      err.statusCode = 422;
      throw err;
    }

    if (confNumber < this.confidenceThreshold) {
      const err = new Error(
        `Confianza de identificación visual insuficiente (${confNumber.toFixed(2)} < ${this.confidenceThreshold}).`
      );
      err.code = 'vehiculo_no_identificado';
      err.statusCode = 422;
      throw err;
    }

    return {
      manufacturer: normalizeManufacturer(String(manufacturer)),
      model: normalizeText(String(model)),
      year: Math.round(yearNumber),
      type: normalizeVehicleType(type),
      condition: normalizeCondition(condition),
      confidence: confNumber,
    };
  }

  /**
   * Normaliza, corrige ortografía y verifica la existencia real de un vehículo ingresado por texto (JSON).
   * Cumple con ADR-0004 (Gemini NUNCA estima precios) y ADR-0009 (mapeo a categorías del dataset).
   *
   * @param {Object} inputData - Datos validados del vehículo ({ texto, marca, modelo, anio, kilometraje, tipo, estado_estetico, descripcion })
   */
  async normalizeAndValidateVehicleText(inputData) {
    const startTime = performance.now();

    const cacheKey = `norm_text:${String(inputData.texto || '').toLowerCase().trim()}:${String(inputData.marca || '').toLowerCase().trim()}:${String(inputData.modelo || '').toLowerCase().trim()}:${inputData.anio || ''}:${String(inputData.tipo || '').toLowerCase().trim()}:${String(inputData.estado_estetico || '').toLowerCase().trim()}:${String(inputData.descripcion || '').toLowerCase().trim()}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      const cacheDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
      logger.info({ cacheKey, durationMs: cacheDurationMs }, '[GeminiText] Cache HIT: Normalización recuperada de memoria');
      return {
        ...cached,
        fromCache: true,
        durationMs: cacheDurationMs,
      };
    }

    if (!this.ai && config.geminiApiKey) {
      this.ai = new GoogleGenAI({
        apiKey: config.geminiApiKey,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
    }

    if (!this.ai) {
      const err = new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
      err.code = 'vision_no_disponible';
      err.statusCode = 503;
      throw err;
    }

    const currentYear = new Date().getFullYear();

    const promptText = `
Actúa como un validador y normalizador automotriz experto para el sistema ValorAuto.
Analiza los datos o el texto de un vehículo ingresados por el usuario y determina si el vehículo existe en la realidad comercial, corrige su ortografía, extrae o reubica sus atributos y estandariza los valores al vocabulario oficial del dataset.

DATOS PROPORCIONADOS POR EL USUARIO:
- Texto libre ("texto"): "${inputData.texto || ''}"
- Marca: "${inputData.marca || ''}"
- Modelo: "${inputData.modelo || ''}"
- Año sugerido: ${inputData.anio ? inputData.anio : 'no especificado'}
- Kilometraje sugerido: ${inputData.kilometraje !== undefined && inputData.kilometraje !== null ? inputData.kilometraje : 'no especificado'}
- Tipo de carrocería sugerido: "${inputData.tipo || ''}"
- Estado estético sugerido: "${inputData.estado_estetico || ''}"
- Descripción adicional: "${inputData.descripcion || ''}"

REGLAS DE PROCESAMIENTO:
1. EXTRACCIÓN Y CORRECCIÓN ORTOGRÁFICA: Extrae marca, modelo, año y kilometraje desde el campo "texto" o desde los campos individuales. Corrige errores de digitación (ej: "Toyotta" -> "Toyota", "Corola" -> "Corolla", "Chebrolet" -> "Chevrolet", "Volskwagen" -> "Volkswagen", "sedán" -> "sedan", "excelente" -> "excellent"). Registra cada cambio realizado en la lista "correcciones_aplicadas".
2. REUBICACIÓN DE DATOS: Si el usuario colocó el modelo en el campo de marca o incluyó todo dentro de "texto" (ej: "Toyotta Corola 2020 45000 km sedan"), extrae y coloca cada valor en su propiedad correspondiente.
3. MAPEO DE CATEGORÍAS OFICIALES (ADR-0009):
   - "tipo": Debe pertenecer estrictamente a: ["sedan", "suv", "truck", "hatchback", "coupe", "wagon", "van", "pickup", "convertible", "other"]. Si el usuario no lo especificó, dedúcelo con base en el modelo real del auto (ej. Toyota Corolla -> "sedan", Toyota RAV4 -> "suv", Ford F-150 -> "truck", Honda Civic -> "sedan", Volkswagen Golf -> "hatchback").
   - "estado_estetico": Debe pertenecer estrictamente a: ["new", "like new", "excellent", "good", "fair", "salvage"]. Si no se especificó o es ambiguo, asigna por defecto "good".
4. AÑO DEL VEHÍCULO: Debe ser un número entero de 4 dígitos entre 1980 y ${currentYear + 1}. Si el usuario no especificó año, usa 2018 como año representativo por defecto.
5. VERIFICACIÓN DE EXISTENCIA: Comprueba si la combinación de marca y modelo realmente existe o existió en el mercado automotriz real.
   - Si el auto es inventado (ej: "Toyota Pepito", "Ford Pikachu", "Chevrolet Batman"), o el texto no corresponde a un automóvil comercial real, establece "existe_vehiculo": false, "es_reconocible": false, y detalla en "motivo_rechazo" la razón del rechazo.
   - Si el vehículo sí existe comercialmente, establece "existe_vehiculo": true y "es_reconocible": true.
6. REGLA FUNDAMENTAL DE ARQUITECTURA (ADR-0004): NO calcules, predigas, estimes, sugieras ni menciones precios bajo ninguna circunstancia.

REGLAS ESTRICTAS DE RESPUESTA:
Responde ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "existe_vehiculo": true,
  "es_reconocible": true,
  "confidence": 0.95,
  "correcciones_aplicadas": ["Se corrigió 'Corola' a 'Corolla'"],
  "motivo_rechazo": null,
  "vehiculo": {
    "marca": "Toyota",
    "manufacturer_key": "toyota",
    "modelo": "Corolla",
    "model_key": "corolla",
    "anio": 2020,
    "kilometraje": 45000,
    "tipo": "sedan",
    "estado_estetico": "excellent"
  }
}
`.trim();

    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        const error = new Error('Tiempo de espera agotado al consultar el servicio de Gemini.');
        error.code = 'vision_no_disponible';
        error.statusCode = 503;
        reject(error);
      }, this.timeoutMs);
      timerId.unref?.();
    });

    const callPromise = (async () => {
      const primaryModel = config.geminiModel;
      const modelsToTry = [primaryModel];
      if (primaryModel !== 'gemini-3.5-flash-lite') {
        modelsToTry.push('gemini-3.5-flash-lite');
      }
      if (primaryModel !== 'gemini-3.1-flash-lite' && !modelsToTry.includes('gemini-3.1-flash-lite')) {
        modelsToTry.push('gemini-3.1-flash-lite');
      }

      let lastErr = null;
      for (const modelToUse of modelsToTry) {
        try {
          const response = await this.ai.models.generateContent({
            model: modelToUse,
            contents: [
              {
                role: 'user',
                parts: [{ text: promptText }],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const rawText = response.text || '';
          return this._parseAndValidateTextResponse(rawText, inputData);
        } catch (err) {
          if (err.code === 'vehiculo_no_identificado' || err.code === 'vision_format_error') {
            throw err;
          }

          // NO reintentar si Gemini devuelve 400 o INVALID_ARGUMENT
          if (this._isBadRequestOrInvalidArgument(err)) {
            logger.warn(
              { model: modelToUse, status: err.status || 400, error: err.message },
              '[GeminiText] Error 400 / INVALID_ARGUMENT recibido de Gemini. Abortando sin reintentos.'
            );
            const clientErr = new Error(
              'Los parámetros de texto enviados fueron rechazados por la API de Gemini (400 INVALID_ARGUMENT).'
            );
            clientErr.code = 'datos_invalidos';
            clientErr.status = 'INVALID_ARGUMENT';
            clientErr.statusCode = 400;
            throw clientErr;
          }

          // Solo reintentar en caso de error 429 o 503
          if (!this._isRetryableError(err)) {
            logger.error(
              { model: modelToUse, status: err.status || err.statusCode, error: err.message },
              '[GeminiText] Error no recuperable en Gemini. Abortando sin reintentos.'
            );
            const fatalErr = new Error(`Fallo en el servicio de normalización de Gemini: ${err.message}`);
            fatalErr.code = 'vision_no_disponible';
            fatalErr.statusCode = err.statusCode || 502;
            throw fatalErr;
          }

          lastErr = err;
          logger.warn(
            { model: modelToUse, error: err.message },
            `[GeminiText] Fallo temporal 429/503 en modelo ${modelToUse}; reintentando...`
          );
        }
      }

      const visionError = new Error(`Fallo en el servicio de normalización de Gemini: ${lastErr?.message || 'Error desconocido'}`);
      visionError.code = 'vision_no_disponible';
      visionError.statusCode = 503;
      throw visionError;
    })();

    let result;
    try {
      result = await Promise.race([callPromise, timeoutPromise]);
    } finally {
      if (timerId) clearTimeout(timerId);
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    this.cache.set(cacheKey, result);

    return {
      ...result,
      fromCache: false,
      durationMs,
    };
  }

  /**
   * Parsea y valida el JSON devuelto por Gemini para la normalización textual.
   */
  _parseAndValidateTextResponse(rawText, inputData) {
    if (!rawText || typeof rawText !== 'string') {
      const err = new Error('La respuesta de Gemini fue vacía.');
      err.code = 'vision_format_error';
      err.statusCode = 422;
      throw err;
    }

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
      const err = new Error('La respuesta del modelo no contiene un JSON válido.');
      err.code = 'vision_format_error';
      err.statusCode = 422;
      throw err;
    }

    if (Array.isArray(parsed)) {
      parsed = parsed[0] || {};
    }

    const existeVehiculo = Boolean(parsed.existe_vehiculo !== false && parsed.es_reconocible !== false);
    const confidence = Math.min(1.0, Math.max(0.0, Number(parsed.confidence ?? 0.85)));
    const correcciones = Array.isArray(parsed.correcciones_aplicadas) ? parsed.correcciones_aplicadas : [];
    const motivoRechazo = parsed.motivo_rechazo || (existeVehiculo ? null : 'El vehículo ingresado no existe en el mercado automotriz.');

    const veh = parsed.vehiculo || {};
    const marcaRaw = veh.marca || inputData.marca || 'desconocido';
    const modeloRaw = veh.modelo || inputData.modelo || 'desconocido';

    let anioParsed = Number(veh.anio || inputData.anio || 2018);
    if (Number.isNaN(anioParsed)) {
      anioParsed = 2018;
    }

    let kmParsed = Number(inputData.kilometraje ?? veh.kilometraje ?? 50000);
    if (Number.isNaN(kmParsed) || kmParsed < 0) {
      kmParsed = 50000;
    }

    return {
      existe_vehiculo: existeVehiculo,
      es_reconocible: Boolean(parsed.es_reconocible !== false),
      confidence,
      correcciones_aplicadas: correcciones,
      motivo_rechazo: motivoRechazo,
      vehiculo: {
        marca: String(marcaRaw).trim(),
        manufacturer_key: normalizeManufacturer(veh.manufacturer_key || marcaRaw),
        modelo: String(modeloRaw).trim(),
        model_key: normalizeText(veh.model_key || modeloRaw),
        anio: Math.round(anioParsed),
        kilometraje: Math.round(kmParsed),
        tipo: normalizeVehicleType(veh.tipo || inputData.tipo || 'sedan'),
        estado_estetico: normalizeCondition(veh.estado_estetico || inputData.estado_estetico || 'good'),
      },
    };
  }
}

export const geminiService = new GeminiVisionService();
export default geminiService;
