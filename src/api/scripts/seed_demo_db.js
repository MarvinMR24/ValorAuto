/**
 * Script de utilidad para generar una base de datos SQLite precalc.db de muestra
 * con el esquema idéntico al que produce src/pipeline/precalculo.py (ADR-0010:
 * incluye model_base y n_anuncios).
 * Permite probar la API localmente sin necesidad de reentrenar todo el pipeline de ML.
 *
 *   bun run seed            # crea data/precalc.db solo si no existe
 *   bun run seed --force    # lo reemplaza (¡pisa el precálculo real!)
 *
 * Los tests importan seedDemoDb() para crear su propia base temporal (test/setup.js).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from 'bun:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.resolve(__dirname, '../../../data/precalc.db');

// [year, odometer, manufacturer, model_base, fuel, transmission, drive, type, condition, cylinders, size, n_anuncios, predicted_price]
export const DEMO_ROWS = [
  // Toyota Corolla 2015
  [2015, 10000, 'toyota', 'corolla', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 107, 15800.0],
  [2015, 50000, 'toyota', 'corolla', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 107, 13400.0],
  [2015, 100000, 'toyota', 'corolla', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 107, 11200.0],
  [2015, 150000, 'toyota', 'corolla', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 107, 9100.0],
  [2015, 200000, 'toyota', 'corolla', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 107, 7400.0],
  // Toyota Camry 2015: mismo tipo que el Corolla, distinto precio (el modelo importa)
  [2015, 50000, 'toyota', 'camry', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 128, 14900.0],
  // Toyota Tacoma 2015: aparece como 'pickup' en el dataset
  [2015, 50000, 'toyota', 'tacoma', 'gas', 'automatic', '4wd', 'pickup', 'good', '4 cylinders', 'compact', 60, 32100.0],
  // Ford F-150
  [2018, 50000, 'ford', 'f-150', 'gas', 'automatic', '4wd', 'truck', 'good', '8 cylinders', 'full-size', 300, 28500.0],
  [2018, 100000, 'ford', 'f-150', 'gas', 'automatic', '4wd', 'truck', 'good', '8 cylinders', 'full-size', 300, 23900.0],
  // Honda Civic
  [2017, 50000, 'honda', 'civic', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 150, 17200.0],
  [2017, 100000, 'honda', 'civic', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 150, 14100.0],
  // Chevrolet Tahoe
  [2016, 100000, 'chevrolet', 'tahoe', 'gas', 'automatic', '4wd', 'suv', 'good', '8 cylinders', 'full-size', 40, 26000.0],
];

export function seedDemoDb(dbPath = defaultDbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec(`DROP TABLE IF EXISTS precalculated_prices;`);
  db.exec(`
    CREATE TABLE precalculated_prices (
      year INTEGER,
      odometer INTEGER,
      manufacturer TEXT,
      model_base TEXT,
      fuel TEXT,
      transmission TEXT,
      drive TEXT,
      type TEXT,
      condition TEXT,
      cylinders TEXT,
      size TEXT,
      n_anuncios INTEGER,
      predicted_price REAL
    );
  `);
  db.exec(`CREATE INDEX idx_search ON precalculated_prices (manufacturer, model_base, year, odometer);`);
  db.exec(`CREATE INDEX idx_fallback ON precalculated_prices (manufacturer, year, type, odometer);`);

  const insert = db.prepare(`
    INSERT INTO precalculated_prices
    (year, odometer, manufacturer, model_base, fuel, transmission, drive, type, condition, cylinders, size, n_anuncios, predicted_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of DEMO_ROWS) {
    insert.run(...row);
  }
  db.close();
  return dbPath;
}

if (import.meta.main) {
  const force = process.argv.includes('--force');
  if (fs.existsSync(defaultDbPath) && !force) {
    console.log(`[Seed] Ya existe ${defaultDbPath}; no se pisa (usa --force para reemplazarlo).`);
  } else {
    seedDemoDb(defaultDbPath);
    console.log(`[Seed] ${DEMO_ROWS.length} registros insertados con éxito en ${defaultDbPath}`);
  }
}
