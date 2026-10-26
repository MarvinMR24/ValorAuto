/**
 * Cliente del backend de ValorAuto (src/api, Bun/Express).
 * Contratos: openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md y
 * openspec/changes/app-dos-flujos-tasacion/specs/app-tasacion/spec.md
 *
 * EXPO_PUBLIC_API_URL apunta al backend (ver .env.example). En un teléfono real
 * tiene que ser la IP de la computadora en la red local, no localhost.
 * Nunca hardcodear URLs de producción ni llaves de API aquí (docs/team_charter.md).
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Catalogo = {
  marcas: string[];
  modelos: Record<string, string[]>;
  anio_min: number;
  anio_max: number;
};

export type Identificacion = {
  marca: string;
  modelo: string;
  anio: number;
  tipo: string | null;
  confianza: number;
};

export type Coincidencia = 'modelo' | 'marca_anio_tipo' | 'marca_anio' | 'ninguna';

export type TasacionResult = {
  marca: string;
  modelo: string;
  anio: number;
  precio_estimado: number;
  precio_min: number;
  precio_max: number;
  rango_km_consultado?: number;
  coincidencia?: Coincidencia;
};

export type DatosVehiculo = {
  marca: string;
  modelo: string;
  anio: number;
  kilometraje: number;
  tipo?: string | null;
};

export type Revision = {
  fallas_comunes: { titulo: string; detalle: string; severidad: 'alta' | 'media' | 'baja' }[];
  revisar_primero: { titulo: string; detalle: string }[];
  fuente: 'gemini' | 'generico';
};

export type TasacionErrorCode =
  | 'imagen_invalida'
  | 'kilometraje_invalido'
  | 'datos_invalidos'
  | 'vehiculo_no_identificado'
  | 'vision_no_disponible'
  | 'vision_format_error'
  | 'combinacion_no_precalculada'
  | 'limite_excedido'
  | 'catalogo_no_disponible'
  | 'sin_conexion'
  | 'error_desconocido';

export class TasacionError extends Error {
  code: TasacionErrorCode;
  campo?: string;
  constructor(code: TasacionErrorCode, message: string, campo?: string) {
    super(message);
    this.code = code;
    this.campo = campo;
  }
}

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Gemini con imagen puede tardar hasta el timeout del backend (VISION_TIMEOUT_MS, 25 s por
// defecto y configurable hasta ~45 s); la app espera más para que el error lo decida el backend.
const TIMEOUT_VISION_MS = 50_000;
const TIMEOUT_MS = 15_000;

async function pedir<T>(ruta: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${ruta}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch (err) {
    // El detalle real (red, timeout, FormData inválido…) queda en la consola de Metro.
    console.warn(`[api] ${init.method ?? 'GET'} ${ruta} falló antes de recibir respuesta:`, err);
    throw new TasacionError(
      'sin_conexion',
      'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code: TasacionErrorCode = body?.error ?? 'error_desconocido';
    throw new TasacionError(code, mensajePorCodigo(code), body?.campo);
  }
  return body as T;
}

/** Marcas, modelos por marca y rango de años para los selectores del formulario. */
export function getCatalogo(): Promise<Catalogo> {
  return pedir<Catalogo>('/catalogo');
}

/**
 * Achica la foto a 1280 px de ancho en JPEG 0.7 antes de subirla: queda muy por
 * debajo del límite de 5 MB del backend y Gemini responde más rápido.
 */
export async function prepararFoto(uri: string): Promise<string> {
  const imagen = await ImageManipulator.manipulate(uri).resize({ width: 1280 }).renderAsync();
  const resultado = await imagen.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return resultado.uri;
}

/**
 * Arma el multipart con la foto. Desde SDK 58 el `fetch` global es el de Expo
 * (expo/fetch), que NO acepta el objeto estilo React Native `{ uri, name, type }`
 * ("Unsupported FormDataPart implementation"): la foto va como `File` de
 * expo-file-system, que implementa Blob.
 */
function formConFoto(uri: string): FormData {
  const form = new FormData();
  form.append('imagen', new File(uri) as unknown as Blob, 'auto.jpg');
  return form;
}

/** Flujo "Usar una foto": identifica marca/modelo/año para prellenar el formulario. */
export async function identificar(photoUri: string): Promise<Identificacion> {
  const uri = await prepararFoto(photoUri);
  const form = formConFoto(uri);
  return pedir<Identificacion>('/identificar', { method: 'POST', body: form }, TIMEOUT_VISION_MS);
}

/** Precio a partir de los datos del formulario (ambos flujos terminan acá). */
export function tasarConDatos(datos: DatosVehiculo): Promise<TasacionResult> {
  return pedir<TasacionResult>('/tasacion/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
}

/** Fallas comunes y puntos a revisar primero (nunca falla del lado del backend: cae a un checklist genérico). */
export function getRevision(v: { marca: string; modelo: string; anio: number }): Promise<Revision> {
  const q = `marca=${encodeURIComponent(v.marca)}&modelo=${encodeURIComponent(v.modelo)}&anio=${v.anio}`;
  return pedir<Revision>(`/revision?${q}`, {}, TIMEOUT_VISION_MS);
}

/**
 * Tasación en un solo paso (foto + kilometraje) contra POST /tasacion.
 * La app ya no la usa (usa identificar + tasarConDatos), se mantiene por compatibilidad.
 */
export async function tasarAuto(photoUri: string, kilometraje: number): Promise<TasacionResult> {
  const uri = await prepararFoto(photoUri);
  const form = formConFoto(uri);
  form.append('kilometraje', String(kilometraje));
  return pedir<TasacionResult>('/tasacion', { method: 'POST', body: form }, TIMEOUT_VISION_MS);
}

export function mensajePorCodigo(code: TasacionErrorCode): string {
  switch (code) {
    case 'imagen_invalida':
      return 'La foto no es válida (formato jpg, png o webp, máximo 5 MB).';
    case 'kilometraje_invalido':
      return 'El kilometraje debe ser un número entero entre 0 y 500.000.';
    case 'datos_invalidos':
      return 'Revisa los datos del vehículo: marca, modelo y año son obligatorios.';
    case 'vehiculo_no_identificado':
      return 'No pudimos identificar el vehículo en la foto. Prueba con otra foto más clara y de frente, o completa los datos a mano.';
    case 'vision_no_disponible':
      return 'El servicio de identificación por foto no está disponible ahora. Puedes completar los datos a mano.';
    case 'vision_format_error':
      return 'Hubo un problema procesando la foto. Prueba de nuevo o completa los datos a mano.';
    case 'combinacion_no_precalculada':
      return 'Todavía no tenemos un precio para esa marca y año. Prueba con otro año o modelo.';
    case 'limite_excedido':
      return 'Hiciste muchas consultas seguidas. Espera un minuto y vuelve a intentarlo.';
    case 'catalogo_no_disponible':
      return 'El catálogo de vehículos no está disponible todavía.';
    case 'sin_conexion':
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    default:
      return 'Ocurrió un error inesperado. Prueba de nuevo.';
  }
}
