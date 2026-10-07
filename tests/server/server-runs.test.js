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
  let started = 0;
  return {
    log,
    async rpc(name, args) {
      log.rpcs.push({ name, args });
      if (name === 'server_start_run') {
        if (startError) throw startError;
        started += 1;
        return `run-${started}`;
      }
      if (name === 'server_claim_stale_runs') return stale;
      return null;
    },
    async select(table, options) {
      log.selects.push({ table, options });
      // The server may call the message functions but cannot read the message table (the database refuses, as it did in production).
      if (table === 'workspace_messages') throw new DatabaseError('permission denied for table workspace_messages', { code: '42501' });
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
  const failing = createMessageWriter({ store: { rpc: async () => { throw new Error('db down'); } }, userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, sequence: 1, onError: (error) => errors.push(error), retryWait: async () => {} });
  failing.update([{ text: 'x' }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(() => failing.finish([{ text: 'x' }], 'complete'), /db down/, 'a failed final write is heard of');
  assert.equal(errors.length, 5, 'one streaming write and the final one tried four times');

  // The end of a reply is written again when the first try fails, and a failed end does not keep the error that follows from being written.
  const attempts = [];
  const endings = [];
  let fails = 2;
  const later = createMessageWriter({
    store: { rpc: async (name, args) => { attempts.push(args.p_row.status); if (fails > 0) { fails -= 1; throw new Error('blip'); } } },
    userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, sequence: 1, retryWait: async () => {}, onWritten: (status, attempt) => endings.push([status, attempt])
  });
  await later.finish([{ text: 'done' }], 'complete');
  assert.deepEqual(attempts, ['complete', 'complete', 'complete']);
  assert.deepEqual(endings, [['complete', 2]]);
  const stuck = [];
  let broken = true;
  const afterFailure = createMessageWriter({ store: { rpc: async (name, args) => { stuck.push(args.p_row.status); if (broken) throw new Error('too big'); } }, userId: USER, conversationId: CONVERSATION, messageId: MESSAGE, sequence: 1, retries: 0, retryWait: async () => {} });
  await assert.rejects(() => afterFailure.finish([{ text: 'x' }], 'complete'), /too big/);
  broken = false;
  await afterFailure.finish([{ text: 'sorry' }], 'error');
  assert.deepEqual(stuck, ['complete', 'error'], 'the error text still gets written');
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

function managerHarness({ execute, executeDeepResearch, executeCouncilRun, db = fakeDatabase(), logs = [], sandbox = null, vision, fetchImpl, credentials = null } = {}) {
  const vault = createKeyVault([{ version: 1, key: masterKey() }]);
  const repeating = [];
  const timers = [];
  const store = createRunStore({ db, limits: LIMITS });
  const manager = createRunManager({
    store,
    db,
    vault,
    sandbox,
    credentials,
    ...(executeDeepResearch ? { executeDeepResearch } : {}),
    ...(executeCouncilRun ? { executeCouncilRun } : {}),
    ...(vision ? { vision } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
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

test('a council is a run of its own kind: its keys (one for each provider) are sealed and gone at the end, its checkpoints count as progress, and a page that joins late is given how it stands', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const { manager, db, vault } = managerHarness({
    executeCouncilRun: async ({ spec, secrets, onUpdate, onLive, onCheckpoint }) => {
      seen.push({ kind: spec.kind, secrets });
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } });
      onLive({ cs: { stage: 'firstRound', elapsedMs: 1000, modelStates: [{ modelId: 'a', status: 'running' }] } });
      await onCheckpoint({ version: 1, kind: 'council', memo: { k: 'v' } });
      await gate;
      onUpdate([{ text: 'The synthesis' }]);
      return { parts: [{ text: 'The synthesis' }], status: 'done', run: { elapsedMs: 5 }, toolCalls: 0 };
    }
  });
  const council = {
    protocol: 1,
    kind: 'council',
    clientVersion: '17.11.0',
    conversationId: CONVERSATION,
    assistantMessageId: MESSAGE,
    sequence: 2,
    model: { provider: 'openrouter', id: 'synth', info: { provider: 'openrouter' } },
    council: { mode: 'consensus', participants: [], synthesizer: { provider: 'openrouter', id: 'synth', info: {} }, translator: null, showRawResponses: true, showComparisonTable: true },
    request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, systemInstruction: '', systemInstructions: { participant: '', deliberation: '', synthesis: '' }, language: 'en' },
    tools: { webSearch: 'off', searchProvider: 'tavily', searchDepth: 'basic', advanced: false },
    secrets: { keys: { openrouter: KEY, nvidia: 'nv-secret-value' } }
  };
  await manager.start({ userId: USER, spec: council });
  await settle();
  assert.deepEqual(seen[0], { kind: 'council', secrets: { keys: { openrouter: KEY, nvidia: 'nv-secret-value' } } });
  const start = db.log.rpcs.find((call) => call.name === 'server_start_run').args;
  assert.equal(start.p_model.kind, 'council', 'the page can tell what kind of run it is from the run\'s record');
  assert.deepEqual(vault.open(start.p_key_envelope, start.p_key_version, { userId: USER, messageId: MESSAGE }).keys.nvidia, 'nv-secret-value');
  const saved = db.log.updates.find((update) => update.values.spec);
  assert.equal(JSON.stringify(saved.values.spec).includes(KEY), false, 'the kept request has no key');
  const checkpoint = db.log.updates.find((update) => update.values.checkpoint?.kind === 'council');
  assert.equal(checkpoint.values.attempts, 0, 'each call that finished counts as progress');

  const joined = [];
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => joined.push(event), close() {} });
  assert.equal(joined[0].r.cs.stage, 'firstRound', 'a page that joins late is given how the council stands');
  assert.ok(joined[0].r.cs.elapsedMs >= 1000, 'with the time it has gone on');
  release();
  await settle();
  assert.equal(messageWrites(db).at(-1).status, 'complete');
  assert.deepEqual(messageWrites(db).at(-1).parts, [{ text: 'The synthesis' }]);
  const done = db.log.updates.find((update) => update.values.status === 'done');
  assert.equal(done.values.key_envelope, null, 'the keys are gone at the end');
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
  // The log says what went wrong and where (the person is told only the code), with the key hidden.
  const failure = JSON.parse(odd.logs.find((line) => JSON.parse(line).event === 'run_failed'));
  assert.equal(failure.code, 'internal_error');
  assert.match(failure.message, /^secret \[hidden\] leaked in a stack$/);
  assert.equal(failure.name, 'Error');
  assert.match(failure.at, /server-runs\.test\.js/);
  assert.ok(odd.logs.some((line) => JSON.parse(line).event === 'message_written'), 'and the log says when the end of the reply landed');
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

// ----- watching a reply live

test('a page that joins while the reply is searching first is told which source it searches with, and not after it is over', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager } = managerHarness({
    execute: async ({ onLive }) => {
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } });
      onLive({ ss: 'tavily' });
      await gate;
      onLive({ ss: '' });
      onLive({ a: 'Hi' });
      return { parts: [{ text: 'Hi' }], status: 'done', run: {}, toolCalls: 0 };
    }
  });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  const joined = [];
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => joined.push(event), close() {} });
  assert.equal(joined[0].r.ss, 'tavily', 'the page that joins now shows "Searching with Tavily"');
  release();
  await settle();
  assert.deepEqual(joined.slice(1, 3), [{ ss: '' }, { a: 'Hi' }]);
  const after = managerHarness({ execute: async ({ onLive }) => { onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } }); onLive({ ss: 'tavily' }); onLive({ ss: '' }); await new Promise(() => {}); } });
  await after.manager.start({ userId: USER, spec: specOf() });
  await settle();
  const late = [];
  after.manager.watch({ userId: USER, runId: 'run-1', send: (event) => late.push(event), close() {} });
  assert.equal('ss' in late[0].r, false, 'a search that is over is not told to a page that joins later');
});

test('a reply can be watched live: the page gets what there is now, then every piece, then that it is over (after the message is written)', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager, db } = managerHarness({
    execute: async ({ onLive }) => {
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } });
      onLive({ a: 'Hel' });
      await gate;
      onLive({ a: 'lo' });
      onLive({ th: 'hmm', k: 'summary' });
      onLive({ src: [{ url: 'https://a.example', n: 1 }] });
      return { parts: [{ text: 'Hello' }], status: 'done', run: {}, toolCalls: 0 };
    }
  });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(manager.isLive({ userId: USER, runId: 'run-1' }), true);
  assert.equal(manager.isLive({ userId: 'someone-else', runId: 'run-1' }), false);
  const early = [];
  const stopEarly = manager.watch({ userId: USER, runId: 'run-1', send: (event) => early.push(event), close: () => early.push('closed') });
  const { elapsedMs, ...nowOn } = early[0].r;
  assert.deepEqual(nowOn, { answer: 'Hel', thought: { text: '', kind: 'model', ended: false, ms: 0 }, sources: [] }, 'a page that comes in now sees the reply as it is now');
  assert.equal(typeof elapsedMs, 'number', 'with how long it has been going');
  const late = [];
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => late.push(event), close: () => late.push('closed') });
  release();
  await settle();
  assert.deepEqual(early.slice(1), [{ a: 'lo' }, { th: 'hmm', k: 'summary' }, { src: [{ url: 'https://a.example', n: 1 }] }, { done: 'complete' }, 'closed']);
  assert.deepEqual(late.slice(1), early.slice(1), 'every page sees the same pieces');
  const written = messageWrites(db).at(-1);
  assert.equal(written.status, 'complete', 'the message was whole before the pages were told');
  assert.equal(manager.isLive({ userId: USER, runId: 'run-1' }), false);
  stopEarly();
  assert.equal(manager.watch({ userId: USER, runId: 'run-1', send() {}, close() {} }), null, 'nothing to watch once it is over');
});

test('a reply that failed tells those watching it ended in error; one handed over at a restart just lets them go', async () => {
  const failing = managerHarness({ execute: async () => { throw new ReplyError('no', 'provider_error'); } });
  await failing.manager.start({ userId: USER, spec: specOf() });
  const seen = [];
  failing.manager.watch({ userId: USER, runId: 'run-1', send: (event) => seen.push(event), close: () => seen.push('closed') });
  await settle();
  assert.deepEqual(seen.slice(-2), [{ done: 'error' }, 'closed']);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const restarting = managerHarness({ execute: async ({ signal }) => { await gate; return { parts: [{ text: 'cut' }], status: signal.aborted ? 'stopped' : 'done', run: {}, toolCalls: 0 }; } });
  await restarting.manager.start({ userId: USER, spec: specOf() });
  await settle();
  const watched = [];
  restarting.manager.watch({ userId: USER, runId: 'run-1', send: (event) => watched.push(event), close: () => watched.push('closed') });
  await restarting.manager.shutdown();
  release();
  await settle();
  assert.equal(watched.some((event) => event?.done), false, 'not told it is over: it goes on elsewhere');
  assert.equal(watched.at(-1), 'closed');
});

test('there is a limit to how many pages may watch for one account', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager } = managerHarness({ execute: async () => { await gate; return { parts: [{ text: 'x' }], status: 'done', run: {}, toolCalls: 0 }; } });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  const results = Array.from({ length: 14 }, () => manager.watch({ userId: USER, runId: 'run-1', send() {}, close() {} }));
  assert.equal(results.filter(Boolean).length, 12);
  release();
  await settle();
});

test('a page that comes in late is given the times as they are now: how long the reply has gone on, and how long it has thought', async () => {
  let clock = 5000;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const vault = createKeyVault([{ version: 1, key: masterKey() }]);
  const db = fakeDatabase();
  const manager = createRunManager({
    store: createRunStore({ db, limits: LIMITS }), db, vault, now: () => clock,
    execute: async ({ onLive }) => {
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 100 } });
      clock += 1000;
      onLive({ th: 'a', k: 'model' });
      clock += 3000;
      onLive({ th: 'b', k: 'model' });
      await gate;
      return { parts: [{ text: 'x' }], status: 'done', run: {}, toolCalls: 0 };
    },
    setRepeating: () => 1, clearRepeating: () => {}, setTimer: () => 1, clearTimer: () => {}
  });
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  clock += 500;
  const seen = [];
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => seen.push(event), close() {} });
  assert.equal(seen[0].r.elapsedMs, 100 + 4500, 'the reply\'s own clock');
  assert.equal(seen[0].r.thought.ms, 3500, 'it has been thinking since the first thought');
  assert.equal(seen[0].r.thought.ended, false);
  seen.length = 0;
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => seen.push(event), close() {} });
  release();
  await settle();
}
);

test('the steps of a reply with Python are kept for a page that joins late, joined where they follow each other, and given to every page as they come', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const given = {};
  const { manager } = managerHarness({
    sandbox: { host: { configured: true, ready: async () => ({ ok: true }) }, files: { marker: 'files' } },
    execute: async ({ onLive, userId, sandboxHost, files }) => {
      Object.assign(given, { userId, sandboxHost, files });
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } });
      onLive({ ev: { type: 'thinking', text: 'Let ', kind: 'raw' } });
      onLive({ ev: { type: 'thinking', text: 'me see', kind: 'raw' } });
      onLive({ ev: { type: 'step', n: 1, title: 'Run', code: '' } });
      onLive({ ev: { type: 'code', text: 'pri' } });
      onLive({ ev: { type: 'code', text: 'print(1)' } });
      onLive({ ev: { type: 'output', n: 1, stream: 'stdout', text: '1' } });
      onLive({ ev: { type: 'output', n: 1, stream: 'stdout', text: '\n' } });
      await gate;
      onLive({ ev: { type: 'step-end', n: 1, ok: true, files: [], elapsedMs: 9 } });
      return { parts: [{ text: 'x' }], status: 'done', run: {}, toolCalls: 1 };
    }
  });
  assert.equal(await manager.advancedAvailable(), true);
  await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(given.userId, USER, 'the run knows whose files these are');
  assert.equal(given.sandboxHost.configured, true);
  const late = [];
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => late.push(event), close() {} });
  assert.deepEqual(late[0].r.events, [
    { type: 'thinking', text: 'Let me see', kind: 'raw' },
    { type: 'step', n: 1, title: 'Run', code: '' },
    { type: 'code', text: 'print(1)' },
    { type: 'output', n: 1, stream: 'stdout', text: '1\n' }
  ]);
  release();
  await settle();
  assert.deepEqual(late[1], { ev: { type: 'step-end', n: 1, ok: true, files: [], elapsedMs: 9 } });
});

test('without a sandbox host, or while it does not answer, replies with Python are not taken (the browser makes them)', async () => {
  assert.equal(await managerHarness({ execute: async () => ({}) }).manager.advancedAvailable(), false);
  const down = managerHarness({ execute: async () => ({}), sandbox: { host: { configured: true, ready: async () => ({ ok: false, reason: 'unreachable' }) }, files: {} } });
  assert.equal(await down.manager.advancedAvailable(), false);
  const broken = managerHarness({ execute: async () => ({}), sandbox: { host: { configured: true, ready: async () => { throw new Error('x'); } }, files: {} } });
  assert.equal(await broken.manager.advancedAvailable(), false);
  const up = managerHarness({ execute: async () => ({}), sandbox: { host: { configured: true, ready: async () => ({ ok: true }) }, files: {} } });
  assert.equal(await up.manager.advancedAvailable(), true);
});

// ----- the visual check that follows a reply with a presentation

const VISION_SPEC = () => ({ ...specOf(), model: { provider: 'gemini', id: 'g', info: { provider: 'gemini', id: 'g', name: 'G' } }, tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, visionCheck: { deckDesign: 'auto', advanced: false } } });
const DECK_TEXT = '````file deck.pptx\n{"design":{"preset":"office"},"meta":{"language":"en","title":"T"},"slides":[{"layout":"cover","title":"Hello"}]}\n````';

function visionHarness({ available = true, onCheck } = {}) {
  const checks = [];
  const db = fakeDatabase();
  const kit = { marker: 'kit' };
  const { manager } = managerHarness({
    db,
    execute: async ({ onLive }) => {
      onLive({ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], elapsedMs: 0 } });
      return { parts: [{ text: DECK_TEXT }], status: 'done', run: {}, toolCalls: 0, artifacts: { decks: new Map() } };
    },
    vision: {
      available: async () => available,
      getKit: async () => kit,
      execute: async (args) => {
        checks.push(args);
        args.onLive({ vc: { m: 'begin', a: [{ name: 'deck.pptx', free: false }] } });
        args.onLive({ vc: { m: 'think', a: ['Looking'] } });
        args.onLive({ vc: { m: 'think', a: [' closely'] } });
        if (onCheck) await onCheck(args);
        await args.writeMessage({ id: args.spec.assistantMessageId, parts: [{ text: 'Fixed.' }], metadata: { visionCheck: { applied: 1 } } });
        args.onLive({ vc: { m: 'file-end', a: [{ outcome: 'fixed', messageId: args.spec.assistantMessageId }] } });
        return { checked: 1, written: [args.spec.assistantMessageId] };
      }
    }
  });
  return { manager, db, checks, kit };
}

test('a reply that wrote a presentation is followed by its check, a run of its own that the page is told of, and the check writes its reply after everything in the conversation', async () => {
  const { manager, db, checks, kit } = visionHarness();
  const seen = [];
  await manager.start({ userId: USER, spec: VISION_SPEC() });
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => seen.push(event), close() {} });
  await settle();
  await settle();
  const done = seen.find((event) => event?.done);
  assert.ok(done.vision, 'the page is told the id of the check');
  assert.equal(checks.length, 1);
  assert.equal(checks[0].spec.kind, 'vision');
  assert.equal(checks[0].spec.source.messageId, specOf().assistantMessageId);
  assert.match(checks[0].spec.source.text, /deck\.pptx/);
  assert.equal(await checks[0].getKit(), kit);
  assert.equal(checks[0].secrets.providerKey, KEY, 'the check has the key too');
  const starts = db.log.rpcs.filter((call) => call.name === 'server_start_run');
  assert.equal(starts.length, 2, 'the check is recorded as a run of its own');
  assert.notEqual(starts[1].args.p_message_id, specOf().assistantMessageId);
  assert.deepEqual(starts[0].args.p_model, { provider: 'gemini', id: 'g', vision: true }, 'the page can tell by the model column that this reply has a check');
  assert.deepEqual(starts[1].args.p_model, { provider: 'gemini', id: 'g', kind: 'vision' }, 'and that the check is not a reply');
  const saved = db.log.updates.filter((update) => update.values.spec?.kind === 'vision');
  assert.equal(JSON.stringify(saved).includes(KEY), false, 'its record has no key');
  const writes = messageWrites(db);
  const fixed = writes.find((row) => row.parts[0].text === 'Fixed.');
  assert.equal(fixed.role, 'model');
  assert.equal(fixed.status, 'complete');
  assert.equal('sequence' in fixed, false, 'it comes with no sequence: the database takes the next place under its lock');
  assert.deepEqual(fixed.metadata, { visionCheck: { applied: 1 } });
  assert.equal(db.log.updates.filter((update) => update.values.status === 'done').length, 2, 'both runs end done');
});

test('those watching the check are given what it has told so far (joined where the model\'s thinking runs on), then every piece', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { manager } = visionHarness({ onCheck: () => gate });
  await manager.start({ userId: USER, spec: VISION_SPEC() });
  await settle();
  await settle();
  const late = [];
  manager.watch({ userId: USER, runId: 'run-2', send: (event) => late.push(event), close() {} });
  // Each call says when it happened (ms since the check's run began), so every page, whenever it joined, draws the same seconds.
  assert.ok(late[0].r.vc.every((call) => Number.isFinite(call.t) && call.t >= 0));
  assert.deepEqual(late[0].r.vc.map(({ t, ...call }) => call), [{ m: 'begin', a: [{ name: 'deck.pptx', free: false }] }, { m: 'think', a: ['Looking closely'] }]);
  assert.ok(Number.isFinite(late[0].r.elapsedMs), 'with how long the check has been going, to set the clock by');
  release();
  await settle();
  assert.ok(late.some((event) => event.vc?.m === 'file-end'));
  assert.ok(late.some((event) => event.done));
});

test('a stop of the check ends it without a reply, and nothing is started when the server cannot draw, the reply was stopped or no presentation was written', async () => {
  const none = visionHarness({ available: false });
  await none.manager.start({ userId: USER, spec: VISION_SPEC() });
  await settle();
  assert.equal(none.checks.length, 0, 'the page makes the check itself');

  const plain = managerHarness({
    execute: async () => ({ parts: [{ text: 'Just words.' }], status: 'done', run: {}, toolCalls: 0 }),
    vision: { available: async () => true, execute: async () => { throw new Error('must not run'); }, getKit: async () => null }
  });
  await plain.manager.start({ userId: USER, spec: VISION_SPEC() });
  await settle();
  assert.equal(plain.db.log.rpcs.filter((call) => call.name === 'server_start_run').length, 1);

  const without = visionHarness();
  await without.manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(without.checks.length, 0, 'not asked');
});

test('the whole way: a reply writes a presentation, the server draws it, the model looks at the pictures, and the corrected reply is written and told to those watching', async () => {
  const { executeVisionCheck } = await import('../../server/vision-check.js');
  const { canDrawSlides } = await import('../../server/slides/available.js');
  const { getFontKit } = await import('../../server/slides/font-kit.js');
  const answer = '{"issues":[{"slide":2,"category":"text","problem":"Cramped","fix":"Shorten"}],"edits":[{"op":"setItemText","specSlide":2,"list":"bullets","item":0,"field":"text","value":"Revenue up 23 percent"}],"summary":"Tightened."}';
  const sheets = [];
  const db = fakeDatabase();
  const deck = JSON.stringify({ design: { preset: 'office' }, meta: { language: 'en', title: 'T' }, slides: [{ layout: 'cover', title: 'Annual report' }, { layout: 'bullets', title: 'Points', bullets: ['Revenue grew 23 percent in a year', 'Margin improved'] }] });
  const { manager } = managerHarness({
    db,
    execute: async () => ({ parts: [{ text: `Here.\n\n\`\`\`\`file deck.pptx\n${deck}\n\`\`\`\`` }], status: 'done', run: {}, toolCalls: 0, artifacts: { decks: new Map() } }),
    vision: { available: canDrawSlides, execute: executeVisionCheck, getKit: getFontKit },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      sheets.push(body.contents[0].parts.filter((part) => part.inlineData).length);
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: answer }] }, finishReason: 'STOP' }] })}\r\n\r\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
  });
  const seen = [];
  await manager.start({ userId: USER, spec: VISION_SPEC() });
  manager.watch({ userId: USER, runId: 'run-1', send: (event) => seen.push(event), close() {} });
  for (let wait = 0; wait < 100 && !seen.some((event) => event?.done); wait += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  const visionId = seen.find((event) => event?.done)?.vision;
  assert.equal(visionId, 'run-2');
  const late = [];
  for (let wait = 0; wait < 100 && !messageWrites(db).some((row) => /Cramped/.test(row.parts[0]?.text || '')); wait += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  const corrected = messageWrites(db).find((row) => /Cramped/.test(row.parts[0]?.text || ''));
  assert.ok(corrected, 'the corrected reply was written');
  assert.match(corrected.parts[0].text, /Revenue up 23 percent/);
  assert.deepEqual(sheets, [1], 'the model was shown the one contact sheet');
  void late;
});

// ----- deep research

const researchSpecOf = () => ({ ...specOf(), kind: 'research', research: { topic: 'Solid-state batteries' }, tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } });

test('a deep research is recorded with its kind, keeps its keys for a day, hands its controls to the run, and writes its parts', async () => {
  const seen = [];
  const { manager, db } = managerHarness({
    executeDeepResearch: async ({ spec, controls, onUpdate, onLive, onCheckpoint }) => {
      seen.push({ kind: spec.kind, topic: spec.research.topic, controls: Boolean(controls?.send) });
      onUpdate([{ text: '' }, { researchPlan: { phase: 'awaiting' } }]);
      onLive({ rs: { phase: 'awaiting', title: 'T' } });
      await onCheckpoint({ kind: 'research', phase: 'awaiting' });
      return { parts: [{ text: '' }, { researchReport: { title: 'T' } }], status: 'done', toolCalls: 7 };
    }
  });
  await manager.start({ userId: USER, spec: researchSpecOf() });
  await settle();
  assert.deepEqual(seen, [{ kind: 'research', topic: 'Solid-state batteries', controls: true }]);
  const start = db.log.rpcs.find((call) => call.name === 'server_start_run').args;
  assert.deepEqual(start.p_model, { provider: 'openrouter', id: 'm', kind: 'research' });
  const lifetime = new Date(start.p_key_expires_at).getTime() - Date.now();
  assert.ok(lifetime > 26 * 3600_000 && lifetime <= 27 * 3600_000 + 5000, 'the key is kept for a day and some hours');
  assert.deepEqual(messageWrites(db).at(-1).parts, [{ text: '' }, { researchReport: { title: 'T' } }]);
  assert.equal(messageWrites(db).at(-1).status, 'complete');
  const checkpoint = db.log.updates.find((update) => update.values.checkpoint?.kind === 'research');
  assert.equal(checkpoint.values.attempts, 0, 'a research that goes on after being taken up starts counting anew');
});

test('a person controls a research of their own while it runs here: only theirs, only while it is running', async () => {
  let release;
  const received = [];
  const { manager } = managerHarness({
    executeDeepResearch: ({ controls }) => new Promise((resolve) => {
      controls.bind({ phase: () => 'awaiting', handle: (action, payload) => { received.push([action, payload]); return action === 'pause' ? { ok: false, reason: 'wrong_phase' } : { ok: true }; } });
      release = () => resolve({ parts: [{ text: '' }], status: 'done', toolCalls: 0 });
    })
  });
  const runId = await manager.start({ userId: USER, spec: researchSpecOf() });
  await settle();
  assert.deepEqual(manager.control({ userId: USER, runId, action: 'plan', payload: { instruction: 'shorter' } }), { ok: true });
  assert.deepEqual(manager.control({ userId: USER, runId, action: 'pause' }), { ok: false, reason: 'wrong_phase' });
  assert.deepEqual(manager.control({ userId: '999e4567-e89b-12d3-a456-426614174009', runId, action: 'start' }), { ok: false, reason: 'not_running' }, 'not another person\'s');
  assert.deepEqual(manager.control({ userId: USER, runId: 'run-99', action: 'start' }), { ok: false, reason: 'not_running' });
  assert.deepEqual(received, [['plan', { instruction: 'shorter' }], ['pause', {}]]);
  release();
  await settle();
  assert.deepEqual(manager.control({ userId: USER, runId, action: 'start' }), { ok: false, reason: 'not_running' }, 'it has ended');
});

test('a stop that asks for the report goes to the research and does not end it; any other stop ends it', async () => {
  const stops = [];
  const { manager, db } = managerHarness({
    executeDeepResearch: ({ controls, signal }) => new Promise((resolve) => {
      controls.bind({ phase: () => 'researching', handle: (action, payload) => { stops.push([action, payload.mode]); return { ok: true }; } });
      signal.addEventListener('abort', () => resolve({ parts: [{ text: '' }], status: 'stopped', toolCalls: 0 }));
    })
  });
  const runId = await manager.start({ userId: USER, spec: researchSpecOf() });
  await settle();
  const before = db.log.updates.filter((update) => update.values.stop_requested).length;
  assert.equal(await manager.stop({ userId: USER, runId, mode: 'report' }), true);
  assert.deepEqual(stops, [['stop', 'report']]);
  assert.equal(db.log.updates.filter((update) => update.values.stop_requested).length, before, 'the run is not marked as stopped');
  assert.equal(manager.activeCount, 1, 'and it goes on');
  db.log.stopRequested = true;
  assert.equal(await manager.stop({ userId: USER, runId }), true);
  await settle();
  assert.equal(manager.activeCount, 0, 'a plain stop ends it');
});

test('a research that fails keeps its card: the error text is not written over the plan', async () => {
  const { manager, db } = managerHarness({
    executeDeepResearch: async () => {
      const error = new ReplyError('The research was paused for too long.', 'pause_expired');
      error.parts = [{ text: '' }, { researchPlan: { phase: 'failed' } }];
      throw error;
    }
  });
  await manager.start({ userId: USER, spec: researchSpecOf() });
  await settle();
  const last = messageWrites(db).at(-1);
  assert.equal(last.status, 'error');
  assert.deepEqual(last.parts, [{ text: '' }, { researchPlan: { phase: 'failed' } }]);
  assert.equal(last.metadata.serverError.code, 'pause_expired');
  assert.match(errorText('en', last.metadata.serverError), /paused for too long/);
  assert.equal(db.log.updates.find((update) => update.values.status === 'failed').values.error_code, 'pause_expired');
});

test('a page that joins a research late is given where it stands, what it has done, and the server\'s clock', async () => {
  let release;
  const { manager } = managerHarness({
    executeDeepResearch: ({ onLive }) => new Promise((resolve) => {
      onLive({ rs: { phase: 'researching', title: 'T' } });
      onLive({ ra: { type: 'item', text: 'First' } });
      onLive({ ra: { type: 'searching', text: 'Searching: x' } });
      release = () => resolve({ parts: [{ text: '' }], status: 'done', toolCalls: 0 });
    })
  });
  const runId = await manager.start({ userId: USER, spec: researchSpecOf() });
  await settle();
  const events = [];
  const unwatch = manager.watch({ userId: USER, runId, send: (event) => events.push(event), close: () => {} });
  assert.equal(events[0].r.rs.phase, 'researching');
  assert.deepEqual(events[0].r.ra.map((entry) => entry.type), ['item', 'searching']);
  assert.equal(typeof events[0].r.serverNow, 'number');
  unwatch();
  release();
  await settle();
});

test('the person\'s answer about a site goes to the reply that asked, the reply of that person only, and only while it runs', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const answered = [];
  let received = null;
  const { manager } = managerHarness({
    execute: async ({ netControl, credentials }) => {
      received = { hasCredentials: credentials === 'the-store' };
      netControl.answer = async (askId, decision) => { answered.push([askId, decision]); return { answered: askId === 'ask0000000000001' }; };
      await gate;
      return { parts: [{ text: 'done' }], status: 'done', run: { elapsedMs: 1 }, toolCalls: 0 };
    },
    credentials: 'the-store'
  });
  const runId = await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.deepEqual(received, { hasCredentials: true }, 'the reply is given the credential store');
  assert.deepEqual(await manager.answerNet({ userId: USER, runId, askId: 'ask0000000000001', decision: 'once' }), { ok: true, answered: true });
  assert.deepEqual(await manager.answerNet({ userId: USER, runId, askId: 'ask0000000000009', decision: 'deny' }), { ok: true, answered: false }, 'a question that is no longer open');
  assert.deepEqual(await manager.answerNet({ userId: '999e4567-e89b-12d3-a456-426614174009', runId, askId: 'ask0000000000001', decision: 'once' }), { ok: false, reason: 'not_running' }, 'not another person\'s reply');
  assert.deepEqual(await manager.answerNet({ userId: USER, runId: 'nothing', askId: 'ask0000000000001', decision: 'once' }), { ok: false, reason: 'not_running' });
  release();
  await settle();
  assert.deepEqual(await manager.answerNet({ userId: USER, runId, askId: 'ask0000000000001', decision: 'once' }), { ok: false, reason: 'not_running' }, 'it is over');
  assert.equal(answered.length, 2);
});

test('the person\'s answer to the window for a tool\'s login goes to the reply that asked, the reply of that person only, and only while it runs', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const answered = [];
  const { manager } = managerHarness({
    execute: async ({ credentialControl }) => {
      credentialControl.answer = (askId, decision) => { answered.push([askId, decision]); return { answered: askId === 'ask0000000000001' }; };
      await gate;
      return { parts: [{ text: 'done' }], status: 'done', run: { elapsedMs: 1 }, toolCalls: 0 };
    }
  });
  const runId = await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.deepEqual(await manager.answerCredential({ userId: USER, runId, askId: 'ask0000000000001', decision: 'saved' }), { ok: true, answered: true });
  assert.deepEqual(await manager.answerCredential({ userId: USER, runId, askId: 'ask0000000000009', decision: 'cancel' }), { ok: true, answered: false });
  assert.deepEqual(await manager.answerCredential({ userId: '999e4567-e89b-12d3-a456-426614174009', runId, askId: 'ask0000000000001', decision: 'saved' }), { ok: false, reason: 'not_running' });
  release();
  await settle();
  assert.deepEqual(await manager.answerCredential({ userId: USER, runId, askId: 'ask0000000000001', decision: 'saved' }), { ok: false, reason: 'not_running' });
  assert.equal(answered.length, 2);
});

test('time the reply spent waiting for the person is given back to its time limit, and every page is told the clock was set back', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const { manager, timers } = managerHarness({
    execute: async ({ onPaused, onLive }) => {
      onLive({ r: { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0 }, sources: [], elapsedMs: 0 } });
      onPaused(90_000);
      onLive({ tm: 1234 });
      await gate;
      return { parts: [{ text: 'done' }], status: 'done', run: {}, toolCalls: 0 };
    }
  });
  const runId = await manager.start({ userId: USER, spec: specOf() });
  await settle();
  assert.equal(timers[0].ms, 2 * 60 * 60 * 1000);
  assert.ok(timers.length >= 2, 'a new timer for what is left');
  const remaining = timers.at(-1).ms;
  assert.ok(remaining > 2 * 60 * 60 * 1000 + 89_000 && remaining <= 2 * 60 * 60 * 1000 + 90_000, `the limit is longer by what was waited (${remaining})`);
  const stop = manager.watch({ userId: USER, runId, send: (event) => seen.push(event) });
  assert.ok(stop);
  const first = seen[0].r.elapsedMs;
  assert.ok(first >= 1234 && first < 1234 + 2000, 'a page that joins is given the clock as it was set back');
  stop();
  release();
  await settle();
});
