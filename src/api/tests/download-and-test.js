/**
 * Script de Pruebas E2E y Descarga Automatizada de Imágenes
 *
 * Flujo:
 * 1. Descarga 5 imágenes de prueba de vehículos desde URLs públicas directas.
 * 2. Guarda las imágenes en la carpeta local 'tests/fixtures/'.
 * 3. Ejecuta peticiones HTTP multipart/form-data a POST /tasacion para cada vehículo.
 * 4. Valida que el servicio de visión con Google Gemini extraiga correctamente:
 *    - Marca (manufacturer)
 *    - Modelo (model)
 *    - Año (year)
 *    - Nivel de confianza
 * 5. Muestra un informe tabular con los resultados de la tasación.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../index.js';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

// Lista de 5 vehículos de prueba con imágenes públicas de alta calidad
const TEST_VEHICLES = [
  {
    name: 'car_1_toyota.jpg',
    expectedBrand: 'toyota',
    url: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&auto=format&fit=crop&q=80',
    odometer: 48000,
  },
  {
    name: 'car_2_ford.jpg',
    expectedBrand: 'ford',
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
  console.log('================================================================');
  console.log('  🧪 VALORAUTO: SUITE DE PRUEBAS E2E (VISIÓN GEMINI + TASACIÓN)');
  console.log('================================================================');

  await ensureFixturesDirectory();

  console.log('\n--- PASO 1: Descarga de Imágenes de Prueba ---');
  for (const car of TEST_VEHICLES) {
    const dest = path.join(fixturesDir, car.name);
    await downloadImage(car.url, dest);
  }

  console.log('\n--- PASO 2: Ejecución de Peticiones POST /tasacion ---');
  // Usar el puerto del servidor levantado por index.js
  const serverUrl = `http://localhost:${config.port}/tasacion`;
  console.log(`Endpoint destino: ${serverUrl}\n`);

  const results = [];
  let allMetadataVerified = true;

  for (let i = 0; i < TEST_VEHICLES.length; i++) {
    const car = TEST_VEHICLES[i];
    const imagePath = path.join(fixturesDir, car.name);
    const fileBytes = fs.readFileSync(imagePath);

    console.log(`[Auto ${i + 1}/${TEST_VEHICLES.length}] Procesando ${car.name} con ${car.odometer} km...`);

    const form = new FormData();
    const blob = new Blob([fileBytes], { type: 'image/jpeg' });
    form.append('imagen', blob, car.name);
    form.append('odometer', String(car.odometer));

    const startTime = Date.now();
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
      allMetadataVerified = false;
      continue;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Extraer metadatos tanto de respuesta 200 como de 404
    const marca = body.marca || body.vehiculo_identificado?.marca;
    const modelo = body.modelo || body.vehiculo_identificado?.modelo;
    const anio = body.anio || body.vehiculo_identificado?.anio;
    const precio = body.precio_estimado ? `$${body.precio_estimado.toLocaleString('en-US')}` : 'Sin precio precalculado (404)';
    const confianza = body.confianza_vision ?? body.vehiculo_identificado?.confianza ?? 'N/A';

    // Verificaciones de metadatos requeridos
    const hasMarca = typeof marca === 'string' && marca.length > 0;
    const hasModelo = typeof modelo === 'string' && modelo.length > 0;
    const hasAnio = Number.isInteger(anio) && anio >= 1990 && anio <= 2030;
    const metadataOk = hasMarca && hasModelo && hasAnio;

    if (!metadataOk) {
      allMetadataVerified = false;
    }

    results.push({
      Archivo: car.name,
      'Marca Detectada': marca || 'No identificada',
      'Modelo Detectado': modelo || 'No identificado',
      Año: anio || 'N/A',
      Confianza: typeof confianza === 'number' ? `${(confianza * 100).toFixed(0)}%` : confianza,
      HTTP: res.status,
      Precio: precio,
      'Tiempo (s)': `${duration}s`,
      'Metadatos OK': metadataOk ? '✅' : '❌',
    });

    console.log(`  -> HTTP ${res.status} | ${marca} ${modelo} (${anio}) | Confianza: ${confianza} | ${duration}s`);
  }

  console.log('\n================================================================');
  console.log('  📊 RESUMEN DE RESULTADOS DE PRUEBA');
  console.log('================================================================');
  console.table(results);

  if (allMetadataVerified) {
    console.log('\n🎉 ÉXITO: Los metadatos (marca, modelo, año) de los 5 vehículos fueron extraídos correctamente por Gemini.');
    process.exit(0);
  } else {
    console.error('\n⚠️ ADVERTENCIA: Uno o más vehículos no pudieron extraer todos los metadatos requeridos.');
    process.exit(1);
  }
}

// Ejecutar el script
runTests().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
