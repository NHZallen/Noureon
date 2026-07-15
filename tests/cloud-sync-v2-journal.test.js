import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { initializeConversationShadowSync } from '../src/app/sync/cloud-sync-v2-shadow.js';
import {
  acknowledgeCloudSyncJournal,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty
} from '../src/app/sync/cloud-sync-journal.js';

const userId = '11111111-1111-4111-8111-111111111111';
const username = `supabase:${userId}`;
const appDataKey = `chatAppData_v8.6_${username}`;
const journalKey = getCloudSyncJournalKey(username);
const folderId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const astraId = '44444444-4444-4444-8444-444444444444';

function createWorkspace() {
  return {
    folders: [{ id: folderId, name: 'Local folder', color: 'blue', conversationIds: [conversationId] }],
    conversations: [{
      id: conversationId,
      title: 'Local conversation',
      model: 'model-1',
      provider: 'provider-1',
      folderId,
      createdAt: '2026-07-15T00:00:00.000Z',
      genConfig: { temperature: 0.7 },
      messages: [{ role: 'user', parts: [{ text: 'Local message' }] }]
    }],
    astras: [{ id: astraId, name: 'Local Noura', description: '', instructions: 'Local instructions' }],
    personalMemories: [],
    memoryState: { version: 2, legacyInbox: [{ id: 'device-only-memory' }] },
    deviceOnlyWorkspaceState: { preserved: true }
  };
}

function createCleanJournal(revision = 'clean-revision') {
  const dirty = markCloudSyncJournalDirty(null, {
    username,
    revision,
    now: () => '2026-07-15T00:01:00.000Z'
  });
  return acknowledgeCloudSyncJournal(dirty, revision, {
    username,
    acknowledgedAt: () => '2026-07-15T00:02:00.000Z',
    fullResyncCompleted: true
  }).journal;
}

function createStorage(workspace, journalRaw) {
  const values = new Map([[appDataKey, JSON.stringify(workspace)]]);
  if (journalRaw !== undefined) values.set(journalKey, journalRaw);
  const atomicBatches = [];
  return {
    values,
    atomicBatches,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async setItemsAtomic(entries) {
      atomicBatches.push(entries.map(entry => ({ ...entry })));
      for (const { key, value } of entries) values.set(key, value);
    },
    workspace: () => JSON.parse(values.get(appDataKey)),
    journal: () => JSON.parse(values.get(journalKey))
  };
}

function createSupabase({
  profile = { user_id: userId, schema_version: 2, migration_state: 'ready', legacy_backup_created_at: '2026-07-14T00:00:00.000Z' },
  tables = {},
  onFetch = async () => {},
  onConversationUpload = async () => {}
} = {}) {
  const data = {
    workspace_tombstones: [],
    workspace_folders: [],
    workspace_conversations: [],
    workspace_messages: [],
    workspace_astras: [],
    ...structuredClone(tables)
  };
  const calls = { fetches: [], uploads: [], verifies: 0, states: [] };
  let currentProfile = { ...profile };
  let conversationUploadCount = 0;

  const upsertRows = (table, rows) => {
    const byId = new Map((data[table] || []).map(row => [row.id, row]));
    for (const row of rows || []) byId.set(row.id, structuredClone(row));
    data[table] = [...byId.values()];
  };
  const queryFor = table => ({
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    async range(from, to) {
      await onFetch(table);
      calls.fetches.push(table);
      return {
        data: structuredClone((data[table] || []).slice(from, to + 1)),
        error: null
      };
    },
    async maybeSingle() { return { data: { ...currentProfile }, error: null }; },
    async in(column, ids) {
      calls.verifies += 1;
      return {
        data: (data[table] || [])
          .filter(row => ids.includes(row[column]))
          .map(({ updated_at: _updatedAt, sync_seq: _syncSequence, ...row }) => row),
        error: null
      };
    },
    async upsert(rows) {
      if (table === 'sync_profiles') {
        currentProfile = { ...currentProfile, ...rows };
        calls.states.push(rows.migration_state);
      } else {
        upsertRows(table, rows);
        calls.uploads.push(table);
      }
      return { error: null };
    },
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => onFetch(table))
        .then(() => {
          calls.fetches.push(table);
          return { data: structuredClone(data[table] || []), error: null };
        })
        .then(resolve, reject);
    }
  });
  const rpcTables = {
    upsert_workspace_folders: 'workspace_folders',
    upsert_workspace_conversations: 'workspace_conversations',
    upsert_workspace_messages: 'workspace_messages'
  };
  return {
    data,
    calls,
    supabase: {
      from: table => queryFor(table),
      async rpc(name, { p_rows: rows } = {}) {
        const table = rpcTables[name];
        if (!table) return { error: new Error(`Unexpected RPC: ${name}`) };
        if (name === 'upsert_workspace_conversations') {
          conversationUploadCount += 1;
          await onConversationUpload(rows, conversationUploadCount);
        }
        upsertRows(table, rows);
        calls.uploads.push(table);
        return { error: null };
      }
    }
  };
}

function initialize({ storage, remote, schedule, cancel, now } = {}) {
  return initializeConversationShadowSync({
    window: {},
    supabase: remote.supabase,
    storage,
    user: { id: userId },
    username,
    cryptoProvider: webcrypto,
    schedule,
    cancel,
    now,
    logger: { warn() {}, info() {} }
  });
}

test('a proven-clean journal still pulls and commits remote state but skips the full upload', async () => {
  const storage = createStorage(createWorkspace(), JSON.stringify(createCleanJournal()));
  const remote = createSupabase();
  const sync = initialize({ storage, remote });

  const status = await sync.ready;

  assert.equal(status.state, 'ready');
  assert.equal(status.uploadSkipped, true);
  assert.equal(remote.calls.uploads.length, 0);
  assert.equal(remote.calls.verifies, 0);
  assert.ok(remote.calls.fetches.includes('workspace_tombstones'));
  assert.ok(remote.calls.fetches.includes('workspace_conversations'));
  assert.equal(storage.journal().dirty, false);
  assert.equal(storage.journal().fullResyncRequired, false);
  assert.deepEqual(storage.workspace().memoryState, createWorkspace().memoryState);
  assert.deepEqual(storage.workspace().deviceOnlyWorkspaceState, { preserved: true });
});

test('missing, corrupt, and unknown journals each recover with one verified upload then skip on reload', async t => {
  const cases = [
    ['missing', undefined],
    ['corrupt', '{broken-json'],
    ['unknown version', JSON.stringify({ version: 99, username, dirty: false, fullResyncRequired: false })]
  ];
  for (const [name, journalRaw] of cases) {
    await t.test(name, async () => {
      const storage = createStorage(createWorkspace(), journalRaw);
      const remote = createSupabase();
      const first = initialize({ storage, remote });
      assert.equal((await first.ready).state, 'ready');
      const uploadCount = remote.calls.uploads.filter(table => table === 'workspace_conversations').length;
      assert.equal(uploadCount, 1);
      assert.ok(remote.calls.verifies > 0);
      assert.equal(storage.journal().dirty, false);
      assert.equal(storage.journal().fullResyncRequired, false);

      const second = initialize({ storage, remote });
      assert.equal((await second.ready).uploadSkipped, true);
      assert.equal(
        remote.calls.uploads.filter(table => table === 'workspace_conversations').length,
        uploadCount
      );
    });
  }
});

test('a newer persisted revision during upload survives the old ACK and is captured next', async () => {
  let releaseFirstUpload;
  let markFirstUploadStarted;
  const firstUploadStarted = new Promise(resolve => { markFirstUploadStarted = resolve; });
  const firstUploadGate = new Promise(resolve => { releaseFirstUpload = resolve; });
  const remote = createSupabase({
    onConversationUpload: async (_rows, count) => {
      if (count !== 1) return;
      markFirstUploadStarted();
      await firstUploadGate;
    }
  });
  const storage = createStorage(createWorkspace(), undefined);
  let scheduled;
  const sync = initialize({
    storage,
    remote,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {},
    now: () => '2026-07-15T00:03:00.000Z'
  });
  await firstUploadStarted;

  const laterWorkspace = createWorkspace();
  laterWorkspace.conversations.push({
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Saved during upload',
    model: 'model-1',
    provider: 'provider-1',
    createdAt: '2026-07-15T00:04:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'New revision' }] }]
  });
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => laterWorkspace,
    getAppDataKey: () => appDataKey,
    setItem: storage.setItem,
    readItem: storage.getItem,
    setItemsAtomic: storage.setItemsAtomic,
    createSyncRevision: () => 'newer-revision',
    now: () => '2026-07-15T00:04:00.000Z',
    onSaved: (snapshot, metadata) => sync.captureWorkspace(snapshot, {
      ...metadata,
      revision: 'forged-metadata-revision'
    })
  });
  await persistence.saveAppData();
  releaseFirstUpload();

  const firstStatus = await sync.ready;
  assert.equal(firstStatus.state, 'ready');
  assert.equal(firstStatus.pending, true);
  assert.equal(storage.journal().workspaceRevision, 'newer-revision');
  assert.equal(storage.journal().dirty, true);
  assert.equal(typeof scheduled, 'function');

  await scheduled();
  assert.equal(storage.journal().dirty, false);
  assert.equal(storage.journal().lastAcknowledgedRevision, 'newer-revision');
  assert.equal(remote.data.workspace_conversations.length, 2);
});

test('a failed dirty upload remains durable and resumes successfully after reload', async () => {
  let failNextUpload = true;
  const remote = createSupabase({
    onConversationUpload: async () => {
      if (!failNextUpload) return;
      failNextUpload = false;
      throw new Error('temporary upload failure');
    }
  });
  const storage = createStorage(createWorkspace(), undefined);
  const first = initialize({ storage, remote });

  assert.equal((await first.ready).state, 'retry');
  const pendingRevision = storage.journal().workspaceRevision;
  assert.equal(storage.journal().dirty, true);
  assert.equal(storage.journal().fullResyncRequired, true);

  const reloaded = initialize({ storage, remote });
  assert.equal((await reloaded.ready).state, 'ready');
  assert.equal(storage.journal().dirty, false);
  assert.equal(storage.journal().fullResyncRequired, false);
  assert.equal(storage.journal().lastAcknowledgedRevision, pendingRevision);
});

test('ID repair atomically marks a previously clean workspace dirty before upload', async () => {
  let releaseUpload;
  let markUploadStarted;
  const uploadStarted = new Promise(resolve => { markUploadStarted = resolve; });
  const uploadGate = new Promise(resolve => { releaseUpload = resolve; });
  const remote = createSupabase({
    onConversationUpload: async (_rows, count) => {
      if (count !== 1) return;
      markUploadStarted();
      await uploadGate;
    }
  });
  const legacyWorkspace = createWorkspace();
  legacyWorkspace.folders[0].id = 'legacy-folder';
  legacyWorkspace.folders[0].conversationIds = ['legacy-conversation'];
  legacyWorkspace.conversations[0].id = 'legacy-conversation';
  legacyWorkspace.conversations[0].folderId = 'legacy-folder';
  legacyWorkspace.astras[0].id = 'legacy-astra';
  const storage = createStorage(legacyWorkspace, JSON.stringify(createCleanJournal()));
  const sync = initialize({ storage, remote });
  await uploadStarted;

  const repairedWorkspace = storage.workspace();
  assert.match(repairedWorkspace.conversations[0].id, /^[0-9a-f-]{36}$/i);
  assert.match(repairedWorkspace.folders[0].id, /^[0-9a-f-]{36}$/i);
  assert.match(repairedWorkspace.astras[0].id, /^[0-9a-f-]{36}$/i);
  assert.equal(storage.journal().dirty, true);
  assert.equal(storage.journal().fullResyncRequired, true);
  assert.ok(storage.atomicBatches.some(entries => {
    const workspaceEntry = entries.find(entry => entry.key === appDataKey);
    const journalEntry = entries.find(entry => entry.key === journalKey);
    if (!workspaceEntry || !journalEntry) return false;
    const persistedWorkspace = JSON.parse(workspaceEntry.value);
    const persistedJournal = JSON.parse(journalEntry.value);
    return persistedWorkspace.conversations[0].id === repairedWorkspace.conversations[0].id
      && persistedJournal.dirty
      && persistedJournal.fullResyncRequired;
  }));

  releaseUpload();
  assert.equal((await sync.ready).state, 'ready');
  assert.equal(storage.journal().dirty, false);
  assert.equal(storage.journal().fullResyncRequired, false);
});

test('save during remote fetch preserves dirty same-ID folder, Noura, and conversation metadata', async () => {
  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise(resolve => { markFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const remote = createSupabase({
    tables: {
      workspace_folders: [{ id: folderId, user_id: userId, name: 'Remote folder', color: 'red', icon: 'default', text_color: 'gray', deleted_at: null }],
      workspace_conversations: [{
        id: conversationId,
        user_id: userId,
        folder_id: folderId,
        title: 'Remote conversation',
        summary: '',
        model: 'model-1',
        provider: 'provider-1',
        metadata: { genConfig: { temperature: 0.1 } },
        archived: false,
        pinned: false,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }],
      workspace_astras: [{
        id: astraId,
        user_id: userId,
        name: 'Remote Noura',
        description: '',
        instructions: 'Remote instructions',
        metadata: {},
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }],
      workspace_messages: [{
        id: '66666666-6666-4666-8666-666666666666',
        user_id: userId,
        conversation_id: conversationId,
        role: 'user',
        parts: [{ text: 'Local message' }],
        status: 'complete',
        sequence: 0,
        created_at: '2026-07-15T00:00:01.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }, {
        id: '77777777-7777-4777-8777-777777777777',
        user_id: userId,
        conversation_id: conversationId,
        role: 'model',
        parts: [{ text: 'Remote answer received during fetch' }],
        status: 'complete',
        sequence: 1,
        created_at: '2026-07-15T00:01:01.000Z',
        updated_at: '2026-07-15T00:01:01.000Z',
        deleted_at: null
      }]
    },
    onFetch: async table => {
      if (table !== 'workspace_conversations') return;
      markFetchStarted();
      await fetchGate;
    }
  });
  const storage = createStorage(createWorkspace(), JSON.stringify(createCleanJournal()));
  const sync = initialize({ storage, remote });
  await fetchStarted;

  const latest = createWorkspace();
  latest.folders[0].name = 'Saved folder';
  latest.astras[0].name = 'Saved Noura';
  latest.astras[0].instructions = 'Saved instructions';
  latest.conversations[0].title = 'Saved conversation';
  latest.conversations[0].genConfig = { temperature: 0.95 };
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => latest,
    getAppDataKey: () => appDataKey,
    setItem: storage.setItem,
    readItem: storage.getItem,
    setItemsAtomic: storage.setItemsAtomic,
    createSyncRevision: () => 'fetch-save-revision',
    now: () => '2026-07-15T00:05:00.000Z'
  });
  await persistence.saveAppData();
  releaseFetch();
  assert.equal((await sync.ready).state, 'ready');

  const committed = storage.workspace();
  assert.equal(committed.folders[0].name, 'Saved folder');
  assert.equal(committed.astras[0].name, 'Saved Noura');
  assert.equal(committed.astras[0].instructions, 'Saved instructions');
  assert.equal(committed.conversations[0].title, 'Saved conversation');
  assert.deepEqual(committed.conversations[0].genConfig, { temperature: 0.95 });
  assert.equal(committed.conversations[0].messages.length, 2);
  assert.equal(committed.conversations[0].messages[1].parts[0].text, 'Remote answer received during fetch');
  assert.deepEqual(committed.memoryState, latest.memoryState);
  assert.deepEqual(committed.deviceOnlyWorkspaceState, { preserved: true });
});

test('a local folder edit does not hide another device new conversation message', async () => {
  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise(resolve => { markFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const remote = createSupabase({
    tables: {
      workspace_folders: [{ id: folderId, user_id: userId, name: 'Remote folder', color: 'red', icon: 'default', text_color: 'gray', deleted_at: null }],
      workspace_conversations: [{
        id: conversationId,
        user_id: userId,
        folder_id: folderId,
        title: 'Remote conversation',
        summary: '',
        model: 'model-1',
        provider: 'provider-1',
        metadata: { genConfig: { temperature: 0.1 } },
        archived: false,
        pinned: false,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }],
      workspace_messages: [{
        id: '66666666-6666-4666-8666-666666666666',
        user_id: userId,
        conversation_id: conversationId,
        role: 'user',
        parts: [{ text: 'Local message' }],
        status: 'complete',
        sequence: 0,
        created_at: '2026-07-15T00:00:01.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }, {
        id: '77777777-7777-4777-8777-777777777777',
        user_id: userId,
        conversation_id: conversationId,
        role: 'model',
        parts: [{ text: 'Message added on device B' }],
        status: 'complete',
        sequence: 1,
        created_at: '2026-07-15T00:01:01.000Z',
        updated_at: '2026-07-15T00:01:01.000Z',
        deleted_at: null
      }]
    },
    onFetch: async table => {
      if (table !== 'workspace_conversations') return;
      markFetchStarted();
      await fetchGate;
    }
  });
  const storage = createStorage(createWorkspace(), JSON.stringify(createCleanJournal()));
  const sync = initialize({ storage, remote });
  await fetchStarted;

  const localEdit = createWorkspace();
  localEdit.folders[0].name = 'Folder renamed on device A';
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => localEdit,
    getAppDataKey: () => appDataKey,
    setItem: storage.setItem,
    readItem: storage.getItem,
    setItemsAtomic: storage.setItemsAtomic,
    createSyncRevision: () => 'folder-only-revision'
  });
  await persistence.saveAppData();
  assert.deepEqual(storage.journal().dirtyEntities, {
    unknown: false,
    conversations: [],
    folders: [folderId],
    astras: []
  });
  releaseFetch();
  assert.equal((await sync.ready).state, 'ready');

  const committed = storage.workspace();
  assert.equal(committed.folders[0].name, 'Folder renamed on device A');
  assert.equal(committed.conversations[0].title, 'Remote conversation');
  assert.equal(committed.conversations[0].messages.length, 2);
  assert.equal(committed.conversations[0].messages[1].parts[0].text, 'Message added on device B');
});

test('editing Astra X locally preserves a concurrent remote edit to Astra Y', async () => {
  const astraYId = '55555555-5555-4555-8555-555555555555';
  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise(resolve => { markFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const initial = createWorkspace();
  initial.astras.push({ id: astraYId, name: 'Astra Y before', description: '', instructions: 'Y before' });
  const remote = createSupabase({
    tables: {
      workspace_astras: [{
        id: astraId,
        user_id: userId,
        name: 'Local Noura',
        description: '',
        instructions: 'Local instructions',
        metadata: {},
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }, {
        id: astraYId,
        user_id: userId,
        name: 'Astra Y edited on device B',
        description: '',
        instructions: 'Y remote edit',
        metadata: {},
        updated_at: '2026-07-15T00:02:00.000Z',
        deleted_at: null
      }]
    },
    onFetch: async table => {
      if (table !== 'workspace_astras') return;
      markFetchStarted();
      await fetchGate;
    }
  });
  const storage = createStorage(initial, JSON.stringify(createCleanJournal()));
  const sync = initialize({ storage, remote });
  await fetchStarted;

  const localEdit = structuredClone(initial);
  localEdit.astras[0].name = 'Astra X edited on device A';
  localEdit.astras[0].instructions = 'X local edit';
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => localEdit,
    getAppDataKey: () => appDataKey,
    setItem: storage.setItem,
    readItem: storage.getItem,
    setItemsAtomic: storage.setItemsAtomic,
    createSyncRevision: () => 'astra-x-revision'
  });
  await persistence.saveAppData();
  assert.deepEqual(storage.journal().dirtyEntities.astras, [astraId]);
  releaseFetch();
  assert.equal((await sync.ready).state, 'ready');

  const committedById = new Map(storage.workspace().astras.map(astra => [astra.id, astra]));
  assert.equal(committedById.get(astraId).name, 'Astra X edited on device A');
  assert.equal(committedById.get(astraId).instructions, 'X local edit');
  assert.equal(committedById.get(astraYId).name, 'Astra Y edited on device B');
  assert.equal(committedById.get(astraYId).instructions, 'Y remote edit');
});

test('a remote tombstone wins over a same-entity local edit during fetch', async () => {
  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise(resolve => { markFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const remote = createSupabase({
    tables: {
      workspace_tombstones: [{
        entity_type: 'conversation',
        entity_id: conversationId,
        deleted_at: '2026-07-15T00:03:00.000Z'
      }],
      workspace_conversations: [{
        id: conversationId,
        user_id: userId,
        folder_id: folderId,
        title: 'Stale remote row',
        summary: '',
        model: 'model-1',
        provider: 'provider-1',
        metadata: {},
        archived: false,
        pinned: false,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:01:00.000Z',
        deleted_at: null
      }]
    },
    onFetch: async table => {
      if (table !== 'workspace_conversations') return;
      markFetchStarted();
      await fetchGate;
    }
  });
  const storage = createStorage(createWorkspace(), JSON.stringify(createCleanJournal()));
  const sync = initialize({ storage, remote });
  await fetchStarted;

  const localEdit = createWorkspace();
  localEdit.conversations[0].title = 'Edited locally after remote deletion';
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => localEdit,
    getAppDataKey: () => appDataKey,
    setItem: storage.setItem,
    readItem: storage.getItem,
    setItemsAtomic: storage.setItemsAtomic,
    createSyncRevision: () => 'tombstoned-conversation-revision'
  });
  await persistence.saveAppData();
  assert.deepEqual(storage.journal().dirtyEntities.conversations, [conversationId]);
  releaseFetch();
  assert.equal((await sync.ready).state, 'ready');

  assert.equal(storage.workspace().conversations.some(item => item.id === conversationId), false);
  assert.deepEqual(storage.workspace().folders[0].conversationIds, []);
});
