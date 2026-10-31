import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { CredentialError } from '../../server/cli-credentials.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const TOKEN = 'good-token-good-token-good-token';
const KEY = 'sk-live-provider-key-value';

async function withServer(run, { auth = true, runs = null, credentials = null, files = null, memoryRebuild = null, shares = null } = {}) {
  const lines = [];
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => {
    if (!auth) throw new Error('offline');
    return options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 });
  };
  const server = createServer(createApp({ config, fetchImpl, runs, credentials, files, memoryRebuild, shares, log: createLogger((line) => lines.push(line)) }));
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

test('the client description document of a test site is served by the server, from its own settings', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/.well-known/oauth-client.json`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.client_id, 'https://noureon.com/.well-known/oauth-client.json');
    assert.deepEqual(body.redirect_uris, ['https://api.noureon.com/mcp/callback']);
    assert.equal(body.token_endpoint_auth_method, 'none');
    assert.equal(body.client_name, 'Noureon');
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
    assert.equal((await (await fetch(`${base}/healthz`)).json()).sandbox, 'off');
  });
});

test('/v1/runs accepts a reply, hands it over without its keys in the log, and stop and status are for the signed-in person only', async () => {
  const started = [];
  const runs = {
    sandboxState: () => 'down',
    start: async ({ userId, spec: given }) => { started.push({ userId, spec: given }); return RUN_ID; },
    stop: async ({ userId, runId }) => userId === USER && runId === RUN_ID,
    get: async ({ userId, runId }) => (userId === USER && runId === RUN_ID ? { id: RUN_ID, status: 'running' } : null)
  };
  await withServer(async ({ base, lines }) => {
    const accepted = await call(base, 'POST', '/v1/runs', spec());
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), { runId: RUN_ID, vision: false });
    assert.equal(started[0].userId, USER);
    assert.equal(started[0].spec.secrets.providerKey, KEY);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/stop`)).status, 200);
    assert.equal((await call(base, 'POST', '/v1/runs/423e4567-e89b-12d3-a456-4266141740ff/stop')).status, 404);
    assert.deepEqual((await (await call(base, 'GET', `/v1/runs/${RUN_ID}`)).json()).run, { id: RUN_ID, status: 'running' });
    assert.equal((await call(base, 'GET', '/v1/runs/423e4567-e89b-12d3-a456-4266141740ff')).status, 404);
    assert.equal((await fetch(`${base}/v1/runs/${RUN_ID}`)).status, 401);
    assert.equal(lines.join('').includes(KEY), false, 'no key in the log');
    assert.equal((await (await fetch(`${base}/healthz`)).json()).runs, true);
    // What the sandbox host was last found to be (a host that is down shows here before anyone wonders why Python runs in the browser).
    assert.equal((await (await fetch(`${base}/healthz`)).json()).sandbox, 'down');
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
  const runs = { advancedAvailable: async () => true, start: async ({ spec: given }) => { started.push(given.tools); return RUN_ID; }, stop: async () => true, get: async () => null };
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

test('a reply that asks for the visual check is told whether the server makes it', async () => {
  const runs = { visionAvailable: async () => true, start: async () => RUN_ID, stop: async () => true, get: async () => null };
  await withServer(async ({ base }) => {
    const asked = spec();
    asked.tools = { webSearch: 'off', advanced: false, visionCheck: { deckDesign: 'Slate', advanced: true } };
    const accepted = await call(base, 'POST', '/v1/runs', asked);
    assert.deepEqual(await accepted.json(), { runId: RUN_ID, vision: true });
    const not = await call(base, 'POST', '/v1/runs', spec());
    assert.deepEqual(await not.json(), { runId: RUN_ID, vision: false }, 'not asked: not made');
    asked.tools.visionCheck = { deckDesign: 5 };
    assert.equal((await call(base, 'POST', '/v1/runs', asked)).status, 422);
  }, { runs });
  const down = { visionAvailable: async () => false, start: async () => RUN_ID, stop: async () => true, get: async () => null };
  await withServer(async ({ base }) => {
    const asked = spec();
    asked.tools = { webSearch: 'off', advanced: false, visionCheck: { deckDesign: 'auto', advanced: false } };
    assert.deepEqual(await (await call(base, 'POST', '/v1/runs', asked)).json(), { runId: RUN_ID, vision: false }, 'a server that cannot draw leaves the check to the page');
  }, { runs: down });
});

test('a visual check asked for again is taken when the server can draw slides, and refused (so the page makes it) when it cannot', async () => {
  const again = () => ({ ...spec(), kind: 'vision', tools: { webSearch: 'off', advanced: false, visionCheck: { deckDesign: 'auto', advanced: false } }, source: { messageId: 'reply-1', text: 'Here.', parts: [], fileIds: ['f-1'] } });
  const started = [];
  const runs = (available) => ({ visionAvailable: async () => available, start: async ({ spec: given }) => { started.push(given); return RUN_ID; }, stop: async () => true, get: async () => null });
  await withServer(async ({ base }) => {
    assert.deepEqual(await (await call(base, 'POST', '/v1/runs', again())).json(), { runId: RUN_ID, vision: false }, 'it is the check: no other check follows it');
    assert.equal(started[0].kind, 'vision');
    assert.deepEqual(started[0].source.fileIds, ['f-1']);
  }, { runs: runs(true) });
  await withServer(async ({ base }) => {
    const refused = await call(base, 'POST', '/v1/runs', again());
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'unsupported_mode');
  }, { runs: runs(false) });
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

const researchSpec = () => ({ ...spec(), kind: 'research', research: { topic: 'Solid-state batteries' }, tools: { webSearch: 'research', advanced: false } });

test('a deep research is started at its own address and nowhere else, and the person\'s requests to it reach the run with the answers it gives', async () => {
  const started = [];
  const controls = [];
  const stops = [];
  const runs = {
    start: async ({ spec: given }) => { started.push(given.kind); return RUN_ID; },
    control: ({ userId, runId, action, payload }) => {
      controls.push([userId, runId, action, payload]);
      if (action === 'pause') return { ok: false, reason: 'wrong_phase' };
      if (action === 'plan' && !payload.instruction) return { ok: false, reason: 'empty' };
      if (action === 'resume') return { ok: false, reason: 'not_running' };
      return { ok: true };
    },
    stop: async ({ mode }) => { stops.push(mode); return true; }
  };
  await withServer(async ({ base }) => {
    assert.equal((await call(base, 'POST', '/v1/research', researchSpec())).status, 202);
    assert.deepEqual(started, ['research']);
    assert.equal((await call(base, 'POST', '/v1/research', spec())).status, 422, 'an ordinary reply is not taken there');
    assert.equal((await call(base, 'POST', '/v1/runs', researchSpec())).status, 422, 'and a research is not taken at the ordinary address');
    assert.deepEqual(started, ['research']);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/start`)).status, 200);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/hold`)).status, 200);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/release`)).status, 200);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/plan`, { instruction: 'only the cost' })).status, 200);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/plan`, { instruction: '' })).status, 400);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/steer`, { instruction: 'cover the cost' })).status, 200);
    assert.equal(controls.at(-1)[2], 'steer');
    assert.equal(controls.at(-1)[3].instruction, 'cover the cost');
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/steer`, { instruction: '' })).status, 200, 'the fake manager answers ok; the real one says empty');
    const pause = await call(base, 'POST', `/v1/runs/${RUN_ID}/pause`);
    assert.equal(pause.status, 409);
    assert.equal((await pause.json()).error.code, 'wrong_phase');
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/resume`)).status, 404);
    assert.deepEqual(controls.slice(0, 4).map((entry) => [entry[0], entry[1], entry[2]]), [[USER, RUN_ID, 'start'], [USER, RUN_ID, 'hold'], [USER, RUN_ID, 'release'], [USER, RUN_ID, 'plan']]);
    assert.equal(controls[3][3].instruction, 'only the cost');
    assert.equal((await fetch(`${base}/v1/runs/${RUN_ID}/start`, { method: 'POST' })).status, 401, 'only for a signed-in person');
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/stop`, { mode: 'report' })).status, 200);
    assert.equal((await call(base, 'POST', `/v1/runs/${RUN_ID}/stop`)).status, 200);
    assert.deepEqual(stops, ['report', null]);
  }, { runs });
});

// ----- secure credentials of CLI tools, and the person's answers about sites

const auth = { Authorization: `Bearer ${TOKEN}` };
const json = { 'Content-Type': 'application/json' };

function fakeCredentials() {
  const calls = [];
  return {
    calls,
    list: async (userId) => { calls.push(['list', userId]); return [{ name: 'TWITTER_CT0', value: 'abc', updatedAt: '2026-10-05T00:00:00Z' }]; },
    set: async (userId, name, value) => {
      calls.push(['set', userId, name, value]);
      if (name === 'BAD') throw new CredentialError('bad_value', 'A value is 1 to 4000 characters.');
      return { name };
    },
    remove: async (userId, name) => { calls.push(['remove', userId, name]); }
  };
}

test('secure credentials: a signed-in person lists, sets and removes their own, and nothing else may', async () => {
  const credentials = fakeCredentials();
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/v1/credentials`)).status, 401, 'signing in is needed');
    const listed = await fetch(`${base}/v1/credentials`, { headers: auth });
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json()).credentials, [{ name: 'TWITTER_CT0', value: 'abc', updatedAt: '2026-10-05T00:00:00Z' }]);
    assert.equal(listed.headers.get('cache-control'), 'no-store');
    const put = await fetch(`${base}/v1/credentials/TWITTER_CT0`, { method: 'PUT', headers: { ...auth, ...json }, body: JSON.stringify({ value: 'new-value' }) });
    assert.equal(put.status, 200);
    assert.deepEqual(credentials.calls.at(-1), ['set', USER, 'TWITTER_CT0', 'new-value'], 'always for the person who signed in');
    const refused = await fetch(`${base}/v1/credentials/BAD`, { method: 'PUT', headers: { ...auth, ...json }, body: JSON.stringify({ value: '' }) });
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).error.reason, 'bad_value');
    const removed = await fetch(`${base}/v1/credentials/TWITTER_CT0`, { method: 'DELETE', headers: auth });
    assert.equal(removed.status, 200);
    assert.deepEqual(credentials.calls.at(-1), ['remove', USER, 'TWITTER_CT0']);
    assert.equal((await fetch(`${base}/v1/credentials/lower-case`, { method: 'DELETE', headers: auth })).status, 404, 'not a credential name');
    assert.equal((await fetch(`${base}/v1/credentials`, { method: 'PUT', headers: { ...auth, ...json }, body: '{}' })).status, 404, 'a PUT needs a name');
    const preflight = await fetch(`${base}/v1/credentials/X`, { method: 'OPTIONS', headers: { Origin: 'https://noureon.com' } });
    assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
    assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
  }, { credentials });
});

test('secure credentials: without the store set up, the server says so', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/credentials`, { headers: auth });
    assert.equal(response.status, 503);
  });
});

test('an answer about a site reaches the reply of the person who gives it, and only a valid answer is taken', async () => {
  const answers = [];
  const runs = { answerNet: async (args) => { answers.push(args); return args.runId === USER ? { ok: true, answered: true } : { ok: false, reason: 'not_running' }; } };
  await withServer(async ({ base }) => {
    const answer = (runId, body) => fetch(`${base}/v1/runs/${runId}/net`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify(body) });
    const ok = await answer(USER, { askId: 'ask0000000000001', decision: 'always' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, answered: true });
    assert.deepEqual(answers[0], { userId: USER, runId: USER, askId: 'ask0000000000001', decision: 'always' });
    assert.equal((await answer(USER, { askId: 'ask0000000000001', decision: 'maybe' })).status, 400);
    assert.equal((await answer(USER, { askId: '../x', decision: 'once' })).status, 400);
    assert.equal((await answer('323e4567-e89b-12d3-a456-426614174002', { askId: 'ask0000000000001', decision: 'once' })).status, 404, 'a reply that is not running here');
    assert.equal((await fetch(`${base}/v1/runs/${USER}/net`, { method: 'POST', headers: json, body: '{}' })).status, 401);
  }, { runs });
});

test('/v1/storage tells the signed-in person how much of their space is used', async () => {
  const asked = [];
  const files = { quotaBytes: 500 * 1024 * 1024, usage: async (userId) => { asked.push(userId); return 1234; } };
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/v1/storage`)).status, 401);
    const response = await fetch(`${base}/v1/storage`, { headers: auth });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { usedBytes: 1234, quotaBytes: 500 * 1024 * 1024 });
    assert.deepEqual(asked, [USER]);
  }, { files });
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/v1/storage`, { headers: auth })).status, 503);
  });
});

test('an answer about the window for a tool\'s login reaches the reply of the person who gives it, and carries no value', async () => {
  const answers = [];
  const runs = { answerCredential: async (args) => { answers.push(args); return args.runId === USER ? { ok: true, answered: true } : { ok: false, reason: 'not_running' }; } };
  await withServer(async ({ base }) => {
    const answer = (runId, body) => fetch(`${base}/v1/runs/${runId}/credential`, { method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify(body) });
    const ok = await answer(USER, { askId: 'ask0000000000001', decision: 'saved', value: 'ignored' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, answered: true });
    assert.deepEqual(answers[0], { userId: USER, runId: USER, askId: 'ask0000000000001', decision: 'saved' }, 'only the decision is passed on');
    assert.equal((await answer(USER, { askId: 'ask0000000000001', decision: 'cancel' })).status, 200);
    assert.equal((await answer(USER, { askId: 'ask0000000000001', decision: 'once' })).status, 400);
    assert.equal((await answer(USER, { askId: '../x', decision: 'saved' })).status, 400);
    assert.equal((await answer('323e4567-e89b-12d3-a456-426614174002', { askId: 'ask0000000000001', decision: 'saved' })).status, 404);
    assert.equal((await fetch(`${base}/v1/runs/${USER}/credential`, { method: 'POST', headers: json, body: '{}' })).status, 401);
  }, { runs });
});

test('a person\'s request to let a model of their council leave reaches that council, and only a valid request is taken', async () => {
  const asked = [];
  const runs = { exitCouncilMember: async (args) => { asked.push(args); return args.runId === USER ? { ok: true, exited: args.modelId === 'can-leave' } : { ok: false, reason: 'not_running' }; } };
  await withServer(async ({ base }) => {
    const exit = (runId, body, headers = { ...auth, ...json }) => fetch(`${base}/v1/runs/${runId}/member`, { method: 'POST', headers, body: JSON.stringify(body) });
    const ok = await exit(USER, { modelId: 'can-leave' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, exited: true });
    assert.deepEqual(asked[0], { userId: USER, runId: USER, modelId: 'can-leave' });
    assert.deepEqual(await (await exit(USER, { modelId: 'other' })).json(), { ok: true, exited: false });
    assert.equal((await exit(USER, { modelId: '' })).status, 400);
    assert.equal((await exit(USER, { modelId: 5 })).status, 400);
    assert.equal((await exit('323e4567-e89b-12d3-a456-426614174002', { modelId: 'can-leave' })).status, 404, 'a council that is not running here');
    assert.equal((await exit(USER, { modelId: 'can-leave' }, json)).status, 401);
  }, { runs });
});

test('the rebuild of the memory: only for a signed-in person, with the key passed on to the job once and never into the log; the answers say what happened', async () => {
  const calls = [];
  let result = { ok: true };
  const memoryRebuild = { start: async (args) => { calls.push(args); return result; }, stop: (userId) => userId === USER };
  await withServer(async ({ base, lines }) => {
    const send = (path, body, token = TOKEN) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await send('/v1/memory/rebuild', { modelId: 'm', key: KEY }, null)).status, 401);
    const started = await send('/v1/memory/rebuild', { modelId: 'm', key: KEY, language: 'fr' });
    assert.equal(started.status, 202);
    assert.deepEqual(await started.json(), { started: true });
    assert.deepEqual(calls, [{ userId: USER, modelId: 'm', key: KEY, language: 'fr' }]);
    result = { ok: false, code: 'already_running' };
    const running = await send('/v1/memory/rebuild', { modelId: 'm', key: KEY });
    assert.equal(running.status, 409);
    assert.equal((await running.json()).error.reason, 'already_running');
    result = { ok: false, code: 'unknown_model' };
    assert.equal((await send('/v1/memory/rebuild', { modelId: 'nope', key: KEY })).status, 400);
    assert.equal((await send('/v1/memory/rebuild', { modelId: 'm', key: 'x'.repeat(601) })).status, 400, 'a key that long is not passed on');
    assert.equal(calls.at(-1).key, '', 'it reached the job as no key');
    const stopped = await send('/v1/memory/rebuild/stop', {});
    assert.deepEqual(await stopped.json(), { stopped: true });
    assert.equal(lines.join('\n').includes(KEY), false, 'the key is not in the log');
  }, { memoryRebuild });
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/memory/rebuild`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: '{}' });
    assert.equal(response.status, 503, 'a server without the memory says so');
  });
});

test('POST /v1/shares makes a share of a conversation and POST /v1/shares/:id/refresh makes it again; the errors say why', async () => {
  const { ShareError } = await import('../../server/shares.js');
  const calls = [];
  let failure = null;
  const shares = {
    create: async (args) => { calls.push(['create', args]); if (failure) throw failure; return { id: 's1', code: 'C'.repeat(32), mode: args.mode, showName: args.showName, title: 't', createdAt: 'now' }; },
    refresh: async (args) => { calls.push(['refresh', args]); if (failure) throw failure; return { id: args.shareId, code: 'C'.repeat(32), mode: 'view', showName: false, title: 't', createdAt: 'now' }; }
  };
  const conversationId = '123e4567-e89b-12d3-a456-426614174000';
  await withServer(async ({ base }) => {
    const send = (path, body, token = TOKEN) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await send('/v1/shares', { conversationId, mode: 'view' }, null)).status, 401);
    const made = await send('/v1/shares', { conversationId, mode: 'continue', showName: true, ownerName: 'Allen' });
    assert.equal(made.status, 201);
    assert.equal((await made.json()).share.code.length, 32);
    assert.deepEqual(calls[0], ['create', { userId: USER, conversationId, mode: 'continue', showName: true, ownerName: 'Allen' }]);
    assert.equal((await send('/v1/shares', { conversationId: 'nope', mode: 'view' })).status, 400);
    const again = await send(`/v1/shares/${conversationId}/refresh`, {});
    assert.equal(again.status, 200);
    assert.deepEqual(calls.at(-1), ['refresh', { userId: USER, shareId: conversationId }]);
    for (const [code, extra, status, reason] of [['limit', { limit: 30 }, 409, 'limit'], ['not_active', {}, 409, 'not_active'], ['too_large', { what: 'files' }, 413, 'too_large'], ['not_found', {}, 404, undefined], ['storage', {}, 503, 'storage']]) {
      failure = new ShareError('x', code, extra);
      const refused = await send('/v1/shares', { conversationId, mode: 'view' });
      assert.equal(refused.status, status, code);
      if (reason) assert.equal((await refused.json()).error.reason, reason);
    }
  }, { shares });
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/v1/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: '{}' });
    assert.equal(response.status, 503, 'a server without sharing says so');
  });
});
