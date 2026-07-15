import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { withWorkspaceStorageExclusive } from '../src/app/sync/workspace-storage-coordinator.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const emptyMemoryState = () => ({
  version: 2,
  profileEntries: [],
  profileCandidates: [],
  resolvedProfileCandidateIds: [],
  recentConversationStates: [],
  mediaMemories: [],
  conversationCapsules: [],
  longTermTopicSummaries: [],
  resolvedTopicSummaryIds: [],
  suppressionRules: [],
  legacyInbox: []
});

test('serialized app data persistence writes the latest store snapshot for the latest user', async () => {
  const calls = [];
  let currentUser = null;
  const appDataStore = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'initial-conv' }]
  });
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => currentUser,
    getAppData: () => appDataStore.getSnapshot(),
    getAppDataKey: () => `chatAppData_v8.6_${currentUser.username}`,
    setItem: async (key, value) => calls.push([key, value])
  });

  await persistence.saveAppData();
  assert.deepEqual(calls, []);

  currentUser = { username: 'alice' };
  await persistence.saveAppData();
  assert.deepEqual(calls, [[
    'chatAppData_v8.6_alice',
    JSON.stringify({
      conversations: [{ id: 'initial-conv' }],
      folders: [],
      astras: [],
      personalMemories: [],
      memoryState: emptyMemoryState()
    })
  ]]);

  currentUser = { username: 'bob' };
  const nextConversations = [{ id: 'next-conv' }];
  const nextFolders = [{ id: 'folder-1' }];
  const nextAstras = [{ id: 'astra-1' }];
  const nextPersonalMemories = [{ id: 'memory-1' }];
  appDataStore.replaceAll({
    conversations: nextConversations,
    folders: nextFolders,
    astras: nextAstras,
    personalMemories: nextPersonalMemories
  });
  nextConversations.push({ id: 'pushed-conv' });
  nextFolders.push({ id: 'pushed-folder' });
  nextAstras.push({ id: 'pushed-astra' });
  nextPersonalMemories.push({ id: 'pushed-memory' });
  await persistence.saveAppData();

  const expectedSnapshot = {
    conversations: [{ id: 'next-conv' }, { id: 'pushed-conv' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }, { id: 'pushed-astra' }],
    personalMemories: [{ id: 'memory-1' }, { id: 'pushed-memory' }],
    memoryState: emptyMemoryState()
  };
  expectedSnapshot.folders.push({ id: 'pushed-folder' });

  assert.deepEqual(calls[1], [
    'chatAppData_v8.6_bob',
    JSON.stringify(expectedSnapshot)
  ]);
  assert.deepEqual(Object.keys(JSON.parse(calls[1][1])), [
    'conversations',
    'folders',
    'astras',
    'personalMemories',
    'memoryState'
  ]);
  assert.equal('activeConversationId' in JSON.parse(calls[1][1]), false);
});

test('production saveAppData wiring reads the store snapshot at save time', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.match(source, /getAppData:\s*\(\)\s*=>\s*runtimeAppDataStore\.getSnapshot\(\)/);
  assert.doesNotMatch(
    source,
    /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/
  );
});

test('queued persistence reads its snapshot only after entering the storage critical section', async () => {
  let release;
  let markEntered;
  const entered = new Promise(resolve => { markEntered = resolve; });
  const blocker = withWorkspaceStorageExclusive(() => {
    markEntered();
    return new Promise(resolve => { release = resolve; });
  });
  await entered;
  let snapshot = { conversations: [{ id: 'old' }] };
  const writes = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (key, value) => writes.push([key, JSON.parse(value)])
  });

  const saving = persistence.saveAppData();
  snapshot = { conversations: [{ id: 'new' }] };
  release();
  await blocker;
  await saving;

  assert.equal(writes[0][1].conversations[0].id, 'new');
});

test('missing user does not read key, app data, or storage adapter', async () => {
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => null,
    getAppData: () => assert.fail('missing user should not read app data'),
    getAppDataKey: () => assert.fail('missing user should not read app data key'),
    setItem: async () => assert.fail('missing user should not write storage')
  });

  await persistence.saveAppData();
});

test('successful local persistence hands the exact saved snapshot to shadow sync', async () => {
  const snapshot = { conversations: [{ id: 'conversation-1' }], folders: [], astras: [], personalMemories: [] };
  const calls = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => calls.push('saved'),
    onSaved: value => calls.push(value)
  });

  await persistence.saveAppData();

  assert.deepEqual(calls, ['saved', snapshot]);
});

test('cloud app data persistence atomically writes the workspace and dirty journal', async () => {
  const snapshot = { conversations: [{ id: 'conversation-1' }], folders: [], astras: [], personalMemories: [] };
  const stored = new Map();
  const atomicWrites = [];
  const observed = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_supabase:user-1',
    setItem: async () => assert.fail('cloud workspace and journal must use the atomic writer'),
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async entries => {
      atomicWrites.push(entries);
      for (const { key, value } of entries) stored.set(key, value);
    },
    createSyncRevision: () => 'revision-1',
    now: () => '2026-07-14T02:00:00.000Z',
    onSaved: (value, metadata) => observed.push([value, metadata])
  });

  await persistence.saveAppData();

  assert.equal(atomicWrites.length, 1);
  assert.equal(atomicWrites[0].length, 2);
  assert.deepEqual(atomicWrites[0][0], {
    key: 'chatAppData_v8.6_supabase:user-1',
    value: JSON.stringify(snapshot)
  });
  const journalEntry = atomicWrites[0][1];
  assert.equal(journalEntry.key, 'chatCloudSyncJournal_v1_supabase:user-1');
  assert.deepEqual(JSON.parse(journalEntry.value), {
    version: 1,
    username: 'supabase:user-1',
    workspaceRevision: 'revision-1',
    lastAcknowledgedRevision: null,
    dirty: true,
    dirtySince: '2026-07-14T02:00:00.000Z',
    dirtyEntities: {
      unknown: true,
      conversations: [],
      folders: [],
      astras: []
    },
    fullResyncRequired: true,
    lastRemoteWatermark: null,
    lastSuccessfulSyncAt: null,
    lastError: null
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0][0], snapshot);
  assert.equal(observed[0][1].revision, 'revision-1');
  assert.deepEqual(observed[0][1].journal, JSON.parse(journalEntry.value));
  assert.equal('immediate' in observed[0][1], false);
});

test('immediate cloud save marks both a new atomic write and an unchanged dirty requeue', async () => {
  const snapshot = { conversations: [{ id: 'conversation-1', deletedAt: '2026-07-14T02:00:00.000Z' }] };
  const stored = new Map();
  const atomicWrites = [];
  const observed = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_supabase:user-1',
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async entries => {
      atomicWrites.push(entries);
      for (const { key, value } of entries) stored.set(key, value);
    },
    createSyncRevision: () => 'revision-immediate',
    now: () => '2026-07-14T02:00:00.000Z',
    onSaved: (value, metadata) => observed.push([value, metadata])
  });

  await persistence.saveAppData({ immediateCloudSync: true });
  await persistence.saveAppData({ immediateCloudSync: true });

  assert.equal(atomicWrites.length, 1);
  assert.equal(observed.length, 2);
  assert.equal(observed[0][1].immediate, true);
  assert.equal(observed[1][1].immediate, true);
  assert.equal(observed[0][1].revision, 'revision-immediate');
  assert.equal(observed[1][1].revision, 'revision-immediate');
  assert.equal(observed[1][1].journal.dirty, true);
});

test('cloud persistence prefers one snapshot read for workspace and journal', async () => {
  const username = 'supabase:user-1';
  const workspaceKey = `chatAppData_v8.6_${username}`;
  const journalKey = `chatCloudSyncJournal_v1_${username}`;
  const readCalls = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => ({ conversations: [{ id: 'next' }] }),
    getAppDataKey: () => workspaceKey,
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async () => assert.fail('single reads must not split a related snapshot'),
    readItems: async keys => {
      readCalls.push(keys);
      return [JSON.stringify({ conversations: [{ id: 'previous' }] }), null];
    },
    setItemsAtomic: async () => {},
    createSyncRevision: () => 'revision-1'
  });

  await persistence.saveAppData();

  assert.deepEqual(readCalls, [[workspaceKey, journalKey]]);
});

test('cloud app data persistence preserves dirty age while assigning each save a newer revision', async () => {
  const stored = new Map();
  const revisions = ['revision-1', 'revision-2'];
  let snapshotVersion = 1;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => ({
      conversations: [{ id: `conversation-${snapshotVersion}` }],
      folders: [],
      astras: [],
      personalMemories: []
    }),
    getAppDataKey: () => 'chatAppData_v8.6_supabase:user-1',
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async entries => {
      for (const { key, value } of entries) stored.set(key, value);
    },
    createSyncRevision: () => revisions.shift(),
    now: (() => {
      const times = ['2026-07-14T02:00:00.000Z', '2026-07-14T03:00:00.000Z'];
      return () => times.shift();
    })()
  });

  await persistence.saveAppData();
  snapshotVersion = 2;
  await persistence.saveAppData();

  const journal = JSON.parse(stored.get('chatCloudSyncJournal_v1_supabase:user-1'));
  assert.equal(journal.workspaceRevision, 'revision-2');
  assert.equal(journal.dirtySince, '2026-07-14T02:00:00.000Z');
  assert.equal(journal.dirty, true);
});

test('cloud app data persistence unions entity-level dirty ids across saves', async () => {
  const username = 'supabase:user-1';
  const workspaceKey = `chatAppData_v8.6_${username}`;
  const journalKey = `chatCloudSyncJournal_v1_${username}`;
  let snapshot = {
    folders: [{ id: 'folder-1', name: 'Before', conversationIds: ['conversation-1'] }],
    conversations: [{ id: 'conversation-1', title: 'Before', messages: [] }],
    astras: [{ id: 'astra-1', name: 'Before' }],
    personalMemories: []
  };
  const stored = new Map([
    [workspaceKey, JSON.stringify(snapshot)],
    [journalKey, JSON.stringify({
      version: 1,
      username,
      workspaceRevision: 'clean-revision',
      lastAcknowledgedRevision: 'clean-revision',
      dirty: false,
      dirtySince: null,
      dirtyEntities: { unknown: false, conversations: [], folders: [], astras: [] },
      fullResyncRequired: false,
      lastRemoteWatermark: null,
      lastSuccessfulSyncAt: '2026-07-14T01:00:00.000Z',
      lastError: null
    })]
  ]);
  const revisions = ['folder-revision', 'astra-revision'];
  let atomicWrites = 0;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => snapshot,
    getAppDataKey: () => workspaceKey,
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async entries => {
      atomicWrites += 1;
      for (const { key, value } of entries) stored.set(key, value);
    },
    createSyncRevision: () => revisions.shift(),
    now: () => '2026-07-14T02:00:00.000Z'
  });

  snapshot = structuredClone(snapshot);
  snapshot.folders[0].name = 'Local folder edit';
  await persistence.saveAppData();
  snapshot = structuredClone(snapshot);
  snapshot.astras[0].name = 'Local Astra edit';
  await persistence.saveAppData();
  await persistence.saveAppData();

  const journal = JSON.parse(stored.get(journalKey));
  assert.equal(atomicWrites, 2, 'the exact third snapshot is still a write no-op');
  assert.equal(journal.workspaceRevision, 'astra-revision');
  assert.deepEqual(journal.dirtyEntities, {
    unknown: false,
    conversations: [],
    folders: ['folder-1'],
    astras: ['astra-1']
  });
});

test('unchanged clean cloud workspace is a storage and sync no-op', async () => {
  const snapshot = { conversations: [], folders: [], astras: [], personalMemories: [] };
  const username = 'supabase:user-1';
  const workspaceKey = `chatAppData_v8.6_${username}`;
  const journalKey = `chatCloudSyncJournal_v1_${username}`;
  const stored = new Map([
    [workspaceKey, JSON.stringify(snapshot)],
    [journalKey, JSON.stringify({
      version: 1,
      username,
      workspaceRevision: 'revision-1',
      lastAcknowledgedRevision: 'revision-1',
      dirty: false,
      dirtySince: null,
      fullResyncRequired: false,
      lastRemoteWatermark: null,
      lastSuccessfulSyncAt: '2026-07-14T02:00:00.000Z',
      lastError: null
    })]
  ]);
  let atomicWrites = 0;
  let notifications = 0;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => snapshot,
    getAppDataKey: () => workspaceKey,
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async () => { atomicWrites += 1; },
    createSyncRevision: () => assert.fail('a no-op must not create a revision'),
    onSaved: () => { notifications += 1; }
  });

  await persistence.saveAppData();

  assert.equal(atomicWrites, 0);
  assert.equal(notifications, 0);
});

test('unchanged dirty cloud workspace requeues its existing revision without another write', async () => {
  const snapshot = { conversations: [], folders: [], astras: [], personalMemories: [] };
  const username = 'supabase:user-1';
  const workspaceKey = `chatAppData_v8.6_${username}`;
  const journalKey = `chatCloudSyncJournal_v1_${username}`;
  const journal = {
    version: 1,
    username,
    workspaceRevision: 'revision-pending',
    lastAcknowledgedRevision: null,
    dirty: true,
    dirtySince: '2026-07-14T02:00:00.000Z',
    fullResyncRequired: false,
    lastRemoteWatermark: null,
    lastSuccessfulSyncAt: null,
    lastError: null
  };
  const stored = new Map([
    [workspaceKey, JSON.stringify(snapshot)],
    [journalKey, JSON.stringify(journal)]
  ]);
  let atomicWrites = 0;
  const observed = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username, authProvider: 'supabase' }),
    getAppData: () => snapshot,
    getAppDataKey: () => workspaceKey,
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async key => stored.get(key) ?? null,
    setItemsAtomic: async () => { atomicWrites += 1; },
    createSyncRevision: () => assert.fail('an unchanged dirty workspace must preserve its revision'),
    onSaved: (value, metadata) => observed.push([value, metadata])
  });

  await persistence.saveAppData();

  assert.equal(atomicWrites, 0);
  assert.equal(observed.length, 1);
  assert.equal(observed[0][0], snapshot);
  assert.equal(observed[0][1].revision, 'revision-pending');
  assert.deepEqual(observed[0][1].journal, {
    ...journal,
    dirtyEntities: {
      unknown: true,
      conversations: [],
      folders: [],
      astras: []
    }
  });
});

test('local accounts keep the legacy single-item persistence path', async () => {
  const calls = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice', authProvider: 'local' }),
    getAppData: () => ({ conversations: [] }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (...args) => calls.push(args),
    readItem: async () => assert.fail('local account must not read a cloud journal'),
    setItemsAtomic: async () => assert.fail('local account must not write a cloud journal')
  });

  await persistence.saveAppData();
  assert.deepEqual(calls, [[
    'chatAppData_v8.6_alice',
    JSON.stringify({ conversations: [] })
  ]]);
});

test('atomic cloud persistence failure rejects before notifying shadow sync', async () => {
  const atomicError = new Error('atomic write failed');
  let notified = false;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => ({ conversations: [] }),
    getAppDataKey: () => 'chatAppData_v8.6_supabase:user-1',
    setItem: async () => assert.fail('cloud writes must be atomic'),
    setItemsAtomic: async () => { throw atomicError; },
    createSyncRevision: () => 'revision-1',
    onSaved: () => { notified = true; }
  });

  await assert.rejects(() => persistence.saveAppData(), atomicError);
  assert.equal(notified, false);
});

test('journal read failure falls back to a durable full-resync marker', async () => {
  const warnings = [];
  let journal;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'supabase:user-1', authProvider: 'supabase' }),
    getAppData: () => ({ conversations: [] }),
    getAppDataKey: () => 'chatAppData_v8.6_supabase:user-1',
    setItem: async () => assert.fail('cloud writes must be atomic'),
    readItem: async () => { throw new Error('journal read failed'); },
    setItemsAtomic: async entries => {
      journal = JSON.parse(entries[1].value);
    },
    createSyncRevision: () => 'revision-1',
    now: () => '2026-07-14T02:00:00.000Z',
    logger: { warn: (...args) => warnings.push(args) }
  });

  await persistence.saveAppData();

  assert.equal(journal.dirty, true);
  assert.equal(journal.fullResyncRequired, true);
  assert.equal(journal.workspaceRevision, 'revision-1');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /full resync/i);
});

test('local app data persistence survives a failed shadow sync notification', async () => {
  const snapshot = { conversations: [{ id: 'conversation-1' }], folders: [], astras: [], personalMemories: [] };
  const calls = [];
  const warnings = [];
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => snapshot,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (key, value) => calls.push([key, JSON.parse(value)]),
    onSaved: async () => { throw new Error('sync bridge failed'); },
    logger: { warn: (...args) => warnings.push(args) }
  });

  await persistence.saveAppData();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], snapshot);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /cloud conversation sync/i);
});

test('save notification runs after releasing the workspace storage critical section', async () => {
  let notificationEnteredStorage = false;
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice', authProvider: 'local' }),
    getAppData: () => ({ conversations: [] }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => {},
    onSaved: async () => withWorkspaceStorageExclusive(async () => {
      notificationEnteredStorage = true;
    })
  });

  await persistence.saveAppData();

  assert.equal(notificationEnteredStorage, true);
});

test('serialized app data persistence preserves rejection and stringify error boundaries', async () => {
  const setItemError = new Error('storage failed');
  const rejectingPersistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => ({
      conversations: [],
      folders: [],
      astras: [],
      personalMemories: []
    }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => { throw setItemError; }
  });

  await assert.rejects(() => rejectingPersistence.saveAppData(), setItemError);

  const circular = {};
  circular.self = circular;
  const circularPersistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => ({
      conversations: [circular],
      folders: [],
      astras: [],
      personalMemories: []
    }),
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async () => assert.fail('circular app data should fail before storage write')
  });

  await assert.rejects(
    () => circularPersistence.saveAppData(),
    /circular structure|Converting circular/i
  );
});

test('serialized app data persistence exposes only saveAppData and avoids storage reader ownership', () => {
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => null,
    getAppData: () => ({}),
    getAppDataKey: () => '',
    setItem: async () => {}
  });
  const source = readSource('src/app/runtime/kernel/app-data-persistence.js');

  assert.deepEqual(Object.keys(persistence), ['saveAppData']);
  assert.equal(typeof persistence.saveAppData, 'function');
  assert.match(source, /export\s+function\s+createLegacyRuntimeAppDataPersistence/);
  assert.doesNotMatch(source, /loadAppData|getItem|removeItem|openDB|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
});
