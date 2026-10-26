import { describe, expect, it } from 'bun:test';
import { PricingService } from '../services/pricingService.js';

describe('PricingService - Módulo de Integración para Modelo de Precios', () => {
  const service = new PricingService();

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
    expect(result.precio_min).toBe(9622);
    expect(result.precio_max).toBe(17178);
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
});
