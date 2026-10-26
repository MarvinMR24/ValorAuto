/**
 * Preload de `bun test` (bunfig.toml): crea una precalc.db demo temporal y
 * apunta DB_PATH a ella ANTES de que los tests importen config.js, para que la
 * suite no dependa del precálculo real de data/precalc.db (que cambia en cada
 * reentrenamiento) ni lo modifique.
 */
import os from 'os';
import path from 'path';
import { seedDemoDb } from '../scripts/seed_demo_db.js';

const dbPath = path.join(os.tmpdir(), `valorauto-test-${process.pid}.db`);
seedDemoDb(dbPath);
process.env.DB_PATH = dbPath;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// Sin precios de Gemini en la suite (los tests de PricingService lo activan con un stub)
process.env.PRICE_GEMINI_FALLBACK = 'false';
