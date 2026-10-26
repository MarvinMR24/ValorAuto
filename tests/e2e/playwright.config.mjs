import { defineConfig, devices } from '@playwright/test';

export const API_URL = process.env.API_URL || 'http://localhost:3000';
const PUERTO_APP = Number(process.env.E2E_APP_PORT || 8090);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'reporte', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PUERTO_APP}`,
    ...devices['iPhone 13'],
    browserName: 'chromium',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  // Sirve el build web de la app (npm run build:app) con un servidor estático sin dependencias
  webServer: {
    command: `node servidor-estatico.mjs .web-build ${PUERTO_APP}`,
    url: `http://localhost:${PUERTO_APP}`,
    reuseExistingServer: true,
  },
});
