const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Ruta configurable vía variable de entorno o fallback a data/precalc.db en la raíz del repo
const defaultDbPath = path.resolve(__dirname, '../../../data/precalc.db');
const dbPath = process.env.DATABASE_PATH || defaultDbPath;

let SQL = null;
let db = null;

async function getDb() {
  if (!db) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Base de datos no encontrada en ${dbPath}`);
    }
    if (!SQL) {
      SQL = await initSqlJs();
    }
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  }
  return db;
}

async function checkDatabaseHealth() {
  try {
    const database = await getDb();
    const res = database.exec('SELECT COUNT(*) as count FROM precalculated_prices');
    const count = (res.length > 0 && res[0].values.length > 0) ? res[0].values[0][0] : 0;
    return {
      connected: true,
      records: count,
      path: dbPath
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      path: dbPath
    };
  }
}

/**
 * Mapea el kilometraje real al escalón precalculado más cercano (10k, 50k, 100k, 150k, 200k)
 */
function calcularOdometerMasCercano(km) {
  const ranges = [10000, 50000, 100000, 150000, 200000];
  const kmNum = Number(km);
  return ranges.reduce((prev, curr) => Math.abs(curr - kmNum) < Math.abs(prev - kmNum) ? curr : prev);
}

/**
 * Busca tasación en la tabla precalculated_prices.
 * Si encuentra coincidencia, calcula precio_min y precio_max con base en un margen de error del 10%.
 */
async function buscarTasacion(marca, modelo, anio, km) {
  const database = await getDb();
  const odometerTarget = calcularOdometerMasCercano(km);

  // Buscar por fabricante (marca), año y odometer
  const stmt = database.prepare(`
    SELECT manufacturer, year, odometer, type, predicted_price
    FROM precalculated_prices
    WHERE LOWER(manufacturer) = LOWER(:marca)
      AND year = :anio
      AND odometer = :odometer
    LIMIT 1
  `);

  stmt.bind({
    ':marca': marca,
    ':anio': anio,
    ':odometer': odometerTarget
  });

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();

    const precioEstimado = Math.round(row.predicted_price * 100) / 100;
    // Margen referencial del 10% según MAE del modelo
    const precioMin = Math.round(precioEstimado * 0.9 * 100) / 100;
    const precioMax = Math.round(precioEstimado * 1.1 * 100) / 100;

    return {
      marca: row.manufacturer,
      modelo: modelo,
      anio: row.year,
      odometer: row.odometer,
      tipo: row.type,
      precio_estimado: precioEstimado,
      precio_min: precioMin,
      precio_max: precioMax
    };
  }
  stmt.free();
  return null;
}

module.exports = {
  getDb,
  checkDatabaseHealth,
  buscarTasacion,
  calcularOdometerMasCercano,
  dbPath
};
