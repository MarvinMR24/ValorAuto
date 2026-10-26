import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { config } from '../config/config.js';

/**
 * Servicio de Caché en Memoria para Inferencia de Gemini
 *
 * Utiliza LRUCache indexada por el hash criptográfico SHA-256 del búfer de la imagen.
 * Si dos peticiones envían la misma imagen en la sesión, se reutiliza el resultado estructurado
 * evitando llamadas redundantes a la API de Google GenAI, reduciendo costos y latencia.
 */
export class CacheService {
  constructor() {
    this.cache = new LRUCache({
      max: config.cache?.maxItems || 500,
      ttl: config.cache?.ttlMs || 24 * 60 * 60 * 1000, // 24 horas
    });
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Genera el hash SHA-256 representativo del buffer de la imagen.
   *
   * @param {Buffer} buffer - Búfer binario de la imagen
   * @returns {string|null} Hash hexadecimal o null si es inválido
   */
  generateImageHash(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return null;
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Recupera un resultado de visión almacenado en caché.
   *
   * @param {string} hash - Hash SHA-256 de la imagen o clave de fallback
   * @returns {object|null} Resultado en caché o null si hubo cache-miss
   */
  get(hash) {
    if (!hash) return null;
    const item = this.cache.get(hash);
    if (item) {
      this.hits += 1;
      return item;
    }
    this.misses += 1;
    return null;
  }

  /**
   * Guarda el resultado de extracción en caché.
   *
   * @param {string} hash - Hash SHA-256 de la imagen
   * @param {object} data - Datos extraídos por Gemini
   */
  set(hash, data) {
    if (!hash || !data) return;
    this.cache.set(hash, data);
  }

  /**
   * Verifica si un hash existe en el caché.
   */
  has(hash) {
    return Boolean(hash && this.cache.has(hash));
  }

  /**
   * Limpia el contenido del caché en memoria y reinicia contadores.
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Retorna métricas de uso y eficiencia del caché.
   */
  getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0
      ? `${((this.hits / totalRequests) * 100).toFixed(1)}%`
      : '0.0%';

    return {
      size: this.cache.size,
      max: this.cache.max,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }
}

export const cacheService = new CacheService();
export default cacheService;
