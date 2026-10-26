import { describe, expect, it } from 'bun:test';
import { PricingService } from '../services/pricingService.js';

describe('PricingService - Módulo de Integración para Modelo de Precios', () => {
  const service = new PricingService();
  // Sin llamadas reales a Gemini en la suite: cada test define la respuesta
  service.allowGeminiFallback = true;
  service.geminiService = { estimateUsMarketPrice: async () => null };

  it('debe consultar la base precalculada de SQLite como estrategia primaria', async () => {
    const result = await service.estimatePrice({
      manufacturer: 'toyota',
      model: 'corolla',
      year: 2015,
      odometer: 50000,
      type: 'sedan',
    });

    expect(result).not.toBeNull();
    expect(result.precio_estimado).toBe(13400);
    expect(result.fuente).toBe('sqlite_precalculo');
    expect(result.precio_min).toBe(10157);
    expect(result.precio_max).toBe(16643);
  });

  it('debe responder null si el auto no está precalculado y el fallback está inactivo (modo estricto ADR-0003)', async () => {
    service.allowMockFallback = false;

    const result = await service.estimatePrice({
      manufacturer: 'lamborghini',
      model: 'aventador',
      year: 2022,
      odometer: 10000,
    });

    expect(result).toBeNull();
  });

  it('debe generar una estimación heurística provisional cuando el mock fallback está habilitado', async () => {
    service.allowMockFallback = true;

    const result = await service.estimatePrice({
      manufacturer: 'bmw',
      model: 'm3',
      year: 2020,
      odometer: 45000,
      type: 'sedan',
    });

    expect(result).not.toBeNull();
    expect(result.fuente).toBe('mock_heuristico_provisional');
    expect(result.precio_estimado).toBeGreaterThan(0);
    expect(result.precio_min).toBeLessThanOrEqual(result.precio_estimado);
    expect(result.precio_max).toBeGreaterThanOrEqual(result.precio_estimado);
  });

  it('debe preguntar a Gemini (mercado EE. UU.) si el modelo no está precalculado', async () => {
    service.allowMockFallback = false;
    let consulta = null;
    service.geminiService = {
      estimateUsMarketPrice: async (vehiculo) => {
        consulta = vehiculo;
        return { precio_estimado: 21000, precio_min: 18500, precio_max: 23500 };
      },
    };

    try {
      const result = await service.estimatePrice({
        manufacturer: 'toyota',
        model: 'supra',
        year: 2015,
        odometer: 50000,
        type: 'sedan',
      });

      expect(consulta).toMatchObject({ marca: 'toyota', modelo: 'supra', anio: 2015, kilometraje: 50000 });
      expect(result.fuente).toBe('gemini_estimacion');
      expect(result.coincidencia).toBe('gemini');
      expect(result.precio_estimado).toBe(21000);
      expect(result.precio_min).toBe(18500);
      expect(result.precio_max).toBe(23500);
    } finally {
      service.geminiService = { estimateUsMarketPrice: async () => null };
    }
  });

  it('no debe consultar a Gemini si el modelo exacto está precalculado', async () => {
    let llamado = false;
    service.geminiService = { estimateUsMarketPrice: async () => { llamado = true; return null; } };

    try {
      const result = await service.estimatePrice({ manufacturer: 'toyota', model: 'corolla', year: 2015, odometer: 50000, type: 'sedan' });
      expect(result.fuente).toBe('sqlite_precalculo');
      expect(llamado).toBe(false);
    } finally {
      service.geminiService = { estimateUsMarketPrice: async () => null };
    }
  });

  it('debe usar el promedio precalculado de marca+año si Gemini no responde', async () => {
    service.allowMockFallback = false;
    const result = await service.estimatePrice({ manufacturer: 'toyota', model: 'supra', year: 2015, odometer: 50000, type: 'sedan' });
    expect(result.fuente).toBe('sqlite_precalculo');
    expect(result.coincidencia).toBe('marca_anio_tipo');
  });
});
