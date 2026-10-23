import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8'
};

// The built site (`dist/`) as a static host serves it: a path, the same with `.html` or `/index.html`, and the app page for anything else. `headers`
// are sent with every file (the security headers of vercel.json, for instance).
export const serveDist = (root, { headers = {} } = {}) => new Promise((resolve, reject) => {
  const fileFor = (pathname) => {
    const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html')]) {
      const file = join(root, candidate);
      if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return file;
    }
    return join(root, 'index.html');
  };
  const server = createServer((request, response) => {
    const file = fileFor(new URL(request.url, 'http://localhost').pathname);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...headers });
    createReadStream(file).pipe(response);
  });
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); })
  }));
});
