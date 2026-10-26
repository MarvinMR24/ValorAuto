const request = require('supertest');
const app = require('../src/app');
const { getDb } = require('../src/db');

describe('API Healthchecks y Readiness', () => {
  it('GET /health debe responder 200 con status ok y uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /ready debe responder 200 con información de la base precalculada', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database.connected).toBe(true);
    expect(res.body.database.records).toBeGreaterThan(0);
  });
});

describe('POST /tasacion - Validaciones y Contrato', () => {
  const dummyImage = Buffer.from('fake image binary content');

  it('Debe responder 400 si falta el kilometraje', async () => {
    const res = await request(app)
      .post('/tasacion')
      .attach('foto', dummyImage, 'car.jpg');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('kilometraje_invalido');
  });

  it('Debe responder 400 si el kilometraje está fuera de rango (<0 o >1,000,000)', async () => {
    const res = await request(app)
      .post('/tasacion')
      .field('kilometraje', '-50')
      .attach('foto', dummyImage, 'car.jpg');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('kilometraje_invalido');

    const res2 = await request(app)
      .post('/tasacion')
      .field('kilometraje', '2000000')
      .attach('foto', dummyImage, 'car.jpg');

    expect(res2.statusCode).toBe(400);
    expect(res2.body.error).toBe('kilometraje_invalido');
  });

  it('Debe responder 400 si falta la imagen', async () => {
    const res = await request(app)
      .post('/tasacion')
      .field('kilometraje', '45000');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imagen_invalida');
  });

  it('Debe responder 422 si la confianza de visión es menor al umbral (0.6)', async () => {
    const mockLowConfidence = {
      marca: 'toyota',
      modelo: 'corolla',
      anio: 2018,
      confianza: 0.4
    };

    const res = await request(app)
      .post('/tasacion')
      .set('x-mock-vision', JSON.stringify(mockLowConfidence))
      .field('kilometraje', '50000')
      .attach('foto', dummyImage, 'car.jpg');

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('vehiculo_no_identificado');
  });

  it('Debe responder 404 si la combinación de auto no existe en la tabla precalculada', async () => {
    const mockAutoRaro = {
      marca: 'marca_inexistente',
      modelo: 'modelo_inexistente',
      anio: 1950,
      confianza: 0.95
    };

    const res = await request(app)
      .post('/tasacion')
      .set('x-mock-vision', JSON.stringify(mockAutoRaro))
      .field('kilometraje', '50000')
      .attach('foto', dummyImage, 'car.jpg');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('combinacion_no_precalculada');
  });

  it('Debe responder 200 con tasación para un auto existente en la tabla', async () => {
    const db = await getDb();
    const result = db.exec('SELECT manufacturer, year, odometer FROM precalculated_prices LIMIT 1');
    const row = {
      marca: result[0].values[0][0],
      anio: result[0].values[0][1],
      odometer: result[0].values[0][2]
    };

    const mockValido = {
      marca: row.marca,
      modelo: 'f-150',
      anio: row.anio,
      confianza: 0.92
    };

    const res = await request(app)
      .post('/tasacion')
      .set('x-mock-vision', JSON.stringify(mockValido))
      .field('kilometraje', row.odometer.toString())
      .attach('foto', dummyImage, 'car.jpg');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('precio_estimado');
    expect(res.body).toHaveProperty('precio_min');
    expect(res.body).toHaveProperty('precio_max');
    expect(res.body.precio_min).toBeLessThanOrEqual(res.body.precio_estimado);
    expect(res.body.precio_estimado).toBeLessThanOrEqual(res.body.precio_max);
  });
});
