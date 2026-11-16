// The HTTP face of browser-host: the routes of the contract (Linear NOU-204), behind the request check of auth.mjs. Everything is signed, including the health
// check. The address is checked before any body is read, so only the main server can make this process hold a large upload.
//   GET    /v1/health                     POST /v1/sessions                 GET    /v1/sessions/:id
//   PUT    /v1/sessions/:id/profile       GET  /v1/sessions/:id/profile     POST   /v1/sessions/:id/actions
//   POST   /v1/sessions/:id/save          DELETE /v1/sessions/:id[?save=1]
//   live screen (only when BROWSER_LIVE_* is set): POST /v1/sessions/:id/viewers   DELETE /v1/sessions/:id/viewers/:viewerId
//                                                   POST /v1/sessions/:id/control {mode, viewerId}   POST /v1/sessions/:id/screen {ratio}
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { HostError } from './session-manager.mjs';

const SMALL_BODY = 64 * 1024;
const ID = '([A-Za-z0-9][A-Za-z0-9_-]{7,63})';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HostError(413, 'too_large', 'the request is too large')); return; }
    const chunks = []; let size = 0;
    req.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(new HostError(413, 'too_large', 'the request is too large')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(new HostError(400, 'bad_request', 'the request was cut off')));
  });
}
const json = (body) => { try { return body.length ? JSON.parse(body.toString('utf8')) : {}; } catch { throw new HostError(400, 'bad_request', 'the body is not JSON'); } };

const VIEWER = '([A-Za-z0-9_-]{1,64})';
function liveRoutes(manager, live) {
  const session = (id) => manager.ready(id);
  return [
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/viewers$`), run: async ({ match }) => ({ status: 200, body: await live.createViewer(session(match[1])) }) },
    { method: 'DELETE', re: new RegExp(`^/v1/sessions/${ID}/viewers/${VIEWER}$`), run: async ({ match }) => { await live.closeViewer(session(match[1]), match[2]); return { status: 200, body: { ok: true } }; } },
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/control$`), run: async ({ match, body }) => { const b = json(body); return { status: 200, body: await live.control(session(match[1]), { mode: b.mode, viewerId: typeof b.viewerId === 'string' ? b.viewerId : undefined }) }; } },
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/card-ticket$`), run: async ({ match, body }) => ({ status: 200, body: live.createCardTicket(session(match[1]), { origin: json(body).origin }) }) },
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/screen$`), run: async ({ match, body }) => ({ status: 200, body: await live.setRatio(session(match[1]), json(body).ratio) }) }
  ];
}

export function createServer({ manager, verifier, live = null, maxProfileBytes = 150 * 1024 * 1024, log = () => {}, tls = null, load = () => os.loadavg()[0] }) {
  const routes = [
    { method: 'GET', re: /^\/v1\/health$/, run: async () => ({ status: 200, body: { ok: true, ...manager.summary(), load1: Number(load().toFixed(2)) } }) },
    { method: 'POST', re: /^\/v1\/sessions$/, run: async ({ body }) => ({ status: 202, body: manager.create(json(body)) }) },
    { method: 'PUT', re: new RegExp(`^/v1/sessions/${ID}/profile$`), big: true, run: async ({ match, body }) => ({ status: 202, body: manager.putProfile(match[1], body) }) },
    { method: 'GET', re: new RegExp(`^/v1/sessions/${ID}/profile$`), run: async ({ match }) => ({ status: 200, binary: await manager.collectProfile(match[1]) }) },
    { method: 'GET', re: new RegExp(`^/v1/sessions/${ID}$`), run: async ({ match }) => ({ status: 200, body: manager.get(match[1]) }) },
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/actions$`), run: async ({ match, body }) => ({ status: 200, body: await manager.action(match[1], json(body)) }) },
    ...(live ? liveRoutes(manager, live) : []),
    { method: 'POST', re: new RegExp(`^/v1/sessions/${ID}/save$`), run: async ({ match }) => ({ status: 200, binary: await manager.save(match[1]) }) },
    {
      method: 'DELETE', re: new RegExp(`^/v1/sessions/${ID}$`),
      run: async ({ match, url }) => {
        const wantSave = url.searchParams.get('save') === '1';
        const { profile } = await manager.stop(match[1], { save: wantSave, reason: 'requested' });
        return profile ? { status: 200, binary: profile } : { status: 200, body: { ok: true } };
      }
    }
  ];

  const send = (res, status, payload, binary) => {
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (binary) { res.writeHead(status, { ...headers, 'content-type': 'application/gzip', 'content-length': binary.length }); res.end(binary); return; }
    const text = JSON.stringify(payload ?? {});
    res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  };

  const handler = async (req, res) => {
    const started = Date.now();
    let status = 500; let label = 'unknown';
    try {
      const remote = req.socket.remoteAddress;
      if (!verifier.addressAllowed(remote)) { status = 403; log({ ev: 'refused', label: 'address', status: 403, remote: String(remote).slice(0, 64) }); send(res, 403, { error: 'forbidden' }); req.destroy(); return; }
      const rawUrl = req.url || '/';
      const url = new URL(rawUrl, 'http://browser-host.invalid');
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      label = `${req.method} ${url.pathname.replace(/\/sessions\/[^/]+/, '/sessions/:id')}`;
      const body = await readBody(req, route?.big ? maxProfileBytes + 1024 : SMALL_BODY);
      const verdict = verifier.verify({ method: req.method, pathWithQuery: rawUrl, headers: req.headers, body, remoteAddress: remote });
      if (!verdict.ok) { status = verdict.status; log({ ev: 'refused', label, status, why: verdict.reason }); send(res, status, { error: status === 429 ? 'busy' : 'unauthorized' }); return; }
      if (!route) { status = routes.some((r) => r.re.test(url.pathname)) ? 405 : 404; send(res, status, { error: status === 405 ? 'method_not_allowed' : 'not_found' }); return; }
      const out = await route.run({ match: url.pathname.match(route.re), body, url });
      status = out.status; send(res, status, out.body, out.binary);
    } catch (error) {
      if (error instanceof HostError) { status = error.status; send(res, status, { error: error.code, message: error.message }); } else { status = 500; log({ ev: 'error', label, why: String(error?.message || error).slice(0, 160) }); send(res, 500, { error: 'internal' }); }
    } finally {
      log({ ev: 'request', label, status, ms: Date.now() - started });
    }
  };

  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.requestTimeout = 300_000; server.headersTimeout = 20_000; server.keepAliveTimeout = 5000;
  return server;
}
