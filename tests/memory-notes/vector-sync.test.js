import assert from 'node:assert/strict';
import test from 'node:test';

import { EMBEDDING_PROVIDERS, versionOf } from '../../src/app/runtime/memory-store/embedding-client.js';
import { createPageVectors } from '../../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createFakeIndexedDb } from '../helpers/fake-indexeddb.js';

const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
const embedText = (text) => {
  const vector = new Array(DIMS).fill(0);
  if (/dog|puppy|狗/i.test(text)) vector[0] = 1;
  if (/invoice|tax/i.test(text)) vector[1] = 1;
  vector[DIMS - 1] = 0.01;
  return vector;
};
const textOf = (value) => value.replace(/^task: search result \| query: /, '').replace(/^title: none \| text: /, '');
const geminiFetch = (calls) => async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push(url);
  return Response.json({ embeddings: body.requests.map((request) => ({ values: embedText(textOf(request.content.parts[0].text)) })) });
};

// The table workspace_memory_vectors as the page's client reaches it (just what vector-sync.js asks for).
function fakeVectorTable({ down = false } = {}) {
  const rows = new Map();
  const state = { down };
  const from = () => {
    const query = { op: 'select', filters: [], range: null, values: null };
    const matches = (row) => query.filters.every(([kind, column, value]) => (kind === 'eq' ? row[column] === value : kind === 'neq' ? row[column] !== value : value.includes(row[column])));
    const builder = {
      select() { return builder; },
      eq(column, value) { query.filters.push(['eq', column, value]); return builder; },
      neq(column, value) { query.filters.push(['neq', column, value]); return builder; },
      in(column, value) { query.filters.push(['in', column, value]); return builder; },
      order() { return builder; },
      range(a, b) { query.range = [a, b]; return builder; },
      upsert(values) { query.op = 'upsert'; query.values = values; return builder; },
      delete() { query.op = 'delete'; return builder; },
      then(resolve, reject) {
        if (state.down) return Promise.resolve({ data: null, error: { message: 'offline' } }).then(resolve, reject);
        let result;
        if (query.op === 'upsert') {
          for (const row of query.values) rows.set(`${row.user_id}|${row.piece_id}`, { ...row });
          result = { data: null, error: null };
        } else if (query.op === 'delete') {
          for (const [key, row] of [...rows]) if (matches(row)) rows.delete(key);
          result = { data: null, error: null };
        } else {
          const found = [...rows.values()].filter(matches).sort((left, right) => left.piece_id.localeCompare(right.piece_id));
          result = { data: (query.range ? found.slice(query.range[0], query.range[1] + 1) : found).map((row) => ({ ...row })), error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      }
    };
    return builder;
  };
  return { supabase: { from }, rows, state };
}

const conversation = (id, text) => ({ id, lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text }], createdAt: '2026-10-01T00:00:00.000Z' }, { role: 'model', parts: [{ text: 'Sure.' }] }] });
const CONVERSATIONS = [conversation('dogs', 'My puppy has not been eating for two days'), conversation('tax', 'Please check my invoice for the quarterly tax filing')];

async function device({ cloud, calls, sync = true, conversations = CONVERSATIONS }) {
  const settings = { vector: { enabled: true, consentAt: '2026-10-30T00:00:00.000Z', provider: 'gemini', sync } };
  const rows = [{ record_key: 'meta:settings', payload: settings, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => conversations });
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider: (name) => (name === 'gemini' ? 'g-key' : ''), getCloud: () => (cloud ? { supabase: cloud.supabase, userId: 'user-1' } : null), indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl: geminiFetch(calls), wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  history.setVectors(vectors);
  return { vectors, store: memory.getStore() };
}

test('vectors made on one device are kept in the cloud, and a second device takes them instead of making them again', async () => {
  const cloud = fakeVectorTable();
  const callsA = [];
  const first = await device({ cloud, calls: callsA });
  assert.equal((await first.vectors.sync()).status, 'idle');
  assert.ok(callsA.length > 0);
  assert.equal(cloud.rows.size, 2, 'one row for each piece');
  const row = [...cloud.rows.values()][0];
  assert.equal(row.model, versionOf('gemini'));
  assert.match(row.embedding, /^\[[-\d.e,]+\]$/, 'sent the way pgvector reads a vector');
  const callsB = [];
  const second = await device({ cloud, calls: callsB });
  assert.equal((await second.vectors.sync()).status, 'idle');
  assert.equal(callsB.length, 0, 'nothing was made again');
  assert.equal(second.vectors.available(), true);
  assert.equal((await second.vectors.search('puppy', { limit: 3 }))[0].conversationId, 'dogs');
});

test('a deleted conversation also leaves the cloud; turning the sync off deletes the cloud copy and keeps the device copy', async () => {
  const cloud = fakeVectorTable();
  const conversations = [...CONVERSATIONS];
  const one = await device({ cloud, calls: [], conversations });
  await one.vectors.sync();
  conversations.splice(0, 1);
  await one.vectors.sync();
  assert.equal(cloud.rows.size, 1);
  assert.equal(one.vectors.isSyncing(), true);
  assert.equal(await one.vectors.setSync(false), true);
  assert.equal(cloud.rows.size, 0);
  assert.equal(one.vectors.isSyncing(), false);
  assert.equal(one.vectors.available(), true, 'this device still has its vectors');
});

test('the vectors of another model are removed from the cloud, and are not taken', async () => {
  const cloud = fakeVectorTable();
  cloud.rows.set('user-1|old', { user_id: 'user-1', piece_id: 'old', model: 'something-else', hash: 'x', embedding: '[1]', failed: false });
  const one = await device({ cloud, calls: [] });
  await one.vectors.sync();
  assert.equal([...cloud.rows.values()].some((row) => row.model === 'something-else'), false);
});

test('a local account has no cloud: the sync cannot be turned on and the vectors stay on the device', async () => {
  const calls = [];
  const one = await device({ cloud: null, calls, sync: false });
  assert.equal(one.vectors.canSync(), false);
  assert.equal(await one.vectors.setSync(true), false);
  assert.equal((await one.vectors.sync()).status, 'idle');
  assert.equal(one.vectors.available(), true);
});

test('when the cloud cannot be reached the device goes on with its own vectors', async () => {
  const cloud = fakeVectorTable({ down: true });
  const one = await device({ cloud, calls: [] });
  assert.equal((await one.vectors.sync()).status, 'idle');
  assert.equal(one.vectors.available(), true);
  assert.equal((await one.vectors.search('invoice tax', { limit: 3 }))[0].conversationId, 'tax');
});

test('turning the search off also deletes the cloud copy', async () => {
  const cloud = fakeVectorTable();
  const one = await device({ cloud, calls: [] });
  await one.vectors.sync();
  assert.equal(cloud.rows.size, 2);
  await one.vectors.disable();
  assert.equal(cloud.rows.size, 0);
});

test('the person may change which provider makes the vectors when there is a key for each; the vectors made stay', async () => {
  const calls = [];
  const settings = { vector: { enabled: true, consentAt: '2026-10-30T00:00:00.000Z', provider: 'openrouter', sync: false } };
  const rows = [{ record_key: 'meta:settings', payload: settings, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => CONVERSATIONS });
  const keys = { openrouter: 'o-key' };
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider: (name) => keys[name] || '', indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl: async (url, options) => { calls.push(url); return geminiFetch([])(url, options); }, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  assert.deepEqual(vectors.providers().map((entry) => entry.name), ['openrouter']);
  assert.equal(await vectors.setProvider('gemini'), false, 'no key, no change');
  keys.gemini = 'g-key';
  assert.deepEqual(vectors.providers().map((entry) => [entry.name, entry.current]), [['gemini', false], ['openrouter', true]]);
  assert.equal(await vectors.setProvider('gemini'), true);
  assert.equal(memory.getStore().getSettings().vector.provider, 'gemini');
  assert.equal(memory.getStore().getSettings().vector.consentAt, '2026-10-30T00:00:00.000Z', 'the consent stays');
  await vectors.sync();
  assert.ok(calls.some((url) => url.includes('generativelanguage.googleapis.com')), 'the build now goes straight to Google');
});
