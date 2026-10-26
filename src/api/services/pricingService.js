import { sqliteService } from './sqlite.service.js';
import { geminiService } from './gemini.service.js';
import { config } from '../config/config.js';
import {
  normalizeManufacturer,
  normalizeVehicleType,
  normalizeCondition,
  normalizeText,
} from '../utils/normalizer.js';
import { logger } from '../utils/logger.js';

/**
 * Servicio Híbrido de Valoración de Vehículos (Pricing Service)
 *
 * Implementa el pipeline híbrido de tasación (Fases 2 y 3):
 * 1. Fase 2: Consulta al Modelo ML local de Leo (XGBoost precalculado en data/precalc.db).
 *    Calcula o recupera la estimación de precio y su nivel de confianza (score 0..1).
 * 2. Fase 3: Lógica Condicional de Evaluación de Confianza (Umbral del 65% = 0.65):
 *    - Caso A (Confianza >= 65%): Responde con el precio del modelo ML local ("origen_precio": "modelo_ml").
 *    - Caso B (Confianza < 65% o vehículo no encontrado en BD local): Ejecuta fallback automático
 *      a Gemini API ("origen_precio": "gemini_fallback") incluyendo la justificación de mercado.
 */
export class PricingService {
  constructor(options = {}) {
    this.sqliteService = options.sqliteService || sqliteService;
    this.geminiService = options.geminiService || geminiService;
    this.baselineMae = config.model?.baselineMae || 3778;
    // Umbral oficial del 65% (0.65) para decidir entre modelo_ml y contingencia
    this.confidenceThreshold =
      options.confidenceThreshold ?? config.model?.mlConfidenceThreshold ?? 0.65;
    // Por defecto false para cumplir estrictamente ADR-0003 y ADR-0004 (responde 404 combinacion_no_precalculada sin inferencia en vivo)
    this.allowFallback =
      options.allowFallback !== undefined
        ? options.allowFallback
        : Boolean(config.model?.allowGeminiFallback);
  }

  /**
   * Estima el precio de mercado aplicando el pipeline híbrido (Modelo ML Local + Gemini Fallback).
   *
   * @param {Object} params
   * @param {string} params.manufacturer - Marca del vehículo (ej: 'toyota', 'ford')
   * @param {string} [params.model] - Modelo del vehículo (ej: 'corolla', 'f-150')
   * @param {number} params.year - Año de fabricación (ej: 2020)
   * @param {number} params.odometer - Kilometraje actual del auto (en km)
   * @param {string} [params.type] - Tipo de carrocería (ej: 'sedan', 'suv', 'truck')
   * @param {string} [params.condition] - Estado estético estimado (ej: 'good', 'excellent')
   * @returns {Promise<{
   *   precio_estimado: number,
   *   precio_min: number,
   *   precio_max: number,
   *   moneda: string,
   *   confianza: number,
   *   confianza_porcentaje: string,
   *   origen_precio: 'modelo_ml' | 'gemini_fallback',
   *   fuente: string,
   *   rango_km: number,
   *   nota: string,
   *   pricingDurationMs: number,
   *   detalles?: object
   * } | null>}
   */
  async estimatePrice({
    manufacturer,
    model = '',
    year,
    odometer,
    type = null,
    condition = 'good',
  }) {
    const startTime = performance.now();

    if (!manufacturer || !year || odometer === undefined || odometer === null) {
      throw new Error('Parámetros insuficientes para la estimación de precio.');
    }

    const normManufacturer = normalizeManufacturer(manufacturer);
    const normModel = normalizeText(model);
    const normYear = Number(year);
    const normOdometer = Number(odometer);
    const normType = normalizeVehicleType(type);
    const normCondition = normalizeCondition(condition);

    // --------------------------------------------------------------------------
    // FASE 2: Consulta al Modelo ML de Leo / Base Precalculada (data/precalc.db)
    // --------------------------------------------------------------------------
    let mlResult = null;
    try {
      mlResult = await this.sqliteService.queryPrice({
        manufacturer: normManufacturer,
        model: normModel,
        year: normYear,
        type: normType,
        condition: normCondition,
        odometer: normOdometer,
      });
    } catch (err) {
      logger.warn(
        { error: err.message, manufacturer: normManufacturer, year: normYear },
        '[PricingService] Error al consultar base precalculada SQLite; procediendo a evaluar contingencia'
      );
    }

    // --------------------------------------------------------------------------
    // FASE 3 - CASO A: Confianza del Modelo ML >= 65% (0.65)
    // --------------------------------------------------------------------------
    if (mlResult && mlResult.confianza >= this.confidenceThreshold) {
      const pricingDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const confianzaPct = `${Math.round(mlResult.confianza * 100)}%`;

      logger.info(
        {
          manufacturer: normManufacturer,
          model: normModel,
          year: normYear,
          confianza: mlResult.confianza,
          origen_precio: 'modelo_ml',
        },
        `[PricingService] Caso A: Confianza ML (${confianzaPct} >= 65%) superada. Usando modelo_ml.`
      );

      return {
        precio_estimado: mlResult.precio_estimado,
        precio_min: mlResult.precio_min,
        precio_max: mlResult.precio_max,
        moneda: 'USD',
        confianza: mlResult.confianza,
        confianza_porcentaje: confianzaPct,
        origen_precio: 'modelo_ml',
        fuente: 'modelo_ml',
        rango_km: mlResult.rango_km,
        nota: 'Precio calculado exitosamente con el modelo ML local.',
        pricingDurationMs,
        detalles: mlResult.detalles,
      };
    }

    // Si el modo estricto sin fallback está forzado explícitamente, devolver null
    if (!this.allowFallback) {
      return null;
    }

    // --------------------------------------------------------------------------
    // FASE 3 - CASO B: Confianza < 65% o Vehículo No Encontrado en BD Local -> Fallback a Gemini
    // --------------------------------------------------------------------------
    const mlConfidencePrev = mlResult?.confianza ?? 0;
    const fallbackReason = mlResult
      ? `Confianza del modelo ML local insuficiente (${Math.round(mlConfidencePrev * 100)}% < ${Math.round(this.confidenceThreshold * 100)}%)`
      : 'Combinación de vehículo no encontrada en la base de datos local (precalc.db)';

    logger.info(
      {
        manufacturer: normManufacturer,
        model: normModel,
        year: normYear,
        mlConfidencePrev,
        threshold: this.confidenceThreshold,
        reason: fallbackReason,
      },
      '[PricingService] Caso B: Activando fallback automático a Gemini para estimación de mercado'
    );

    const fallbackResult = await this.geminiService.estimatePriceFallback({
      manufacturer: normManufacturer,
      model: normModel,
      year: normYear,
      odometer: normOdometer,
      type: normType,
      condition: normCondition,
    });

    const pricingDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const rangoKm = this.sqliteService.discretizeOdometer(normOdometer);
    const confianzaPct = `${Math.round(fallbackResult.confianza * 100)}%`;

    return {
      precio_estimado: fallbackResult.precio_estimado,
      precio_min: fallbackResult.precio_min,
      precio_max: fallbackResult.precio_max,
      moneda: 'USD',
      confianza: fallbackResult.confianza,
      confianza_porcentaje: confianzaPct,
      origen_precio: 'gemini_fallback',
      fuente: 'gemini_fallback',
      rango_km: rangoKm,
      nota: fallbackResult.justificacion,
      pricingDurationMs,
      detalles: {
        motivo_fallback: fallbackReason,
        confianza_ml_previa: mlConfidencePrev,
        estado_estetico: normCondition,
      },
    };
  }
}

export const pricingService = new PricingService();
export default pricingService;
