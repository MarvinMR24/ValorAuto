/**
 * E2E del flujo "Usar una foto" con dependencias reales: foto → POST /identificar (Gemini)
 * → POST /tasacion/datos (precalc.db, modelo XGBoost) → GET /revision (Gemini texto).
 * Es exactamente la secuencia de llamadas que hace la app. Se salta si el backend
 * no tiene GEMINI_API_KEY configurada (GET /health).
 * Foto: tests/e2e/fixtures/corolla_2015.jpg (CC BY-SA 4.0, ver fixtures/ATRIBUCION.md).
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { API_URL } from './playwright.config.mjs';

test('foto de un Toyota Corolla 2015 → identificación → precio → revisión', async ({ request }) => {
  const salud = await (await request.get(`${API_URL}/health`)).json();
  expect(salud.status).toBe('OK');
  test.skip(!salud.geminiApi?.configured, 'El backend no tiene GEMINI_API_KEY: flujo con foto no disponible');

  const foto = await readFile(new URL('./fixtures/corolla_2015.jpg', import.meta.url));
  const identificacion = await request.post(`${API_URL}/identificar`, {
    multipart: { imagen: { name: 'corolla_2015.jpg', mimeType: 'image/jpeg', buffer: foto } },
    timeout: 60_000,
  });
  // 503 solo si Gemini está caído incluso con el modelo de respaldo: se reporta, no se maquilla
  expect(identificacion.status(), await identificacion.text()).toBe(200);
  const v = await identificacion.json();
  expect(v.marca).toBe('toyota');
  expect(v.modelo).toBe('corolla');
  expect(Math.abs(v.anio - 2015)).toBeLessThanOrEqual(1);
  expect(v.confianza).toBeGreaterThanOrEqual(0.6);

  const tasacion = await (
    await request.post(`${API_URL}/tasacion/datos`, {
      data: { marca: v.marca, modelo: v.modelo, anio: v.anio, kilometraje: 85000, tipo: v.tipo },
    })
  ).json();
  expect(tasacion.coincidencia).toBe('modelo');
  expect(tasacion.fuente_precio).toBe('sqlite_precalculo');
  expect(tasacion.precio_min).toBeLessThanOrEqual(tasacion.precio_estimado);
  expect(tasacion.precio_estimado).toBeLessThanOrEqual(tasacion.precio_max);

  const revision = await (
    await request.get(`${API_URL}/revision`, { params: { marca: v.marca, modelo: v.modelo, anio: v.anio }, timeout: 60_000 })
  ).json();
  expect(revision.fallas_comunes.length + revision.revisar_primero.length).toBeGreaterThan(0);
  expect(JSON.stringify(revision)).not.toMatch(/US\$|\bUSD\b|d[oó]lares/i); // Gemini nunca da precios

  console.log(
    `E2E foto: ${v.marca} ${v.modelo} ${v.anio} (conf ${v.confianza}) → US$ ${tasacion.precio_estimado} ` +
      `[${tasacion.precio_min}–${tasacion.precio_max}] | revisión: ${revision.fuente}`
  );
});
