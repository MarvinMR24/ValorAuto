require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ValorAuto API] Servidor escuchando en http://0.0.0.0:${PORT}`);
  console.log(`[ValorAuto API] Healthcheck: http://localhost:${PORT}/health`);
  console.log(`[ValorAuto API] Readiness:   http://localhost:${PORT}/ready`);
});
