import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOUD_SYNC_JOURNAL_KEY_PREFIX,
  CLOUD_SYNC_JOURNAL_VERSION,
  acknowledgeCloudSyncJournal,
  createCloudSyncRevision,
  createFullResyncCloudSyncJournal,
  diffCloudSyncWorkspaceEntities,
  getCloudSyncJournalKey,
  markCloudSyncJournalDirty,
  mergeCloudSyncDirtyEntities,
  normalizeCloudSyncJournal,
  requireCloudSyncFullResync
} from '../src/app/sync/cloud-sync-journal.js';

const username = 'supabase:user-1';
const firstRevision = '11111111-1111-4111-8111-111111111111';
const secondRevision = '22222222-2222-4222-8222-222222222222';

test('cloud sync journal key is explicitly versioned and account scoped', () => {
  assert.equal(CLOUD_SYNC_JOURNAL_VERSION, 1);
  assert.equal(CLOUD_SYNC_JOURNAL_KEY_PREFIX, 'chatCloudSyncJournal_v1_');
  assert.equal(getCloudSyncJournalKey(username), 'chatCloudSyncJournal_v1_supabase:user-1');
  assert.throws(() => getCloudSyncJournalKey(''), /requires a username/i);
});

test('missing, empty, corrupt, and unknown-version journals require a full resync', () => {
  for (const value of [
    null,
    '',
    '{broken-json',
    { version: 0, username, dirty: false, fullResyncRequired: false },
    { version: 2, username, dirty: false, fullResyncRequired: false }
  ]) {
    assert.deepEqual(normalizeCloudSyncJournal(value, { username }),
      createFullResyncCloudSyncJournal({ username }));
  }
});

test('journal normalization refuses an unproven clean state and cross-account state', () => {
  const unprovenClean = {
    version: 1,
    username,
    workspaceRevision: firstRevision,
    lastAcknowledgedRevision: null,
    dirty: false,
    dirtySince: null,
    dirtyEntities: {
      unknown: false,
      conversations: [],
      folders: [],
      astras: []
    },
    fullResyncRequired: false
  };
  const wrongAccount = {
    ...unprovenClean,
    username: 'supabase:someone-else',
    lastAcknowledgedRevision: firstRevision
  };

  assert.equal(normalizeCloudSyncJournal(unprovenClean, { username }).fullResyncRequired, true);
  const normalizedWrongAccount = normalizeCloudSyncJournal(wrongAccount, { username });
  assert.equal(normalizedWrongAccount.username, username);
  assert.equal(normalizedWrongAccount.fullResyncRequired, true);
  assert.equal(normalizedWrongAccount.workspaceRevision, null);
});

test('valid journal normalization preserves only supported safe fields', () => {
  const normalized = normalizeCloudSyncJournal(JSON.stringify({
    version: 1,
    username,
    workspaceRevision: firstRevision,
    lastAcknowledgedRevision: firstRevision,
    dirty: false,
    dirtySince: '2026-07-14T00:00:00.000Z',
    fullResyncRequired: false,
    lastRemoteWatermark: 42,
    lastSuccessfulSyncAt: '2026-07-14T01:00:00.000Z',
    lastError: '',
    unsupported: 'discard-me'
  }), { username });

  assert.deepEqual(normalized, {
    version: 1,
    username,
    workspaceRevision: firstRevision,
    lastAcknowledgedRevision: firstRevision,
    dirty: false,
    dirtySince: null,
    dirtyEntities: {
      unknown: false,
      conversations: [],
      folders: [],
      astras: []
    },
    fullResyncRequired: false,
    lastRemoteWatermark: 42,
    lastSuccessfulSyncAt: '2026-07-14T01:00:00.000Z',
    lastError: null
  });
});

test('marking a journal dirty creates a revision and preserves the first dirty timestamp', () => {
  const initiallyDirty = markCloudSyncJournalDirty(null, {
    username,
    revision: firstRevision,
    now: () => '2026-07-14T02:00:00.000Z'
  });
  const changedAgain = markCloudSyncJournalDirty(initiallyDirty, {
    username,
    revision: secondRevision,
    now: () => '2026-07-14T03:00:00.000Z'
  });

  assert.equal(initiallyDirty.fullResyncRequired, true);
  assert.equal(initiallyDirty.dirty, true);
  assert.equal(changedAgain.workspaceRevision, secondRevision);
  assert.equal(changedAgain.dirty, true);
  assert.equal(changedAgain.dirtySince, '2026-07-14T02:00:00.000Z');
  assert.equal(changedAgain.fullResyncRequired, true);
});

test('legacy dirty journals remain readable but mark entity attribution unknown', () => {
  const normalized = normalizeCloudSyncJournal({
    version: 1,
    username,
    workspaceRevision: firstRevision,
    lastAcknowledgedRevision: null,
    dirty: true,
    dirtySince: '2026-07-14T02:00:00.000Z',
    fullResyncRequired: false
  }, { username });

  assert.deepEqual(normalized.dirtyEntities, {
    unknown: true,
    conversations: [],
    folders: [],
    astras: []
  });
});

test('workspace entity diffs ignore derived folder membership and union dirty ids', () => {
  const before = {
    folders: [{ id: 'folder-1', name: 'Before', conversationIds: ['conversation-1'] }],
    conversations: [{ id: 'conversation-1', title: 'Before', messages: [] }],
    astras: [{ id: 'astra-1', name: 'Before' }]
  };
  const afterFolder = structuredClone(before);
  afterFolder.folders[0].name = 'After';
  afterFolder.folders[0].conversationIds = [];
  const afterConversation = structuredClone(afterFolder);
  afterConversation.conversations[0].title = 'After';

  const folderDiff = diffCloudSyncWorkspaceEntities(before, afterFolder);
  const conversationDiff = diffCloudSyncWorkspaceEntities(afterFolder, afterConversation);
  assert.deepEqual(folderDiff, {
    unknown: false,
    conversations: [],
    folders: ['folder-1'],
    astras: []
  });
  assert.deepEqual(mergeCloudSyncDirtyEntities(folderDiff, conversationDiff), {
    unknown: false,
    conversations: ['conversation-1'],
    folders: ['folder-1'],
    astras: []
  });
  assert.equal(diffCloudSyncWorkspaceEntities(null, afterFolder).unknown, true);
});

test('an older acknowledgement cannot clear a newer dirty revision', () => {
  const first = markCloudSyncJournalDirty(null, {
    username,
    revision: firstRevision,
    now: () => '2026-07-14T02:00:00.000Z'
  });
  const second = markCloudSyncJournalDirty(first, {
    username,
    revision: secondRevision,
    now: () => '2026-07-14T03:00:00.000Z'
  });
  const result = acknowledgeCloudSyncJournal(second, firstRevision, {
    username,
    acknowledgedAt: () => '2026-07-14T04:00:00.000Z',
    remoteWatermark: 100,
    fullResyncCompleted: true
  });

  assert.equal(result.acknowledged, false);
  assert.deepEqual(result.journal, second);
  assert.equal(result.journal.dirty, true);
  assert.equal(result.journal.fullResyncRequired, true);
  assert.equal(result.journal.lastRemoteWatermark, null);
});

test('a matching acknowledgement clears only its revision and requires explicit full-resync completion', () => {
  const dirty = markCloudSyncJournalDirty(null, {
    username,
    revision: firstRevision,
    now: () => '2026-07-14T02:00:00.000Z'
  });
  const ordinaryAck = acknowledgeCloudSyncJournal(dirty, firstRevision, {
    username,
    acknowledgedAt: () => '2026-07-14T04:00:00.000Z',
    remoteWatermark: 'watermark-10'
  });

  assert.equal(ordinaryAck.acknowledged, true);
  assert.equal(ordinaryAck.journal.dirty, false);
  assert.equal(ordinaryAck.journal.dirtySince, null);
  assert.equal(ordinaryAck.journal.lastAcknowledgedRevision, firstRevision);
  assert.equal(ordinaryAck.journal.fullResyncRequired, true);
  assert.equal(ordinaryAck.journal.lastRemoteWatermark, 'watermark-10');
  assert.equal(ordinaryAck.journal.lastSuccessfulSyncAt, '2026-07-14T04:00:00.000Z');

  const fullAck = acknowledgeCloudSyncJournal(dirty, firstRevision, {
    username,
    acknowledgedAt: () => '2026-07-14T04:00:01.000Z',
    fullResyncCompleted: true
  });
  assert.equal(fullAck.journal.fullResyncRequired, false);
});

test('requiring recovery never clears an existing dirty revision', () => {
  const dirty = markCloudSyncJournalDirty(null, {
    username,
    revision: firstRevision,
    now: () => '2026-07-14T02:00:00.000Z'
  });
  const recovery = requireCloudSyncFullResync(dirty, {
    username,
    lastError: 'verification failed'
  });

  assert.equal(recovery.dirty, true);
  assert.equal(recovery.workspaceRevision, firstRevision);
  assert.equal(recovery.fullResyncRequired, true);
  assert.equal(recovery.lastError, 'verification failed');
});

test('revision generation uses the injected cryptographic UUID provider', () => {
  assert.equal(createCloudSyncRevision({
    cryptoProvider: { randomUUID: () => firstRevision }
  }), firstRevision);
});
