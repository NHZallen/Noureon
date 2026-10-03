import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const TOKEN = 'good-token-good-token-good-token';
const KEY = 'sk-live-provider-key-value';

async function withServer(run, { auth = true } = {}) {
  const lines = [];
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => {
    if (!auth) throw new Error('offline');
    return options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 });
  };
  const server = createServer(createApp({ config, fetchImpl, log: createLogger((line) => lines.push(line)) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run({ base, lines });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const spec = () => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '17.4.0',
  conversationId: USER,
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 1,
  model: { provider: 'openrouter', id: 'm' },
  request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, systemInstruction: '', language: 'en' },
  tools: { webSearch: 'off', advanced: false },
  secrets: { providerKey: KEY }
});
const post = (base, body, headers = {}) => fetch(`${base}/v1/runs/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('/healthz answers without signing in, with the headers a plain API should send', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.protocol, PROTOCOL_VERSION);
    assert.equal(body.build, 'abc123');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('/v1/whoami names the signed-in person and no one else', async () => {
  await withServer(async ({ base }) => {
    const ok = await fetch(`${base}/v1/whoami`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { userId: USER, protocol: PROTOCOL_VERSION });
    const none = await fetch(`${base}/v1/whoami`);
    assert.equal(none.status, 401);
    assert.equal((await none.json()).error.code, 'unauthorized');
    const wrong = await fetch(`${base}/v1/whoami`, { headers: { Authorization: 'Bearer wrong-token-wrong-token-wrong' } });
    assert.equal(wrong.status, 401);
  });
});

test('when the sign-in service cannot be reached nobody is let in, and it is not called a wrong password', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/whoami`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'internal_error');
  }, { auth: false });
});

test('only the site itself may call from a browser', async () => {
  await withServer(async ({ base }) => {
    const allowed = await fetch(`${base}/v1/whoami`, { method: 'OPTIONS', headers: { Origin: 'https://noureon.com', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://noureon.com');
    assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/);
    const other = await fetch(`${base}/v1/whoami`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const answer = await fetch(`${base}/healthz`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(answer.headers.get('access-control-allow-origin'), null);
  });
});

test('/v1/runs/validate checks a request without starting anything, and tells what is wrong without repeating the key', async () => {
  await withServer(async ({ base, lines }) => {
    assert.equal((await post(base, spec())).status, 200);
    const broken = spec();
    broken.sequence = 'one';
    const bad = await post(base, broken);
    assert.equal(bad.status, 422);
    const body = await bad.json();
    assert.equal(body.error.code, 'invalid_run_spec');
    assert.ok(body.error.details.some((detail) => detail.path === 'sequence'));
    assert.doesNotMatch(JSON.stringify(body), new RegExp(KEY));
    const other = await post(base, { ...spec(), protocol: PROTOCOL_VERSION + 1 });
    assert.equal(other.status, 426);
    assert.equal((await other.json()).error.protocol, PROTOCOL_VERSION);
    assert.equal((await post(base, '{not json')).status, 400);
    assert.equal((await fetch(`${base}/v1/runs/validate`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{}' })).status, 400, 'the body must say it is JSON');
    assert.equal((await fetch(`${base}/v1/runs/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec()) })).status, 401);
    // The log has lines for all of this and not a trace of the key.
    assert.ok(lines.length >= 6);
    assert.doesNotMatch(lines.join('\n'), new RegExp(KEY));
  });
});

test('a request that is too large is refused before it is read', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/runs/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, 'Content-Length': String(30 * 1024 * 1024) },
      body: 'x'
    }).catch((error) => error);
    // Either the answer arrives (413) or the connection is cut: both mean it was not accepted.
    if (response instanceof Response) assert.equal(response.status, 413);
  });
});

test('a person who starts too many in a minute is slowed down', async () => {
  await withServer(async ({ base }) => {
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await post(base, spec())).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  });
});

test('anything else is not found, in the same shape as the other errors', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/nothing`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'not_found');
  });
});
