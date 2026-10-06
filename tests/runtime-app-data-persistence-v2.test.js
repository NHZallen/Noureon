import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { createWorkspaceStoreV2 } from '../src/app/runtime/kernel/workspace-store-v2.js';

const JOURNAL_KEY = 'chatCloudSyncJournal_v1_supabase:user-1';
const quiet = { warn() {}, error() {}, info() {} };

function createFakeStorage() {
  const values = new Map();
  const applies = [];
  const storage = {
    values,
    applies,
    getItem: async key => (values.has(key) ? values.get(key) : null),
    readItems: async keys => keys.map(key => (values.has(key) ? values.get(key) : null)),
    setItem: async (key, value) => { values.set(key, value); },
    setItemsAtomic: async entries => { for (const { key, value } of entries) values.set(key, value); },
    applyAtomic: async ({ puts = [], removes = [] }) => {
      applies.push({ puts: puts.map(entry => entry.key), removes: [...removes] });
      for (const { key, value } of puts) values.set(key, value);
      for (const key of removes) values.delete(key);
    },
    getKeys: async () => [...values.keys()]
  };
  return storage;
}

const conversation = (id, extra = {}) => ({ id, title: id, createdAt: '2026-10-01T00:00:00.000Z', messages: [{ id: `${id}-1`, role: 'user', parts: [{ text: 'hi' }] }], ...extra });

function createBackends(authProvider) {
  const user = authProvider === 'supabase'
    ? { username: 'supabase:user-1', authProvider: 'supabase' }
    : { username: 'alice', authProvider: 'local' };
  const build = useStore => {
    const storage = createFakeStorage();
    let snapshot = { conversations: [], folders: [], astras: [], personalMemories: [], memoryState: { version: 2, mediaMemories: [] } };
    let revision = 0;
    const saved = [];
    const store = useStore ? createWorkspaceStoreV2({ storage, username: user.username, logger: quiet }) : null;
    const persistence = createLegacyRuntimeAppDataPersistence({
      getCurrentUser: () => user,
      getAppData: () => snapshot,
      getAppDataKey: () => `chatAppData_v8.6_${user.username}`,
      getWorkspaceStore: () => store,
      setItem: storage.setItem,
      readItem: storage.getItem,
      readItems: storage.readItems,
      setItemsAtomic: storage.setItemsAtomic,
      createSyncRevision: () => `r${(revision += 1)}`,
      now: () => '2026-10-06T00:00:00.000Z',
      onSaved: (value, metadata) => saved.push(metadata),
      logger: quiet
    });
    return {
      storage,
      store,
      saved,
      save: options => persistence.saveAppData(options),
      get snapshot() { return snapshot; },
      set snapshot(value) { snapshot = value; },
      journal: () => JSON.parse(storage.values.get(JOURNAL_KEY) || 'null')
    };
  };
  return { legacy: build(false), v2: build(true) };
}

const clone = value => JSON.parse(JSON.stringify(value));

test('a local account saves to the split store, and nothing is written when nothing changed', async () => {
  const { v2 } = createBackends('local');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1'), conversation('c2')] };
  await v2.save();
  assert.equal(v2.storage.values.has('chatAppData_v8.6_alice'), false, 'the old item is not written');
  assert.equal(v2.saved.length, 1);

  await v2.save();
  assert.equal(v2.storage.applies.length, 1);
  assert.equal(v2.saved.length, 1, 'an unchanged save is not announced');

  v2.snapshot.conversations[1] = conversation('c2', { title: 'edited' });
  await v2.save();
  assert.deepEqual(v2.storage.applies.at(-1).puts.sort(), ['chatWS2:alice:conv:c2', 'chatWS2:alice:meta']);
  assert.equal(v2.saved.length, 2);
});

test('a cloud account writes the journal in the same transaction as the changed conversations', async () => {
  const { v2 } = createBackends('supabase');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1'), conversation('c2')] };
  await v2.save();
  const first = v2.storage.applies.at(-1);
  assert.ok(first.puts.includes(JOURNAL_KEY) && first.puts.includes('chatWS2:supabase%3Auser-1:meta'));
  assert.deepEqual(v2.journal().dirtyEntities, { unknown: true, conversations: [], folders: [], astras: [] }, 'a first save has no previous state, as before');
  assert.equal(v2.journal().fullResyncRequired, true);
  assert.equal(v2.saved[0].revision, 'r1');
});

test('the journal of the split store lists the same entities the old whole-workspace comparison does, save after save', async () => {
  const { legacy, v2 } = createBackends('supabase');
  const steps = [
    snapshot => { snapshot.conversations.push(conversation('c1'), conversation('c2'), conversation('c3')); },
    snapshot => { snapshot.conversations[1].title = 'edited'; },
    snapshot => { snapshot.conversations[0].messages.push({ id: 'm2', role: 'model', parts: [{ text: 'more' }] }); snapshot.conversations[2].pinned = true; },
    snapshot => { snapshot.folders.push({ id: 'f1', name: 'Work' }); },
    snapshot => { snapshot.astras.push({ id: 'a1', name: 'Writer' }); snapshot.folders[0].name = 'Renamed'; },
    snapshot => { snapshot.conversations.splice(1, 1); },
    snapshot => { snapshot.memoryState.mediaMemories.push({ id: 'x' }); },
    snapshot => { snapshot.personalMemories.push('likes tea'); },
    snapshot => { snapshot.conversations.reverse(); },
    snapshot => { snapshot.conversations.unshift(conversation('c9', { isTemporary: true, messages: [] })); },
    snapshot => { snapshot.astras = []; snapshot.conversations = []; },
    () => {}
  ];
  for (const [index, step] of steps.entries()) {
    const next = clone(legacy.snapshot);
    step(next);
    legacy.snapshot = clone(next);
    v2.snapshot = clone(next);
    await legacy.save();
    await v2.save();
    assert.deepEqual(v2.journal(), legacy.journal(), `step ${index + 1}: the journal`);
    assert.equal(v2.saved.length, legacy.saved.length, `step ${index + 1}: what is announced to the sync`);
  }
  // and what is stored reads back as the same workspace
  const loaded = (await v2.store.load()).workspace;
  assert.deepEqual(loaded, JSON.parse(legacy.storage.values.get('chatAppData_v8.6_supabase:user-1')));
});

test('with large attachments in the conversations the journal still matches the old whole-workspace comparison, and the attachments survive', async () => {
  const { legacy, v2 } = createBackends('supabase');
  const file = (seed, length = 40000) => ({ inlineData: { mimeType: 'image/png', name: `${seed}.png`, data: seed.repeat(Math.ceil(length / seed.length)).slice(0, length) } });
  const steps = [
    snapshot => { snapshot.conversations.push(conversation('c1', { messages: [{ id: 'm1', role: 'user', parts: [{ text: 'a' }, file('QUJD')] }] }), conversation('c2'), conversation('c3', { messages: [{ id: 'm3', role: 'user', parts: [file('REVG')] }] })); },
    snapshot => { snapshot.conversations[0].title = 'renamed'; },
    snapshot => { snapshot.conversations[2].messages[0].parts = [file('R0hJ')]; },
    snapshot => { snapshot.conversations[1].messages.push({ id: 'm9', role: 'user', parts: [file('QUJD')] }); },
    snapshot => { snapshot.conversations.splice(0, 1); },
    () => {}
  ];
  for (const [index, step] of steps.entries()) {
    const next = clone(legacy.snapshot);
    step(next);
    legacy.snapshot = clone(next);
    v2.snapshot = clone(next);
    await legacy.save();
    await v2.save();
    assert.deepEqual(v2.journal(), legacy.journal(), `step ${index + 1}: the journal`);
  }
  assert.deepEqual((await v2.store.load()).workspace, JSON.parse(legacy.storage.values.get('chatAppData_v8.6_supabase:user-1')));
  const attachmentRecords = [...v2.storage.values.keys()].filter(key => key.includes(':att:'));
  assert.equal(attachmentRecords.length, 2, 'only the files still in use are kept (c2 and c3 hold one each)');
});

test('an unchanged cloud workspace with a clean journal writes nothing; with a dirty journal it only re-announces the same revision', async () => {
  const { v2 } = createBackends('supabase');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1')] };
  await v2.save();
  const journal = v2.journal();

  v2.storage.values.set(JOURNAL_KEY, JSON.stringify({ ...journal, dirty: false, fullResyncRequired: false, workspaceRevision: 'r1', lastAcknowledgedRevision: 'r1' }));
  const writes = v2.storage.applies.length;
  const announced = v2.saved.length;
  await v2.save();
  assert.equal(v2.storage.applies.length, writes);
  assert.equal(v2.saved.length, announced);

  v2.storage.values.set(JOURNAL_KEY, JSON.stringify({ ...journal, dirty: true, workspaceRevision: 'r1', fullResyncRequired: false }));
  await v2.save({ immediateCloudSync: true });
  assert.equal(v2.storage.applies.length, writes, 'no write for a requeue');
  assert.equal(v2.saved.length, announced + 1);
  assert.equal(v2.saved.at(-1).revision, 'r1');
  assert.equal(v2.saved.at(-1).immediate, true);
});

test('an unchanged cloud workspace whose journal asks for a full resync gets only the journal written', async () => {
  const { v2 } = createBackends('supabase');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1')] };
  await v2.save();
  v2.storage.values.set(JOURNAL_KEY, JSON.stringify({ ...v2.journal(), dirty: false, fullResyncRequired: true }));
  await v2.save();
  assert.deepEqual(v2.storage.applies.at(-1), { puts: [JOURNAL_KEY], removes: [] });
  assert.equal(v2.journal().dirty, true);
});

test('a journal that cannot be read falls back to a durable full-resync marker, written with the workspace', async () => {
  const { v2 } = createBackends('supabase');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1')] };
  await v2.save();
  const failing = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => ({ ...v2.snapshot, conversations: [conversation('c1', { title: 'edited' })] }),
    getAppDataKey: () => 'unused',
    getWorkspaceStore: () => v2.store,
    setItem: async () => {},
    readItem: async () => { throw new Error('journal read failed'); },
    createSyncRevision: () => 'rX',
    logger: quiet
  });
  await failing.saveAppData();
  assert.equal(v2.journal().fullResyncRequired, true);
  assert.equal(v2.journal().dirty, true);
  assert.deepEqual(v2.storage.applies.at(-1).puts.sort(), [JOURNAL_KEY, 'chatWS2:supabase%3Auser-1:conv:c1', 'chatWS2:supabase%3Auser-1:meta']);
});

test('a failed transaction leaves neither the conversations nor the journal, and the save reports the failure', async () => {
  const { v2 } = createBackends('supabase');
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1')] };
  await v2.save();
  const before = new Map(v2.storage.values);
  v2.storage.applyAtomic = async () => { throw new Error('quota'); };
  v2.snapshot = { ...v2.snapshot, conversations: [conversation('c1', { title: 'edited' })] };
  await assert.rejects(() => v2.save(), /quota/);
  assert.deepEqual(v2.storage.values, before);
});

test('without a split store the old single-item path is used exactly as before', async () => {
  const { legacy } = createBackends('local');
  legacy.snapshot = { ...legacy.snapshot, conversations: [conversation('c1')] };
  await legacy.save();
  assert.equal(legacy.storage.values.has('chatAppData_v8.6_alice'), true);
  assert.equal([...legacy.storage.values.keys()].some(key => key.startsWith('chatWS2:')), false);
});
