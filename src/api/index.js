import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/config.js';
import { httpLogger, logger } from './utils/logger.js';
import { sqliteService } from './services/sqlite.service.js';
import { cacheService } from './services/cacheService.js';
import { swaggerSpec } from './docs/swagger.js';
import tasacionRoutes from './routes/tasacion.routes.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/error.middleware.js';

const app = express();

// 1. Seguridad: Cabeceras HTTP con Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Permite cargar recursos estáticos y assets de Swagger UI sin bloqueos
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS para permitir peticiones desde aplicaciones móviles (Expo/React Native) y navegadores
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })
);

// 3. Logging estructurado HTTP con Pino
app.use(httpLogger);

// 4. Parseo de cuerpos JSON y URL-Encoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Documentación Interactiva Swagger / OpenAPI 3.0 en GET /docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ValorAuto API - Swagger Docs',
}));

// Endpoint para descargar la especificación OpenAPI en JSON puro
app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Función auxiliar para enmascarar la API key
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return null;
  if (key.length <= 10) return '***';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

// 6. Endpoint de Diagnóstico, Métricas y Salud: GET /health
app.get('/health', async (req, res) => {
  const dbHealth = await sqliteService.checkHealth();
  const cacheStats = cacheService.getStats();
  const mem = process.memoryUsage();

  const isHealthy = dbHealth.status === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'ValorAuto REST API',
    uptimeSeconds: Math.round(process.uptime() * 10) / 10,
    runtime: typeof Bun !== 'undefined' ? `Bun v${Bun.version}` : `Node ${process.version}`,
    database: dbHealth,
    geminiApi: {
      configured: Boolean(config.gemini.apiKey),
      maskedKey: maskApiKey(config.gemini.apiKey),
      model: config.gemini.model,
    },
    cache: cacheStats,
    memory: {
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
      heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
    },
  });
});

// 7. Rutas de la API (POST /tasacion)
app.use('/', tasacionRoutes);

// 8. Manejo centralizado de errores
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Inicio del servidor HTTP
const portToUse = process.env.NODE_ENV === 'test' ? parseInt(process.env.TEST_PORT || '3001', 10) : config.port;

export const server = app.listen(portToUse, () => {
  const actualPort = server.address()?.port || portToUse;
  const runtimeInfo = typeof Bun !== 'undefined' ? `Bun v${Bun.version}` : `Node ${process.version}`;
  logger.info({
    port: actualPort,
    runtime: runtimeInfo,
    docsUrl: `http://localhost:${actualPort}/docs`,
    healthUrl: `http://localhost:${actualPort}/health`,
    dbPath: config.database.path,
  }, '🚗 ValorAuto API Backend iniciado con éxito');
});

export { app };
export default app;
