import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { createFileStore } from '../../server/file-store.js';
import { executeImage } from '../../server/image-run.js';
import { createKeyVault } from '../../server/key-vault.js';
import { LIMITS, PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createRunStore } from '../../server/run-store.js';
import { createRunManager } from '../../server/runs.js';
import { ReplyError } from '../../server/executor.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const MESSAGE = '223e4567-e89b-12d3-a456-426614174001';
const CONVERSATION = '323e4567-e89b-12d3-a456-426614174002';
const KEY = 'sk-or-image-secret-value';
const TOKEN = 'good-token-good-token-good-token';
const PICTURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8]);
const PICTURE_B64 = PICTURE.toString('base64');

const imageSpec = (overrides = {}) => ({
  protocol: PROTOCOL_VERSION,
  kind: 'image',
  clientVersion: '17.9.0',
  conversationId: CONVERSATION,
  assistantMessageId: MESSAGE,
  sequence: 3,
  model: { provider: 'openrouter', id: 'black-forest-labs/flux-3-image', info: { name: 'FLUX.3 Image', provider: 'openrouter' } },
  request: { language: 'zh-TW' },
  image: { prompt: 'a cat in the rain', config: { aspectRatio: '16:9', resolution: '2K' }, references: [] },
  secrets: { providerKey: KEY },
  ...overrides
});

// ----- the request

test('an image request is accepted, with only the known fields kept and what the rest of the server reads filled in', () => {
  const result = validateRunSpec(imageSpec({ image: { prompt: ' a cat ', config: { aspectRatio: '1:1', resolution: '', n: 2, quality: 'high', seed: 7, reasoningEffort: 'minimal', provider: { options: { x: {} } } }, references: ['data:image/png;base64,AAAA', { __astraCloudAsset: { path: `${USER}/${'a'.repeat(64)}`, mimeType: 'image/webp', encoding: 'blob' } }] } }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { spec } = result;
  assert.equal(spec.kind, 'image');
  assert.deepEqual(spec.image.config, { aspectRatio: '1:1', n: 2, quality: 'high', seed: 7, reasoningEffort: 'minimal', provider: { options: { x: {} } } }, "an empty size is left out");
  assert.equal(spec.image.references.length, 2);
  assert.deepEqual(spec.request, { history: [], currentMessage: { parts: [] }, systemInstruction: '', language: 'zh-TW' });
  assert.deepEqual(spec.tools, { webSearch: 'off', searchProvider: 'tavily', advanced: false });
  assert.deepEqual(spec.secrets, { providerKey: KEY });
  assert.equal(validateRunSpec(imageSpec({ image: { prompt: 'x', config: { aspectRatio: 'auto' } } })).ok, true, 'auto is a ratio of the app');
});

test('an image request that is not in the right shape says where, and never repeats a value', () => {
  const bad = (change) => validateRunSpec(imageSpec(change));
  const paths = (result) => result.errors.map((error) => error.path);
  assert.equal(bad({ model: { provider: 'gemini', id: 'm', info: {} } }).ok, false);
  assert.ok(paths(bad({ model: { provider: 'gemini', id: 'm', info: {} } })).includes('model.provider'));
  assert.ok(paths(bad({ image: { prompt: '', config: { aspectRatio: '1:1' } } })).includes('image.prompt'));
  assert.ok(paths(bad({ image: { prompt: 'x'.repeat(LIMITS.maxImagePromptChars + 1), config: { aspectRatio: '1:1' } } })).includes('image.prompt'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '5:9' } } })).includes('image.config.aspectRatio'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1', resolution: '8K' } } })).includes('image.config.resolution'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1', n: 9 } } })).includes('image.config.n'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1', evil: 1 } } })).includes('image.config.evil'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1' }, references: ['https://example.com/a.png'] } })).includes('image.references[0]'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1' }, references: Array(LIMITS.maxImageReferences + 1).fill('data:image/png;base64,AA') } })).includes('image.references'));
  assert.ok(paths(bad({ image: { prompt: 'x', config: { aspectRatio: '1:1' }, references: [{ __astraCloudAsset: { path: 'p', mimeType: 'application/pdf' } }] } })).includes('image.references[0]'));
  assert.ok(paths(bad({ request: { language: 'xx' } })).includes('request.language'));
  assert.ok(paths(bad({ secrets: { providerKey: KEY, searchKey: 'other-key-value' } })).includes('secrets.searchKey'));
  assert.ok(paths(bad({ tools: { advanced: true } })).includes('tools'), 'an image takes no tools');
  const secret = bad({ image: { prompt: 'x', config: { aspectRatio: KEY } } });
  assert.equal(JSON.stringify(secret).includes(KEY), false);
  assert.equal(validateRunSpec({ ...imageSpec(), protocol: PROTOCOL_VERSION + 1 }).unsupportedProtocol, true);
});

// ----- making the image

function openRouter({ images = [{ b64_json: PICTURE_B64, media_type: 'image/png' }], status = 200, error = null, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    if (hang) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (error) return new Response(JSON.stringify({ error: { message: error } }), { status });
    return new Response(JSON.stringify({ data: images }), { status });
  };
  return { calls, fetchImpl };
}

function memoryFiles({ failSaves = 0, loadable = {} } = {}) {
  const saved = [];
  let failures = failSaves;
  return {
    saved,
    loads: [],
    async save(args) {
      if (failures > 0) { failures -= 1; throw new Error('storage is down'); }
      saved.push(args);
      return { __astraCloudAsset: { path: `${args.userId}/stored-${saved.length}`, mimeType: args.mimeType, encoding: args.encoding } };
    },
    async load({ marker }) {
      this.loads.push(marker);
      const found = loadable[marker.__astraCloudAsset.path];
      if (!found) throw new Error('missing');
      return found;
    }
  };
}

const run = (spec, extra = {}) => executeImage({ spec, secrets: spec.secrets, userId: USER, signal: new AbortController().signal, wait: async () => {}, ...extra });

test('the image is asked of OpenRouter as the page asks it, kept in the cloud space, and given back as the parts the app knows', async () => {
  const router = openRouter({ images: [{ b64_json: PICTURE_B64, media_type: 'image/png' }, { b64_json: PICTURE_B64, media_type: 'image/webp' }] });
  const files = memoryFiles();
  const updates = [];
  const spec = validateRunSpec(imageSpec({ image: { prompt: 'a cat in the rain', config: { aspectRatio: '7:5', resolution: '1.5K', n: 2 }, references: ['data:image/png;base64,QUJD'] } })).spec;
  const result = await run(spec, { fetchImpl: router.fetchImpl, files, onUpdate: (parts) => updates.push(parts) });

  assert.deepEqual(updates[0], [{ imageGenerationLoading: true, imageAspectRatio: '7:5' }], 'the place-holder comes first');
  assert.equal(router.calls.length, 1);
  assert.equal(router.calls[0].url, 'https://openrouter.ai/api/v1/images');
  assert.equal(router.calls[0].options.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(router.calls[0].body, { model: 'black-forest-labs/flux-3-image', prompt: 'a cat in the rain', n: 2, resolution: '1.5K', aspect_ratio: '7:5', input_references: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }] });
  assert.equal('stream' in router.calls[0].body, false, 'no preview pictures');

  assert.equal(result.status, 'done');
  assert.equal(result.parts.length, 2);
  assert.deepEqual(files.saved.map((entry) => [entry.userId, entry.mimeType, entry.encoding, entry.quota]), [[USER, 'image/png', 'blob', false], [USER, 'image/webp', 'blob', false]]);
  assert.deepEqual([...files.saved[0].bytes], [...PICTURE]);
  const first = result.parts[0].generatedImage;
  assert.deepEqual(Object.keys(first).sort(), ['aspectRatio', 'cloudAsset', 'id', 'mediaType', 'size', 'storageKey']);
  assert.equal(first.storageKey, `generatedImage:supabase:${USER}:${first.id}`);
  assert.equal(first.size, PICTURE.length);
  assert.equal(first.aspectRatio, '7:5');
  assert.equal(first.cloudAsset.__astraCloudAsset.encoding, 'blob');
  assert.notEqual(result.parts[1].generatedImage.id, first.id);
});

test('a picture from the cloud space is read there and sent as a data address', async () => {
  const router = openRouter();
  const marker = { __astraCloudAsset: { path: `${USER}/${'b'.repeat(64)}`, mimeType: 'image/png', encoding: 'blob' } };
  const files = memoryFiles({ loadable: { [marker.__astraCloudAsset.path]: new Uint8Array([65, 66, 67]) } });
  const spec = validateRunSpec(imageSpec({ image: { prompt: 'x', config: { aspectRatio: '1:1' }, references: [marker] } })).spec;
  await run(spec, { fetchImpl: router.fetchImpl, files });
  assert.deepEqual(router.calls[0].body.input_references, [{ type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }]);
  const lost = memoryFiles();
  await assert.rejects(() => run(spec, { fetchImpl: router.fetchImpl, files: lost }), (error) => error instanceof ReplyError && error.code === 'provider_error' && /reference picture/.test(error.message));
});

test('what the provider says is kept (without the key), and an answer with no picture is an error', async () => {
  const spec = validateRunSpec(imageSpec()).spec;
  const refused = openRouter({ status: 402, error: `Insufficient credits for key ${KEY}` });
  await assert.rejects(() => run(spec, { fetchImpl: refused.fetchImpl, files: memoryFiles() }), (error) => {
    assert.ok(error instanceof ReplyError);
    assert.equal(error.code, 'provider_error');
    assert.match(error.message, /Insufficient credits/);
    assert.equal(error.message.includes(KEY), false);
    return true;
  });
  const empty = openRouter({ images: [] });
  await assert.rejects(() => run(spec, { fetchImpl: empty.fetchImpl, files: memoryFiles() }), (error) => error.code === 'provider_error' && /no picture/.test(error.message));
});

test('a stop puts the request down and keeps nothing', async () => {
  const router = openRouter({ hang: true });
  const files = memoryFiles();
  const controller = new AbortController();
  const spec = validateRunSpec(imageSpec()).spec;
  const pending = run(spec, { fetchImpl: router.fetchImpl, files, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort('stopped');
  const result = await pending;
  assert.equal(result.status, 'stopped');
  assert.deepEqual(result.parts, [{ text: '' }]);
  assert.equal(files.saved.length, 0);

  const late = new AbortController();
  const answered = openRouter();
  const slowFiles = memoryFiles();
  const stoppedAfter = await run(spec, { fetchImpl: async (...args) => { const response = await answered.fetchImpl(...args); late.abort('stopped'); return response; }, files: slowFiles, signal: late.signal });
  assert.equal(stoppedAfter.status, 'stopped', 'a stop that comes as the picture arrives still stops');
  assert.equal(slowFiles.saved.length, 0);
});

test('a picture that cannot be kept is tried again, and when it still cannot the person is told the image was made but not kept', async () => {
  const spec = validateRunSpec(imageSpec()).spec;
  const problems = [];
  const flaky = memoryFiles({ failSaves: 2 });
  const result = await run(spec, { fetchImpl: openRouter().fetchImpl, files: flaky, onProblem: (what) => problems.push(what) });
  assert.equal(result.status, 'done', 'the third try keeps it');
  assert.deepEqual(problems, ['image_not_saved', 'image_not_saved']);
  const broken = memoryFiles({ failSaves: 99 });
  await assert.rejects(() => run(spec, { fetchImpl: openRouter().fetchImpl, files: broken }), (error) => error instanceof ReplyError && error.code === 'image_not_saved');
});

// ----- the run

function fakeDatabase() {
  const log = { rpcs: [], updates: [] };
  return {
    log,
    async rpc(name, args) {
      log.rpcs.push({ name, args });
      return name === 'server_start_run' ? 'run-1' : null;
    },
    async select() { return []; },
    async update(table, filters, values) { log.updates.push({ table, filters, values }); return [{ id: 'x', stop_requested: false }]; }
  };
}
function harness({ fetchImpl, files = memoryFiles() }) {
  const db = fakeDatabase();
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const timers = [];
  const logs = [];
  const manager = createRunManager({
    store: createRunStore({ db, limits: LIMITS }),
    db,
    vault,
    files,
    fetchImpl,
    executeImageRun: (args) => executeImage({ ...args, wait: async () => {} }),
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
    setRepeating: () => 1,
    clearRepeating: () => {},
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {}
  });
  return { manager, db, timers, logs, files, vault };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const writes = (db) => db.log.rpcs.filter((call) => call.name === 'server_upsert_workspace_message').map((call) => call.args.p_row);
const specFor = (overrides) => validateRunSpec(imageSpec(overrides)).spec;

test('an image run writes the place-holder, then the picture; its key lives half an hour and goes the moment it ends', async () => {
  const { manager, db, files, vault, logs } = harness({ fetchImpl: openRouter().fetchImpl });
  assert.equal(manager.imageAvailable(), true);
  const runId = await manager.start({ userId: USER, spec: specFor() });
  assert.equal(runId, 'run-1');
  await settle();

  const start = db.log.rpcs.find((call) => call.name === 'server_start_run').args;
  assert.deepEqual(start.p_model, { provider: 'openrouter', id: 'black-forest-labs/flux-3-image', kind: 'image' });
  assert.equal(Date.parse(start.p_key_expires_at) - Date.now() < 31 * 60 * 1000 && Date.parse(start.p_key_expires_at) - Date.now() > 29 * 60 * 1000, true, 'half an hour');
  assert.deepEqual(vault.open(start.p_key_envelope, start.p_key_version, { userId: USER, messageId: MESSAGE }), { providerKey: KEY });
  const kept = db.log.updates.find((update) => update.values.spec);
  assert.equal(JSON.stringify(kept.values.spec).includes(KEY), false, 'the kept request has no key');
  assert.equal(kept.values.spec.kind, 'image');

  const rows = writes(db);
  assert.equal(rows[0].status, 'streaming');
  assert.deepEqual(rows[0].parts, [{ imageGenerationLoading: true, imageAspectRatio: '16:9' }]);
  assert.equal(rows.at(-1).status, 'complete');
  assert.equal(rows.at(-1).role, 'model');
  assert.equal(rows.at(-1).sequence, 3);
  assert.equal(rows.at(-1).id, MESSAGE);
  assert.equal(rows.at(-1).parts.length, 1);
  assert.ok(rows.at(-1).parts[0].generatedImage.cloudAsset.__astraCloudAsset.path.startsWith(`${USER}/`));
  assert.equal(files.saved.length, 1);
  const done = db.log.updates.find((update) => update.values.status === 'done');
  assert.equal(done.values.key_envelope, null);
  assert.equal(manager.activeCount, 0);
  assert.equal(logs.join('').includes(KEY), false);
});

test('an image run that fails writes the error in the language of the page, with the code, and no key', async () => {
  const refused = openRouter({ status: 402, error: `No credits left on ${KEY}` });
  const { manager, db, logs } = harness({ fetchImpl: refused.fetchImpl });
  await manager.start({ userId: USER, spec: specFor({ request: { language: 'en' } }) });
  await settle();
  const last = writes(db).at(-1);
  assert.equal(last.status, 'error');
  assert.match(last.parts[0].text, /^Sorry, an error occurred: No credits left on/);
  assert.equal(JSON.stringify(last).includes(KEY), false);
  assert.equal(last.metadata.serverError.code, 'provider_error');
  assert.equal(db.log.updates.some((update) => update.values.status === 'failed' && update.values.error_code === 'provider_error' && update.values.key_envelope === null), true);
  assert.equal(logs.join('').includes(KEY), false);

  const notKept = harness({ fetchImpl: openRouter().fetchImpl, files: memoryFiles({ failSaves: 99 }) });
  await notKept.manager.start({ userId: USER, spec: specFor() });
  await settle();
  const sorry = writes(notKept.db).at(-1);
  assert.equal(sorry.status, 'error');
  assert.match(sorry.parts[0].text, /圖片畫好了，但沒能存進你的雲端空間/);
  assert.equal(sorry.metadata.serverError.code, 'image_not_saved');
});

test('a person can stop an image that is being made, and the time limit is ten minutes', async () => {
  const hanging = harness({ fetchImpl: openRouter({ hang: true }).fetchImpl });
  await hanging.manager.start({ userId: USER, spec: specFor() });
  await settle();
  assert.equal(await hanging.manager.stop({ userId: USER, runId: 'run-1' }), true);
  await settle();
  assert.equal(writes(hanging.db).at(-1).status, 'complete');
  assert.deepEqual(writes(hanging.db).at(-1).parts, [{ text: '' }]);
  assert.equal(hanging.db.log.updates.some((update) => update.values.status === 'stopped'), true);
  assert.equal(hanging.files.saved.length, 0);

  const slow = harness({ fetchImpl: openRouter({ hang: true }).fetchImpl });
  await slow.manager.start({ userId: USER, spec: specFor({ request: { language: 'en' } }) });
  await settle();
  const limit = slow.timers.find((timer) => timer.ms === LIMITS.maxImageRunMs);
  assert.ok(limit, 'a limit of ten minutes is set');
  assert.equal(LIMITS.maxImageRunMs, 10 * 60 * 1000);
  limit.fn();
  await settle();
  const last = writes(slow.db).at(-1);
  assert.equal(last.status, 'error');
  assert.equal(last.metadata.serverError.code, 'time_limit');
  assert.equal(slow.db.log.updates.some((update) => update.values.status === 'failed' && update.values.error_code === 'time_limit'), true);
});

test('without a store for the pictures the server says it cannot make images', () => {
  const { manager } = harness({ fetchImpl: openRouter().fetchImpl, files: null });
  assert.equal(manager.imageAvailable(), false);
});

test('the store keeps a picture as the app\'s own sync does, and a picture is not stopped by the space the person has', async () => {
  const objects = new Map();
  const fetchImpl = async (url, options = {}) => {
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/storage\/v1\/object\/(info\/)?user-assets\//, ''));
    if (String(url).includes('/object/info/')) return { ok: objects.has(path) };
    objects.set(path, options.body);
    return { ok: true, status: 200, text: async () => '' };
  };
  const db = { rpc: async () => 499 * 1024 * 1024 };
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'svc', fetchImpl, db, quotaBytes: 500 * 1024 * 1024 });
  const bytes = new Uint8Array(5 * 1024 * 1024).fill(7);
  await assert.rejects(() => store.save({ userId: USER, bytes, mimeType: 'application/pdf' }), (error) => error.code === 'quota', 'a file is stopped by the space');
  const marker = await store.save({ userId: USER, bytes, mimeType: 'image/png', encoding: 'blob', quota: false });
  assert.equal(marker.__astraCloudAsset.encoding, 'blob');
  assert.match(marker.__astraCloudAsset.path, new RegExp(`^${USER}/[0-9a-f]{64}$`));
  assert.equal((await store.save({ userId: USER, bytes: new Uint8Array([1]), mimeType: 'image/png' })).__astraCloudAsset.encoding, 'base64', 'the usual encoding is unchanged');
});

// ----- the address

async function withServer(runs, body) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => (options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 }));
  const lines = [];
  const server = createServer(createApp({ config, fetchImpl, runs, log: createLogger((line) => lines.push(line)) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await body({ base: `http://127.0.0.1:${server.address().port}`, lines });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const post = (base, path, payload) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(payload) });

test('/v1/runs takes an image request when the server can make images, and answers unsupported_mode (so the page makes it) when it cannot', async () => {
  const started = [];
  const runs = (available) => ({ imageAvailable: () => available, start: async ({ spec }) => { started.push(spec); return 'run-9'; }, stop: async () => true, get: async () => null });
  await withServer(runs(true), async ({ base, lines }) => {
    const accepted = await post(base, '/v1/runs', imageSpec());
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).runId, 'run-9');
    assert.equal(started[0].kind, 'image');
    assert.equal(started[0].secrets.providerKey, KEY);
    assert.equal(lines.join('').includes(KEY), false, 'no key in the log');
    const wrong = await post(base, '/v1/runs', imageSpec({ image: { prompt: 'x', config: { aspectRatio: 'nope' } } }));
    assert.equal(wrong.status, 422);
    assert.equal((await wrong.json()).error.code, 'invalid_run_spec');
    assert.equal((await post(base, '/v1/research', imageSpec())).status, 422, 'an image is not a deep research');
  });
  await withServer(runs(false), async ({ base }) => {
    const refused = await post(base, '/v1/runs', imageSpec());
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'unsupported_mode');
  });
});
