// Servidor estático mínimo para el build web de la app (sin dependencias).
// Uso: node servidor-estatico.mjs <carpeta> <puerto>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [raiz = '.web-build', puerto = '8090'] = process.argv.slice(2);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const archivo of [join(raiz, ruta), join(raiz, 'index.html')]) {
    try {
      const cuerpo = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' });
      return res.end(cuerpo);
    } catch {
      // probar el siguiente (fallback a index.html para la SPA)
    }
  }
  res.writeHead(404).end('no encontrado');
}).listen(Number(puerto), () => console.log(`App web en http://localhost:${puerto} (${raiz})`));
