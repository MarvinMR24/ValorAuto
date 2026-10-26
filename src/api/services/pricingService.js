import { sqliteService } from './sqlite.service.js';
import { config } from '../config/config.js';
import { normalizeManufacturer, normalizeVehicleType } from '../utils/normalizer.js';

/**
 * Servicio de Estimación de Precios de Vehículos (Pricing Service)
 *
 * Módulo independiente y desacoplado que actúa como interfaz única para la
 * estimación de valor de mercado en el backend de ValorAuto.
 *
 * Arquitectura (ADR-0001, ADR-0003, ADR-0007):
 * 1. Consulta primaria: Tabla de precios precalculados en SQLite (data/precalc.db).
 * 2. Comportamiento provisional / Mock: Estimación basada en depreciación heurística
 *    cuando la base de precálculo aún no incluye la combinación solicitada o está en desarrollo.
 *
 * // TODO: Punto de integración para el modelo de ML / SQLite de producción
 * // Cuando el pipeline de MLOps (XGBoost/Scikit-Learn) se exponga como microservicio,
 * // modelo serializado ONNX o job nocturno extendido, este es el punto único de enlace.
 */
export class PricingService {
  constructor() {
    this.sqliteService = sqliteService;
    this.baselineMae = config.model?.baselineMae || 3243;
    // Permite activar o desactivar el mock fallback (útil para pruebas y desarrollo continuo)
    this.allowMockFallback = process.env.ALLOW_PRICE_FALLBACK === 'true' || process.env.NODE_ENV === 'test_fallback';
  }

  /**
   * Estima el precio de mercado para un vehículo a partir de sus atributos.
   *
   * @param {Object} params
   * @param {string} params.manufacturer - Marca del vehículo (ej: 'toyota', 'ford')
   * @param {string} params.model - Modelo del vehículo (ej: 'corolla', 'f-150')
   * @param {number} params.year - Año de fabricación (ej: 2018)
   * @param {number} params.odometer - Kilometraje actual del auto (en km)
   * @param {string} [params.type] - Tipo de carrocería (ej: 'sedan', 'suv', 'truck')
   * @returns {Promise<{ precio_estimado: number, precio_min: number, precio_max: number, rango_km: number, fuente: string, pricingDurationMs: number, detalles?: object } | null>}
   */
  async estimatePrice({ manufacturer, model, year, odometer, type = null }) {
    const startTime = performance.now();

    if (!manufacturer || !year || odometer === undefined || odometer === null) {
      throw new Error('Parámetros insuficientes para la estimación de precio.');
    }

    const normManufacturer = normalizeManufacturer(manufacturer);
    const normModel = model ? String(model).toLowerCase().trim() : '';
    const normYear = Number(year);
    const normOdometer = Number(odometer);
    const normType = normalizeVehicleType(type);

    // --------------------------------------------------------------------------
    // 1. ESTRATEGIA PRINCIPAL: Consulta a la base de precálculo SQLite (ADR-0003, ADR-0007)
    // --------------------------------------------------------------------------
    try {
      const sqliteResult = await this.sqliteService.queryPrice({
        manufacturer: normManufacturer,
        model: normModel,
        year: normYear,
        type: normType,
        odometer: normOdometer,
      });

      if (sqliteResult) {
        const pricingDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
        return {
          precio_estimado: sqliteResult.precio_estimado,
          precio_min: sqliteResult.precio_min,
          precio_max: sqliteResult.precio_max,
          rango_km: sqliteResult.rango_km,
          coincidencia: sqliteResult.coincidencia,
          fuente: 'sqlite_precalculo',
          pricingDurationMs,
          detalles: sqliteResult.detalles,
        };
      }
    } catch (err) {
      console.warn(`[PricingService] Fallo al consultar SQLite precalculado: ${err.message}`);
    }

    // --------------------------------------------------------------------------
    // 2. // TODO: Punto de integración para el modelo de ML / SQLite de producción
    //    Aquí se integrará la inferencia directa del modelo XGBoost/Scikit-Learn
    //    (ej. cliente gRPC/HTTP a servicio Python o runner ONNX local).
    // --------------------------------------------------------------------------

    // Si no se permite fallback heurístico (modo estricto MVP), retornar null -> HTTP 404
    if (!this.allowMockFallback) {
      return null;
    }

    // --------------------------------------------------------------------------
    // 3. COMPORTAMIENTO PROVISIONAL (Mock Heurístico de desarrollo)
    //    Calcula un valor referencial coherente con las curvas del dataset de Craigslist
    //    para permitir que el backend y frontend funcionen de punta a punta.
    // --------------------------------------------------------------------------
    const fallback = this._calculateFallbackEstimation({
      manufacturer: normManufacturer,
      model: normModel,
      year: normYear,
      odometer: normOdometer,
      type: normType,
    });

    const pricingDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      ...fallback,
      pricingDurationMs,
    };
  }

  /**
   * Genera una estimación heurística provisional basada en el año y kilometraje.
   * Útil para pruebas y desarrollo cuando el auto no está en la base de precálculo.
   */
  _calculateFallbackEstimation({ manufacturer, model, year, odometer, type }) {
    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - year);

    // Precio base de partida según tipo/categoría aproximada
    let basePrice = 28000;
    if (type === 'truck' || type === 'pickup') basePrice = 36000;
    else if (type === 'suv') basePrice = 32000;
    else if (type === 'sedan' || type === 'hatchback') basePrice = 24000;

    // Ajuste por fabricante (premium vs generalista)
    const premiumBrands = ['audi', 'bmw', 'mercedes-benz', 'lexus', 'porsche', 'volvo'];
    if (premiumBrands.includes(manufacturer)) {
      basePrice *= 1.35;
    }

    // Depreciación por edad (aprox 7% anual compuesto)
    let depreciated = basePrice * Math.pow(0.93, age);

    // Depreciación por uso (odómetro): castigo de ~$0.04 por km por encima del promedio anual
    const kmPenalty = (odometer / 10000) * 450;
    depreciated -= kmPenalty;

    // Asegurar límites razonables de mercado
    const precioEstimado = Math.round(Math.max(1500, Math.min(100000, depreciated)));
    const precioMin = Math.max(500, Math.round(precioEstimado - this.baselineMae));
    const precioMax = Math.round(precioEstimado + this.baselineMae);
    const rangoKm = this.sqliteService.discretizeOdometer(odometer);

    return {
      precio_estimado: precioEstimado,
      precio_min: precioMin,
      precio_max: precioMax,
      rango_km: rangoKm,
      coincidencia: 'ninguna',
      fuente: 'mock_heuristico_provisional',
      detalles: {
        tipo: type || 'desconocido',
        nota: 'Estimación provisional mientras se conecta el modelo de ML final.',
      },
    };
  }
}

export const pricingService = new PricingService();
export default pricingService;
