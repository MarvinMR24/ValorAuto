import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { sqliteService } from '../services/sqlite.service.js';
import { GeminiVisionService, geminiService } from '../services/gemini.service.js';
import { cacheService } from '../services/cacheService.js';
import {
  normalizeManufacturer,
  normalizeText,
  fuzzyMatch,
  normalizeVehicleType,
  normalizeCondition,
  formatDisplayName,
} from '../utils/normalizer.js';
import { server } from '../index.js';

describe('ValorAuto API - Tests Unitarios e Integración (Pipeline Híbrido)', () => {
  beforeAll(async () => {
    sqliteService.resetConnection();
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

    it('debe normalizar tipos de carrocería y estado estético (condition)', () => {
      expect(normalizeVehicleType('pickup')).toBe('truck');
      expect(normalizeVehicleType('camioneta')).toBe('truck');
      expect(normalizeVehicleType('berlina')).toBe('sedan');
      expect(normalizeCondition('excelente')).toBe('excellent');
      expect(normalizeCondition('buen estado')).toBe('good');
      expect(normalizeCondition('regular')).toBe('fair');
    });

    it('debe formatear nombres para visualización (formatDisplayName)', () => {
      expect(formatDisplayName('toyota')).toBe('Toyota');
      expect(formatDisplayName('corolla')).toBe('Corolla');
      expect(formatDisplayName('bmw')).toBe('BMW');
      expect(formatDisplayName('mercedes-benz')).toBe('Mercedes-Benz');
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

  describe('Fase 2: Servicio de Base de Datos SQLite (sqliteService)', () => {
    it('debe discretizar correctamente el kilometraje a los rangos precalculados', () => {
      expect(sqliteService.discretizeOdometer(8000)).toBe(10000);
      expect(sqliteService.discretizeOdometer(45000)).toBe(50000);
      expect(sqliteService.discretizeOdometer(110000)).toBe(100000);
      expect(sqliteService.discretizeOdometer(145000)).toBe(150000);
      expect(sqliteService.discretizeOdometer(230000)).toBe(200000);
    });

    it('debe encontrar una combinación existente con confianza >= 0.65 y calcular min/max con el MAE', async () => {
      const res = await sqliteService.queryPrice({
        manufacturer: 'Toyota',
        year: 2015,
        type: 'sedan',
        odometer: 52000, // Discretiza a 50000
      });

      expect(res).not.toBeNull();
      expect(res.precio_estimado).toBe(13400);
      expect(res.rango_km).toBe(50000);
      expect(res.confianza).toBeGreaterThanOrEqual(0.65);
      expect(res.precio_min).toBe(Math.max(0, 13400 - 3778));
      expect(res.precio_max).toBe(13400 + 3778);
    });

    it('debe asignar confianza < 0.65 cuando el año consultado difiere en 2 o más años y allowYearInterpolation=true', async () => {
      const res = await sqliteService.queryPrice({
        manufacturer: 'Toyota',
        year: 1992, // En BD el más cercano es 1995 (diferencia de 3 años)
        type: 'sedan',
        odometer: 50000,
        allowYearInterpolation: true,
      });

      expect(res).not.toBeNull();
      expect(res.matchType).toBe('year_interpolated');
      expect(res.confianza).toBeLessThan(0.65);
    });

    it('debe responder null si la combinación (marca/año) no existe en data/precalc.db en modo estricto ADR-0003', async () => {
      const res = await sqliteService.queryPrice({
        manufacturer: 'Ferrari',
        year: 2024,
        type: 'coupe',
        odometer: 10000,
      });

      expect(res).toBeNull();
    });

    it('debe recargar automáticamente la conexión si cambia mtimeMs de data/precalc.db (swap atómico os.replace)', async () => {
      await sqliteService.getDb();
      expect(sqliteService.lastMtimeMs).not.toBeNull();

      // Simular un cambio de mtimeMs tras un os.replace() del pipeline nocturno
      sqliteService.lastMtimeMs = 12345;
      const dbReloaded = await sqliteService.getDb();
      expect(dbReloaded).not.toBeNull();
      expect(sqliteService.lastMtimeMs).not.toBe(12345);
    });

    it('debe reportar estado saludable en checkHealth()', async () => {
      const health = await sqliteService.checkHealth();
      expect(health.status).toBe('connected');
      expect(health.precalculatedRows).toBeGreaterThan(0);
    });
  });

  describe('Fase 2: Servicio de Normalización y Validación Textual (Gemini)', () => {
    const service = new GeminiVisionService();

    it('debe parsear y estructurar la respuesta JSON de normalización textual', () => {
      const mockJson = JSON.stringify({
        existe_vehiculo: true,
        es_reconocible: true,
        confidence: 0.95,
        correcciones_aplicadas: ["Se corrigió 'Toyotta' a 'Toyota'", "Se corrigió 'Corola' a 'Corolla'"],
        motivo_rechazo: null,
        vehiculo: {
          marca: 'Toyota',
          manufacturer_key: 'toyota',
          modelo: 'Corolla',
          model_key: 'corolla',
          anio: 2017,
          tipo: 'sedan',
          estado_estetico: 'excellent',
        },
      });

      const parsed = service._parseAndValidateTextResponse(mockJson, { marca: 'Toyotta', modelo: 'Corola' });
      expect(parsed.existe_vehiculo).toBe(true);
      expect(parsed.vehiculo.marca).toBe('Toyota');
      expect(parsed.vehiculo.manufacturer_key).toBe('toyota');
      expect(parsed.vehiculo.modelo).toBe('Corolla');
      expect(parsed.vehiculo.model_key).toBe('corolla');
      expect(parsed.vehiculo.tipo).toBe('sedan');
      expect(parsed.vehiculo.estado_estetico).toBe('excellent');
      expect(parsed.correcciones_aplicadas).toHaveLength(2);
    });

    it('debe reportar existe_vehiculo=false si Gemini determina que el auto no existe', () => {
      const mockFakeJson = JSON.stringify({
        existe_vehiculo: false,
        es_reconocible: false,
        confidence: 0.2,
        correcciones_aplicadas: [],
        motivo_rechazo: "El vehículo 'Toyota Pepito' no existe en el mercado automotriz.",
        vehiculo: {
          marca: 'Toyota',
          modelo: 'Pepito',
        },
      });

      const parsed = service._parseAndValidateTextResponse(mockFakeJson, { marca: 'Toyota', modelo: 'Pepito' });
      expect(parsed.existe_vehiculo).toBe(false);
      expect(parsed.motivo_rechazo).toContain('no existe');
    });

    it('debe limpiar prefijos "data:image/...;base64," en _cleanImageBase64 y validar mimeType exacto', () => {
      const rawBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
      const dataUrlString = `data:image/jpeg;base64,${rawBase64}`;

      const cleanedFromStr = service._cleanImageBase64(dataUrlString);
      expect(cleanedFromStr.cleanBase64).toBe(rawBase64);
      expect(cleanedFromStr.extractedMimeType).toBe('image/jpeg');
      expect(cleanedFromStr.cleanBase64.startsWith('data:image')).toBe(false);

      const cleanedFromBuf = service._cleanImageBase64(Buffer.from(dataUrlString, 'utf8'));
      expect(cleanedFromBuf.cleanBase64).toBe(rawBase64);

      // Normaliza image/jpg -> image/jpeg
      const normalizedMime = service._validateAndNormalizeMimeType('image/jpg', cleanedFromStr.binaryBuffer);
      expect(normalizedMime).toBe('image/jpeg');

      // Rechaza MIME inválido con 400 INVALID_ARGUMENT
      expect(() => service._validateAndNormalizeMimeType('application/pdf', Buffer.from('12345678'))).toThrow();
    });

    it('NO debe reintentar cuando Gemini responde con error 400 o status INVALID_ARGUMENT', async () => {
      const customService = new GeminiVisionService();
      let attempts = 0;
      customService.ai = {
        models: {
          generateContent: async () => {
            attempts++;
            const err = new Error('Request contains an invalid argument.');
            err.status = 'INVALID_ARGUMENT';
            err.statusCode = 400;
            throw err;
          },
        },
      };

      const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      let caughtError = null;
      try {
        await customService.identifyVehicle(fakeJpeg, 'image/jpeg');
      } catch (err) {
        caughtError = err;
      }

      expect(attempts).toBe(1);
      expect(caughtError).not.toBeNull();
      expect(caughtError.statusCode).toBe(400);
      expect(caughtError.status).toBe('INVALID_ARGUMENT');
    });

    it('SÍ debe reintentar únicamente cuando Gemini responde con 429 o 503', async () => {
      const customService = new GeminiVisionService();
      let attempts = 0;
      customService.ai = {
        models: {
          generateContent: async () => {
            attempts++;
            if (attempts === 1) {
              const err = new Error('Service Unavailable');
              err.statusCode = 503;
              throw err;
            }
            return {
              text: JSON.stringify({
                manufacturer: 'toyota',
                model: 'corolla',
                year: 2020,
                type: 'sedan',
                condition: 'good',
                confidence: 0.92,
              }),
            };
          },
        },
      };

      const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x02]);
      const res = await customService.identifyVehicle(fakeJpeg, 'image/jpeg');
      expect(attempts).toBe(2);
      expect(res.manufacturer).toBe('toyota');
      expect(res.model).toBe('corolla');
    });
  });

  describe('Endpoints HTTP y Tasación Textual (Fases 1 a 4)', () => {
    const getBaseUrl = () => `http://localhost:${server.address()?.port || 3001}`;

    it('GET /health debe responder 200 con status "OK" y diagnóstico completo', async () => {
      const res = await fetch(`${getBaseUrl()}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('OK');
      expect(data.service).toBe('ValorAuto REST API');
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');
      expect(data.geminiApi).toBeDefined();
      expect(data.cache).toBeDefined();
      expect(data.memory).toBeDefined();
    });

    it('GET /docs debe responder 200 con Swagger UI', async () => {
      const res = await fetch(`${getBaseUrl()}/docs/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="swagger-ui"');
      expect(html).toContain('swagger-ui-bundle.js');
    });

    it('GET /docs.json debe responder 200 con la especificación OpenAPI 3.0 incluyendo /tasacion y /tasacion/imagen', async () => {
      const res = await fetch(`${getBaseUrl()}/docs.json`);
      expect(res.status).toBe(200);
      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('ValorAuto REST API');
      expect(spec.paths['/tasacion']).toBeDefined();
      expect(spec.paths['/tasacion/imagen']).toBeDefined();
    });

    it('POST /tasacion con el campo "texto" en JSON debe responder 200 OK', async () => {
      const originalNormalize = geminiService.normalizeAndValidateVehicleText;
      geminiService.normalizeAndValidateVehicleText = async () => ({
        existe_vehiculo: true,
        es_reconocible: true,
        confidence: 0.97,
        correcciones_aplicadas: ["Se corrigió 'Toyotta' a 'Toyota'"],
        motivo_rechazo: null,
        vehiculo: {
          marca: 'Toyota',
          manufacturer_key: 'toyota',
          modelo: 'Corolla',
          model_key: 'corolla',
          anio: 2020,
          kilometraje: 45000,
          tipo: 'sedan',
          estado_estetico: 'good',
        },
        fromCache: false,
        durationMs: 25.0,
      });

      try {
        const res = await fetch(`${getBaseUrl()}/tasacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texto: 'Toyotta Corolla 2020 con 45000 km',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.vehiculo.marca).toBe('Toyota');
        expect(data.vehiculo.modelo).toBe('Corolla');
        expect(data.tasacion.precio_estimado).toBe(15500);
      } finally {
        geminiService.normalizeAndValidateVehicleText = originalNormalize;
      }
    });

    it('POST /tasacion/imagen sin archivo "imagen" debe responder 400 imagen_invalida', async () => {
      const formData = new FormData();
      formData.append('kilometraje', '45000');

      const res = await fetch(`${getBaseUrl()}/tasacion/imagen`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('imagen_invalida');
    });

    it('POST /tasacion/imagen con imagen válida en multipart/form-data debe responder 200 OK', async () => {
      const originalIdentify = geminiService.identifyVehicle;
      geminiService.identifyVehicle = async () => ({
        manufacturer: 'toyota',
        model: 'corolla',
        year: 2020,
        type: 'sedan',
        condition: 'good',
        confidence: 0.94,
        fromCache: false,
        visionDurationMs: 120.5,
        imageHash: 'abc123hash',
      });

      try {
        const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
        const blob = new Blob([fakeJpegBytes], { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('imagen', blob, 'corolla.jpg');
        formData.append('kilometraje', '45000');

        const res = await fetch(`${getBaseUrl()}/tasacion/imagen`, {
          method: 'POST',
          body: formData,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.vehiculo.marca).toBe('Toyota');
        expect(data.vehiculo.modelo).toBe('Corolla');
        expect(data.tasacion.precio_estimado).toBe(15500);
        expect(data.tasacion.origen_precio).toBe('modelo_ml');
      } finally {
        geminiService.identifyVehicle = originalIdentify;
      }
    });

    it('POST /tasacion sin kilometraje debe responder 400 Bad Request con kilometraje_invalido', async () => {
      const res = await fetch(`${getBaseUrl()}/tasacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marca: 'Toyota',
          modelo: 'Corolla',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('kilometraje_invalido');
    });

    it('POST /tasacion con kilometraje negativo o fuera de rango (>1,000,000) debe responder 400', async () => {
      const resNegative = await fetch(`${getBaseUrl()}/tasacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marca: 'Toyota',
          modelo: 'Corolla',
          kilometraje: -50,
        }),
      });

      expect(resNegative.status).toBe(400);
      const dataNegative = await resNegative.json();
      expect(dataNegative.error).toBe('kilometraje_invalido');

      const resExceeded = await fetch(`${getBaseUrl()}/tasacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marca: 'Toyota',
          modelo: 'Corolla',
          kilometraje: 1500000,
        }),
      });

      expect(resExceeded.status).toBe(400);
      const dataExceeded = await resExceeded.json();
      expect(dataExceeded.error).toBe('kilometraje_invalido');
    });

    it('POST /tasacion con año fuera de rango (< 1980 o futuro lejano) debe responder 400 anio_invalido', async () => {
      const res = await fetch(`${getBaseUrl()}/tasacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marca: 'Toyota',
          modelo: 'Corolla',
          anio: 1965,
          kilometraje: 50000,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('anio_invalido');
    });

    it('POST /tasacion con marca o modelo basura ("12345", "???", "asdfg") debe responder 400 datos_invalidos', async () => {
      const resGibberish = await fetch(`${getBaseUrl()}/tasacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marca: '12345',
          modelo: '???',
          kilometraje: 50000,
        }),
      });

      expect(resGibberish.status).toBe(400);
      const dataGibberish = await resGibberish.json();
      expect(dataGibberish.error).toBe('datos_invalidos');
    });

    it('POST /tasacion con datos válidos debe responder 200 OK con tasación calculada desde SQLite', async () => {
      const originalNormalize = geminiService.normalizeAndValidateVehicleText;
      geminiService.normalizeAndValidateVehicleText = async () => ({
        existe_vehiculo: true,
        es_reconocible: true,
        confidence: 0.96,
        correcciones_aplicadas: ["Se corrigió 'Toyotta' a 'Toyota'", "Se corrigió 'Corola' a 'Corolla'"],
        motivo_rechazo: null,
        vehiculo: {
          marca: 'Toyota',
          manufacturer_key: 'toyota',
          modelo: 'Corolla',
          model_key: 'corolla',
          anio: 2020,
          tipo: 'sedan',
          estado_estetico: 'good',
        },
        fromCache: false,
        durationMs: 45.2,
      });

      try {
        const res = await fetch(`${getBaseUrl()}/tasacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marca: 'Toyotta',
            modelo: 'Corola',
            anio: 2020,
            kilometraje: 45000,
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.success).toBe(true);
        expect(data.vehiculo).toEqual({
          marca: 'Toyota',
          modelo: 'Corolla',
          anio: 2020,
          kilometraje: 45000,
          tipo: 'sedan',
          estado_estetico: 'good',
        });

        expect(data.tasacion).toBeDefined();
        expect(data.tasacion.precio_estimado).toBe(15500);
        expect(data.tasacion.precio_min).toBe(Math.max(0, 15500 - 3778));
        expect(data.tasacion.precio_max).toBe(15500 + 3778);
        expect(data.tasacion.moneda).toBe('USD');
        expect(data.tasacion.confianza).toBeGreaterThanOrEqual(0.65);
        expect(data.tasacion.origen_precio).toBe('modelo_ml');

        expect(data.metadatos).toBeDefined();
        expect(data.metadatos.correcciones_aplicadas).toHaveLength(2);
        expect(data.metadatos.nota).toBe('Precio calculado exitosamente con el modelo ML local.');
      } finally {
        geminiService.normalizeAndValidateVehicleText = originalNormalize;
      }
    });

    it('POST /tasacion con vehículo inventado ("Toyota Pepito") debe responder 422 vehiculo_no_identificado', async () => {
      const originalNormalize = geminiService.normalizeAndValidateVehicleText;
      geminiService.normalizeAndValidateVehicleText = async () => ({
        existe_vehiculo: false,
        es_reconocible: false,
        confidence: 0.15,
        correcciones_aplicadas: [],
        motivo_rechazo: "El modelo 'Toyota Pepito' no existe en el mercado automotriz real.",
        vehiculo: {
          marca: 'Toyota',
          manufacturer_key: 'toyota',
          modelo: 'Pepito',
          model_key: 'pepito',
          anio: 2020,
          tipo: 'sedan',
          estado_estetico: 'good',
        },
        fromCache: false,
        durationMs: 40.1,
      });

      try {
        const res = await fetch(`${getBaseUrl()}/tasacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marca: 'Toyota',
            modelo: 'Pepito',
            kilometraje: 35000,
          }),
        });

        expect(res.status).toBe(422);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toBe('vehiculo_no_identificado');
        expect(data.message).toContain('no existe');
      } finally {
        geminiService.normalizeAndValidateVehicleText = originalNormalize;
      }
    });

    it('POST /tasacion con combinación fuera de base SQLite debe responder 404 combinacion_no_precalculada', async () => {
      const originalNormalize = geminiService.normalizeAndValidateVehicleText;
      geminiService.normalizeAndValidateVehicleText = async () => ({
        existe_vehiculo: true,
        es_reconocible: true,
        confidence: 0.95,
        correcciones_aplicadas: [],
        motivo_rechazo: null,
        vehiculo: {
          marca: 'Ferrari',
          manufacturer_key: 'ferrari',
          modelo: 'F8',
          model_key: 'f8',
          anio: 2024,
          tipo: 'coupe',
          estado_estetico: 'good',
        },
        fromCache: false,
        durationMs: 42.0,
      });

      try {
        const res = await fetch(`${getBaseUrl()}/tasacion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marca: 'Ferrari',
            modelo: 'F8',
            anio: 2024,
            kilometraje: 10000,
          }),
        });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toBe('combinacion_no_precalculada');
      } finally {
        geminiService.normalizeAndValidateVehicleText = originalNormalize;
      }
    });

    it('POST /tasacion debe aplicar Rate Limiting (HTTP 429) al superar 10 peticiones por minuto', async () => {
      const originalNormalize = geminiService.normalizeAndValidateVehicleText;
      geminiService.normalizeAndValidateVehicleText = async () => ({
        existe_vehiculo: true,
        es_reconocible: true,
        confidence: 0.95,
        correcciones_aplicadas: [],
        motivo_rechazo: null,
        vehiculo: {
          marca: 'Toyota',
          manufacturer_key: 'toyota',
          modelo: 'Corolla',
          model_key: 'corolla',
          anio: 2020,
          tipo: 'sedan',
          estado_estetico: 'good',
        },
        fromCache: true,
        durationMs: 1.0,
      });

      try {
        let hit429 = false;
        for (let i = 0; i < 15; i++) {
          const res = await fetch(`${getBaseUrl()}/tasacion`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-test-ratelimit': 'true',
            },
            body: JSON.stringify({
              marca: 'Toyota',
              modelo: 'Corolla',
              kilometraje: 50000,
            }),
          });
          if (res.status === 429) {
            hit429 = true;
            const body = await res.json();
            expect(body.error).toBe('limite_excedido');
            break;
          }
        }
        expect(hit429).toBe(true);
      } finally {
        geminiService.normalizeAndValidateVehicleText = originalNormalize;
      }
    });
  });
});
