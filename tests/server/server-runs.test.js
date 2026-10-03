import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { errorText } from '../../server/error-texts.js';
import { ReplyError } from '../../server/executor.js';
import { createKeyVault } from '../../server/key-vault.js';
import { createMessageWriter } from '../../server/message-writer.js';
import { LIMITS } from '../../server/protocol.js';
import { createRunStore } from '../../server/run-store.js';
import { createRunManager, RunError } from '../../server/runs.js';
import { createServiceClient, DatabaseError } from '../../server/supabase-rest.js';
import { createUpstreamFetch } from '../../server/upstream-fetch.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const MESSAGE = '223e4567-e89b-12d3-a456-426614174001';
const CONVERSATION = '323e4567-e89b-12d3-a456-426614174002';
const KEY = 'sk-provider-secret-value';
const masterKey = () => randomBytes(32).toString('base64');

// ----- the sealed keys

test('keys are sealed for one person and one message, and nothing else opens them', () => {
  const vault = createKeyVault([{ version: 1, key: masterKey() }]);
  const secrets = { providerKey: KEY, searchKey: 'search-secret' };
  const { envelope, keyVersion } = vault.seal(secrets, { userId: USER, messageId: MESSAGE });
  assert.equal(keyVersion, 1);
  assert.doesNotMatch(envelope, new RegExp(KEY), 'the key is not in the envelope');
  assert.deepEqual(vault.open(envelope, 1, { userId: USER, messageId: MESSAGE }), secrets);
  assert.throws(() => vault.open(envelope, 1, { userId: USER, messageId: '999e4567-e89b-12d3-a456-426614174009' }), /cannot be opened/, 'not for another message');
  assert.throws(() => vault.open(envelope, 1, { userId: '999e4567-e89b-12d3-a456-426614174009', messageId: MESSAGE }), /cannot be opened/, 'not for another person');
  const [prefix, iv, tag, sealed] = envelope.split('.');
  const flipped = Buffer.from(sealed, 'base64');
  flipped[0] ^= 1;
  assert.throws(() => vault.open([prefix, iv, tag, flipped.toString('base64')].join('.'), 1, { userId: USER, messageId: MESSAGE }), /cannot be opened/, 'a changed byte');
  assert.throws(() => vault.open(envelope, 2, { userId: USER, messageId: MESSAGE }), /cannot be opened/, 'an unknown key version');
  assert.throws(() => vault.open('garbage', 1, { userId: USER, messageId: MESSAGE }), /cannot be opened/);
  assert.notEqual(vault.seal(secrets, { userId: USER, messageId: MESSAGE }).envelope, envelope, 'a fresh nonce each time');
});

test('a master key can be replaced: the new one seals, the old one still opens what it sealed', () => {
  const oldKey = masterKey();
  const newKey = masterKey();
  const before = createKeyVault([{ version: 1, key: oldKey }]).seal({ providerKey: KEY }, { userId: USER, messageId: MESSAGE });
  const after = createKeyVault([{ version: 2, key: newKey }, { version: 1, key: oldKey }]);
  assert.equal(after.currentVersion, 2);
  assert.deepEqual(after.open(before.envelope, before.keyVersion, { userId: USER, messageId: MESSAGE }), { providerKey: KEY });
  assert.equal(after.seal({ providerKey: KEY }, { userId: USER, messageId: MESSAGE }).keyVersion, 2);
  assert.throws(() => createKeyVault([]), /encryption key is needed/);
  assert.throws(() => createKeyVault([{ version: 1, key: 'short' }]), /32 bytes/);
});

// ----- the database client and the run record

test('the database client sends the service key, and its errors carry the database\'s code but never the request', async () => {
  const calls = [];
  const client = createServiceClient({
    url: 'https://project.supabase.example',
    serviceKey: 'service-key-value',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (String(url).includes('/rpc/boom')) return new Response(JSON.stringify({ code: 'P0001', message: 'too_many_runs' }), { status: 400 });
      return new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
    }
  });
  assert.deepEqual(await client.rpc('good', { a: 1 }), [{ id: 'x' }]);
  assert.equal(calls[0].url, 'https://project.supabase.example/rest/v1/rpc/good');
  assert.equal(calls[0].options.headers.apikey, 'service-key-value');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer service-key-value');
  await client.update('server_runs', { id: 'eq.1', status: 'in.(queued,running)' }, { stop_requested: true });
  assert.match(calls[1].url, /server_runs\?id=eq\.1&status=in\.\(queued%2Crunning\)&select=id/);
  assert.equal(calls[1].options.method, 'PATCH');
  await assert.rejects(() => client.rpc('boom', { secret: KEY }), (error) => {
    assert.ok(error instanceof DatabaseError);
    assert.equal(error.code, 'P0001');
    assert.match(error.message, /too_many_runs/);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(KEY));
    return true;
  });
  const down = createServiceClient({ url: 'https://p.example', serviceKey: 'k', fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => down.rpc('x'), /could not be reached/);
});

function fakeDatabase({ startError = null, stale = [], specs = {} } = {}) {
  const log = { rpcs: [], updates: [], selects: [] };
  return {
    log,
    async rpc(name, args) {
      log.rpcs.push({ name, args });
      if (name === 'server_start_run') {
        if (startError) throw startError;
        return 'run-1';
      }
      if (name === 'server_claim_stale_runs') return stale;
      return null;
    },
    async select(table, options) {
      log.selects.push({ table, options });
      const id = String(options.filters.id).replace('eq.', '');
      return specs[id] ? [{ spec: specs[id] }] : [];
    },
    async update(table, filters, values, options) {
      log.updates.push({ table, filters, values, options });
      return [{ id: 'x', stop_requested: Boolean(log.stopRequested) }];
    }
  };
}

test('the run record: a run is started with the limit, its key goes the moment it ends, and a person can only stop their own', async () => {
  const db = fakeDatabase();
  const store = createRunStore({ db, limits: LIMITS, now: () => new Date('2026-10-03T00:00:00Z') });
  const id = await store.start({ userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, model: { provider: 'p', id: 'm', info: { huge: true } }, envelope: 'sealed', keyVersion: 1 });
  assert.equal(id, 'run-1');
  const start = db.log.rpcs[0].args;
  assert.equal(start.p_max_live, 5);
  assert.deepEqual(start.p_model, { provider: 'p', id: 'm' }, 'only which model, nothing more');
  assert.equal(start.p_key_expires_at, '2026-10-03T02:15:00.000Z', 'two hours and a quarter');
  await store.finish('run-1', { status: 'done' });
  const finished = db.log.updates.at(-1);
  assert.deepEqual({ status: finished.values.status, key: finished.values.key_envelope, expires: finished.values.key_expires_at, checkpoint: finished.values.checkpoint }, { status: 'done', key: null, expires: null, checkpoint: null });
  db.log.stopRequested = true;
  assert.equal(await store.requestStop({ userId: USER, runId: 'run-1' }), true);
  assert.deepEqual(db.log.updates.at(-1).filters, { id: 'eq.run-1', user_id: `eq.${USER}`, status: 'in.(queued,running)' });
  assert.equal(await store.saveCheckpoint('run-1', { big: 'x'.repeat(7 * 1024 * 1024) }), false, 'a checkpoint too large is not kept');
  assert.equal(await store.saveCheckpoint('run-1', { ok: true }), true);
});

// ----- writing the message

test('the message is written as it grows, at most every 300 ms, in order, and the last write says how it ended', async () => {
  const written = [];
  let clock = 10000;
  const timers = [];
  const writer = createMessageWriter({
    store: { rpc: async (name, args) => { written.push(args.p_row); } },
    userId: USER,
    conversationId: CONVERSATION,
    messageId: MESSAGE,
    sequence: 7,
    metadata: { model: 'm' },
    now: () => clock,
    setTimer: (fn, wait) => { timers.push({ fn, wait }); return timers.length; },
    clearTimer: () => {}
  });
  writer.update([{ text: 'a' }]);
  await new Promise((resolve) => setImmediate(resolve));
  writer.update([{ text: 'ab' }]);
  writer.update([{ text: 'abc' }]);
  assert.equal(timers.length, 1, 'later ones wait for the one timer');
  assert.ok(timers[0].wait > 0 && timers[0].wait <= 300);
  clock = 10800;
  timers[0].fn();
  await writer.finish([{ text: 'abcd' }], 'complete');
  assert.deepEqual(written.map((row) => [row.status, row.parts[0].text]), [['streaming', 'a'], ['streaming', 'abc'], ['complete', 'abcd']]);
  assert.equal(written[0].sequence, 7);
  assert.deepEqual(written[0].metadata, { model: 'm' });
  assert.equal(written[0].role, 'model');
  writer.update([{ text: 'late' }]);
  await Promise.resolve();
  assert.equal(written.length, 3, 'nothing is written after the end');
  const errors = [];
  const failing = createMessageWriter({ store: { rpc: async () => { throw new Error('db down'); } }, userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, sequence: 1, onError: (error) => errors.push(error) });
  failing.update([{ text: 'x' }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(() => failing.finish([{ text: 'x' }], 'complete'), /db down/, 'a failed final write is heard of');
  const withError = [];
  const ending = createMessageWriter({ store: { rpc: async (name, args) => { withError.push(args.p_row); } }, userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, sequence: 1, metadata: { model: 'm' } });
  await ending.finish([{ text: '' }], 'error', { serverError: { code: 'provider_error', message: 'x' } });
  assert.deepEqual(withError[0].metadata, { model: 'm', serverError: { code: 'provider_error', message: 'x' } });
});

// ----- the services the browser cannot reach

test('the four search paths and NVIDIA\'s chat go straight to their services, with the same fields and no others', async () => {
  const calls = [];
  const upstream = createUpstreamFetch({ fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return new Response('{}', { status: 200 }); } });
  const bearer = { Authorization: 'Bearer the-key', 'Content-Type': 'application/json' };
  await upstream('/api/tavily-search', { method: 'POST', headers: bearer, body: JSON.stringify({ query: 'q', topic: 'news' }) });
  assert.equal(calls[0].url, 'https://api.tavily.com/search');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer the-key');
  await upstream('/api/tavily-extract', { method: 'POST', headers: bearer, body: JSON.stringify({ urls: ['https://a.example', 'ftp://bad', 'https://a.example'], extract_depth: 'advanced', evil: 1 }) });
  assert.deepEqual(JSON.parse(calls[1].options.body), { urls: ['https://a.example'], extract_depth: 'advanced', format: 'markdown', include_images: false });
  await upstream('/api/tinyfish-search', { method: 'POST', headers: bearer, body: JSON.stringify({ query: 'q', domain_type: 'news', bogus: 'x', page: 2 }) });
  const searchUrl = new URL(calls[2].url);
  assert.equal(searchUrl.origin, 'https://api.search.tinyfish.ai');
  assert.deepEqual([...searchUrl.searchParams.keys()].sort(), ['domain_type', 'page', 'query']);
  assert.equal(calls[2].options.headers['X-API-Key'], 'the-key');
  assert.equal(calls[2].options.method, 'GET');
  await upstream('/api/tinyfish-fetch', { method: 'POST', headers: bearer, body: JSON.stringify({ urls: ['https://a.example'], format: 'html' }) });
  assert.equal(calls[3].url, 'https://api.fetch.tinyfish.ai');
  await upstream('/api/nvidia-chat', { method: 'POST', headers: bearer, body: '{"model":"m"}' });
  assert.equal(calls[4].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(calls[4].options.headers.Accept, 'text/event-stream');
  assert.equal((await upstream('/api/nothing', { method: 'POST', headers: bearer, body: '{}' })).status, 404);
  assert.equal((await upstream('/api/tavily-search', { method: 'POST', body: '{}' })).status, 401, 'no key, no call');
  assert.equal((await upstream('/api/tinyfish-search', { method: 'POST', headers: bearer, body: JSON.stringify({ query: ' ' }) })).status, 400);
  assert.equal(calls.length, 5);
  await upstream('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: bearer, body: '{}' });
  assert.equal(calls[5].url, 'https://openrouter.ai/api/v1/chat/completions', 'anything else goes as it is');
});

// ----- the run manager

function managerHarness({ execute, db = fakeDatabase(), logs = [] } = {}) {
  const vault = createKeyVault([{ version: 1, key: masterKey() }]);
  const repeating = [];
  const timers = [];
  const store = createRunStore({ db, limits: LIMITS });
  const manager = createRunManager({
    store,
    db,
    vault,
    execute,
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
    setRepeating: (fn, ms) => { repeating.push({ fn, ms }); return repeating.length; },
    clearRepeating: () => {},
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {}
  });
  return { manager, db, vault, repeating, timers, logs, store };
}
const specOf = () => ({
  protocol: 1,
  clientVersion: '17.4.0',
  conversationId: CONVERSATION,
  assistantMessageId: MESSAGE,
  sequence: 4,
  model: { provider: 'openrouter', id: 'm', info: { provider: 'openrouter' } },
  request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, systemInstruction: '', language: 'en', messageMetadata: { model: 'M' } },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false },
  secrets: { providerKey: KEY }
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
const messageWrites = (db) => db.log.rpcs.filter((call) => call.name === 'server_upsert_workspace_message').map((call) => call.args.p_row);

test('a reply is accepted, run, written, and finished, and its key goes with it', async () => {
  const seen = [];
  const { manager, db, vault } = managerHarness({
    execute: async ({ spec, secrets, onUpdate, onCheckpoint }) => {
      seen.push({ secrets, hasSecretsInSpec: 'secrets' in spec });
      onUpdate([{ text: 'partial' }]);
      await onCheckpoint({ round: 1 });
      return { parts: [{ text: 'whole answer' }], status: 'done', run: { elapsedMs: 5 }, toolCalls: 2 };
    }
  });
  const runId = await manager.start({ userId: USER, spec: specOf() });
  assert.equal(runId, 'run-1');
  await settle();
  assert.deepEqual(seen[0].secrets, { providerKey: KEY }, 'the run has the key');
  assert.equal(seen[0].hasSecretsInSpec, false);
  const start = db.log.rpcs.find((call) => call.name === 'server_start_run').args;
  assert.deepEqual(vault.open(start.p_key_envelope, start.p_key_version, { userId: USER, messageId: MESSAGE }), { providerKey: KEY });
  const saved = db.log.updates.find((update) => update.values.spec);
  assert.equal(JSON.stringify(saved.values.spec).includes(KEY), false, 'the kept request has no key');
  assert.equal(saved.values.spec.conversationId, CONVERSATION);
  const writes = messageWrites(db);
  assert.equal(writes.at(-1).status, 'complete');
  assert.deepEqual(writes.at(-1).parts, [{ text: 'whole answer' }]);
  assert.deepEqual(writes.at(-1).metadata, { model: 'M' });
  assert.equal(db.log.updates.some((update) => update.values.checkpoint?.round === 1), true);
  const done = db.log.updates.find((update) => update.values.status === 'done');
  assert.equal(done.values.key_envelope, null);
  assert.equal(manager.activeCount, 0);
});

test('a reply that cannot be started says why', async () => {
  const tooMany = managerHarness({ db: fakeDatabase({ startError: new DatabaseError('too_many_runs', { code: 'P0001' }) }), execute: async () => ({}) });
  await assert.rejects(() => tooMany.manager.start({ userId: USER, spec: specOf() }), (error) => error instanceof RunError && error.code === 'too_many_runs');
  const missing = managerHarness({ db: fakeDatabase({ startError: new DatabaseError('conversation_not_found', { code: 'P0002' }) }), execute: async () => ({}) });
  await assert.rejects(() => missing.manager.start({ userId: USER, spec: specOf() }), (error) => error.code === 'conversation_not_found');
  const twice = managerHarness({ db: fakeDatabase({ startError: new DatabaseError('duplicate key value', { code: '23505' }) }), execute: async () => ({}) });
  await assert.rejects(() => twice.manager.start({ userId: USER, spec: specOf() }), (error) => error.code === 'run_exists');
  const broken = managerHarness({ db: fakeDatabase({ startError: new DatabaseError(`boom ${KEY}`) }), execute: async () => ({}) });
  await assert.rejects(() => broken.manager.start({ userId: USER, spec: specOf() }), (error) => error.code === 'internal_error' && !error.message.includes(KEY));
});

test('a failed reply is saved as an error with a message that has no key in it, and the run ends failed', async () => {
  const { manager, db, logs } = managerHarness({ execute: async () => { throw new ReplyError('The provider said no', 'provider_error'); } });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  const last = messageWrites(db).at(-1);
  assert.equal(last.status, 'error');
  assert.deepEqual(last.metadata.serverError, { code: 'provider_error', message: 'The provider said no' });
  assert.deepEqual(last.parts, [{ text: 'Sorry, an error occurred: The provider said no' }], 'a reply that failed with the page closed still reads as an error');
  const finished = db.log.updates.find((update) => update.values.status === 'failed');
  assert.equal(finished.values.error_code, 'provider_error');
  assert.equal(finished.values.key_envelope, null);
  assert.equal(JSON.stringify([db.log, logs]).includes(KEY), false, 'no key in what was written or logged');
  // An error that is not ours is told plainly, not by its own words.
  const odd = managerHarness({ execute: async () => { throw new Error(`secret ${KEY} leaked in a stack`); } });
  await odd.manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(messageWrites(odd.db).at(-1).metadata.serverError.code, 'internal_error');
  assert.equal(JSON.stringify([odd.db.log, odd.logs]).includes(KEY), false);
});

test('a stop, from the person or found at a heartbeat, ends the reply and keeps what was written', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const outcomes = [];
  const { manager, db, repeating } = managerHarness({
    execute: async ({ signal }) => {
      await gate;
      outcomes.push(signal.aborted ? String(signal.reason) : 'not stopped');
      return { parts: [{ text: 'what was written' }], status: signal.aborted ? 'stopped' : 'done', run: {}, toolCalls: 0 };
    }
  });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(manager.activeCount, 1);
  db.log.stopRequested = true;
  assert.equal(await manager.stop({ userId: 'someone-else', runId: 'run-1' }), true, 'the database decides whose it is (the fake says yes), the local run is not theirs');
  assert.equal(manager.activeCount, 1);
  assert.equal(await manager.stop({ userId: USER, runId: 'run-1' }), true);
  release();
  await settle();
  assert.deepEqual(outcomes, ['stopped']);
  assert.equal(db.log.updates.find((update) => update.values.status === 'stopped').values.key_envelope, null);
  assert.equal(messageWrites(db).at(-1).status, 'complete');

  // Found at a heartbeat: the database says a stop was asked for.
  let signalSeen = null;
  let open;
  const hold = new Promise((resolve) => { open = resolve; });
  const second = managerHarness({ execute: async ({ signal }) => { signalSeen = signal; await hold; return { parts: [{ text: 'x' }], status: signal.aborted ? 'stopped' : 'done', run: {}, toolCalls: 0 }; } });
  second.db.log.stopRequested = true;
  await second.manager.start({ userId: USER, spec: specOf() });
  await settle();
  await second.repeating[0].fn();
  assert.equal(signalSeen.aborted, true);
  open();
  await settle();
});

test('a reply that runs too long ends as an error, keeping its text', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager, db, timers } = managerHarness({ execute: async ({ signal }) => { await gate; return { parts: [{ text: 'so far' }], status: signal.aborted ? 'stopped' : 'done', run: {}, toolCalls: 0 }; } });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(timers[0].ms, 2 * 60 * 60 * 1000, 'two hours');
  timers[0].fn();
  release();
  await settle();
  const last = messageWrites(db).at(-1);
  assert.equal(last.status, 'error');
  assert.deepEqual(last.parts, [{ text: 'so far' }]);
  assert.equal(last.metadata.serverError.code, 'time_limit');
  assert.equal(db.log.updates.find((update) => update.values.status === 'failed').values.error_code, 'time_limit');
});

test('replies that lost their process are taken up from their checkpoint, and keys past their time are deleted', async () => {
  const vault = createKeyVault([{ version: 1, key: masterKey() }]);
  const sealed = vault.seal({ providerKey: KEY }, { userId: USER, messageId: MESSAGE });
  const spec = { ...specOf() };
  delete spec.secrets;
  const db = fakeDatabase({ stale: [{ id: 'run-9', user_id: USER, conversation_id: CONVERSATION, message_id: MESSAGE, checkpoint: { toolTurns: [], text: 'half', research: { used: 1, numbered: [] } }, key_envelope: sealed.envelope, key_version: 1, attempts: 1 }], specs: { 'run-9': spec } });
  const executed = [];
  const logs = [];
  const manager = createRunManager({
    store: createRunStore({ db, limits: LIMITS }),
    db,
    vault,
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
    setRepeating: () => 1,
    clearRepeating: () => {},
    setTimer: () => 1,
    clearTimer: () => {},
    execute: async ({ spec: given, secrets, resume }) => { executed.push({ spec: given, secrets, resume }); return { parts: [{ text: 'finished' }], status: 'done', run: {}, toolCalls: 0 }; }
  });
  assert.equal(await manager.sweep(), 1);
  await settle();
  assert.deepEqual(executed[0].secrets, { providerKey: KEY }, 'its key, opened');
  assert.deepEqual(executed[0].resume, { toolTurns: [], text: 'half', research: { used: 1, numbered: [] } });
  assert.equal(executed[0].spec.conversationId, CONVERSATION);
  const claim = db.log.rpcs.find((call) => call.name === 'server_claim_stale_runs').args;
  assert.deepEqual(claim, { p_stale_seconds: 45, p_max_attempts: 3, p_limit: 5 });
  assert.equal(db.log.updates.some((update) => update.filters.key_expires_at?.startsWith('lt.')), true, 'expired keys purged');
  assert.equal(messageWrites(db).at(-1).status, 'complete');
  assert.equal(logs.join('').includes(KEY), false);

  // A key that cannot be opened (another person's, damaged, or its master key gone): the run is failed, not retried for ever.
  const broken = fakeDatabase({ stale: [{ id: 'run-8', user_id: USER, message_id: MESSAGE, conversation_id: CONVERSATION, key_envelope: 'junk', key_version: 1, attempts: 1 }], specs: { 'run-8': spec } });
  const failing = createRunManager({ store: createRunStore({ db: broken, limits: LIMITS }), db: broken, vault, execute: async () => { throw new Error('should not run'); }, setRepeating: () => 1, clearRepeating: () => {}, setTimer: () => 1, clearTimer: () => {} });
  await failing.sweep();
  const failed = broken.log.updates.find((update) => update.values.status === 'failed');
  assert.equal(failed.values.error_code, 'server_restarted');
});

test('when the process ends its replies are put down, handed over at once, and nothing is finished', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager, db } = managerHarness({ execute: async ({ signal }) => { await gate; return { parts: [{ text: 'cut' }], status: signal.aborted ? 'stopped' : 'done', run: {}, toolCalls: 0 }; } });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(await manager.shutdown(), 1);
  assert.deepEqual(db.log.updates.at(-1).filters, { id: 'in.(run-1)', status: 'in.(queued,running)' });
  assert.equal(db.log.updates.at(-1).values.heartbeat_at, '1970-01-01T00:00:00Z');
  release();
  await settle();
  assert.equal(db.log.updates.some((update) => ['done', 'stopped', 'failed'].includes(update.values.status)), false, 'the run is left for the next process');
  assert.equal(messageWrites(db).some((row) => row.status === 'complete' || row.status === 'error'), false);
  await assert.rejects(() => manager.start({ userId: USER, spec: specOf() }), (error) => error.code === 'runs_unavailable', 'no new replies while ending');
});

test('the words of a failed reply are in the language of the page, the provider\'s own text is kept, and the server\'s own reasons are told plainly', () => {
  assert.equal(errorText('fr', { code: 'provider_error', message: 'Rate limit' }), 'Désolé, une erreur est survenue : Rate limit');
  assert.equal(errorText('zh-TW', { code: 'time_limit', message: 'x' }), '抱歉，發生錯誤：這則回覆花的時間太久，已被停止。');
  assert.equal(errorText('xx', { code: 'internal_error', message: 'x' }), 'Sorry, an error occurred: The server could not finish this reply.');
  assert.equal(errorText('es', { code: 'server_restarted' }).startsWith('Lo sentimos, ocurrió un error: '), true);
});
