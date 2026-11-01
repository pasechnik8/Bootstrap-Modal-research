import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function createServer({ built = false } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405); res.end(); return;
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const vendor = !built && pathname.startsWith('/vendor/bootstrap/');
      const root = path.join(projectRoot, built ? 'dist' : vendor ? 'node_modules/bootstrap' : 'public');
      const relative = vendor ? pathname.slice('/vendor/bootstrap/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = path.resolve(root, relative);
      const inside = path.relative(root, target);
      if (inside.startsWith('..') || path.isAbsolute(inside)) {
        res.writeHead(403); res.end(); return;
      }
      const data = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400);
      res.end('Resource unavailable');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer({ built: process.argv.includes('--dist') });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Порт 5174 занят. Остановите предыдущий экземпляр Bootstrap-демо.' : error.message);
    process.exitCode = 1;
  });
  server.listen(5174, '127.0.0.1', () => console.log('Bootstrap Modal Lab: http://127.0.0.1:5174\nCtrl+C — остановить сервер'));
}
