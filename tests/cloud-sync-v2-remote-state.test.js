import assert from 'node:assert/strict';
import test from 'node:test';

import { createRemoteBaseline } from '../src/app/sync/cloud-sync-v2-baseline.js';

const moduleUrl = new URL('../src/app/sync/cloud-sync-v2-remote-state.js', import.meta.url);
const remoteStateModule = await import(moduleUrl).catch(() => null);

function subject() {
  assert.ok(remoteStateModule, 'cloud-sync-v2-remote-state module must exist');
  return remoteStateModule;
}

const userId = '11111111-1111-4111-8111-111111111111';
const username = 'alice';

function cleanJournal(watermark = '10') {
  return {
    version: 1,
    username,
    workspaceRevision: 'revision-1',
    lastAcknowledgedRevision: 'revision-1',
    dirty: false,
    dirtySince: null,
    dirtyEntities: { unknown: false, conversations: [], folders: [], astras: [] },
    fullResyncRequired: false,
    lastRemoteWatermark: watermark,
    lastSuccessfulSyncAt: '2026-07-16T00:00:00.000Z',
    lastError: null
  };
}

function createStorageFixture(initialEntries = []) {
  const values = new Map(initialEntries);
  const atomicWrites = [];
  return {
    values,
    atomicWrites,
    storage: {
      getItem: async key => values.get(key) ?? null,
      readItems: async keys => keys.map(key => values.get(key) ?? null),
      setItem: async (key, value) => { values.set(key, value); },
      setItemsAtomic: async entries => {
        atomicWrites.push(entries);
        for (const { key, value } of entries) values.set(key, value);
      }
    }
  };
}

function emptyRows() {
  return { folders: [], conversations: [], messages: [], astras: [], tombstones: [] };
}

test('a trusted empty delta returns the persisted baseline without rewriting storage', async () => {
  const { createPersistentWorkspaceRemoteReader, getCloudSyncRemoteBaselineKey } = subject();
  const baselineKey = getCloudSyncRemoteBaselineKey(username);
  const journalKey = 'chatCloudSyncJournal_v1_alice';
  const baseline = createRemoteBaseline({ userId, watermark: '10', rows: emptyRows() });
  const baselineRaw = JSON.stringify(baseline);
  const journalRaw = JSON.stringify(cleanJournal('10'));
  const fixture = createStorageFixture([
    [baselineKey, baselineRaw],
    [journalKey, journalRaw]
  ]);
  const calls = [];
  const repository = {
    fetchWorkspaceDelta: async afterSeq => {
      calls.push(['delta', afterSeq]);
      return {
        pages: [{ changes: [], next_seq: '10', has_more: false }],
        nextSeq: '10',
        rowCount: 0
      };
    },
    fetchWorkspace: async () => assert.fail('valid baselines must not fetch full workspace tables'),
    fetchTombstones: async () => assert.fail('valid baselines must not fetch full tombstone tables')
  };
  const reader = createPersistentWorkspaceRemoteReader({
    repository,
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });

  const state = await reader.read();

  assert.deepEqual(calls, [['delta', '10']]);
  assert.equal(state.deltaSupported, true);
  assert.equal(state.rowCount, 0);
  assert.deepEqual(state.rows, { folders: [], conversations: [], messages: [], astras: [] });
  assert.deepEqual(state.tombstones, []);
  assert.equal(fixture.atomicWrites.length, 0);
  assert.equal(fixture.values.get(baselineKey), baselineRaw);
  assert.equal(fixture.values.get(journalKey), journalRaw);
});

test('delta pages are applied completely before one baseline commit', async () => {
  const { createPersistentWorkspaceRemoteReader, getCloudSyncRemoteBaselineKey } = subject();
  const baselineKey = getCloudSyncRemoteBaselineKey(username);
  const journalKey = 'chatCloudSyncJournal_v1_alice';
  const baseline = createRemoteBaseline({ userId, watermark: '5', rows: emptyRows() });
  const fixture = createStorageFixture([
    [baselineKey, JSON.stringify(baseline)],
    [journalKey, JSON.stringify(cleanJournal('5'))]
  ]);
  const reader = createPersistentWorkspaceRemoteReader({
    repository: {
      fetchWorkspaceDelta: async () => ({
        pages: [
          {
            changes: [{
              collection: 'folders',
              sync_seq: 6,
              row: { id: 'folder-1', user_id: userId, sync_seq: 6 }
            }],
            next_seq: 6,
            has_more: true
          },
          {
            changes: [{
              collection: 'conversations',
              sync_seq: 7,
              row: { id: 'conversation-1', user_id: userId, folder_id: 'folder-1', sync_seq: 7 }
            }],
            next_seq: 7,
            has_more: false
          }
        ],
        nextSeq: '7',
        rowCount: 2
      })
    },
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });

  const state = await reader.read();

  assert.equal(state.pageCount, 2);
  assert.equal(state.rows.folders[0].id, 'folder-1');
  assert.equal(state.rows.conversations[0].id, 'conversation-1');
  assert.equal(JSON.parse(fixture.values.get(baselineKey)).watermark, '7');
  assert.equal(fixture.atomicWrites.length, 1);
});

test('a missing or mismatched baseline rebuilds safely from sequence zero', async () => {
  const { createPersistentWorkspaceRemoteReader, getCloudSyncRemoteBaselineKey } = subject();
  const baselineKey = getCloudSyncRemoteBaselineKey(username);
  const journalKey = 'chatCloudSyncJournal_v1_alice';
  const wrongOwnerBaseline = createRemoteBaseline({
    userId: 'another-user',
    watermark: '99',
    rows: emptyRows()
  });
  const fixture = createStorageFixture([
    [baselineKey, JSON.stringify(wrongOwnerBaseline)],
    [journalKey, JSON.stringify(cleanJournal('99'))]
  ]);
  const starts = [];
  const reader = createPersistentWorkspaceRemoteReader({
    repository: {
      fetchWorkspaceDelta: async afterSeq => {
        starts.push(afterSeq);
        return {
          pages: [{ changes: [], next_seq: '0', has_more: false }],
          nextSeq: '0',
          rowCount: 0
        };
      }
    },
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });

  const state = await reader.read();

  assert.deepEqual(starts, ['0']);
  assert.equal(state.baselineReset, true);
  assert.equal(JSON.parse(fixture.values.get(baselineKey)).userId, userId);
});

test('missing delta capability falls back once without mutating persisted cursors', async () => {
  const { createPersistentWorkspaceRemoteReader, getCloudSyncRemoteBaselineKey } = subject();
  const baselineKey = getCloudSyncRemoteBaselineKey(username);
  const journalKey = 'chatCloudSyncJournal_v1_alice';
  const baselineRaw = JSON.stringify(createRemoteBaseline({ userId, watermark: '10', rows: emptyRows() }));
  const journalRaw = JSON.stringify(cleanJournal('10'));
  const fixture = createStorageFixture([
    [baselineKey, baselineRaw],
    [journalKey, journalRaw]
  ]);
  const calls = [];
  const reader = createPersistentWorkspaceRemoteReader({
    repository: {
      fetchWorkspaceDelta: async () => {
        const error = new Error('missing');
        error.code = 'ASTRA_WORKSPACE_DELTA_UNSUPPORTED';
        throw error;
      },
      fetchTombstones: async () => { calls.push('tombstones'); return [{ entity_id: 'deleted' }]; },
      fetchWorkspace: async () => {
        calls.push('workspace');
        return { folders: [], conversations: [], messages: [], astras: [] };
      }
    },
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });

  const state = await reader.read();

  assert.deepEqual(calls, ['tombstones', 'workspace']);
  assert.equal(state.deltaSupported, false);
  assert.equal(state.snapshotFallback, true);
  assert.equal(state.fallbackReason, 'delta-unsupported');
  assert.equal(fixture.values.get(baselineKey), baselineRaw);
  assert.equal(fixture.values.get(journalKey), journalRaw);
  assert.equal(fixture.atomicWrites.length, 0);
});

test('failed or stopped delta reads never persist a new baseline', async () => {
  const { createPersistentWorkspaceRemoteReader } = subject();
  const fixture = createStorageFixture();
  const networkError = new Error('offline');
  const failingReader = createPersistentWorkspaceRemoteReader({
    repository: { fetchWorkspaceDelta: async () => { throw networkError; } },
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });
  await assert.rejects(() => failingReader.read(), error => error === networkError);
  assert.equal(fixture.atomicWrites.length, 0);

  const stoppedReader = createPersistentWorkspaceRemoteReader({
    repository: {
      fetchWorkspaceDelta: async () => ({
        pages: [{ changes: [], next_seq: '0', has_more: false }],
        nextSeq: '0',
        rowCount: 0
      })
    },
    storage: fixture.storage,
    userId,
    username,
    withLock: task => task()
  });
  await assert.rejects(
    () => stoppedReader.read({ assertCurrent: () => { throw new Error('stopped'); } }),
    /stopped/
  );
  assert.equal(fixture.atomicWrites.length, 0);
});
