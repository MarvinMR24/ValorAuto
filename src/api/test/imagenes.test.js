/**
 * Optimizaciones de imagen y resiliencia de Gemini portadas de la rama sam:
 * sharp en el servidor, detección por magic bytes y modelo de respaldo ante 429/503.
 */
import { describe, expect, it, afterEach } from 'bun:test';
import sharp from 'sharp';
import { optimizeImageBuffer } from '../middlewares/upload.middleware.js';
import {
  GeminiVisionService,
  detectMimeFromMagicBytes,
  isBadRequestError,
  isRetryableError,
} from '../services/gemini.service.js';
import { config } from '../config/config.js';

const fotoGrande = () =>
  sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 30, b: 40 } } })
    .jpeg({ quality: 95 })
    .toBuffer();

const respuestaOk = { text: JSON.stringify({ manufacturer: 'toyota', model: 'corolla', year: 2015, type: 'sedan', confidence: 0.9 }) };

describe('Optimización de imágenes (sharp)', () => {
  it('debe reducir una foto de 4000x3000 a 800 px por lado y JPEG', async () => {
    const original = await fotoGrande();
    const { buffer, mimetype } = await optimizeImageBuffer(original, 'image/jpeg');
    const meta = await sharp(buffer).metadata();
    expect(mimetype).toBe('image/jpeg');
    expect(Math.max(meta.width, meta.height)).toBe(config.upload.optimization.maxDimension);
    expect(buffer.length).toBeLessThan(original.length);
  });

  it('debe convertir PNG a JPEG y no agrandar imágenes chicas', async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#1E3A5F' } }).png().toBuffer();
    const { buffer, mimetype } = await optimizeImageBuffer(png, 'image/png');
    const meta = await sharp(buffer).metadata();
    expect(mimetype).toBe('image/jpeg');
    expect(meta.width).toBe(300);
  });

  it('debe devolver el buffer original si no es una imagen legible', async () => {
    const basura = Buffer.alloc(2048, 7);
    const { buffer, mimetype } = await optimizeImageBuffer(basura, 'image/jpeg');
    expect(buffer).toBe(basura);
    expect(mimetype).toBe('image/jpeg');
  });
});

describe('Detección y clasificación de errores', () => {
  it('debe detectar JPEG, PNG y WEBP por magic bytes', async () => {
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).webp().toBuffer();
    expect(detectMimeFromMagicBytes(jpg)).toBe('image/jpeg');
    expect(detectMimeFromMagicBytes(png)).toBe('image/png');
    expect(detectMimeFromMagicBytes(webp)).toBe('image/webp');
    expect(detectMimeFromMagicBytes(Buffer.from('texto plano cualquiera'))).toBeNull();
  });

  it('debe distinguir errores 400 (no reintentar) de 429/503 (reintentar)', () => {
    expect(isBadRequestError({ status: 400 })).toBe(true);
    expect(isBadRequestError({ message: '{"error":{"code":400,"status":"INVALID_ARGUMENT"}}' })).toBe(true);
    expect(isRetryableError({ message: '{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}' })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ message: 'socket hang up' })).toBe(false);
  });
});

describe('Modelo de respaldo de Gemini', () => {
  let service;
  afterEach(() => service?.cache.clear());

  const conModelos = (impl) => {
    service = new GeminiVisionService();
    const llamados = [];
    service.ai = {
      models: {
        generateContent: async (req) => {
          llamados.push(req.model);
          return impl(req.model, llamados.length);
        },
      },
    };
    return llamados;
  };

  it('debe reintentar con el modelo de respaldo cuando el principal responde 503', async () => {
    const llamados = conModelos((_model, n) => {
      if (n === 1) throw Object.assign(new Error('This model is currently experiencing high demand'), { status: 503 });
      return respuestaOk;
    });
    const r = await service.identifyVehicle(Buffer.from(`foto-${Math.random()}`), 'image/jpeg');
    expect(r.manufacturer).toBe('toyota');
    expect(llamados).toEqual([service.modelName, config.gemini.fallbackModel]);
  });

  it('debe responder vision_no_disponible si ambos modelos están saturados', async () => {
    conModelos(() => {
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    });
    await expect(service.identifyVehicle(Buffer.from(`foto-${Math.random()}`))).rejects.toMatchObject({
      code: 'vision_no_disponible',
      statusCode: 503,
    });
  });

  it('no debe reintentar un 400 INVALID_ARGUMENT y debe devolver imagen_invalida', async () => {
    const llamados = conModelos(() => {
      throw Object.assign(new Error('Request contains an invalid argument. INVALID_ARGUMENT'), { status: 400 });
    });
    await expect(service.identifyVehicle(Buffer.from(`foto-${Math.random()}`))).rejects.toMatchObject({
      code: 'imagen_invalida',
      statusCode: 400,
    });
    expect(llamados).toHaveLength(1);
  });

  it('la revisión también usa el modelo de respaldo', async () => {
    const llamados = conModelos((_model, n) => {
      if (n === 1) throw Object.assign(new Error('UNAVAILABLE'), { status: 503 });
      return { text: JSON.stringify({ fallas_comunes: [{ titulo: 'CVT', detalle: 'x', severidad: 'alta' }], revisar_primero: [] }) };
    });
    const r = await service.generateInspectionTips({ marca: 'toyota', modelo: 'corolla', anio: 2015 });
    expect(r.fuente).toBe('gemini');
    expect(llamados).toHaveLength(2);
  });
});
