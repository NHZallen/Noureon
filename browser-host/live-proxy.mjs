// The small door of the live screen: Traefik sends https://<live host>/s/<random>/api/ws here, and this program hands the WebSocket to the neko of that one browser.
// It lets through nothing else: no page, no login request, no other path. A path that is not the 128-bit random one of a browser that is live gets 404, the same for
// "no such browser" and "wrong path". The browser's own port 8080 is never published; only this process (on the host) can reach it.
import http from 'node:http';
import net from 'node:net';

const WS_PATH = /^\/s\/([0-9a-f]{32})\/api\/ws$/;
const MAX_HEADER = 8 * 1024;
const REMOVE = new Set(['origin', 'host', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-forwarded-server', 'x-real-ip', 'forwarded', 'cookie', 'authorization']);

export function createLiveProxy({ live, log = () => {}, connect = (port, ip) => net.connect({ host: ip, port }), idleMs = 0 }) {
  const server = http.createServer((req, res) => {
    // Anything that is not a WebSocket upgrade is not served at all.
    res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store', connection: 'close' });
    res.end('not found');
  });
  server.headersTimeout = 10_000; server.requestTimeout = 10_000; server.maxHeadersCount = 40;

  server.on('upgrade', (req, socket, head) => {
    const refuse = (status, text) => { try { socket.end(`HTTP/1.1 ${status} ${text}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`); } catch { socket.destroy(); } };
    try {
      if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.method !== 'GET') { refuse(404, 'Not Found'); return; }
      const url = new URL(req.url || '/', 'http://live.invalid');
      const match = WS_PATH.exec(url.pathname);
      const target = match ? live.target(match[1]) : null;
      if (!target) { refuse(404, 'Not Found'); return; }
      if (url.search.length > 512) { refuse(414, 'URI Too Long'); return; }
      const upstream = connect(target.port, target.ip);
      let opened = false;
      const close = () => { socket.destroy(); upstream.destroy(); };
      upstream.on('error', () => { if (!opened) refuse(502, 'Bad Gateway'); close(); });
      socket.on('error', close);
      upstream.on('connect', () => {
        opened = true;
        // neko lives under its own root: the random prefix is ours only. The page's Origin is removed (neko checks it against its own host, which a browser behind the proxy never matches).
        const lines = [`GET /api/ws${url.search} HTTP/1.1`, `Host: ${target.ip}:${target.port}`];
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i]; const value = req.rawHeaders[i + 1];
          if (REMOVE.has(name.toLowerCase()) || /[\r\n]/.test(value)) continue;
          lines.push(`${name}: ${value}`);
        }
        const header = `${lines.join('\r\n')}\r\n\r\n`;
        if (header.length > MAX_HEADER) { refuse(431, 'Request Header Fields Too Large'); close(); return; }
        upstream.write(header);
        if (head?.length) upstream.write(head);
        socket.pipe(upstream); upstream.pipe(socket);
        log({ ev: 'live_ws_open', sessionId: target.sessionId });
      });
      if (idleMs > 0) { socket.setTimeout(idleMs, close); }
      socket.on('close', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
    } catch { refuse(400, 'Bad Request'); }
  });
  server.on('clientError', (error, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n'); } catch { socket.destroy(); } });
  return server;
}
