/**
 * Middleware de Pre-Validación para Tasación basada en Texto (POST /tasacion).
 *
 * Soporta dos formatos de payload JSON (application/json):
 * A) Basado en campo 'texto': { "texto": "Toyota Corolla 2020 con 45000 km", "kilometraje": 45000 (opcional) }
 * B) Basado en campos estructurados: { "marca": "Toyota", "modelo": "Corolla", "anio": 2020, "kilometraje": 45000 }
 *
 * Filtra peticiones inválidas antes de consumir cuota de la API de Google Gemini:
 * 1. Valida kilometraje si se envía (entero entre 0 y 1,000,000 km) -> 400 kilometraje_invalido.
 * 2. Valida año si se envía (entre 1980 y año actual + 1) -> 400 anio_invalido.
 * 3. Valida que 'texto' o 'marca'/'modelo' no estén vacíos ni sean símbolos o texto sin sentido -> 400 datos_invalidos.
 */

/**
 * Detecta si una cadena es texto basura (solo números, solo símbolos, teclado secuencial o carácter repetido).
 */
function isGibberish(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  // Solo números (ej: "12345")
  if (/^\d+$/.test(trimmed)) return true;
  // Solo caracteres no alfanuméricos (ej: "???", "---", "!@#$")
  if (/^[\W_]+$/.test(trimmed)) return true;
  // Teclado secuencial o repetitivo común
  const lower = trimmed.toLowerCase();
  const commonPatterns = ['asdf', 'asdfg', 'qwerty', 'zxcv', '12345', 'test', 'prueba'];
  if (commonPatterns.includes(lower)) return true;
  // Mismo carácter repetido más de 3 veces (ej: "aaaaa", "zzzz")
  if (/^(.)\1{2,}$/.test(lower)) return true;
  return false;
}

/**
 * Extrae el kilometraje aproximado si está escrito dentro del campo 'texto' (ej: "45000 km", "45,000 kms", "80k km").
 */
function extractKilometrajeFromText(texto) {
  if (!texto || typeof texto !== 'string') return null;

  // Ejemplo: "45k km" o "45k kilometros"
  const kMatch = texto.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*k\s*(?:km|kms|kil[oó]metros)\b/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(',', '.'));
    if (!Number.isNaN(num)) return Math.round(num * 1000);
  }

  // Ejemplo: "45000 km", "45.000 km", "45,000 kilometros"
  const kmMatch = texto.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d{1,7})\s*(?:km|kms|kil[oó]metros|miles|mi)\b/i);
  if (kmMatch) {
    const rawNum = kmMatch[1].replace(/[.,]/g, '');
    const parsed = parseInt(rawNum, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

/**
 * Extrae un año de 4 dígitos (1980..actual+1) si se menciona dentro del campo 'texto'.
 */
function extractYearFromText(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const maxYear = new Date().getFullYear() + 1;
  const matches = texto.match(/\b(19[89]\d|20\d{2})\b/g);
  if (!matches) return null;

  for (const m of matches) {
    const yr = parseInt(m, 10);
    if (yr >= 1980 && yr <= maxYear) {
      return yr;
    }
  }
  return null;
}

export function validateTextTasacion(req, res, next) {
  const body = req.body || {};
  const vehiculoData = body.vehiculo && typeof body.vehiculo === 'object' ? body.vehiculo : {};

  // Extraer campo 'texto' principal (o equivalentes)
  const hasTextoField =
    body.texto !== undefined ||
    vehiculoData.texto !== undefined ||
    body.text !== undefined;
  const rawTexto = body.texto ?? vehiculoData.texto ?? body.text ?? '';
  const textoStr = String(rawTexto).trim();

  // Extraer campos estructurados (compatibilidad completa)
  const rawMarca = body.marca ?? vehiculoData.marca ?? body.manufacturer ?? vehiculoData.manufacturer ?? '';
  const rawModelo = body.modelo ?? vehiculoData.modelo ?? body.model ?? vehiculoData.model ?? '';
  const rawAnio = body.anio ?? vehiculoData.anio ?? body.year ?? vehiculoData.year ?? body.ano ?? vehiculoData.ano;
  const rawKilometraje =
    body.kilometraje ??
    vehiculoData.kilometraje ??
    body.odometer ??
    vehiculoData.odometer ??
    body.mileage ??
    vehiculoData.mileage;
  const rawTipo = body.tipo ?? vehiculoData.tipo ?? body.type ?? vehiculoData.type ?? '';
  const rawEstado =
    body.estado_estetico ??
    vehiculoData.estado_estetico ??
    body.condition ??
    vehiculoData.condition ??
    body.estado ??
    vehiculoData.estado ??
    '';
  const rawDescripcion = body.descripcion ?? vehiculoData.descripcion ?? body.description ?? vehiculoData.description ?? '';

  const marcaStr = String(rawMarca).trim();
  const modeloStr = String(rawModelo).trim();
  const descStr = String(rawDescripcion).trim();

  // Si se envió explícitamente el campo 'texto', validar que no esté vacío ni sea basura
  if (hasTextoField && !marcaStr && !modeloStr) {
    if (!textoStr || isGibberish(textoStr)) {
      return res.status(400).json({
        success: false,
        error: 'datos_invalidos',
        message: 'El campo "texto" debe contener una descripción válida del vehículo (marca, modelo, año, etc.).',
      });
    }
  }

  // 1. REGLA: Validación de Kilometraje
  let parsedKm = null;
  if (rawKilometraje !== undefined && rawKilometraje !== null && rawKilometraje !== '') {
    parsedKm = Number(rawKilometraje);
    if (
      Number.isNaN(parsedKm) ||
      !Number.isFinite(parsedKm) ||
      parsedKm < 0 ||
      parsedKm > 1000000
    ) {
      return res.status(400).json({
        success: false,
        error: 'kilometraje_invalido',
        message: 'El kilometraje debe ser un número entero entre 0 y 1,000,000.',
      });
    }
    parsedKm = Math.round(parsedKm);
  } else if (textoStr) {
    // Si se usó el campo 'texto' sin 'kilometraje' separado, intentar extraerlo del texto o usar 50,000 km por defecto
    const extractedKm = extractKilometrajeFromText(textoStr);
    if (extractedKm !== null) {
      if (extractedKm < 0 || extractedKm > 1000000) {
        return res.status(400).json({
          success: false,
          error: 'kilometraje_invalido',
          message: 'El kilometraje debe ser un número entero entre 0 y 1,000,000.',
        });
      }
      parsedKm = extractedKm;
    } else {
      parsedKm = 50000;
    }
  } else {
    // En modo estructurado sin 'texto', 'kilometraje' es obligatorio
    return res.status(400).json({
      success: false,
      error: 'kilometraje_invalido',
      message: 'El kilometraje debe ser un número entero entre 0 y 1,000,000.',
    });
  }

  // 2. REGLA: Validación de Año (Si está presente, 1980 a año actual + 1)
  let parsedAnio = null;
  if (rawAnio !== undefined && rawAnio !== null && rawAnio !== '') {
    parsedAnio = Number(rawAnio);
    const maxYear = new Date().getFullYear() + 1;
    if (Number.isNaN(parsedAnio) || parsedAnio < 1980 || parsedAnio > maxYear) {
      return res.status(400).json({
        success: false,
        error: 'anio_invalido',
        message: 'El año ingresado está fuera de rango (1980 - actual).',
      });
    }
    parsedAnio = Math.round(parsedAnio);
  } else if (textoStr) {
    parsedAnio = extractYearFromText(textoStr);
  }

  // 3. REGLA: Validación de Marca, Modelo o Texto
  if (!textoStr && !descStr && marcaStr.length < 2 && modeloStr.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'datos_invalidos',
      message: 'Por favor ingresa el campo "texto" o una marca y modelo válidos antes de procesar.',
    });
  }

  if (marcaStr && isGibberish(marcaStr)) {
    return res.status(400).json({
      success: false,
      error: 'datos_invalidos',
      message: 'Por favor ingresa una marca y modelo válidos antes de procesar.',
    });
  }

  if (modeloStr && isGibberish(modeloStr)) {
    return res.status(400).json({
      success: false,
      error: 'datos_invalidos',
      message: 'Por favor ingresa una marca y modelo válidos antes de procesar.',
    });
  }

  // Asignar payload validado y estructurado a la petición
  req.validatedInput = {
    texto: textoStr,
    marca: marcaStr,
    modelo: modeloStr,
    anio: parsedAnio,
    kilometraje: parsedKm,
    tipo: String(rawTipo).trim(),
    estado_estetico: String(rawEstado).trim(),
    descripcion: descStr || textoStr,
  };

  req.odometer = req.validatedInput.kilometraje;

  next();
}

export default validateTextTasacion;
