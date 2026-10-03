// The server's request handling, kept apart from listening on a port so it can be tested with plain requests.

import { bearerToken, createTokenVerifier } from './auth.js';
import { createLogger } from './log.js';
import { ERROR_CODES, LIMITS, PROTOCOL_VERSION } from './protocol.js';
import { createRateLimiter } from './rate-limit.js';
import { validateRunSpec } from './run-spec.js';

const STATUS_FOR = {
  [ERROR_CODES.unauthorized]: 401,
  [ERROR_CODES.tooManyRuns]: 429,
  [ERROR_CODES.conversationNotFound]: 404,
  [ERROR_CODES.runExists]: 409,
  [ERROR_CODES.runsUnavailable]: 503,
  [ERROR_CODES.unsupportedMode]: 422,
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
export function createApp({ config, fetchImpl = fetch, log = createLogger(), now = Date.now, runs = null } = {}) {
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
        send(response, 200, { ok: true, protocol: PROTOCOL_VERSION, build: config.build, runs: Boolean(runs), uptimeSeconds: Math.round((now() - startedAt) / 1000) }, origin);
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
      const runPath = /^\/v1\/runs\/([0-9a-f-]{36})(\/stop|\/stream)?$/i.exec(url.pathname);
      if (route === 'POST /v1/runs') {
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        if (!startLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
        const result = validateRunSpec(await readJson(request, LIMITS.maxRequestBytes));
        if (result.unsupportedProtocol) throw new RequestError(ERROR_CODES.protocolUnsupported, 'This server speaks another protocol version.', { protocol: PROTOCOL_VERSION });
        if (!result.ok) throw new RequestError(ERROR_CODES.invalidRunSpec, 'The request is not in the right shape.', { details: result.errors });
        // Python needs the sandbox host; the provider's own web search does not go with tools (the briefing is how it is done instead).
        if (result.spec.tools.advanced && (!runs.advancedEnabled || result.spec.tools.webSearch === 'grounding')) throw new RequestError(ERROR_CODES.unsupportedMode, 'Advanced mode is not run on the server.');
        try {
          const runId = await runs.start({ userId: user.id, spec: result.spec });
          send(response, 202, { runId }, origin);
          status = 202;
        } catch (error) {
          if (error?.name === 'RunError') throw new RequestError(error.code, error.message);
          throw error;
        }
        return;
      }
      if (runPath && request.method === 'GET' && runPath[2] === '/stream') {
        // The reply as it is written, pushed as it comes (server-sent events): any page may join at any moment and sees what is there now.
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        if (!runs.isLive({ userId: user.id, runId: runPath[1] })) throw new RequestError(ERROR_CODES.notFound, 'This reply is not being made here.');
        response.writeHead(200, { ...SECURITY_HEADERS, ...corsHeaders(origin), 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' });
        status = 200;
        let unwatch = null;
        const beat = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
        const end = () => {
          clearInterval(beat);
          unwatch?.();
          if (!response.writableEnded) response.end();
        };
        request.on('close', end);
        unwatch = runs.watch({
          userId: user.id,
          runId: runPath[1],
          send: (event) => {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
            // A page that cannot keep up is let go (it reads the rest from the message).
            if (response.writableLength > 2 * 1024 * 1024) end();
          },
          close: end
        });
        if (!unwatch) {
          response.write(`data: ${JSON.stringify({ done: 'gone' })}\n\n`);
          end();
        }
        return;
      }
      if (runPath && request.method === 'POST' && runPath[2] === '/stop') {
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const found = await runs.stop({ userId: user.id, runId: runPath[1] });
        if (!found) throw new RequestError(ERROR_CODES.notFound, 'No such reply is running.');
        send(response, 200, { ok: true }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'GET' && !runPath[2]) {
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const run = await runs.get({ userId: user.id, runId: runPath[1] });
        if (!run) throw new RequestError(ERROR_CODES.notFound, 'No such reply.');
        send(response, 200, { run }, origin);
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
