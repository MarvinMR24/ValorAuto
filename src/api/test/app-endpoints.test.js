import { describe, expect, it, beforeAll, afterEach } from 'bun:test';
import { geminiService } from '../services/gemini.service.js';
import { server } from '../index.js';

const BASE = 'http://localhost:3000';

describe('Endpoints de la app (change app-dos-flujos-tasacion)', () => {
  const originalAi = geminiService.ai;
  const originalIdentify = geminiService.identifyVehicle;

  beforeAll(async () => {
    if (!server.listening) {
      await new Promise((resolve) => server.once('listening', resolve));
    }
  });

  afterEach(() => {
    geminiService.ai = originalAi;
    geminiService.identifyVehicle = originalIdentify;
    geminiService.tipsCache.clear();
  });

  const postDatos = (body) =>
    fetch(`${BASE}/tasacion/datos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  describe('GET /catalogo', () => {
    it('debe devolver marcas, modelos por marca (más anunciados primero) y rango de años', async () => {
      const res = await fetch(`${BASE}/catalogo`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.marcas).toEqual(['chevrolet', 'ford', 'honda', 'toyota']);
      // Orden por SUM(n_anuncios): en la demo el corolla tiene 5 escalones de km (5 × 107)
      expect(data.modelos.toyota).toEqual(['corolla', 'camry', 'tacoma']);
      expect(data.anio_min).toBe(2015);
      expect(data.anio_max).toBe(2018);
    });
  });

  describe('POST /tasacion/datos', () => {
    it('debe tasar con datos ingresados a mano (200, mismo contrato que /tasacion)', async () => {
      const res = await postDatos({ marca: 'Toyota', modelo: 'Corolla', anio: 2015, kilometraje: 52000 });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.precio_estimado).toBe(13400);
      expect(data.precio_min).toBe(13400 - 3243);
      expect(data.precio_max).toBe(13400 + 3243);
      expect(data.coincidencia).toBe('modelo');
      expect(data.confianza_vision).toBeNull();
    });

    it('debe aceptar kilometraje y año como texto numérico (formulario)', async () => {
      const res = await postDatos({ marca: 'honda', modelo: 'civic', anio: '2017', kilometraje: '100000' });
      expect(res.status).toBe(200);
      expect((await res.json()).precio_estimado).toBe(14100);
    });

    it('debe responder 404 si la marca/año no está precalculado', async () => {
      const res = await postDatos({ marca: 'ferrari', modelo: 'f40', anio: 1990, kilometraje: 10000 });
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('combinacion_no_precalculada');
    });

    it('debe responder 400 kilometraje_invalido fuera de 0..500000', async () => {
      const res = await postDatos({ marca: 'toyota', modelo: 'corolla', anio: 2015, kilometraje: 600000 });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('kilometraje_invalido');
    });

    it('debe responder 400 datos_invalidos si falta la marca o el año no es válido', async () => {
      let res = await postDatos({ modelo: 'corolla', anio: 2015, kilometraje: 1000 });
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe('marca');

      res = await postDatos({ marca: 'toyota', modelo: 'corolla', anio: 'dos mil', kilometraje: 1000 });
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe('anio');
    });
  });

  describe('POST /identificar', () => {
    const postImagen = (type = 'image/jpeg') => {
      const form = new FormData();
      form.append('imagen', new Blob(['simulated image data'], { type }), 'auto.jpg');
      return fetch(`${BASE}/identificar`, { method: 'POST', body: form });
    };

    it('debe devolver marca/modelo/año/tipo/confianza sin precio', async () => {
      geminiService.identifyVehicle = async () => ({
        manufacturer: 'toyota', model: 'corolla', year: 2015, type: 'sedan', confidence: 0.92, fromCache: false,
      });
      const res = await postImagen();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ marca: 'toyota', modelo: 'corolla', anio: 2015, tipo: 'sedan', confianza: 0.92 });
    });

    it('debe deducir el tipo por la extensión si la parte llega como octet-stream (expo/fetch)', async () => {
      geminiService.identifyVehicle = async (_buf, mime) => ({
        manufacturer: 'toyota', model: 'corolla', year: 2015, type: mime, confidence: 0.9, fromCache: false,
      });
      const form = new FormData();
      form.append('imagen', new Blob(['jpeg bytes'], { type: 'application/octet-stream' }), 'ABC123.jpg');
      const res = await fetch(`${BASE}/identificar`, { method: 'POST', body: form });
      expect(res.status).toBe(200);
      expect((await res.json()).tipo).toBe('image/jpeg');
    });

    it('debe responder 400 imagen_invalida sin imagen o con formato no permitido', async () => {
      let res = await fetch(`${BASE}/identificar`, { method: 'POST', body: new FormData() });
      expect(res.status).toBe(400);
      res = await postImagen('image/gif');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('imagen_invalida');
    });

    it('debe propagar 422 y 503 de visión', async () => {
      geminiService.identifyVehicle = async () => {
        throw Object.assign(new Error('baja confianza'), { code: 'vehiculo_no_identificado', statusCode: 422 });
      };
      expect((await postImagen()).status).toBe(422);

      geminiService.identifyVehicle = async () => {
        throw Object.assign(new Error('caído'), { code: 'vision_no_disponible', statusCode: 503 });
      };
      const res = await postImagen();
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('vision_no_disponible');
    });
  });

  describe('GET /revision', () => {
    const getRevision = (q = 'marca=toyota&modelo=corolla&anio=2015') => fetch(`${BASE}/revision?${q}`);

    it('debe devolver fallas y puntos a revisar de Gemini, normalizados', async () => {
      let llamadas = 0;
      geminiService.ai = {
        models: {
          generateContent: async () => {
            llamadas += 1;
            return {
              text: JSON.stringify({
                fallas_comunes: [
                  { titulo: 'Bomba de agua', detalle: 'Fugas después de 100k km.', severidad: 'ALTA' },
                  { titulo: 'Sin severidad', detalle: 'x' },
                  { detalle: 'sin título, se descarta' },
                ],
                revisar_primero: [{ titulo: 'Historial de CVT', detalle: 'Cambios de aceite de la caja.' }],
              }),
            };
          },
        },
      };
      const res = await getRevision();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.fuente).toBe('gemini');
      expect(data.fallas_comunes).toEqual([
        { titulo: 'Bomba de agua', detalle: 'Fugas después de 100k km.', severidad: 'alta' },
        { titulo: 'Sin severidad', detalle: 'x', severidad: 'media' },
      ]);
      expect(data.revisar_primero).toHaveLength(1);

      await getRevision();
      expect(llamadas).toBe(1); // segunda vez sale de caché
    });

    it('debe devolver el checklist genérico (200) si Gemini falla o no hay API key', async () => {
      geminiService.ai = { models: { generateContent: async () => { throw new Error('500'); } } };
      let data = await (await getRevision()).json();
      expect(data.fuente).toBe('generico');
      expect(data.fallas_comunes.length).toBeGreaterThan(0);
      expect(data.revisar_primero.length).toBeGreaterThan(0);

      geminiService.ai = null;
      data = await (await getRevision('marca=ford&modelo=f-150&anio=2018')).json();
      expect(data.fuente).toBe('generico');
    });

    it('debe devolver el genérico si Gemini responde fuera de esquema', async () => {
      geminiService.ai = { models: { generateContent: async () => ({ text: '{"otra":"cosa"}' }) } };
      const data = await (await getRevision()).json();
      expect(data.fuente).toBe('generico');
    });

    it('debe responder 400 si faltan marca, modelo o año', async () => {
      const res = await getRevision('marca=toyota');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('datos_invalidos');
    });
  });
});
