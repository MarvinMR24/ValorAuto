/**
 * Cliente del endpoint de tasación (src/api, Node.js/Express).
 * Contrato completo: openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md
 *
 * En desarrollo, EXPO_PUBLIC_API_URL apunta al backend local (ver .env.example).
 * Nunca hardcodear URLs de producción ni llaves de API aquí (docs/team_charter.md).
 */

export type TasacionResult = {
  marca: string;
  modelo: string;
  anio: number;
  precio_estimado: number;
  precio_min: number;
  precio_max: number;
};

export type TasacionErrorCode =
  | 'imagen_invalida'
  | 'kilometraje_invalido'
  | 'vehiculo_no_identificado'
  | 'vision_no_disponible'
  | 'vision_format_error'
  | 'combinacion_no_precalculada'
  | 'error_desconocido';

export class TasacionError extends Error {
  code: TasacionErrorCode;
  constructor(code: TasacionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Envía la foto + kilometraje al backend y devuelve la tasación.
 * Lanza TasacionError con el código de error del contrato (ver spec) si el
 * backend responde 4xx/5xx, o Error genérico ante un fallo de red.
 */
export async function tasarAuto(photoUri: string, kilometraje: number): Promise<TasacionResult> {
  const form = new FormData();
  form.append('imagen', {
    uri: photoUri,
    name: 'auto.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  form.append('kilometraje', String(kilometraje));

  let response: Response;
  try {
    response = await fetch(`${API_URL}/tasacion`, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
    });
  } catch (networkError) {
    throw new Error('No se pudo conectar con el backend. Revisa tu conexión e inténtalo de nuevo.');
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code: TasacionErrorCode = body?.error ?? 'error_desconocido';
    const message = mensajePorCodigo(code);
    throw new TasacionError(code, message);
  }

  return body as TasacionResult;
}

function mensajePorCodigo(code: TasacionErrorCode): string {
  switch (code) {
    case 'imagen_invalida':
      return 'La foto no es válida (formato jpg/png, máximo 8MB).';
    case 'kilometraje_invalido':
      return 'El kilometraje ingresado no es válido.';
    case 'vehiculo_no_identificado':
      return 'No pudimos identificar el vehículo en la foto. Probá con otra foto, más clara y de frente.';
    case 'vision_no_disponible':
      return 'El servicio de identificación no está disponible en este momento. Probá de nuevo en unos segundos.';
    case 'vision_format_error':
      return 'Hubo un problema procesando la foto. Probá de nuevo.';
    case 'combinacion_no_precalculada':
      return 'Todavía no tenemos un precio calculado para este vehículo específico.';
    default:
      return 'Ocurrió un error inesperado. Probá de nuevo.';
  }
}
