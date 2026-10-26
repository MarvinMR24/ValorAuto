/**
 * E2E de interfaz: usuario → app (build web) → API → precalc.db / Gemini → resultado en pantalla.
 * Recorre el flujo principal "Ingresar datos" y los casos de error visibles para el usuario.
 * El flujo con foto se cubre en api-foto.spec.mjs (en web no hay cámara nativa).
 */
import { test, expect } from '@playwright/test';

// Las pantallas anteriores quedan montadas (ocultas) en la pila: buscar solo elementos visibles.
const visible = (page, texto, exact = true) => page.getByText(texto, { exact }).locator('visible=true').first();
const campo = (page, placeholder) => page.getByPlaceholder(placeholder).locator('visible=true').first();

async function elegir(page, disparador, busqueda, opcion) {
  await visible(page, disparador).click();
  await campo(page, 'Buscar…').fill(busqueda);
  await visible(page, opcion).click();
  await expect(page.getByPlaceholder('Buscar…').locator('visible=true')).toHaveCount(0); // modal cerrado
}

test('flujo principal: ingresar datos → precio + fallas comunes → volver conserva el formulario', async ({ page }) => {
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));

  await page.goto('/');
  await expect(visible(page, 'Ingresar datos')).toBeVisible();
  await expect(visible(page, 'Usar una foto')).toBeVisible();

  await visible(page, 'Ingresar datos').click();
  await expect(visible(page, 'Elige la marca')).toBeVisible(); // catálogo cargado desde GET /catalogo

  // Validación del lado del cliente
  await visible(page, 'Ver precio').click();
  await expect(visible(page, 'Elige la marca.')).toBeVisible();

  await elegir(page, 'Elige la marca', 'toyo', 'Toyota');
  await elegir(page, 'Elige o escribe el modelo', 'corolla', 'Corolla');
  await campo(page, 'Ej. 2015').fill('2015');
  await campo(page, 'Ej. 85.000').fill('85000');
  await expect(campo(page, 'Ej. 85.000')).toHaveValue('85.000');

  const respuesta = page.waitForResponse((r) => r.url().endsWith('/tasacion/datos'));
  await visible(page, 'Ver precio').click();
  const tasacion = await (await respuesta).json();
  expect(tasacion.coincidencia).toBe('modelo');

  await expect(visible(page, 'Toyota Corolla 2015')).toBeVisible();
  await expect(visible(page, 'Precio estimado')).toBeVisible();
  await expect(visible(page, `US$ ${Math.round(tasacion.precio_estimado).toLocaleString('de-DE')}`)).toBeVisible();
  // GET /revision: con o sin Gemini siempre hay secciones (genérico como respaldo)
  await expect(visible(page, 'Fallas comunes')).toBeVisible({ timeout: 60_000 });
  await expect(visible(page, 'Revisar primero')).toBeVisible();
  await page.screenshot({ path: 'reporte/capturas/resultado.png', fullPage: true });

  await visible(page, 'Volver').click();
  await expect(visible(page, 'Corolla')).toBeVisible();
  await expect(campo(page, 'Ej. 85.000')).toHaveValue('85.000');

  expect(errores).toEqual([]);
});

test('modelo que no está en el precálculo → precio de referencia de marca y año', async ({ page }) => {
  await page.goto('/');
  await visible(page, 'Ingresar datos').click();
  await elegir(page, 'Elige la marca', 'toyota', 'Toyota');
  await visible(page, 'Elige o escribe el modelo').click();
  await campo(page, 'Buscar…').fill('modeloinventado');
  await visible(page, 'Usar “modeloinventado”').click();
  await campo(page, 'Ej. 2015').fill('2015');
  await campo(page, 'Ej. 85.000').fill('85000');
  await visible(page, 'Ver precio').click();
  await expect(visible(page, 'precio de referencia', false)).toBeVisible();
});

test('año sin precio (404) y kilometraje fuera de rango muestran mensajes claros', async ({ page }) => {
  await page.goto('/');
  await visible(page, 'Ingresar datos').click();
  await elegir(page, 'Elige la marca', 'toyota', 'Toyota');
  await elegir(page, 'Elige o escribe el modelo', 'corolla', 'Corolla');

  await campo(page, 'Ej. 2015').fill('1950');
  await campo(page, 'Ej. 85.000').fill('85000');
  await visible(page, 'Ver precio').click();
  await expect(visible(page, 'Todavía no tenemos un precio', false)).toBeVisible();

  await campo(page, 'Ej. 2015').fill('2015');
  await campo(page, 'Ej. 85.000').fill('900000');
  await visible(page, 'Ver precio').click();
  await expect(visible(page, 'Ingresa un kilometraje entre 0 y 500.000.')).toBeVisible();
});
