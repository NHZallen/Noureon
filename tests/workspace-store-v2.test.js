import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WorkspaceStoreError,
  createWorkspaceStoreV2,
  fingerprintText,
  getWorkspaceV2Keys
} from '../src/app/runtime/kernel/workspace-store-v2.js';

const LEGACY_KEY = 'chatAppData_v8.6_alice';
const clock = () => '2026-10-06T12:00:00.000Z';
const quiet = { warn() {}, error() {}, info() {} };

// A storage with the same promises as the adapter: applyAtomic applies everything or nothing.
function createFakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const log = { applies: [], reads: [] };
  const hooks = { failApply: null, corruptRead: null };
  const storage = {
    values,
    log,
    hooks,
    async getItem(key) {
      log.reads.push(key);
      return values.has(key) ? values.get(key) : null;
    },
    async readItems(keys) {
      return keys.map(key => {
        log.reads.push(key);
        const value = values.has(key) ? values.get(key) : null;
        return hooks.corruptRead?.(key, value) ?? value;
      });
    },
    async applyAtomic({ puts = [], removes = [] } = {}) {
      if (hooks.failApply?.({ puts, removes })) throw new Error('quota exceeded');
      log.applies.push({ puts: puts.map(entry => entry.key), removes: [...removes] });
      for (const { key, value } of puts) values.set(key, value);
      for (const key of removes) values.delete(key);
    },
    async getKeys() {
      return [...values.keys()];
    },
    async removeItemsByPrefix(prefix) {
      for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key);
    }
  };
  return storage;
}

const conversation = (id, extra = {}) => ({
  id,
  title: `Chat ${id}`,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastUpdatedAt: '2026-10-01T00:00:00.000Z',
  messages: [{ id: `${id}-1`, role: 'user', parts: [{ text: '你好 hello' }] }],
  ...extra
});

const workspace = (...ids) => ({
  conversations: ids.map(id => conversation(id)),
  folders: [{ id: 'f1', name: 'Work' }],
  astras: [{ id: 'a1', name: 'Writer' }],
  personalMemories: ['likes tea'],
  memoryState: { version: 2, mediaMemories: [], conversationCapsules: [{ id: 'c1' }] }
});

const makeStore = (storage, overrides = {}) => createWorkspaceStoreV2({ storage, username: 'alice', now: clock, logger: quiet, ...overrides });

test('the keys of one user are never the start of another user\'s keys', () => {
  const a = getWorkspaceV2Keys('a');
  const ab = getWorkspaceV2Keys('a_b');
  const colon = getWorkspaceV2Keys('a:b');
  assert.equal(ab.meta.startsWith(a.prefix), false);
  assert.equal(colon.meta.startsWith(a.prefix), false);
  assert.equal(a.conversation('x'), 'chatWS2:a:conv:x');
  assert.throws(() => getWorkspaceV2Keys(''), TypeError);
});

test('the fingerprint tells a changed text from an unchanged one, including a swap and a different length', () => {
  const base = '一段對話 lorem ipsum '.repeat(500);
  const middle = base.length >> 1;
  const flipped = `${base.slice(0, middle)}X${base.slice(middle + 1)}`;
  const swapped = `${base.slice(0, middle)}${base[middle + 1]}${base[middle]}${base.slice(middle + 2)}`;
  const fingerprints = new Set([base, flipped, swapped, `${base} `, ` ${base.slice(1)}`, ''].map(fingerprintText));
  assert.equal(fingerprints.size, 6);
  assert.equal(fingerprintText(base), fingerprintText(`${base}`));
});

test('a first save writes every record and the index, and a second save of the same data writes nothing', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const first = await store.save(workspace('c1', 'c2'));
  assert.equal(first.written, 2);
  assert.deepEqual(storage.log.applies[0].puts.sort(), [
    'chatWS2:alice:conv:c1', 'chatWS2:alice:conv:c2', 'chatWS2:alice:memory', 'chatWS2:alice:meta', 'chatWS2:alice:shared'
  ]);
  const second = await store.save(workspace('c1', 'c2'));
  assert.deepEqual(second, { written: 0, removed: 0, shared: false, memory: false, skipped: 2 });
  assert.equal(storage.log.applies.length, 1, 'no transaction for an unchanged workspace');
});

test('changing one conversation writes that conversation and the index, not the others', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const data = workspace('c1', 'c2', 'c3');
  await store.save(data);
  data.conversations[1].messages.push({ id: 'c2-2', role: 'model', parts: [{ text: '新的回覆' }] });
  const result = await store.save(data);
  assert.equal(result.written, 1);
  assert.deepEqual(storage.log.applies.at(-1).puts.sort(), ['chatWS2:alice:conv:c2', 'chatWS2:alice:meta']);
  assert.equal(storage.log.applies.at(-1).removes.length, 0);
});

test('adding, removing and reordering conversations updates the records and the index', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  await store.save(workspace('c1', 'c2', 'c3'));

  const added = workspace('c0', 'c1', 'c2', 'c3');
  assert.equal((await store.save(added)).written, 1);
  assert.deepEqual(storage.log.applies.at(-1).puts.sort(), ['chatWS2:alice:conv:c0', 'chatWS2:alice:meta']);

  const removed = workspace('c0', 'c2', 'c3');
  const removal = await store.save(removed);
  assert.equal(removal.removed, 1);
  assert.deepEqual(storage.log.applies.at(-1).removes, ['chatWS2:alice:conv:c1']);
  assert.equal(storage.values.has('chatWS2:alice:conv:c1'), false);

  const reordered = workspace('c3', 'c0', 'c2');
  const reorder = await store.save(reordered);
  assert.equal(reorder.written, 0);
  assert.deepEqual(storage.log.applies.at(-1).puts, ['chatWS2:alice:meta'], 'only the index changes when only the order does');
  const loaded = await store.load();
  assert.deepEqual(loaded.workspace.conversations.map(item => item.id), ['c3', 'c0', 'c2']);
});

test('the shared data and the memory state are rewritten only when they change, and a memory state can be dropped', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const data = workspace('c1');
  await store.save(data);

  data.folders.push({ id: 'f2', name: 'Home' });
  const sharedOnly = await store.save(data);
  assert.deepEqual(storage.log.applies.at(-1).puts.sort(), ['chatWS2:alice:meta', 'chatWS2:alice:shared']);
  assert.equal(sharedOnly.shared, true);

  data.memoryState.conversationCapsules.push({ id: 'c2' });
  const memoryOnly = await store.save(data);
  assert.deepEqual(storage.log.applies.at(-1).puts.sort(), ['chatWS2:alice:memory', 'chatWS2:alice:meta']);
  assert.equal(memoryOnly.memory, true);

  delete data.memoryState;
  await store.save(data);
  assert.deepEqual(storage.log.applies.at(-1).removes, ['chatWS2:alice:memory']);
  const loaded = await store.load();
  assert.equal('memoryState' in loaded.workspace, false);
});

test('a save with hints serializes only the hinted conversations, but still notices new and removed ones', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const data = workspace('c1', 'c2');
  await store.save(data);

  let serialized = 0;
  const watched = id => ({ ...conversation(id), toJSON() { serialized += 1; return { ...conversation(id), title: 'changed' }; } });
  const next = { ...data, conversations: [watched('c1'), data.conversations[1]] };
  const hinted = await store.save(next, { conversationIds: ['c2'] });
  assert.equal(serialized, 0, 'c1 was not hinted, so it was not even serialized');
  assert.equal(hinted.written, 0);

  const withNew = { ...data, conversations: [watched('c1'), data.conversations[1], conversation('c9')] };
  await store.save(withNew, { conversationIds: [] });
  assert.equal(storage.values.has('chatWS2:alice:conv:c9'), true, 'a conversation the index does not know is always written');

  await store.save({ ...data, conversations: [data.conversations[1]] }, { conversationIds: [] });
  assert.equal(storage.values.has('chatWS2:alice:conv:c1'), false, 'a removal is noticed without a hint');
});

test('load gives back the workspace as it was saved, in order, with the extra top-level data', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const data = { ...workspace('c1', 'c2', 'c3'), futureField: { keep: 'me' } };
  await store.save(data);

  const loaded = await makeStore(storage).load();
  assert.equal(loaded.state, 'ready');
  assert.deepEqual(loaded.problems, []);
  assert.deepEqual(loaded.workspace.conversations, data.conversations);
  assert.deepEqual(loaded.workspace.folders, data.folders);
  assert.deepEqual(loaded.workspace.futureField, { keep: 'me' });
  assert.deepEqual(loaded.workspace.memoryState, data.memoryState);
});

test('a store with nothing saved loads as absent, and an empty workspace round-trips', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  assert.deepEqual(await store.load(), { state: 'absent' });
  await store.save({ conversations: [] });
  const loaded = await store.load();
  assert.equal(loaded.state, 'ready');
  assert.deepEqual(loaded.workspace, { conversations: [] });
});

test('an index that cannot be read is never overwritten, and a newer format is left alone', async () => {
  const garbled = createFakeStorage({ 'chatWS2:alice:meta': '{not json' });
  const garbledStore = makeStore(garbled);
  assert.deepEqual(await garbledStore.load(), { state: 'corrupt', reason: 'meta-not-json' });
  await assert.rejects(() => garbledStore.save(workspace('c1')), error => error instanceof WorkspaceStoreError && error.code === 'corrupt-meta');
  assert.equal(garbled.log.applies.length, 0);
  assert.equal(garbled.values.get('chatWS2:alice:meta'), '{not json');

  const future = createFakeStorage({ 'chatWS2:alice:meta': JSON.stringify({ version: 3, order: [], conversations: {}, shared: { fp: 'x' }, memory: null }) });
  const futureStore = makeStore(future);
  assert.equal((await futureStore.load()).state, 'unsupported');
  await assert.rejects(() => futureStore.save(workspace('c1')), /nothing was written/);
});

test('an unreadable or missing record is reported, the rest loads, and the next save keeps the record and its index entry', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  await store.save(workspace('c1', 'c2', 'c3'));
  storage.values.set('chatWS2:alice:conv:c2', '{broken');
  storage.values.delete('chatWS2:alice:conv:c3');

  const fresh = makeStore(storage);
  const loaded = await fresh.load();
  assert.equal(loaded.state, 'degraded');
  assert.deepEqual(loaded.problems.map(problem => [problem.id, problem.reason]).sort(), [['c2', 'unreadable'], ['c3', 'missing']]);
  assert.deepEqual(loaded.workspace.conversations.map(item => item.id), ['c1']);

  const next = { ...loaded.workspace, conversations: [...loaded.workspace.conversations, conversation('c4')] };
  await fresh.save(next);
  assert.equal(storage.values.get('chatWS2:alice:conv:c2'), '{broken', 'the damaged record was not deleted');
  const meta = JSON.parse(storage.values.get('chatWS2:alice:meta'));
  assert.deepEqual(meta.order, ['c1', 'c4', 'c2', 'c3']);
  assert.ok(meta.conversations.c2 && meta.conversations.c3);
});

test('a record changed behind the index is still loaded, with a warning', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  await store.save(workspace('c1'));
  storage.values.set('chatWS2:alice:conv:c1', JSON.stringify(conversation('c1', { title: 'edited elsewhere' })));
  const loaded = await makeStore(storage).load();
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.workspace.conversations[0].title, 'edited elsewhere');
  assert.deepEqual(loaded.warnings.map(warning => warning.reason), ['fingerprint-changed']);
});

test('a failed transaction changes nothing, and the next save writes everything that was lost', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const data = workspace('c1', 'c2');
  await store.save(data);
  const before = new Map(storage.values);

  data.conversations[0].title = 'new title';
  storage.hooks.failApply = () => true;
  await assert.rejects(() => store.save(data), /quota exceeded/);
  assert.deepEqual(storage.values, before);

  storage.hooks.failApply = null;
  const retry = await store.save(data);
  assert.equal(retry.written, 1);
  assert.equal(JSON.parse(storage.values.get('chatWS2:alice:conv:c1')).title, 'new title');
});

test('a conversation without an id, or two with the same id, is refused before anything is written', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  for (const conversations of [[{ title: 'no id' }], [conversation('c1'), conversation('c1')], [{ id: 5 }]]) {
    await assert.rejects(() => store.save({ conversations }), error => error.code === 'unindexable-conversation');
  }
  assert.equal(storage.log.applies.length, 0);
});

test('data that cannot be turned into JSON is refused before anything is written', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const circular = conversation('c1');
  circular.self = circular;
  await assert.rejects(() => store.save({ conversations: [conversation('c0'), circular] }), error => error.code === 'unserializable');
  assert.equal(storage.log.applies.length, 0);
});

test('saves started together run one after the other and leave a consistent store', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const saves = ['c1', 'c2', 'c3', 'c4'].map((id, index, list) => store.save(workspace(...list.slice(0, index + 1))));
  await Promise.all(saves);
  const loaded = await store.load();
  assert.deepEqual(loaded.workspace.conversations.map(item => item.id), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(await store.checkIntegrity(), { state: 'ok', missing: [], orphans: [] });
});

test('migration copies the old item into records, checks them, and leaves the old item exactly as it was', async () => {
  const legacy = JSON.stringify({ ...workspace('c1', 'c2'), conversations: [conversation('c1'), conversation('c2', { messages: [{ id: 'm', role: 'user', parts: [{ text: 'x' }] }, { id: 'n', role: 'model', parts: [{ text: 'y' }] }] })] });
  const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
  const store = makeStore(storage);

  const result = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.deepEqual(result, { state: 'migrated', conversations: 2, messages: 3, bytes: legacy.length });
  assert.equal(storage.values.get(LEGACY_KEY), legacy, 'the old item is untouched');
  assert.equal(storage.log.applies.length, 1, 'one transaction wrote everything');

  const loaded = await store.load();
  assert.deepEqual(loaded.workspace, JSON.parse(legacy));
  const meta = JSON.parse(storage.values.get('chatWS2:alice:meta'));
  assert.equal(meta.migratedFrom.key, LEGACY_KEY);
  assert.equal(meta.migratedFrom.fingerprint, fingerprintText(legacy));
  assert.equal(meta.migratedFrom.conversationCount, 2);
  assert.equal(meta.migratedFrom.messageCount, 3);

  assert.deepEqual(await store.migrateFromLegacy({ legacyKey: LEGACY_KEY }), { state: 'already-migrated' });
});

test('migration has nothing to do without an old item and does not touch an old item it cannot read', async () => {
  const empty = createFakeStorage();
  assert.deepEqual(await makeStore(empty).migrateFromLegacy({ legacyKey: LEGACY_KEY }), { state: 'no-legacy' });

  const broken = createFakeStorage({ [LEGACY_KEY]: '{oops' });
  assert.deepEqual(await makeStore(broken).migrateFromLegacy({ legacyKey: LEGACY_KEY }), { state: 'legacy-unreadable' });
  assert.equal(broken.log.applies.length, 0);
  assert.equal(broken.values.get(LEGACY_KEY), '{oops');
});

test('an old item with conversations that cannot be indexed is not migrated and the reason is recorded', async () => {
  const legacy = JSON.stringify({ conversations: [{ title: 'no id' }] });
  const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
  const store = makeStore(storage);
  const result = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.equal(result.state, 'unindexable');
  assert.equal(result.attempts, 1);
  assert.equal(storage.values.has('chatWS2:alice:meta'), false);
  assert.equal(storage.values.get(LEGACY_KEY), legacy);
  assert.equal((await store.getMigrationFailure()).reason, 'unindexable-conversation');
});

test('a migration whose transaction fails leaves no new records, keeps the old item and counts the attempt', async () => {
  const legacy = JSON.stringify(workspace('c1', 'c2'));
  const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
  const store = makeStore(storage);
  storage.hooks.failApply = ({ puts }) => puts.some(entry => entry.key.endsWith(':meta'));

  const first = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.equal(first.state, 'failed');
  assert.equal(first.attempts, 1);
  assert.equal([...storage.values.keys()].some(key => key.startsWith('chatWS2:alice:conv:') || key.endsWith(':meta')), false);
  assert.equal(storage.values.get(LEGACY_KEY), legacy);

  const second = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.equal(second.attempts, 2);

  storage.hooks.failApply = null;
  const third = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.equal(third.state, 'migrated');
  assert.equal(await store.getMigrationFailure(), null, 'a successful migration clears the failure marker');
});

test('a migration that does not read back as written is removed again, so the app stays on the old item', async () => {
  const legacy = JSON.stringify(workspace('c1', 'c2'));
  const storage = createFakeStorage({ [LEGACY_KEY]: legacy });
  const store = makeStore(storage);
  storage.hooks.corruptRead = (key, value) => (key.endsWith(':conv:c2') ? `${value} ` : value);

  const result = await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  assert.equal(result.state, 'failed');
  assert.equal(result.reason, 'verification-failed');
  assert.equal([...storage.values.keys()].filter(key => key.startsWith('chatWS2:alice:') && !key.endsWith(':failed')).length, 0, 'no record of the failed migration stays');
  assert.equal(storage.values.get(LEGACY_KEY), legacy);
  assert.equal((await store.getMigrationFailure()).attempts, 1);
  assert.deepEqual(await store.load(), { state: 'absent' });
});

test('after a migration, what an older tab wrote to the old item is merged in without bringing back deleted chats', async () => {
  const base = { ...workspace('c1', 'c2', 'c3') };
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(base) });
  const store = makeStore(storage);
  await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });

  // a newer version deletes c3 and edits c2 (older than what the old tab will write)
  const current = (await store.load()).workspace;
  current.conversations = current.conversations.filter(item => item.id !== 'c3');
  current.conversations[1].title = 'edited in the new version';
  current.conversations[1].lastUpdatedAt = '2026-10-02T00:00:00.000Z';
  await store.save(current);

  // the old tab, still running the old code, edits c1 later, edits c3 (deleted here), and creates c9
  const stale = JSON.parse(storage.values.get(LEGACY_KEY));
  stale.conversations[0] = { ...stale.conversations[0], title: 'edited in the old tab', lastUpdatedAt: '2026-10-05T00:00:00.000Z' };
  stale.conversations[2] = { ...stale.conversations[2], title: 'c3 edited in the old tab', lastUpdatedAt: '2026-10-05T00:00:00.000Z' };
  stale.conversations.unshift(conversation('c9', { lastUpdatedAt: '2026-10-05T00:00:00.000Z' }));
  storage.values.set(LEGACY_KEY, JSON.stringify(stale));

  const result = await store.mergeStaleLegacy({ legacyKey: LEGACY_KEY });
  assert.deepEqual(result, { state: 'merged', added: ['c9'], replaced: ['c1'] });
  const merged = (await store.load()).workspace.conversations;
  assert.deepEqual(merged.map(item => item.id), ['c9', 'c1', 'c2']);
  assert.equal(merged.find(item => item.id === 'c1').title, 'edited in the old tab');
  assert.equal(merged.find(item => item.id === 'c2').title, 'edited in the new version', 'ours is newer, so it stays');
  assert.equal(merged.some(item => item.id === 'c3'), false, 'a chat deleted here does not come back');

  assert.deepEqual(await store.mergeStaleLegacy({ legacyKey: LEGACY_KEY }), { state: 'unchanged' }, 'merging again finds nothing new');
});

test('a conversation that is new in the old item but already exists here (for example pulled from the cloud into both) is not added twice', async () => {
  const storage = createFakeStorage({ [LEGACY_KEY]: JSON.stringify(workspace('c1')) });
  const store = makeStore(storage);
  await store.migrateFromLegacy({ legacyKey: LEGACY_KEY });
  const current = (await store.load()).workspace;
  current.conversations.unshift(conversation('c9', { title: 'ours' }));
  await store.save(current);

  const stale = JSON.parse(storage.values.get(LEGACY_KEY));
  stale.conversations.unshift(conversation('c9', { title: 'theirs' }));
  storage.values.set(LEGACY_KEY, JSON.stringify(stale));

  assert.deepEqual(await store.mergeStaleLegacy({ legacyKey: LEGACY_KEY }), { state: 'merged', added: [], replaced: [] });
  const loaded = (await store.load()).workspace.conversations;
  assert.deepEqual(loaded.map(item => item.id), ['c9', 'c1']);
  assert.equal(loaded[0].title, 'ours');
});

test('nothing is merged when the store was not migrated or the old item is gone', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  assert.deepEqual(await store.mergeStaleLegacy({ legacyKey: LEGACY_KEY }), { state: 'not-migrated' });
  await store.save(workspace('c1'));
  assert.deepEqual(await store.mergeStaleLegacy({ legacyKey: LEGACY_KEY }), { state: 'not-migrated' }, 'a store that never came from an old item');
});

test('the integrity check reports records the index lacks and records the storage lacks', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  await store.save(workspace('c1', 'c2'));
  storage.values.set('chatWS2:alice:conv:ghost', '{}');
  storage.values.delete('chatWS2:alice:conv:c2');
  const report = await store.checkIntegrity();
  assert.deepEqual(report, { state: 'ok', missing: ['c2'], orphans: ['chatWS2:alice:conv:ghost'] });
  assert.equal((await makeStore(createFakeStorage()).checkIntegrity()).state, 'absent');
});

test('usage adds up the sizes of the records, removeAll leaves other users alone, and the disabled marker can be set and cleared', async () => {
  const storage = createFakeStorage({ 'chatWS2:a_b:meta': 'other user', [LEGACY_KEY]: 'old' });
  const store = makeStore(storage, { username: 'a' });
  assert.deepEqual(await store.getUsage(), { conversations: 0, bytes: 0 });
  await store.save(workspace('c1', 'c2'));
  const usage = await store.getUsage();
  assert.equal(usage.conversations, 2);
  assert.ok(usage.bytes > 100);

  assert.equal(await store.isDisabled(), false);
  await store.setDisabled(true);
  assert.equal(await store.isDisabled(), true);
  await store.setDisabled(false);
  assert.equal(await store.isDisabled(), false);

  await store.removeAll();
  assert.deepEqual([...storage.values.keys()].sort(), [LEGACY_KEY, 'chatWS2:a_b:meta'].sort());
});

test('removeAll works with a storage that has no prefix removal', async () => {
  const storage = createFakeStorage({ other: 'x' });
  delete storage.removeItemsByPrefix;
  const store = makeStore(storage);
  await store.save(workspace('c1'));
  await store.removeAll();
  assert.deepEqual([...storage.values.keys()], ['other']);
});

test('the store needs a storage with the atomic transaction and a user name', () => {
  assert.throws(() => createWorkspaceStoreV2({ storage: { getItem() {}, getKeys() {} }, username: 'a' }), /applyAtomic/);
  assert.throws(() => createWorkspaceStoreV2({ storage: createFakeStorage(), username: '' }), /user name/);
});

test('a save of a large workspace with one changed conversation writes one record of that size, not the workspace', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage);
  const filler = '這是一段測試對話內容 lorem ipsum '.repeat(600);
  const data = { conversations: Array.from({ length: 120 }, (_, index) => conversation(`c${index}`, { messages: [{ id: 'm', role: 'model', parts: [{ text: filler }] }] })) };
  await store.save(data);
  const total = [...storage.values.values()].reduce((sum, value) => sum + value.length, 0);

  data.conversations[57].messages.push({ id: 'm2', role: 'user', parts: [{ text: 'one more' }] });
  await store.save(data);
  const written = storage.log.applies.at(-1);
  assert.deepEqual(written.puts.sort(), ['chatWS2:alice:conv:c57', 'chatWS2:alice:meta']);
  const writtenSize = written.puts.reduce((sum, key) => sum + storage.values.get(key).length, 0);
  assert.ok(writtenSize < total / 20, `wrote ${writtenSize} of ${total}`);
});

test('the module is storage-only: no page, no runtime, no old-item writes', () => {
  const source = readFileSync(new URL('../src/app/runtime/kernel/workspace-store-v2.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(document|window|localStorage|indexedDB)\b/);
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(source, /setItem\(|removeItem\(\s*legacyKey/);
});
