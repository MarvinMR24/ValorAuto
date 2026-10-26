import Fuse from 'fuse.js';

/**
 * Normalizador y Comparador Flexible (Fuzzy Matching) para ValorAuto
 *
 * Estandariza textos devueltos por Gemini Vision y los registros de SQLite:
 * 1. Limpieza de acentos, caracteres especiales y mayúsculas.
 * 2. Mapeo de alias comunes (ej. chevy -> chevrolet, vw -> volkswagen).
 * 3. Búsqueda difusa (Fuzzy Matching) mediante Fuse.js para tolerar errores ortográficos leves.
 * 4. Normalización de estado estético (condition) y formateo de presentación.
 */

// Diccionario de alias conocidos para marcas automotrices
export const BRAND_ALIASES = {
  chevy: 'chevrolet',
  chev: 'chevrolet',
  vw: 'volkswagen',
  volks: 'volkswagen',
  mercedes: 'mercedes-benz',
  benz: 'mercedes-benz',
  merc: 'mercedes-benz',
  bimmer: 'bmw',
  beemer: 'bmw',
  jag: 'jaguar',
  caddy: 'cadillac',
  alfa: 'alfa-romeo',
  aston: 'aston-martin',
  landrover: 'rover',
  'land rover': 'rover',
  'range rover': 'rover',
};

// Diccionario de alias conocidos para tipos de carrocería
export const TYPE_ALIASES = {
  pickup: 'truck',
  'pick-up': 'truck',
  camioneta: 'truck',
  berlina: 'sedan',
  crossover: 'suv',
  todoterreno: 'suv',
  minivan: 'mini-van',
  'station wagon': 'wagon',
  familiar: 'wagon',
};

// Diccionario de alias para estado estético (condition en dataset de Leo)
export const CONDITION_ALIASES = {
  excelente: 'excellent',
  excellent: 'excellent',
  'como nuevo': 'like new',
  'like new': 'like new',
  impecable: 'like new',
  'muy bueno': 'excellent',
  bueno: 'good',
  'buen estado': 'good',
  good: 'good',
  normal: 'good',
  regular: 'fair',
  aceptable: 'fair',
  fair: 'fair',
   desgastado: 'fair',
  malo: 'salvage',
  danado: 'salvage',
  siniestrado: 'salvage',
  salvage: 'salvage',
};

// Marcas que se escriben en siglas mayúsculas para visualización
const UPPERCASE_BRANDS = new Set(['bmw', 'gmc', 'ram', 'kia', 'vw', 'byd', 'mg', 'jac', 'jmc']);

/**
 * Limpia y normaliza una cadena de texto:
 * - Convierte a minúsculas
 * - Remueve tildes y diacríticos (ej: camión -> camion)
 * - Remueve caracteres especiales conservando guiones y números
 * - Colapsa espacios en blanco repetidos
 *
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto limpio
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // Elimina marcas diacríticas
    .replace(/[^a-z0-9\s-]/g, ' ') // Elimina caracteres especiales
    .replace(/\s+/g, ' ') // Colapsa múltiples espacios
    .trim();
}

/**
 * Realiza una búsqueda difusa (Fuzzy Matching) de un término contra una lista de candidatos.
 * Utiliza Fuse.js configurado con umbral estricto para evitar falsos positivos.
 *
 * @param {string} term - Término de búsqueda (ej: 'tooyota')
 * @param {string[]} candidates - Lista de opciones válidas (ej: ['toyota', 'ford', 'chevrolet'])
 * @param {number} [threshold=0.35] - Umbral de tolerancia de Fuse.js (0.0 = coincidencia exacta, 1.0 = coincide con todo)
 * @returns {{ match: string, score: number } | null}
 */
export function fuzzyMatch(term, candidates, threshold = 0.35) {
  if (!term || !Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return null;

  // 1. Verificación directa (coincidencia exacta)
  const exact = candidates.find((c) => normalizeText(c) === normalizedTerm);
  if (exact) {
    return { match: exact, score: 0.0 };
  }

  // 2. Coincidencia difusa con Fuse.js
  const fuseList = candidates.map((c) => ({
    raw: c,
    normalized: normalizeText(c),
  }));

  const fuse = new Fuse(fuseList, {
    keys: ['normalized'],
    includeScore: true,
    threshold, // Menor a 0.4 para asegurar alta fidelidad
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(normalizedTerm);
  if (results && results.length > 0 && results[0].score <= threshold) {
    return {
      match: results[0].item.raw,
      score: results[0].score,
    };
  }

  return null;
}

/**
 * Normaliza la marca de un vehículo:
 * 1. Limpia caracteres y acentos.
 * 2. Aplica diccionario de alias (ej. 'chevy' -> 'chevrolet').
 * 3. Si se proporciona lista de marcas conocidas de la BD, aplica Fuzzy Matching si no hay coincidencia exacta.
 *
 * @param {string} manufacturer - Marca reportada por Gemini u origen externo
 * @param {string[]} [knownManufacturers=[]] - Marcas existentes en SQLite
 * @returns {string} Marca estandarizada en minúsculas
 */
export function normalizeManufacturer(manufacturer, knownManufacturers = []) {
  const clean = normalizeText(manufacturer);
  if (!clean) return '';

  // Verificar alias común
  const aliased = BRAND_ALIASES[clean] || clean;

  if (Array.isArray(knownManufacturers) && knownManufacturers.length > 0) {
    const matched = fuzzyMatch(aliased, knownManufacturers, 0.35);
    if (matched) {
      return matched.match.toLowerCase();
    }
  }

  return aliased;
}

/**
 * Normaliza el tipo de carrocería aplicando alias y limpieza.
 *
 * @param {string} type - Tipo de carrocería (ej: 'pickup', 'berlina')
 * @returns {string|null} Tipo normalizado (ej: 'truck', 'sedan')
 */
export function normalizeVehicleType(type) {
  if (!type) return null;
  const clean = normalizeText(type);
  if (!clean) return null;
  return TYPE_ALIASES[clean] || clean;
}

/**
 * Normaliza el estado estético del vehículo al vocabulario del modelo ML (src/model/config.py).
 *
 * @param {string} condition - Estado estético (ej: 'bueno', 'excellent', 'fair')
 * @returns {string} Estado estandarizado ('excellent', 'like new', 'good', 'fair', 'salvage')
 */
export function normalizeCondition(condition) {
  if (!condition) return 'good';
  const clean = normalizeText(condition);
  return CONDITION_ALIASES[clean] || 'good';
}

/**
 * Formatea una marca o modelo normalizado para presentación amigable (Title Case).
 * Ej: 'toyota' -> 'Toyota', 'bmw' -> 'BMW', 'mercedes-benz' -> 'Mercedes-Benz', 'f-150' -> 'F-150'
 *
 * @param {string} text - Texto normalizado
 * @returns {string} Texto formateado para visualización
 */
export function formatDisplayName(text) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.trim().toLowerCase();
  if (UPPERCASE_BRANDS.has(clean)) {
    return clean.toUpperCase();
  }

  return clean
    .split(/(\s+|-)/)
    .map((part) => {
      if (part === ' ' || part === '-' || !part) return part;
      if (UPPERCASE_BRANDS.has(part)) return part.toUpperCase();
      // Si tiene números y letras cortas como f150 o m3, capitalizar letras
      if (/^[a-z]{1,2}\d+$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}
