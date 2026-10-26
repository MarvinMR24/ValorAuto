/**
 * Servicio de Visión por Computadora (Google Generative AI / Gemini)
 * Extrae marca, modelo, año y confianza a partir de una imagen del vehículo.
 */

/**
 * Calcula el rango de kilometraje según la segmentación de la tabla precalculada:
 * - '0-30k'
 * - '30k-60k'
 * - '60k-100k'
 * - '100k-150k'
 * - '150k+'
 */
function calcularRangoKm(km) {
  const kmNum = Number(km);
  if (kmNum <= 30000) return '0-30k';
  if (kmNum <= 60000) return '30k-60k';
  if (kmNum <= 100000) return '60k-100k';
  if (kmNum <= 150000) return '100k-150k';
  return '150k+';
}

/**
 * Identifica el vehículo usando la API de Gemini.
 * @param {Buffer} imageBuffer - Buffer de la imagen.
 * @param {string} mimeType - Tipo MIME (image/jpeg, image/png).
 * @param {object} mockResult - Para pruebas unitarias sin consumir créditos.
 */
async function identificarVehiculo(imageBuffer, mimeType, mockResult = null) {
  if (mockResult) {
    return mockResult;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `
Eres un perito experto en identificación de vehículos. 
Analiza la imagen adjunta e identifica:
1. Marca del auto (ej. "toyota", "ford", "chevrolet", "honda").
2. Modelo del auto (ej. "corolla", "civic", "f-150").
3. Año estimado de fabricación (ej. 2018).
4. Confianza de la identificación (número flotante entre 0.0 y 1.0).

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "marca": "toyota",
  "modelo": "corolla",
  "anio": 2018,
  "confianza": 0.85
}
Si la imagen no corresponde a un automóvil o vehículo identificable, responde con "confianza": 0.0.
`;

  const part = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: mimeType
    }
  };

  // Llamada con timeout de 10 segundos según el contrato de REQ-001
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT_VISION')), 10000)
  );

  const apiPromise = model.generateContent([prompt, part]);

  const response = await Promise.race([apiPromise, timeoutPromise]);
  const text = response.response.text().trim();
  
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('VISION_FORMAT_ERROR');
  }
}

module.exports = {
  calcularRangoKm,
  identificarVehiculo
};
