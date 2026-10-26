import fs from 'fs';
import { config } from '../config/config.js';
import { normalizeManufacturer, normalizeVehicleType } from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

/**
 * Conector defensivo a SQLite.
 * Compatible tanto con 'bun:sqlite' nativo de Bun como con 'better-sqlite3'.
 */
async function createDatabaseConnection(dbPath) {
  // En entorno Bun, preferir bun:sqlite que es nativo, ultra-rápido y no requiere binarios C++
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

  // En entorno Node.js o como fallback
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
    this.db = null;
    this.tableColumns = new Set();
    this.knownManufacturers = [];
  }

  /**
   * Obtiene la conexión a SQLite en modo singleton de solo lectura.
   */
  async getDb() {
    if (this.db) return this.db;

    if (!fs.existsSync(this.dbPath)) {
      logger.warn(
        { dbPath: this.dbPath },
        '[SQLite] Advertencia: Base de datos no encontrada. El pipeline nocturno debe ejecutarse para generarla.'
      );
      return null;
    }

    try {
      this.db = await createDatabaseConnection(this.dbPath);
      await this._inspectTableColumns();
      await this._loadKnownManufacturers();
      return this.db;
    } catch (err) {
      logger.error({ error: err.message, dbPath: this.dbPath }, '[SQLite] Error al conectar con la base de datos');
      return null;
    }
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
   * Consulta el precio precalculado para un vehículo según sus características.
   * ADR-0007: Índice por (manufacturer, year, type).
   * Aplica normalización y Fuzzy Matching para evitar falsos 404s.
   *
   * @param {Object} params
   * @param {string} params.manufacturer - Marca del vehículo (ej: 'toyota', 'chevy')
   * @param {number} params.year - Año de fabricación (ej: 2015)
   * @param {string} [params.type] - Tipo de carrocería (ej: 'sedan', 'pickup')
   * @param {number} params.odometer - Kilometraje real o ya discretizado
   * @returns {Promise<{ precio_estimado: number, precio_min: number, precio_max: number, rango_km: number, queryTimeMs: number } | null>}
   */
  async queryPrice({ manufacturer, year, type = null, odometer }) {
    const startTime = performance.now();
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    const rangoKm = this.discretizeOdometer(odometer);

    // Normalización y Fuzzy Matching de la marca contra la base de datos
    const normManufacturer = normalizeManufacturer(manufacturer, this.knownManufacturers);
    const normYear = Number(year);
    const normType = normalizeVehicleType(type);

    // Detectar qué nombre de columna de kilometraje tiene la tabla (odometer o rango_km)
    const odoCol = this.tableColumns.has('rango_km') ? 'rango_km' : 'odometer';

    let row = null;

    // 1. Intento principal: coincidencia exacta por (manufacturer, year, type, rango_km)
    if (normType && this.tableColumns.has('type')) {
      try {
        const queryWithSql = `
          SELECT * FROM ${this.tableName}
          WHERE LOWER(manufacturer) = LOWER(?)
            AND year = ?
            AND LOWER(type) = LOWER(?)
            AND ${odoCol} = ?
          LIMIT 1
        `;
        row = db.prepare(queryWithSql).get(normManufacturer, normYear, normType, rangoKm);
      } catch (err) {
        logger.warn({ error: err.message }, '[SQLite] Consulta con tipo falló');
      }
    }

    // 2. Si no se especificó tipo o no hubo coincidencia con ese tipo específico,
    // consultar por (manufacturer, year, rango_km) ignorando el tipo
    if (!row) {
      try {
        const queryFallback = `
          SELECT * FROM ${this.tableName}
          WHERE LOWER(manufacturer) = LOWER(?)
            AND year = ?
            AND ${odoCol} = ?
          LIMIT 1
        `;
        row = db.prepare(queryFallback).get(normManufacturer, normYear, rangoKm);
      } catch (err) {
        logger.error({ error: err.message }, '[SQLite] Error en consulta fallback');
      }
    }

    const queryTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    if (!row) {
      return null;
    }

    // Extraer el precio estimado de las columnas posibles (predicted_price o precio_estimado)
    const rawPrice =
      row.predicted_price ??
      row.precio_estimado ??
      row.price ??
      null;

    if (rawPrice === null || rawPrice === undefined) {
      return null;
    }

    const precioEstimado = Math.round(Number(rawPrice) * 100) / 100;

    // Cálculo del rango derivado del error MAE del modelo baseline (XGBoost: ~3778 USD)
    const mae = Number(row.mae ?? this.baselineMae);
    const precioMin = Math.max(0, Math.round(precioEstimado - mae));
    const precioMax = Math.round(precioEstimado + mae);

    return {
      precio_estimado: precioEstimado,
      precio_min: precioMin,
      precio_max: precioMax,
      rango_km: rangoKm,
      queryTimeMs,
      detalles: {
        manufacturer_consultado: normManufacturer,
        type: row.type ?? normType,
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
