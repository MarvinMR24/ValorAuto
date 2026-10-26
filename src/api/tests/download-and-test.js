/**
 * Script de Pruebas E2E para el Pipeline Híbrido de Tasación (Fases 1 a 4)
 *
 * Flujo:
 * 1. Descarga 5 imágenes de prueba de vehículos desde URLs públicas directas en 'tests/fixtures/'.
 * 2. Ejecuta peticiones HTTP multipart/form-data a POST /tasacion para cada vehículo.
 * 3. Verifica la respuesta estructurada de la Fase 4:
 *    - Fase 1: Reconocimiento con Gemini Vision + Normalización (vehiculo.marca, modelo, anio, estado_estetico)
 *    - Fase 2 y 3: Evaluación del umbral de confianza del 65%:
 *        * Caso A (>= 65%): origen_precio = "modelo_ml"
 *        * Caso B (< 65% o fuera de BD): origen_precio = "gemini_fallback"
 * 4. Muestra un informe tabular detallado con el origen del precio, confianza y nota explicativa.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { server } from '../index.js';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

const TEST_VEHICLES = [
  {
    name: 'car_1_toyota.jpg',
    expectedBrand: 'toyota',
    url: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&auto=format&fit=crop&q=80',
    odometer: 48000,
  },
  {
    name: 'car_2_ford.jpg',
    expectedBrand: 'bmw',
    url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    odometer: 62000,
  },
  {
    name: 'car_3_mercedes.jpg',
    expectedBrand: 'mercedes',
    url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&auto=format&fit=crop&q=80',
    odometer: 85000,
  },
  {
    name: 'car_4_chevrolet.jpg',
    expectedBrand: 'chevrolet',
    url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80',
    odometer: 32000,
  },
  {
    name: 'car_5_ferrari.jpg',
    expectedBrand: 'ferrari',
    url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&auto=format&fit=crop&q=80',
    odometer: 15000,
  },
];

async function ensureFixturesDirectory() {
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
    console.log(`📁 Carpeta creada: ${fixturesDir}`);
  }
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
    console.log(`  ✓ Imagen en caché: ${path.basename(destPath)}`);
    return;
  }

  console.log(`  ⬇ Descargando: ${path.basename(destPath)}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fallo al descargar ${url}: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  console.log(`  ✓ Guardada en: ${destPath} (${Math.round(arrayBuffer.byteLength / 1024)} KB)`);
}

async function runTests() {
  console.log('========================================================================');
  console.log('  🧪 VALORAUTO: SUITE E2E PIPELINE HÍBRIDO (VISIÓN + ML + FALLBACK)');
  console.log('========================================================================');

  await ensureFixturesDirectory();

  console.log('\n--- PASO 1: Descarga de Imágenes de Prueba ---');
  for (const car of TEST_VEHICLES) {
    const dest = path.join(fixturesDir, car.name);
    await downloadImage(car.url, dest);
  }

  console.log('\n--- PASO 2: Ejecución de Peticiones POST /tasacion ---');
  const serverUrl = `http://localhost:${config.port}/tasacion`;
  console.log(`Endpoint destino: ${serverUrl}\n`);

  const results = [];
  let allVerified = true;

  for (let i = 0; i < TEST_VEHICLES.length; i++) {
    const car = TEST_VEHICLES[i];
    const imagePath = path.join(fixturesDir, car.name);
    const fileBytes = fs.readFileSync(imagePath);

    console.log(`[Auto ${i + 1}/${TEST_VEHICLES.length}] Procesando ${car.name} con ${car.odometer} km...`);

    const form = new FormData();
    const blob = new Blob([fileBytes], { type: 'image/jpeg' });
    form.append('imagen', blob, car.name);
    form.append('odometer', String(car.odometer));

    let res;
    let body;

    try {
      res = await fetch(serverUrl, {
        method: 'POST',
        body: form,
      });
      body = await res.json();
    } catch (netErr) {
      console.error(`  ❌ Error de conexión al servidor: ${netErr.message}`);
      allVerified = false;
      continue;
    }

    const vehiculo = body.vehiculo || {};
    const tasacion = body.tasacion || {};
    const metadatos = body.metadatos || {};

    const marca = vehiculo.marca || body.marca;
    const modelo = vehiculo.modelo || body.modelo;
    const anio = vehiculo.anio || body.anio;
    const precio = tasacion.precio_estimado
      ? `$${tasacion.precio_estimado.toLocaleString('en-US')} ${tasacion.moneda || 'USD'}`
      : 'N/A';
    const confianza = tasacion.confianza ?? 'N/A';
    const origen = tasacion.origen_precio || 'N/A';
    const tiempoMs = metadatos.tiempo_respuesta_ms ?? 'N/A';

    const isSuccess =
      body.success === true &&
      typeof marca === 'string' &&
      typeof modelo === 'string' &&
      Number.isInteger(anio) &&
      typeof tasacion.precio_estimado === 'number' &&
      (origen === 'modelo_ml' || origen === 'gemini_fallback');

    if (!isSuccess) {
      allVerified = false;
    }

    results.push({
      Archivo: car.name,
      Vehículo: `${marca} ${modelo} (${anio})`,
      Estado: vehiculo.estado_estetico || 'good',
      Precio: precio,
      Confianza: typeof confianza === 'number' ? `${Math.round(confianza * 100)}%` : confianza,
      'Origen Precio': origen,
      'Tiempo (ms)': `${tiempoMs} ms`,
      OK: isSuccess ? '✅' : '❌',
    });

    console.log(
      `  -> HTTP ${res.status} | ${marca} ${modelo} (${anio}) | Precio: ${precio} | Origen: ${origen} (Conf: ${confianza}) | Nota: ${metadatos.nota}`
    );
  }

  console.log('\n========================================================================');
  console.log('  📊 RESUMEN DEL PIPELINE HÍBRIDO DE TASACIÓN');
  console.log('========================================================================');
  console.table(results);

  server.close();

  if (allVerified) {
    console.log('\n🎉 ÉXITO: Los 5 vehículos completaron el pipeline híbrido (modelo_ml y gemini_fallback) correctamente.');
    process.exit(0);
  } else {
    console.error('\n⚠️ ADVERTENCIA: Uno o más vehículos no completaron el flujo esperado.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
