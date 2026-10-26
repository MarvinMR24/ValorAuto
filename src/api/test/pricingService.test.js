import { describe, expect, it } from 'bun:test';
import { PricingService } from '../services/pricingService.js';

describe('PricingService - Pipeline Híbrido (Modelo ML Local + Umbral 65% + Gemini Fallback)', () => {
  it('Caso A (Confianza >= 65%): debe retornar el precio del modelo ML local con origen_precio = "modelo_ml"', async () => {
    const service = new PricingService({ confidenceThreshold: 0.65 });

    const result = await service.estimatePrice({
      manufacturer: 'toyota',
      model: 'corolla',
      year: 2015,
      odometer: 50000,
      type: 'sedan',
      condition: 'good',
    });

    expect(result).not.toBeNull();
    expect(result.precio_estimado).toBe(13400);
    expect(result.origen_precio).toBe('modelo_ml');
    expect(result.moneda).toBe('USD');
    expect(result.confianza).toBeGreaterThanOrEqual(0.65);
    expect(result.nota).toContain('modelo ML local');
  });

  it('Caso B (Confianza < 65%): debe hacer fallback automático a Gemini cuando la confianza del modelo ML es menor al 65%', async () => {
    // Mock de sqliteService que devuelve un resultado con confianza baja (52% < 65%)
    const mockLowConfidenceSqlite = {
      discretizeOdometer: () => 50000,
      queryPrice: async () => ({
        precio_estimado: 12000,
        precio_min: 9000,
        precio_max: 15000,
        rango_km: 50000,
        confianza: 0.52, // Menor al umbral del 65% (0.65)
        matchType: 'year_interpolated',
      }),
    };

    const mockGeminiFallback = {
      estimatePriceFallback: async () => ({
        precio_estimado: 14800,
        precio_min: 13200,
        precio_max: 16400,
        confianza: 0.79,
        justificacion: 'Precio estimado por Gemini Fallback debido a baja confianza del modelo local (< 65%).',
      }),
    };

    const service = new PricingService({
      sqliteService: mockLowConfidenceSqlite,
      geminiService: mockGeminiFallback,
      confidenceThreshold: 0.65,
      allowFallback: true,
    });

    const result = await service.estimatePrice({
      manufacturer: 'toyota',
      model: 'corolla',
      year: 2012,
      odometer: 50000,
    });

    expect(result).not.toBeNull();
    expect(result.origen_precio).toBe('gemini_fallback');
    expect(result.precio_estimado).toBe(14800);
    expect(result.confianza).toBe(0.79);
    expect(result.nota).toContain('Gemini Fallback');
    expect(result.detalles.confianza_ml_previa).toBe(0.52);
  });

  it('Caso B (Vehículo no encontrado en BD local): debe activar fallback automático a Gemini', async () => {
    const mockGeminiFallback = {
      estimatePriceFallback: async ({ manufacturer, model, year }) => ({
        precio_estimado: 19500,
        precio_min: 17500,
        precio_max: 21500,
        confianza: 0.76,
        justificacion: `Valoración de mercado estimada por IA para ${manufacturer} ${model} (${year}).`,
      }),
    };

    const service = new PricingService({
      geminiService: mockGeminiFallback,
      confidenceThreshold: 0.65,
      allowFallback: true,
    });

    const result = await service.estimatePrice({
      manufacturer: 'ferrari',
      model: 'f8',
      year: 2024,
      odometer: 10000,
      type: 'coupe',
    });

    expect(result).not.toBeNull();
    expect(result.origen_precio).toBe('gemini_fallback');
    expect(result.precio_estimado).toBe(19500);
    expect(result.moneda).toBe('USD');
    expect(result.nota).toContain('Valoración de mercado estimada por IA');
  });

  it('debe responder null si el auto no está precalculado y el fallback está deshabilitado explícitamente', async () => {
    const service = new PricingService({ allowFallback: false });

    const result = await service.estimatePrice({
      manufacturer: 'lamborghini',
      model: 'aventador',
      year: 2022,
      odometer: 10000,
    });

    expect(result).toBeNull();
  });
});
