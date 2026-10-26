/**
 * Script de utilidad para generar una base de datos SQLite precalc.db de muestra
 * con el esquema idéntico al que produce src/pipeline/precalculo.py.
 * Permite probar la API localmente sin necesidad de reentrenar todo el pipeline de ML.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../../data/precalc.db');

// Asegurar directorio data/
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

async function seed() {
  console.log(`[Seed] Creando/actualizando base de datos en: ${dbPath}`);

  let db;
  if (typeof Bun !== 'undefined') {
    const { Database } = await import('bun:sqlite');
    db = new Database(dbPath, { create: true });
    db.exec(`DROP TABLE IF EXISTS precalculated_prices;`);
    db.exec(`
      CREATE TABLE precalculated_prices (
        year INTEGER,
        odometer INTEGER,
        manufacturer TEXT,
        fuel TEXT,
        transmission TEXT,
        drive TEXT,
        type TEXT,
        condition TEXT,
        cylinders TEXT,
        size TEXT,
        predicted_price REAL
      );
    `);
    db.exec(`CREATE INDEX idx_search ON precalculated_prices (manufacturer, year, type);`);

    const samples = [
      // Toyota Corolla
      [2015, 10000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 15800.00],
      [2015, 50000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 13400.00],
      [2015, 100000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 11200.00],
      [2015, 150000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 9100.00],
      [2015, 200000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 7400.00],
      // Ford F-150
      [2018, 50000, 'ford', 'gas', 'automatic', '4wd', 'truck', 'good', '8 cylinders', 'full-size', 28500.00],
      [2018, 100000, 'ford', 'gas', 'automatic', '4wd', 'truck', 'good', '8 cylinders', 'full-size', 23900.00],
      // Honda Civic
      [2017, 50000, 'honda', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 17200.00],
      [2017, 100000, 'honda', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 14100.00],
      // Chevrolet Tahoe
      [2016, 100000, 'chevrolet', 'gas', 'automatic', '4wd', 'suv', 'good', '8 cylinders', 'full-size', 26000.00],
    ];

    const insert = db.prepare(`
      INSERT INTO precalculated_prices 
      (year, odometer, manufacturer, fuel, transmission, drive, type, condition, cylinders, size, predicted_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of samples) {
      insert.run(...row);
    }

    console.log(`[Seed] ${samples.length} registros insertados con éxito en ${dbPath}`);
    db.close();
  } else {
    const Database = (await import('better-sqlite3')).default;
    db = new Database(dbPath);
    db.exec(`DROP TABLE IF EXISTS precalculated_prices;`);
    db.exec(`
      CREATE TABLE precalculated_prices (
        year INTEGER,
        odometer INTEGER,
        manufacturer TEXT,
        fuel TEXT,
        transmission TEXT,
        drive TEXT,
        type TEXT,
        condition TEXT,
        cylinders TEXT,
        size TEXT,
        predicted_price REAL
      );
    `);
    db.exec(`CREATE INDEX idx_search ON precalculated_prices (manufacturer, year, type);`);

    const samples = [
      [2015, 10000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 15800.00],
      [2015, 50000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 13400.00],
      [2015, 100000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 11200.00],
      [2015, 150000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 9100.00],
      [2015, 200000, 'toyota', 'gas', 'automatic', 'fwd', 'sedan', 'good', '4 cylinders', 'compact', 7400.00],
    ];

    const insert = db.prepare(`
      INSERT INTO precalculated_prices 
      (year, odometer, manufacturer, fuel, transmission, drive, type, condition, cylinders, size, predicted_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of samples) {
      insert.run(...row);
    }

    console.log(`[Seed] ${samples.length} registros insertados con éxito en ${dbPath}`);
    db.close();
  }
}

seed().catch(console.error);
