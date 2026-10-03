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

async function withServer(run, { auth = true, runs = null } = {}) {
  const lines = [];
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => {
    if (!auth) throw new Error('offline');
    return options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 });
  };
  const server = createServer(createApp({ config, fetchImpl, runs, log: createLogger((line) => lines.push(line)) }));
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
  model: { provider: 'openrouter', id: 'm', info: { name: 'M' } },
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

const RUN_ID = '423e4567-e89b-12d3-a456-426614174003';
const call = (base, method, path, body) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('/v1/runs says plainly that replies on the server are not set up when there is no run manager', async () => {
  await withServer(async ({ base }) => {
    const response = await call(base, 'POST', '/v1/runs', spec());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'runs_unavailable');
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/stop`)).status, 503);
    assert.equal((await (await fetch(`${base}/healthz`)).json()).runs, false);
  });
});

test('/v1/runs accepts a reply, hands it over without its keys in the log, and stop and status are for the signed-in person only', async () => {
  const started = [];
  const runs = {
    start: async ({ userId, spec: given }) => { started.push({ userId, spec: given }); return RUN_ID; },
    stop: async ({ userId, runId }) => userId === USER && runId === RUN_ID,
    get: async ({ userId, runId }) => (userId === USER && runId === RUN_ID ? { id: RUN_ID, status: 'running' } : null)
  };
  await withServer(async ({ base, lines }) => {
    const accepted = await call(base, 'POST', '/v1/runs', spec());
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), { runId: RUN_ID });
    assert.equal(started[0].userId, USER);
    assert.equal(started[0].spec.secrets.providerKey, KEY);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/stop`)).status, 200);
    assert.equal((await call(base, 'POST', '/v1/runs/423e4567-e89b-12d3-a456-4266141740ff/stop')).status, 404);
    assert.deepEqual((await (await call(base, 'GET', `/v1/runs/${RUN_ID}`)).json()).run, { id: RUN_ID, status: 'running' });
    assert.equal((await call(base, 'GET', '/v1/runs/423e4567-e89b-12d3-a456-4266141740ff')).status, 404);
    assert.equal((await fetch(`${base}/v1/runs/${RUN_ID}`)).status, 401);
    assert.equal(lines.join('').includes(KEY), false, 'no key in the log');
    assert.equal((await (await fetch(`${base}/healthz`)).json()).runs, true);
  }, { runs });
});

test('/v1/runs turns the manager\'s refusals into the right answers, and does not take Advanced mode or a bad request', async () => {
  const refusals = { code: 'too_many_runs' };
  const runs = {
    start: async () => { const error = new Error('Too many replies are running.'); error.name = 'RunError'; error.code = refusals.code; throw error; },
    stop: async () => true,
    get: async () => null
  };
  await withServer(async ({ base, lines }) => {
    const tooMany = await call(base, 'POST', '/v1/runs', spec());
    assert.equal(tooMany.status, 429);
    assert.equal((await tooMany.json()).error.code, 'too_many_runs');
    refusals.code = 'conversation_not_found';
    assert.equal((await call(base, 'POST', '/v1/runs', spec())).status, 404);
    refusals.code = 'run_exists';
    assert.equal((await call(base, 'POST', '/v1/runs', spec())).status, 409);
    const advanced = spec();
    advanced.tools.advanced = true;
    const refused = await call(base, 'POST', '/v1/runs', advanced);
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'unsupported_mode');
    const bad = spec();
    bad.request.language = 'xx';
    const invalid = await call(base, 'POST', '/v1/runs', bad);
    assert.equal(invalid.status, 422);
    assert.equal(JSON.stringify(await invalid.json()).includes(KEY), false);
    assert.equal(lines.join('').includes(KEY), false);
  }, { runs });
});

test('replies with Python are taken when the sandbox host is set, except with the provider\'s own web search', async () => {
  const started = [];
  const runs = { advancedEnabled: true, start: async ({ spec: given }) => { started.push(given.tools); return RUN_ID; }, stop: async () => true, get: async () => null };
  await withServer(async ({ base }) => {
    const python = spec();
    python.tools = { webSearch: 'research', advanced: true, designs: { deck: 'Slate', document: 'auto' }, inputs: [{ name: 'a.csv', mimeType: 'text/csv', data: 'YSxi' }] };
    assert.equal((await call(base, 'POST', '/v1/runs', python)).status, 202);
    assert.deepEqual(started[0].designs, { deck: 'Slate', document: 'auto' });
    assert.deepEqual(started[0].inputs, [{ name: 'a.csv', mimeType: 'text/csv', data: 'YSxi' }]);
    python.tools.webSearch = 'grounding';
    const refused = await call(base, 'POST', '/v1/runs', python);
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'unsupported_mode');
  }, { runs });
});

test('/v1/runs/:id/stream pushes the reply as it comes to any page that asks, and only for the signed-in person\'s own live reply', async () => {
  const watchers = [];
  const runs = {
    isLive: ({ userId, runId }) => userId === USER && runId === RUN_ID,
    watch: ({ userId, runId, send, close }) => {
      if (userId !== USER || runId !== RUN_ID) return null;
      send({ r: { answer: 'so far', thought: { text: '', kind: 'model' }, sources: [] } });
      watchers.push({ send, close });
      return () => { watchers.length = 0; };
    },
    start: async () => RUN_ID, stop: async () => true, get: async () => null
  };
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/runs/${RUN_ID}/stream`, { headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'https://noureon.com' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.match(response.headers.get('cache-control'), /no-transform/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://noureon.com');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle) => {
      while (!text.includes(needle)) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    };
    await readUntil('so far');
    watchers[0].send({ a: ' and more' });
    await readUntil('and more');
    watchers[0].send({ done: 'complete' });
    watchers[0].close();
    await readUntil('complete');
    assert.deepEqual(text.split('\n\n').filter(Boolean).map((block) => JSON.parse(block.replace(/^data: /, ''))).map((event) => event.done || event.a || event.r.answer), ['so far', ' and more', 'complete']);
    assert.equal((await reader.read()).done, true, 'the stream ends when the reply does');
    assert.equal((await fetch(`${base}/v1/runs/${RUN_ID}/stream`)).status, 401);
    assert.equal((await fetch(`${base}/v1/runs/423e4567-e89b-12d3-a456-4266141740ff/stream`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 404, 'not a reply that is live');
  }, { runs });
});
