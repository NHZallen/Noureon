// The server's request handling, kept apart from listening on a port so it can be tested with plain requests.

import { bearerToken, createTokenVerifier } from './auth.js';
import { createLogger } from './log.js';
import { ERROR_CODES, LIMITS, PROTOCOL_VERSION } from './protocol.js';
import { createRateLimiter } from './rate-limit.js';
import { validateRunSpec } from './run-spec.js';

const STATUS_FOR = {
  [ERROR_CODES.unauthorized]: 401,
  [ERROR_CODES.badRequest]: 400,
  [ERROR_CODES.invalidRunSpec]: 422,
  [ERROR_CODES.rateLimited]: 429,
  [ERROR_CODES.requestTooLarge]: 413,
  [ERROR_CODES.protocolUnsupported]: 426,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.internal]: 500
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

class RequestError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

async function readJson(request, maxBytes) {
  if (!/^application\/json\b/i.test(String(request.headers['content-type'] || ''))) throw new RequestError(ERROR_CODES.badRequest, 'The body must be application/json.');
  const declared = Number(request.headers['content-length'] || 0);
  if (declared > maxBytes) throw new RequestError(ERROR_CODES.requestTooLarge, 'The request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestError(ERROR_CODES.requestTooLarge, 'The request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(ERROR_CODES.badRequest, 'The body is not valid JSON.');
  }
}

/** Returns the function that answers one request: `(request, response) => Promise<void>`. */
export function createApp({ config, fetchImpl = fetch, log = createLogger(), now = Date.now } = {}) {
  const verify = createTokenVerifier({ supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey, fetchImpl, now });
  const startLimiter = createRateLimiter({ limit: LIMITS.createPerMinute, windowMs: 60_000, now });
  const startedAt = now();

  const corsHeaders = (origin) => (origin && config.allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' }
    : { Vary: 'Origin' });

  const send = (response, status, body, origin) => {
    const text = JSON.stringify(body);
    response.writeHead(status, { ...SECURITY_HEADERS, ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
    response.end(text);
  };
  const fail = (response, code, message, origin, extra = {}) => send(response, STATUS_FOR[code] || 400, { error: { code, message, ...extra } }, origin);

  const authenticate = async (request) => {
    let user;
    try {
      user = await verify(bearerToken(request.headers.authorization));
    } catch {
      throw new RequestError(ERROR_CODES.internal, 'Sign-in could not be checked right now.');
    }
    if (!user) throw new RequestError(ERROR_CODES.unauthorized, 'Sign in again.');
    return user;
  };

  return async function handle(request, response) {
    const origin = String(request.headers.origin || '');
    const began = now();
    const url = new URL(request.url || '/', 'http://local');
    const route = `${request.method} ${url.pathname}`;
    let status = 0;
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { ...SECURITY_HEADERS, ...corsHeaders(origin) });
        response.end();
        status = 204;
        return;
      }
      if (route === 'GET /healthz') {
        send(response, 200, { ok: true, protocol: PROTOCOL_VERSION, build: config.build, uptimeSeconds: Math.round((now() - startedAt) / 1000) }, origin);
        status = 200;
        return;
      }
      if (route === 'GET /v1/whoami') {
        const user = await authenticate(request);
        send(response, 200, { userId: user.id, protocol: PROTOCOL_VERSION }, origin);
        status = 200;
        return;
      }
      if (route === 'POST /v1/runs/validate') {
        // Checks a request's shape without starting anything: for the browser to test what it packs.
        const user = await authenticate(request);
        if (!startLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
        const result = validateRunSpec(await readJson(request, LIMITS.maxRequestBytes));
        if (result.unsupportedProtocol) throw new RequestError(ERROR_CODES.protocolUnsupported, 'This server speaks another protocol version.', { protocol: PROTOCOL_VERSION });
        if (!result.ok) throw new RequestError(ERROR_CODES.invalidRunSpec, 'The request is not in the right shape.', { details: result.errors });
        send(response, 200, { ok: true }, origin);
        status = 200;
        return;
      }
      throw new RequestError(ERROR_CODES.notFound, 'Not found.');
    } catch (error) {
      if (error instanceof RequestError) {
        status = STATUS_FOR[error.code] || 400;
        if (!response.headersSent) fail(response, error.code, error.message, origin, error.extra);
      } else {
        status = 500;
        log('request_failed', { route, name: error?.name || 'Error' });
        if (!response.headersSent) fail(response, ERROR_CODES.internal, 'Something went wrong.', origin);
      }
    } finally {
      log('request', { route, status, ms: now() - began });
    }
  };
}
