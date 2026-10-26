import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { sqliteService } from '../services/sqlite.service.js';
import { GeminiVisionService, geminiService } from '../services/gemini.service.js';
import { cacheService } from '../services/cacheService.js';
import { normalizeManufacturer, normalizeText, fuzzyMatch, normalizeVehicleType } from '../utils/normalizer.js';
import { server } from '../index.js';

describe('ValorAuto API - Tests Unitarios e Integración', () => {
  beforeAll(async () => {
    if (!server.listening) {
      await new Promise((resolve) => server.once('listening', resolve));
    }
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('Normalizador y Fuzzy Matching (normalizer.js)', () => {
    it('debe limpiar diacríticos, mayúsculas y caracteres especiales', () => {
      expect(normalizeText('Camión 4x4!')).toBe('camion 4x4');
      expect(normalizeText('  TOYOTA   COROLLA  ')).toBe('toyota corolla');
      expect(normalizeText('Citroën')).toBe('citroen');
    });

    it('debe resolver alias automotrices comunes a sus marcas canónicas', () => {
      expect(normalizeManufacturer('Chevy')).toBe('chevrolet');
      expect(normalizeManufacturer('VW')).toBe('volkswagen');
      expect(normalizeManufacturer('mercedes')).toBe('mercedes-benz');
      expect(normalizeManufacturer('bimmer')).toBe('bmw');
    });

    it('debe normalizar tipos de carrocería mediante alias', () => {
      expect(normalizeVehicleType('pickup')).toBe('truck');
      expect(normalizeVehicleType('camioneta')).toBe('truck');
      expect(normalizeVehicleType('berlina')).toBe('sedan');
      expect(normalizeVehicleType('crossover')).toBe('suv');
    });

    it('debe realizar coincidencia difusa (Fuzzy Matching) con Fuse.js ante errores ortográficos leves', () => {
      const candidates = ['toyota', 'chevrolet', 'ford', 'honda'];
      const match1 = fuzzyMatch('tooyota', candidates);
      expect(match1).not.toBeNull();
      expect(match1.match).toBe('toyota');

      const match2 = fuzzyMatch('chevrolete', candidates);
      expect(match2).not.toBeNull();
      expect(match2.match).toBe('chevrolet');

      const matchNone = fuzzyMatch('lamborghini', candidates);
      expect(matchNone).toBeNull();
    });
  });

  describe('Sistema de Caching SHA-256 (cacheService.js)', () => {
    beforeAll(() => {
      cacheService.clear();
    });

    it('debe generar el hash SHA-256 consistente para un búfer', () => {
      const buf = Buffer.from('imagen de prueba 123');
      const hash1 = cacheService.generateImageHash(buf);
      const hash2 = cacheService.generateImageHash(buf);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('debe almacenar y recuperar un resultado en caché con registro de hit/miss', () => {
      const buf = Buffer.from('vehiculo-test-cache');
      const hash = cacheService.generateImageHash(buf);

      expect(cacheService.get(hash)).toBeNull(); // Miss

      const data = { manufacturer: 'toyota', model: 'corolla', year: 2018 };
      cacheService.set(hash, data);

      const cached = cacheService.get(hash); // Hit
      expect(cached).not.toBeNull();
      expect(cached.manufacturer).toBe('toyota');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
    });
  });

  describe('Servicio de Base de Datos SQLite (sqliteService)', () => {
    it('debe discretizar correctamente el kilometraje a los rangos precalculados', () => {
      // Rangos oficiales: [10000, 50000, 100000, 150000, 200000]
      expect(sqliteService.discretizeOdometer(8000)).toBe(10000);
      expect(sqliteService.discretizeOdometer(45000)).toBe(50000);
      expect(sqliteService.discretizeOdometer(110000)).toBe(100000);
      expect(sqliteService.discretizeOdometer(145000)).toBe(150000);
      expect(sqliteService.discretizeOdometer(230000)).toBe(200000);
    });

    it('debe encontrar una combinación existente y calcular min/max con el MAE', async () => {
      const res = await sqliteService.queryPrice({
        manufacturer: 'Toyota',
        year: 2015,
        type: 'sedan',
        odometer: 52000, // Discretiza a 50000
      });

      expect(res).not.toBeNull();
      expect(res.precio_estimado).toBe(13400);
      expect(res.rango_km).toBe(50000);
      // MAE baseline es 3778
      expect(res.precio_min).toBe(Math.max(0, 13400 - 3778));
      expect(res.precio_max).toBe(13400 + 3778);
    });

    it('debe responder null (404) si el vehículo no existe en la base de precálculo', async () => {
      const res = await sqliteService.queryPrice({
        manufacturer: 'Ferrari',
        year: 2024,
        type: 'coupe',
        odometer: 10000,
      });

      expect(res).toBeNull();
    });

    it('debe reportar estado saludable en checkHealth()', async () => {
      const health = await sqliteService.checkHealth();
      expect(health.status).toBe('connected');
      expect(health.precalculatedRows).toBeGreaterThan(0);
    });
  });

  describe('Servicio de Visión Gemini (GeminiVisionService)', () => {
    const service = new GeminiVisionService();

    it('debe validar y parsear un JSON válido con confianza suficiente', () => {
      const validJson = JSON.stringify({
        manufacturer: 'Toyota',
        model: 'Corolla',
        year: 2015,
        type: 'sedan',
        confidence: 0.92,
      });

      const parsed = service._parseAndValidateResponse(validJson);
      expect(parsed.manufacturer).toBe('toyota');
      expect(parsed.model).toBe('corolla');
      expect(parsed.year).toBe(2015);
      expect(parsed.type).toBe('sedan');
      expect(parsed.confidence).toBe(0.92);
    });

    it('debe rechazar con 422 si la confianza es menor a 0.6', () => {
      const lowConfidenceJson = JSON.stringify({
        manufacturer: 'Toyota',
        model: 'Corolla',
        year: 2015,
        confidence: 0.45,
      });

      expect(() => service._parseAndValidateResponse(lowConfidenceJson)).toThrow();
    });

    it('debe rechazar con 422 si la respuesta de visión no es un JSON válido', () => {
      const badJson = 'Esto no es un JSON de un auto';
      expect(() => service._parseAndValidateResponse(badJson)).toThrow();
    });
  });

  describe('Endpoints HTTP de la API', () => {
    it('GET /health debe responder 200 con status "OK" y diagnóstico completo', async () => {
      const res = await fetch('http://localhost:3000/health');
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('OK');
      expect(data.service).toBe('ValorAuto REST API');
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');
      expect(data.geminiApi).toBeDefined();
      expect(data.cache).toBeDefined();
      expect(data.memory).toBeDefined();
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('GET /docs debe responder 200 con Swagger UI', async () => {
      const res = await fetch('http://localhost:3000/docs/');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="swagger-ui"');
      expect(html).toContain('swagger-ui-bundle.js');
    });

    it('GET /docs.json debe responder 200 con la especificación OpenAPI 3.0 en JSON', async () => {
      const res = await fetch('http://localhost:3000/docs.json');
      expect(res.status).toBe(200);
      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('ValorAuto REST API');
      expect(spec.paths['/tasacion']).toBeDefined();
    });

    it('POST /tasacion sin archivo debe responder 400 Bad Request con imagen_invalida', async () => {
      const form = new FormData();
      form.append('kilometraje', '50000');

      const res = await fetch('http://localhost:3000/tasacion', {
        method: 'POST',
        body: form,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('imagen_invalida');
    });

    it('POST /tasacion con formato de imagen inválido (.txt) debe responder 400', async () => {
      const form = new FormData();
      const fakeFile = new Blob(['texto plano'], { type: 'text/plain' });
      form.append('imagen', fakeFile, 'documento.txt');
      form.append('kilometraje', '50000');

      const res = await fetch('http://localhost:3000/tasacion', {
        method: 'POST',
        body: form,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('imagen_invalida');
    });

    it('POST /tasacion con kilometraje negativo o fuera de rango (>500,000) debe responder 400 con Zod', async () => {
      const formNegative = new FormData();
      const fakeImage = new Blob(['fake image bytes'], { type: 'image/jpeg' });
      formNegative.append('imagen', fakeImage, 'car.jpg');
      formNegative.append('kilometraje', '-100');

      const resNegative = await fetch('http://localhost:3000/tasacion', {
        method: 'POST',
        body: formNegative,
      });

      expect(resNegative.status).toBe(400);
      const dataNegative = await resNegative.json();
      expect(dataNegative.error).toBe('kilometraje_invalido');

      // Validar límite superior de 500,000 km requerido por Zod
      const formExceeded = new FormData();
      formExceeded.append('imagen', fakeImage, 'car.jpg');
      formExceeded.append('odometer', '600000');

      const resExceeded = await fetch('http://localhost:3000/tasacion', {
        method: 'POST',
        body: formExceeded,
      });

      expect(resExceeded.status).toBe(400);
      const dataExceeded = await resExceeded.json();
      expect(dataExceeded.error).toBe('kilometraje_invalido');
    });

    it('POST /tasacion con imagen WEBP válida debe ser aceptada', async () => {
      const originalIdentify = geminiService.identifyVehicle;
      geminiService.identifyVehicle = async () => ({
        manufacturer: 'toyota',
        model: 'corolla',
        year: 2015,
        type: 'sedan',
        confidence: 0.95,
      });

      try {
        const form = new FormData();
        const fakeWebp = new Blob(['simulated webp binary content'], { type: 'image/webp' });
        form.append('imagen', fakeWebp, 'auto.webp');
        form.append('odometer', '50000');

        const res = await fetch('http://localhost:3000/tasacion', {
          method: 'POST',
          body: form,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.marca).toBe('toyota');
      } finally {
        geminiService.identifyVehicle = originalIdentify;
      }
    });

    it('POST /tasacion flujo completo exitoso (200 OK) mockeando visión y validando métricas', async () => {
      const originalIdentify = geminiService.identifyVehicle;
      geminiService.identifyVehicle = async () => ({
        manufacturer: 'toyota',
        model: 'corolla',
        year: 2015,
        type: 'sedan',
        confidence: 0.95,
        fromCache: false,
        visionDurationMs: 45.2,
        imageHash: 'abcdef123456',
      });

      try {
        const form = new FormData();
        const fakeImage = new Blob(['simulated image data'], { type: 'image/jpeg' });
        form.append('imagen', fakeImage, 'auto.jpg');
        form.append('kilometraje', '52000');

        const res = await fetch('http://localhost:3000/tasacion', {
          method: 'POST',
          body: form,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.marca).toBe('toyota');
        expect(data.modelo).toBe('corolla');
        expect(data.anio).toBe(2015);
        expect(data.precio_estimado).toBe(13400);
        expect(data.precio_min).toBe(9622);
        expect(data.precio_max).toBe(17178);

        // Verificación de observabilidad y métricas
        expect(data._metricas).toBeDefined();
        expect(data._metricas.duracion_total_ms).toBeGreaterThan(0);
        expect(res.headers.get('x-response-time-ms')).toBeDefined();
        expect(res.headers.get('x-vision-cache')).toBeDefined();
      } finally {
        geminiService.identifyVehicle = originalIdentify;
      }
    });

    it('POST /tasacion combinación no precalculada debe responder 404', async () => {
      const originalIdentify = geminiService.identifyVehicle;
      geminiService.identifyVehicle = async () => ({
        manufacturer: 'peugeot',
        model: '208',
        year: 2023,
        type: 'hatchback',
        confidence: 0.9,
      });

      try {
        const form = new FormData();
        const fakeImage = new Blob(['simulated image data'], { type: 'image/jpeg' });
        form.append('imagen', fakeImage, 'peugeot.jpg');
        form.append('kilometraje', '30000');

        const res = await fetch('http://localhost:3000/tasacion', {
          method: 'POST',
          body: form,
        });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBe('combinacion_no_precalculada');
      } finally {
        geminiService.identifyVehicle = originalIdentify;
      }
    });

    it('POST /tasacion vehículo no identificado por visión debe responder 422', async () => {
      const originalIdentify = geminiService.identifyVehicle;
      geminiService.identifyVehicle = async () => {
        const err = new Error('No se pudo identificar el vehículo');
        err.code = 'vehiculo_no_identificado';
        err.statusCode = 422;
        throw err;
      };

      try {
        const form = new FormData();
        const fakeImage = new Blob(['simulated image data'], { type: 'image/jpeg' });
        form.append('imagen', fakeImage, 'borroso.jpg');
        form.append('kilometraje', '40000');

        const res = await fetch('http://localhost:3000/tasacion', {
          method: 'POST',
          body: form,
        });

        expect(res.status).toBe(422);
        const data = await res.json();
        expect(data.error).toBe('vehiculo_no_identificado');
      } finally {
        geminiService.identifyVehicle = originalIdentify;
      }
    });

    it('POST /tasacion debe aplicar Rate Limiting (HTTP 429) al superar 10 peticiones por minuto', async () => {
      // Enviamos peticiones rápidas con x-test-ratelimit
      let hit429 = false;
      for (let i = 0; i < 12; i++) {
        const res = await fetch('http://localhost:3000/tasacion', {
          method: 'POST',
          headers: {
            'x-test-ratelimit': 'true',
          },
        });
        if (res.status === 429) {
          hit429 = true;
          const body = await res.json();
          expect(body.error).toBe('limite_excedido');
          break;
        }
      }
      expect(hit429).toBe(true);
    });
  });
});
