// The runner's requests. Every one needs the secret (and an allowed address); the sandbox runs what it is given and nothing else.
//   POST   /v1/sessions                     { language }          -> { id }
//   POST   /v1/sessions/:id/mount           { files: [{ name, type, data (base64) }] }
//   POST   /v1/sessions/:id/run             { code, timeoutMs }   -> lines of JSON: { type: 'progress', ... } ... { type: 'result', ... }
//   POST   /v1/sessions/:id/clear | /stop
//   DELETE /v1/sessions/:id
//   GET    /healthz                         (answers without the secret, says nothing about what runs)

import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { RunnerError } from './session.js';

const MAX_BODY_BYTES = 160 * 1024 * 1024;
const ID = /^[0-9a-f]{24}$/;

const ipToNumber = (ip) => ip.split('.').reduce((total, part) => (total * 256) + Number(part), 0);

/** Whether an IPv4 address is in one of the allowed ranges ("10.42.0.0/16"). */
export function addressAllowed(address, allow) {
  const plain = String(address || '').replace(/^::ffff:/, '');
  if (isIP(plain) !== 4) return false;
  return allow.some((entry) => {
    const [base, bits = '32'] = entry.split('/');
    if (isIP(base) !== 4) return false;
    const size = Number(bits);
    const mask = size === 0 ? 0 : (0xffffffff << (32 - size)) >>> 0;
    return ((ipToNumber(plain) & mask) >>> 0) === ((ipToNumber(base) & mask) >>> 0);
  });
}

const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RunnerError('too_large', 'The request is too large.', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RunnerError('bad_request', 'The body is not valid JSON.', 400);
  }
}

export function createHandler({ manager, config, log = () => {} }) {
  const json = (response, status, body) => {
    const text = JSON.stringify(body);
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
    response.end(text);
  };

  return async function handle(request, response) {
    const url = new URL(request.url || '/', 'http://local');
    const route = `${request.method} ${url.pathname.replace(/\/[0-9a-f]{24}(?=\/|$)/, '/:id')}`;
    try {
      if (route === 'GET /healthz') return json(response, 200, { ok: true });
      if (!addressAllowed(request.socket.remoteAddress, config.allow)) {
        log('refused', { reason: 'address' });
        return json(response, 403, { error: { code: 'forbidden', message: 'Not allowed.' } });
      }
      const bearer = /^Bearer (.+)$/.exec(String(request.headers.authorization || ''));
      if (!bearer || !sameSecret(bearer[1], config.token)) {
        log('refused', { reason: 'secret' });
        return json(response, 401, { error: { code: 'unauthorized', message: 'Not allowed.' } });
      }
      const id = /^\/v1\/sessions\/([0-9a-f]{24})(?:\/|$)/.exec(url.pathname)?.[1] || null;
      if (id && !ID.test(id)) throw new RunnerError('not_found', 'No such sandbox.', 404);

      if (route === 'POST /v1/sessions') return json(response, 201, await manager.create(await readJson(request)));
      if (route === 'POST /v1/sessions/:id/mount') return json(response, 200, await manager.mount(id, (await readJson(request)).files));
      if (route === 'POST /v1/sessions/:id/clear') return json(response, 200, await manager.clear(id));
      if (route === 'POST /v1/sessions/:id/stop') return json(response, 200, await manager.stop(id));
      if (route === 'DELETE /v1/sessions/:id') return json(response, 200, await manager.destroy(id));
      if (route === 'POST /v1/sessions/:id/run') {
        const body = await readJson(request);
        // Lines of JSON as the step goes on: what it prints, then the result.
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        try {
          const result = await manager.run(id, { code: body.code, timeoutMs: body.timeoutMs }, (progress) => {
            response.write(`${JSON.stringify(progress)}\n`);
          });
          response.write(`${JSON.stringify(result)}\n`);
        } catch (error) {
          response.write(`${JSON.stringify({ type: 'failure', code: error.code || 'internal_error', message: error instanceof RunnerError ? error.message : 'The step could not be run.' })}\n`);
        }
        return response.end();
      }
      throw new RunnerError('not_found', 'Not found.', 404);
    } catch (error) {
      if (response.headersSent) return response.end();
      if (error instanceof RunnerError) return json(response, error.status, { error: { code: error.code, message: error.message } });
      log('request_failed', { name: error?.name || 'Error' });
      return json(response, 500, { error: { code: 'internal_error', message: 'Something went wrong.' } });
    }
  };
}
