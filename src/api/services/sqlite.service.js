import fs from 'fs';
import { config } from '../config/config.js';
import {
  normalizeManufacturer,
  normalizeVehicleType,
  normalizeCondition,
  fuzzyMatch,
  BRAND_ALIASES,
  normalizeText,
} from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

/**
 * Conector defensivo a SQLite.
 * Compatible tanto con 'bun:sqlite' nativo de Bun como con 'better-sqlite3'.
 */
async function createDatabaseConnection(dbPath) {
  if (typeof Bun !== 'undefined') {
    try {
      const { Database } = await import('bun:sqlite');
      const bunDb = new Database(dbPath, { readonly: true });
      return {
        prepare: (sql) => {
          const query = bunDb.query(sql);
          return {
            get: (...params) => query.get(...params),
            all: (...params) => query.all(...params),
          };
        },
        close: () => bunDb.close(),
      };
    } catch (bunErr) {
      logger.warn({ error: bunErr.message }, '[SQLite] Error usando bun:sqlite, intentando better-sqlite3...');
    }
  }

  try {
    const Database = (await import('better-sqlite3')).default;
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    throw new Error(`No se pudo inicializar cliente SQLite: ${err.message}`);
  }
}

export class SqlitePrecalcService {
  constructor() {
    this.dbPath = config.database.path;
    this.tableName = config.database.tableName;
    this.odometerRanges = config.database.odometerRanges;
    this.baselineMae = config.model.baselineMae;
    this.productionR2 = config.model.productionR2 || 0.8482;
    this.db = null;
    this.lastMtimeMs = null;
    this.tableColumns = new Set();
    this.knownManufacturers = [];
  }

  /**
   * Obtiene la conexión a SQLite en modo singleton de solo lectura.
   * Detecta automáticamente si el archivo data/precalc.db fue reemplazado atómicamente
   * (os.replace() del job nocturno según ADR-0003 y ADR-0007) mediante su mtimeMs.
   */
  async getDb() {
    if (!fs.existsSync(this.dbPath)) {
      if (this.db) {
        this.resetConnection();
      }
      logger.warn(
        { dbPath: this.dbPath },
        '[SQLite] Advertencia: Base de datos no encontrada. El pipeline nocturno debe ejecutarse para generarla.'
      );
      return null;
    }

    try {
      const stats = fs.statSync(this.dbPath);
      const currentMtimeMs = stats.mtimeMs;

      if (this.db && this.lastMtimeMs !== null && this.lastMtimeMs === currentMtimeMs) {
        return this.db;
      }

      if (this.db) {
        logger.info(
          { dbPath: this.dbPath, prevMtime: this.lastMtimeMs, newMtime: currentMtimeMs },
          '[SQLite] Detectado swap atómico (os.replace) en data/precalc.db; recargando conexión de solo lectura'
        );
        this.resetConnection();
      }

      this.db = await createDatabaseConnection(this.dbPath);
      this.lastMtimeMs = currentMtimeMs;
      await this._inspectTableColumns();
      await this._loadKnownManufacturers();
      return this.db;
    } catch (err) {
      logger.error({ error: err.message, dbPath: this.dbPath }, '[SQLite] Error al conectar con la base de datos');
      return null;
    }
  }

  /**
   * Permite reiniciar la conexión en caso de recarga de datos o tests.
   */
  resetConnection() {
    if (this.db && typeof this.db.close === 'function') {
      try {
        this.db.close();
      } catch {
        // Ignorar errores al cerrar
      }
    }
    this.db = null;
    this.lastMtimeMs = null;
  }

  /**
   * Inspecciona las columnas existentes de la tabla para adaptar las consultas dinámicamente.
   */
  async _inspectTableColumns() {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`PRAGMA table_info(${this.tableName})`);
      const rows = stmt.all ? stmt.all() : [];
      this.tableColumns = new Set(rows.map((r) => r.name.toLowerCase()));
    } catch {
      this.tableColumns = new Set();
    }
  }

  /**
   * Carga la lista de marcas presentes en la tabla precalculada para coincidencia difusa (Fuzzy Matching).
   */
  async _loadKnownManufacturers() {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`SELECT DISTINCT manufacturer FROM ${this.tableName}`);
      const rows = stmt.all ? stmt.all() : [];
      this.knownManufacturers = rows
        .map((r) => (r.manufacturer || '').toLowerCase().trim())
        .filter(Boolean);
    } catch (err) {
      logger.warn({ error: err.message }, '[SQLite] No se pudieron cargar fabricantes únicos para fuzzy matching');
      this.knownManufacturers = [];
    }
  }

  /**
   * Asigna el kilometraje real al rango más cercano precalculado
   * [10000, 50000, 100000, 150000, 200000] (src/pipeline/config.py).
   *
   * @param {number} km - Kilometraje real del usuario
   * @returns {number} Rango de km más cercano
   */
  discretizeOdometer(km) {
    if (typeof km !== 'number' || Number.isNaN(km)) return 100000;
    return this.odometerRanges.reduce((prev, curr) =>
      Math.abs(curr - km) < Math.abs(prev - km) ? curr : prev
    );
  }

  /**
   * FASE 2: Consulta al Modelo ML de Leo / Base Precalculada (data/precalc.db).
   * Recupera la estimación de precio y calcula su nivel de confianza (score entre 0 y 1)
   * basado en el R² del modelo XGBoost en producción (0.8482) y la precisión del emparejamiento.
   *
   * @param {Object} params
   * @param {string} params.manufacturer - Marca del vehículo (ej: 'toyota', 'chevy')
   * @param {string} [params.model] - Modelo del vehículo (ej: 'corolla')
   * @param {number} params.year - Año de fabricación (ej: 2015)
   * @param {string} [params.type] - Tipo de carrocería (ej: 'sedan', 'pickup')
   * @param {string} [params.condition] - Estado estético (ej: 'good', 'excellent')
   * @param {number} params.odometer - Kilometraje real
   * @param {boolean} [params.allowYearInterpolation=false] - Si true, interpola años cercanos (<=3 años) cuando no hay coincidencia exacta
   * @returns {Promise<{ precio_estimado: number, precio_min: number, precio_max: number, rango_km: number, confianza: number, matchType: string, queryTimeMs: number, detalles: object } | null>}
   */
  async queryPrice({
    manufacturer,
    model = '',
    year,
    type = null,
    condition = 'good',
    odometer,
    allowYearInterpolation = false,
  }) {
    const startTime = performance.now();
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    const rangoKm = this.discretizeOdometer(odometer);

    // Evaluar coincidencia de marca y puntaje difuso (fuzzy score)
    const cleanInputBrand = normalizeText(manufacturer);
    const aliasedBrand = BRAND_ALIASES[cleanInputBrand] || cleanInputBrand;
    let normManufacturer = aliasedBrand;
    let fuzzyPenalty = 0;

    if (this.knownManufacturers.length > 0) {
      const matched = fuzzyMatch(aliasedBrand, this.knownManufacturers, 0.35);
      if (matched) {
        normManufacturer = matched.match.toLowerCase();
        fuzzyPenalty = matched.score * 0.2; // Penalización leve si hubo corrección ortográfica
      }
    }

    const normYear = Number(year);
    const normType = normalizeVehicleType(type);
    const normCondition = normalizeCondition(condition);

    const odoCol = this.tableColumns.has('rango_km') ? 'rango_km' : 'odometer';

    let row = null;
    let matchType = 'none';
    let baseConfidence = 0;

    // 1. Nivel 1 (Alta Confianza): Coincidencia exacta por (manufacturer, year, type, odometer/rango_km) - ADR-0007
    if (normType && this.tableColumns.has('type')) {
      try {
        const queryExact = `
          SELECT * FROM ${this.tableName}
          WHERE LOWER(manufacturer) = LOWER(?)
            AND year = ?
            AND LOWER(type) = LOWER(?)
            AND ${odoCol} = ?
          LIMIT 1
        `;
        row = db.prepare(queryExact).get(normManufacturer, normYear, normType, rangoKm);
        if (row) {
          matchType = 'exact_match';
          baseConfidence = Math.max(0.85, this.productionR2); // ~0.85 (basado en R2=0.8482 de XGBoost v3)
        }
      } catch (err) {
        logger.warn({ error: err.message }, '[SQLite] Consulta exacta con tipo falló');
      }
    }

    // 2. Nivel 2 (Buena Confianza): Fallback a (manufacturer, year, odometer/rango_km) si type no coincide - ADR-0007
    if (!row) {
      try {
        const queryNoType = `
          SELECT * FROM ${this.tableName}
          WHERE LOWER(manufacturer) = LOWER(?)
            AND year = ?
            AND ${odoCol} = ?
          LIMIT 1
        `;
        row = db.prepare(queryNoType).get(normManufacturer, normYear, rangoKm);
        if (row) {
          matchType = 'type_fallback';
          baseConfidence = 0.78;
        }
      } catch (err) {
        logger.error({ error: err.message }, '[SQLite] Error en consulta sin tipo');
      }
    }

    // 3. Nivel 3 (Opcional): Interpolación por Año Cercano (<= 3 años) solo si se habilita explícitamente
    if (!row && allowYearInterpolation) {
      try {
        const queryNearbyYear = `
          SELECT *, ABS(year - ?) as year_diff FROM ${this.tableName}
          WHERE LOWER(manufacturer) = LOWER(?)
            AND ${odoCol} = ?
            AND ABS(year - ?) <= 3
          ORDER BY year_diff ASC
          LIMIT 1
        `;
        row = db.prepare(queryNearbyYear).get(normYear, normManufacturer, rangoKm, normYear);
        if (row) {
          const yearDiff = Math.abs(Number(row.year) - normYear);
          matchType = 'year_interpolated';
          if (yearDiff === 1) baseConfidence = 0.68;
          else if (yearDiff === 2) baseConfidence = 0.58;
          else baseConfidence = 0.48;
        }
      } catch (err) {
        logger.warn({ error: err.message }, '[SQLite] Error en consulta por año cercano');
      }
    }

    const queryTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    if (!row) {
      return null;
    }

    // Extraer el precio estimado directamente de la tabla precalculada (ADR-0003 / ADR-0007)
    const rawPrice =
      row.predicted_price ??
      row.precio_estimado ??
      row.price ??
      null;

    if (rawPrice === null || rawPrice === undefined) {
      return null;
    }

    let adjustedPrice = Number(rawPrice);

    // Si el año fue interpolado explícitamente, ajustar el precio a razón de ~6.5% por año de diferencia
    if (matchType === 'year_interpolated' && row.year) {
      const yearDelta = normYear - Number(row.year);
      adjustedPrice *= Math.pow(1.065, yearDelta);
    }

    const precioEstimado = Math.round(adjustedPrice * 100) / 100;

    // Penalización de confianza si el odómetro real se aleja demasiado del rango máximo precalculado
    const odoDistance = Math.abs(Number(odometer) - rangoKm);
    const odoPenalty = odoDistance > 80000 ? 0.18 : odoDistance > 40000 ? 0.05 : 0;

    // Calcular confianza final del modelo ML (entre 0.10 y 0.98)
    const computedConfidence =
      row.confidence !== undefined && row.confidence !== null
        ? Number(row.confidence)
        : Math.max(0.1, Math.min(0.98, baseConfidence - fuzzyPenalty - odoPenalty));

    const confianzaFinal = Math.round(computedConfidence * 100) / 100;

    // Cálculo del rango derivado del error MAE del modelo (BASELINE_MAE=3778 según ADR-0003 / docs/evidence/baseline-modelo.md)
    const mae = Number(row.mae ?? this.baselineMae);
    const precioMin = Math.max(0, Math.round(precioEstimado - mae));
    const precioMax = Math.round(precioEstimado + mae);

    return {
      precio_estimado: precioEstimado,
      precio_min: precioMin,
      precio_max: precioMax,
      rango_km: rangoKm,
      confianza: confianzaFinal,
      matchType,
      queryTimeMs,
      detalles: {
        manufacturer_consultado: normManufacturer,
        year_base_db: row.year,
        type: row.type ?? normType,
        condition: normCondition,
        fuel: row.fuel,
        transmission: row.transmission,
        drive: row.drive,
      },
    };
  }

  /**
   * Realiza un test de salud rápido en la base de datos para el health check
   */
  async checkHealth() {
    try {
      const db = await this.getDb();
      if (!db) {
        return { status: 'disconnected', path: this.dbPath, error: 'Archivo no encontrado o inaccesible' };
      }
      const test = db.prepare(`SELECT COUNT(*) as total FROM ${this.tableName}`).get();
      return {
        status: 'connected',
        path: this.dbPath,
        precalculatedRows: test?.total ?? 0,
        knownBrands: this.knownManufacturers.length,
      };
    } catch (err) {
      return {
        status: 'error',
        path: this.dbPath,
        error: err.message,
      };
    }
  }
}

export const sqliteService = new SqlitePrecalcService();
export default sqliteService;
