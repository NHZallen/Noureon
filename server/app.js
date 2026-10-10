// The server's request handling, kept apart from listening on a port so it can be tested with plain requests.

import { bearerToken, createTokenVerifier } from './auth.js';
import { createLogger } from './log.js';
import { ERROR_CODES, LIMITS, PROTOCOL_VERSION } from './protocol.js';
import { createRateLimiter } from './rate-limit.js';
import { validateRunSpec } from './run-spec.js';
import { CREDENTIAL_NAME, CredentialError } from './cli-credentials.js';
import { ConnectorError } from './mcp/connections.js';
import { TOOL_STATES } from '../src/data/connector-catalog.js';

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
  [ERROR_CODES.wrongPhase]: 409,
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

// `optional`: a request with no body at all is an empty object (a stop or a start that has nothing to add).
async function readJson(request, maxBytes, { optional = false } = {}) {
  if (optional && !Number(request.headers['content-length'] || 0) && !request.headers['transfer-encoding']) return {};
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
  if (optional && size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(ERROR_CODES.badRequest, 'The body is not valid JSON.');
  }
}

/** Returns the function that answers one request: `(request, response) => Promise<void>`. */
export function createApp({ config, fetchImpl = fetch, log = createLogger(), now = Date.now, runs = null, credentials = null, files = null, connectors = null } = {}) {
  const verify = createTokenVerifier({ supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey, fetchImpl, now });
  const startLimiter = createRateLimiter({ limit: LIMITS.createPerMinute, windowMs: 60_000, now });
  const credentialLimiter = createRateLimiter({ limit: 30, windowMs: 60_000, now });
  const connectorLimiter = createRateLimiter({ limit: 30, windowMs: 60_000, now });
  const callbackLimiter = createRateLimiter({ limit: 120, windowMs: 60_000, now });
  const startedAt = now();

  const corsHeaders = (origin) => (origin && config.allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' }
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
      const runPath = /^\/v1\/runs\/([0-9a-f-]{36})(\/stop|\/stream|\/start|\/hold|\/release|\/plan|\/steer|\/pause|\/resume|\/net|\/credential|\/connector|\/member)?$/i.exec(url.pathname);
      if (route === 'POST /v1/runs' || route === 'POST /v1/research') {
        const deep = route === 'POST /v1/research';
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        if (!startLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
        const result = validateRunSpec(await readJson(request, LIMITS.maxRequestBytes));
        if (result.unsupportedProtocol) throw new RequestError(ERROR_CODES.protocolUnsupported, 'This server speaks another protocol version.', { protocol: PROTOCOL_VERSION });
        if (!result.ok) throw new RequestError(ERROR_CODES.invalidRunSpec, 'The request is not in the right shape.', { details: result.errors });
        // A deep research comes only to its own address, and that address takes nothing else.
        if (deep !== (result.spec.kind === 'research')) throw new RequestError(ERROR_CODES.invalidRunSpec, deep ? 'This address is for a deep research.' : 'A deep research is started at /v1/research.');
        // Python needs the sandbox host, and it has to answer now (when it does not, the browser makes the reply with its own Python); the provider's own web search does not go with tools (the briefing is how it is done instead).
        if (result.spec.tools.advanced && (result.spec.tools.webSearch === 'grounding' || !(await runs.advancedAvailable?.()))) throw new RequestError(ERROR_CODES.unsupportedMode, 'Advanced mode is not run on the server.');
        // An image needs the store that keeps the pictures; without it the browser makes the image itself.
        if (result.spec.kind === 'image' && !runs.imageAvailable?.()) throw new RequestError(ERROR_CODES.unsupportedMode, 'Images are not made on the server.');
        try {
          const runId = await runs.start({ userId: user.id, spec: result.spec });
          // Whether the check of a presentation it writes is made here too (otherwise the page makes it, as it always did).
          const vision = Boolean(result.spec.tools.visionCheck) && Boolean(await runs.visionAvailable?.());
          send(response, 202, { runId, vision }, origin);
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
        // A deep research may be asked to write its report from what it has found: { mode: 'report' } (otherwise it is ended).
        const body = await readJson(request, 4096, { optional: true });
        const mode = body?.mode === 'report' ? 'report' : null;
        const found = await runs.stop({ userId: user.id, runId: runPath[1], mode });
        if (!found) throw new RequestError(ERROR_CODES.notFound, 'No such reply is running.');
        send(response, 200, { ok: true }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'POST' && runPath[2] === '/net') {
        // The person's answer to a question a tool's command put about a site: { askId, decision: 'once' | 'always' | 'deny' }.
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const body = await readJson(request, 4096);
        if (!/^[A-Za-z0-9-]{8,64}$/.test(String(body?.askId || '')) || !['once', 'always', 'deny'].includes(body?.decision)) throw new RequestError(ERROR_CODES.badRequest, 'That is not an answer.');
        const result = await runs.answerNet({ userId: user.id, runId: runPath[1], askId: body.askId, decision: body.decision });
        if (!result.ok) throw new RequestError(ERROR_CODES.notFound, 'No such reply is running here.');
        send(response, 200, { ok: true, answered: result.answered }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'POST' && runPath[2] === '/member') {
        // A person lets one model of their council leave it: { modelId }.
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const body = await readJson(request, 4096);
        if (typeof body?.modelId !== 'string' || !body.modelId || body.modelId.length > 200) throw new RequestError(ERROR_CODES.badRequest, 'That is not a model.');
        const result = await runs.exitCouncilMember({ userId: user.id, runId: runPath[1], modelId: body.modelId });
        if (!result.ok) throw new RequestError(ERROR_CODES.notFound, 'No such council is running here.');
        send(response, 200, { ok: true, exited: result.exited }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'POST' && runPath[2] === '/credential') {
        // The person's answer to the window that asked for a login a tool needs: { askId, decision: 'saved' | 'cancel' } (the values are saved
        // through /v1/credentials, never sent here).
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const body = await readJson(request, 4096);
        if (!/^[A-Za-z0-9-]{8,64}$/.test(String(body?.askId || '')) || !['saved', 'cancel'].includes(body?.decision)) throw new RequestError(ERROR_CODES.badRequest, 'That is not an answer.');
        const result = await runs.answerCredential({ userId: user.id, runId: runPath[1], askId: body.askId, decision: body.decision });
        if (!result.ok) throw new RequestError(ERROR_CODES.notFound, 'No such reply is running here.');
        send(response, 200, { ok: true, answered: result.answered }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'POST' && runPath[2] === '/connector') {
        // The person's answer to the card that asks whether a tool of a connector may run: { askId, decision: 'once' | 'always' | 'deny' }.
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const body = await readJson(request, 4096);
        if (!/^[A-Za-z0-9-]{8,64}$/.test(String(body?.askId || '')) || !['once', 'always', 'deny'].includes(body?.decision)) throw new RequestError(ERROR_CODES.badRequest, 'That is not an answer.');
        const result = await runs.answerConnector({ userId: user.id, runId: runPath[1], askId: body.askId, decision: body.decision });
        if (!result.ok) throw new RequestError(ERROR_CODES.notFound, 'No such reply is running here.');
        send(response, 200, { ok: true, answered: result.answered }, origin);
        status = 200;
        return;
      }
      if (runPath && request.method === 'POST' && ['/start', '/hold', '/release', '/plan', '/steer', '/pause', '/resume'].includes(runPath[2])) {
        // What a person does to a deep research: start it now, hold the countdown (they are editing the plan), let it run again, change the
        // plan in their own words, pause it or let it go on.
        const user = await authenticate(request);
        if (!runs) throw new RequestError(ERROR_CODES.runsUnavailable, 'Replies on the server are not set up yet.');
        const body = await readJson(request, 16 * 1024, { optional: true });
        const result = runs.control({ userId: user.id, runId: runPath[1], action: runPath[2].slice(1), payload: { instruction: typeof body?.instruction === 'string' ? body.instruction : '' } });
        if (!result.ok) {
          if (result.reason === 'wrong_phase') throw new RequestError(ERROR_CODES.wrongPhase, 'The research is not at a stage where that can be done.');
          if (result.reason === 'empty' || result.reason === 'too_many') throw new RequestError(ERROR_CODES.badRequest, result.reason === 'empty' ? 'Say what to add.' : 'That is enough instructions for one research.');
          throw new RequestError(ERROR_CODES.notFound, 'No such research is running here.');
        }
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
      // The secure credentials of the person's CLI tools: all of them (a person may look at their own), one set, one removed.
      const credentialPath = /^\/v1\/credentials(?:\/([A-Za-z0-9_]{1,64}))?$/.exec(url.pathname);
      if (credentialPath) {
        const user = await authenticate(request);
        if (!credentials) throw new RequestError(ERROR_CODES.runsUnavailable, 'Secure credentials are not set up yet.');
        const name = credentialPath[1] || '';
        try {
          if (request.method === 'GET' && !name) {
            send(response, 200, { credentials: await credentials.list(user.id) }, origin);
          } else if (request.method === 'PUT' && name) {
            if (!credentialLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
            const body = await readJson(request, 16 * 1024);
            await credentials.set(user.id, name, body?.value);
            send(response, 200, { ok: true, name }, origin);
          } else if (request.method === 'DELETE' && name) {
            if (!CREDENTIAL_NAME.test(name)) throw new RequestError(ERROR_CODES.badRequest, 'Not a credential name.');
            await credentials.remove(user.id, name);
            send(response, 200, { ok: true }, origin);
          } else throw new RequestError(ERROR_CODES.notFound, 'Not found.');
          status = 200;
        } catch (error) {
          if (error instanceof CredentialError) throw new RequestError(ERROR_CODES.badRequest, error.message, { reason: error.code });
          throw error;
        }
        return;
      }
      // Where the service sends the person back after they logged in to a connector (a page navigation, with no sign-in header: the state in the address is what
      // says who began it). The person is sent on to the app with the result, and nothing of the login is in what is sent.
      if (route === 'GET /mcp/callback') {
        if (!connectors) throw new RequestError(ERROR_CODES.runsUnavailable, 'Connectors are not set up yet.');
        const back = (params) => {
          const target = new URL('/connectors', config.appUrl || 'https://noureon.com');
          for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
          response.writeHead(302, { ...SECURITY_HEADERS, Location: target.toString() });
          response.end();
          status = 302;
        };
        if (!callbackLimiter.take('callback')) {
          back({ connector_error: 'busy' });
          return;
        }
        const pick = (name) => {
          const value = url.searchParams.get(name);
          return typeof value === 'string' ? value : undefined;
        };
        const outcome = await connectors.completeLogin({ state: pick('state'), code: pick('code'), error: pick('error'), iss: pick('iss') });
        back(outcome.ok ? { connector: outcome.connectorId, connected: '1' } : { ...(outcome.connectorId ? { connector: outcome.connectorId } : {}), connector_error: outcome.error });
        return;
      }
      // The person's connectors: the state of each, and what they do about it.
      const connectorPath = /^\/v1\/connectors(?:\/([a-z][a-z0-9-]{1,31})(?:\/(connect|disconnect|permissions|refresh))?)?$/.exec(url.pathname);
      if (connectorPath) {
        const user = await authenticate(request);
        if (!connectors) throw new RequestError(ERROR_CODES.runsUnavailable, 'Connectors are not set up yet.');
        const [, id, action] = connectorPath;
        try {
          if (request.method === 'GET' && !id) {
            send(response, 200, { connectors: await connectors.list(user.id) }, origin);
          } else if (request.method === 'POST' && id && action === 'connect') {
            if (!connectorLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
            const body = await readJson(request, 2048, { optional: true });
            send(response, 200, await connectors.startLogin(user.id, id, body?.mode === 'readonly' ? 'readonly' : 'readwrite'), origin);
          } else if (request.method === 'POST' && id && action === 'disconnect') {
            send(response, 200, { ok: true, ...(await connectors.disconnect(user.id, id)) }, origin);
          } else if (request.method === 'POST' && id && action === 'refresh') {
            if (!connectorLimiter.take(user.id)) throw new RequestError(ERROR_CODES.rateLimited, 'Too many requests; wait a minute.');
            await connectors.refreshTools(user.id, id);
            send(response, 200, { ok: true, connectors: (await connectors.list(user.id)).filter((entry) => entry.id === id) }, origin);
          } else if (request.method === 'PUT' && id && action === 'permissions') {
            const body = await readJson(request, 32 * 1024);
            const states = body?.tools;
            if (!states || typeof states !== 'object' || Array.isArray(states) || Object.keys(states).length > 400 || Object.values(states).some((state) => !TOOL_STATES.includes(state))) throw new RequestError(ERROR_CODES.badRequest, 'That is not a list of tools with states.');
            await connectors.setPermissions(user.id, id, states);
            send(response, 200, { ok: true }, origin);
          } else throw new RequestError(ERROR_CODES.notFound, 'Not found.');
          status = 200;
        } catch (error) {
          if (error instanceof ConnectorError) {
            const known = { unknown_connector: ERROR_CODES.notFound, not_connected: 409, bad_request: ERROR_CODES.badRequest };
            throw new RequestError(known[error.code] === 409 ? ERROR_CODES.wrongPhase : known[error.code] || ERROR_CODES.badRequest, error.message, { reason: error.code, ...(error.detail ? { detail: error.detail } : {}) });
          }
          throw error;
        }
        return;
      }
      // How much of the person's space in the cloud is used: { usedBytes, quotaBytes } (usedBytes is null when it cannot be known).
      if (route === 'GET /v1/storage') {
        const user = await authenticate(request);
        if (!files) throw new RequestError(ERROR_CODES.runsUnavailable, 'Storage is not set up yet.');
        send(response, 200, { usedBytes: await files.usage(user.id), quotaBytes: files.quotaBytes }, origin);
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
