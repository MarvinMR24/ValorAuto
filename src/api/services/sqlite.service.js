import fs from 'fs';
import { config } from '../config/config.js';
import { normalizeManufacturer, normalizeModel, normalizeVehicleType, vehicleTypeCandidates } from '../utils/normalizer.js';
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
    this.catalog = null;
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
   * ADR-0010: búsqueda por (manufacturer, model_base, year, odometer) con
   * índice idx_search, y fallback por (manufacturer, year, type, odometer).
   * Aplica normalización y Fuzzy Matching de marca para evitar falsos 404s.
   *
   * Niveles de coincidencia (campo `coincidencia` del resultado):
   * - 'modelo': existe el modelo; se toma su configuración representativa
   *   (la que comparte el tipo de carrocería de Gemini, si hay; si no, la de más anuncios).
   * - 'marca_anio_tipo' / 'marca_anio': el modelo no está en la tabla; promedio
   *   ponderado por n_anuncios de la marca+año (y tipo si coincide). Sigue siendo
   *   precio precalculado (ADR-0003), solo que menos específico.
   *
   * @param {Object} params
   * @param {string} params.manufacturer - Marca del vehículo (ej: 'toyota', 'chevy')
   * @param {string} [params.model] - Modelo del vehículo (ej: 'corolla le', 'F150')
   * @param {number} params.year - Año de fabricación (ej: 2015)
   * @param {string} [params.type] - Tipo de carrocería (ej: 'sedan', 'pickup')
   * @param {number} params.odometer - Kilometraje real o ya discretizado
   * @returns {Promise<{ precio_estimado: number, precio_min: number, precio_max: number, rango_km: number, coincidencia: string, queryTimeMs: number } | null>}
   */
  async queryPrice({ manufacturer, model = null, year, type = null, odometer }) {
    const startTime = performance.now();
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    const rangoKm = this.discretizeOdometer(odometer);

    // Normalización y Fuzzy Matching de la marca contra la base de datos
    const normManufacturer = normalizeManufacturer(manufacturer, this.knownManufacturers);
    const normModel = normalizeModel(model, normManufacturer);
    const normYear = Number(year);
    const normType = normalizeVehicleType(type);
    const typeCandidates = this.tableColumns.has('type') ? vehicleTypeCandidates(normType) : [];
    const typeIn = typeCandidates.map(() => '?').join(', ');
    const weight = this.tableColumns.has('n_anuncios') ? 'n_anuncios' : '1';

    let row = null;
    let coincidencia = null;

    // 1. Coincidencia por modelo: una fila por (marca, modelo, año, tipo, km) en precalc.db
    if (normModel && this.tableColumns.has('model_base')) {
      try {
        const orderByType = typeCandidates.length ? `(LOWER(type) IN (${typeIn})) DESC, ` : '';
        row = db.prepare(`
          SELECT * FROM ${this.tableName}
          WHERE manufacturer = ? AND model_base = ? AND year = ? AND odometer = ?
          ORDER BY ${orderByType}${weight} DESC
          LIMIT 1
        `).get(normManufacturer, normModel, normYear, rangoKm, ...typeCandidates);
        if (row) coincidencia = 'modelo';
      } catch (err) {
        logger.warn({ error: err.message }, '[SQLite] Consulta por modelo falló');
      }
    }

    // 2. Fallback: promedio ponderado de la marca+año(+tipo) para ese rango de km
    const aggregate = (withType) => db.prepare(`
      SELECT SUM(predicted_price * ${weight}) * 1.0 / SUM(${weight}) AS predicted_price, COUNT(*) AS filas
      FROM ${this.tableName}
      WHERE manufacturer = ? AND year = ? AND odometer = ?
        ${withType ? `AND LOWER(type) IN (${typeIn})` : ''}
    `).get(normManufacturer, normYear, rangoKm, ...(withType ? typeCandidates : []));

    if (!row) {
      try {
        if (typeCandidates.length) {
          const agg = aggregate(true);
          if (agg?.filas > 0) {
            row = { predicted_price: agg.predicted_price, type: normType };
            coincidencia = 'marca_anio_tipo';
          }
        }
        if (!row) {
          const agg = aggregate(false);
          if (agg?.filas > 0) {
            row = { predicted_price: agg.predicted_price };
            coincidencia = 'marca_anio';
          }
        }
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

    // Rango derivado del MAE del modelo en producción (ver BASELINE_MAE en config.js)
    const mae = Number(row.mae ?? this.baselineMae);
    const precioMin = Math.max(0, Math.round(precioEstimado - mae));
    const precioMax = Math.round(precioEstimado + mae);

    return {
      precio_estimado: precioEstimado,
      precio_min: precioMin,
      precio_max: precioMax,
      rango_km: rangoKm,
      coincidencia,
      queryTimeMs,
      detalles: {
        manufacturer_consultado: normManufacturer,
        model_consultado: normModel || null,
        type: row.type ?? normType,
        fuel: row.fuel,
        transmission: row.transmission,
        drive: row.drive,
      },
    };
  }

  /**
   * Catálogo para los selectores de la app: marcas, modelos por marca (ordenados
   * por cantidad de anuncios) y rango de años presentes en precalc.db.
   * Se calcula una sola vez por conexión (la tabla es de solo lectura).
   *
   * @returns {Promise<{ marcas: string[], modelos: Record<string, string[]>, anio_min: number, anio_max: number } | null>}
   */
  async getCatalog() {
    if (this.catalog) return this.catalog;
    const db = await this.getDb();
    if (!db) return null;

    const hasModel = this.tableColumns.has('model_base');
    const weight = this.tableColumns.has('n_anuncios') ? 'SUM(n_anuncios)' : 'COUNT(*)';
    const modelos = {};
    if (hasModel) {
      const rows = db.prepare(`
        SELECT manufacturer, model_base, ${weight} AS peso
        FROM ${this.tableName}
        WHERE model_base IS NOT NULL
        GROUP BY manufacturer, model_base
        ORDER BY manufacturer, peso DESC, model_base
      `).all();
      for (const r of rows) {
        (modelos[r.manufacturer] ||= []).push(r.model_base);
      }
    }
    const years = db.prepare(`SELECT MIN(year) AS min, MAX(year) AS max FROM ${this.tableName}`).get();

    this.catalog = {
      marcas: [...this.knownManufacturers].sort(),
      modelos,
      anio_min: Number(years?.min),
      anio_max: Number(years?.max),
    };
    return this.catalog;
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
