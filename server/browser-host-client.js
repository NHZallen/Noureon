// The main server's side of the control channel to browser-host (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §4.2; Linear NOU-204, contract v2).
// Every request is signed: HMAC-SHA256 over METHOD, path with query, time, a one-time nonce and the SHA-256 of the body (browser-host/auth.mjs is the other half; a test
// makes the two agree). The secret stays in this process. Errors carry the host's code and status but never the request, and never the secret.

import { createHash, createHmac, randomBytes } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

export class BrowserHostError extends Error {
  constructor(message, { status = 0, code = 'unreachable' } = {}) {
    super(message);
    this.name = 'BrowserHostError';
    this.status = status;
    this.code = code;
  }
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');

/** The three headers of a signed request (the same text browser-host/auth.mjs builds). */
export function signedHeaders({ secret, method, pathWithQuery, body, time = Date.now(), nonce = randomBytes(16).toString('hex') }) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) throw new Error(`The browser host secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
  const text = `${String(method).toUpperCase()}\n${pathWithQuery}\n${time}\n${nonce}\n${sha256Hex(payload)}`;
  return { 'x-noureon-time': String(time), 'x-noureon-nonce': nonce, 'x-noureon-signature': createHmac('sha256', secret).update(text).digest('hex') };
}

/**
 * `url`: where browser-host listens (http://172.29.0.1:40010), `secret`: the first of its BROWSER_HOST_SECRET values.
 * Every call resolves what the host answered or throws a BrowserHostError ({ status, code }): `unreachable` (nothing answered), `timeout`, or the host's own code
 * (`busy`, `unauthorized`, `not_found`, `user_busy`…).
 */
export function createBrowserHostClient({ url, secret, fetchImpl = fetch, timeoutMs = 30_000, now = Date.now }) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('The browser host needs an address (http://… or https://…).');
  if (String(secret || '').length < MIN_SECRET_LENGTH) throw new Error(`The browser host secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  const checkId = (id) => { if (!SESSION_ID.test(String(id || ''))) throw new BrowserHostError('That browser session name is not valid.', { status: 400, code: 'bad_session_id' }); return String(id); };

  async function request(method, pathWithQuery, { json, bytes, wait = timeoutMs } = {}) {
    const body = bytes !== undefined ? Buffer.from(bytes) : json !== undefined ? Buffer.from(JSON.stringify(json)) : undefined;
    const headers = { ...signedHeaders({ secret, method, pathWithQuery, body, time: now() }), ...(body ? { 'content-type': bytes !== undefined ? 'application/gzip' : 'application/json' } : {}) };
    let response;
    try {
      response = await fetchImpl(`${base}${pathWithQuery}`, { method, headers, body, signal: AbortSignal.timeout(wait) });
    } catch (error) {
      throw new BrowserHostError('The browser host did not answer.', { code: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable' });
    }
    const data = Buffer.from(await response.arrayBuffer());
    const isJson = String(response.headers.get('content-type') || '').startsWith('application/json');
    let parsed = null;
    if (isJson) { try { parsed = JSON.parse(data.toString('utf8') || '{}'); } catch { parsed = null; } }
    if (!response.ok) throw new BrowserHostError(String(parsed?.message || `The browser host answered ${response.status}.`).slice(0, 200), { status: response.status, code: String(parsed?.error || 'failed') });
    return isJson ? { json: parsed } : { bytes: data };
  }

  const checkViewer = (id) => { if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''))) throw new BrowserHostError('That viewer name is not valid.', { status: 400, code: 'bad_viewer_id' }); return String(id); };
  const sessionPath = (id) => `/v1/sessions/${checkId(id)}`;
  return {
    async health() { return (await request('GET', '/v1/health', { wait: 8_000 })).json; },
    /** { sessionId, userId, screen: { w, h }, hasProfile } -> { state, position? … } */
    async create(spec) { return (await request('POST', '/v1/sessions', { json: spec })).json; },
    /** The login state to start from (a tar.gz): the browser starts only after it has arrived. */
    async putProfile(id, archive) { return (await request('PUT', `${sessionPath(id)}/profile`, { bytes: archive, wait: 120_000 })).json; },
    async get(id) { return (await request('GET', sessionPath(id))).json; },
    /** navigate / screenshot / tabs / text (see browser-host/cdp-actions.mjs). */
    async action(id, action, { wait = 60_000 } = {}) { return (await request('POST', `${sessionPath(id)}/actions`, { json: action, wait })).json; },
    /** The login state now (a tar.gz Buffer); the browser goes on. */
    async save(id) { return (await request('POST', `${sessionPath(id)}/save`, { wait: 120_000 })).bytes; },
    // The live screen (only when the host has it switched on): a temporary viewer (the page gets { viewerId, token, host, wsPath, ratioSizes }), who may point and type now, the size of the screen.
    async createViewer(id) { return (await request('POST', `${sessionPath(id)}/viewers`, { json: {}, wait: 15_000 })).json; },
    async closeViewer(id, viewerId) { return (await request('DELETE', `${sessionPath(id)}/viewers/${checkViewer(viewerId)}`, { wait: 15_000 })).json; },
    async control(id, { mode, viewerId }) { return (await request('POST', `${sessionPath(id)}/control`, { json: { mode, ...(viewerId ? { viewerId: checkViewer(viewerId) } : {}) }, wait: 15_000 })).json; },
    async setScreen(id, ratio) { return (await request('POST', `${sessionPath(id)}/screen`, { json: { ratio }, wait: 20_000 })).json; },
    /** The login state kept after the host stopped a browser by itself (idle, time limit): a Buffer, or throws `not_found` when it is gone. */
    async collect(id) { return (await request('GET', `${sessionPath(id)}/profile`, { wait: 120_000 })).bytes; },
    /** Stops a browser; with `save` the host packs the login state after the browser has closed and returns it (a Buffer), else null. */
    async stop(id, { save = false } = {}) {
      const answer = await request('DELETE', `${sessionPath(id)}${save ? '?save=1' : ''}`, { wait: 120_000 });
      return answer.bytes || null;
    }
  };
}
