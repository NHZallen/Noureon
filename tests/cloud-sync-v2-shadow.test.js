import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  createConversationShadowRepository,
  createConversationShadowSync,
  initializeConversationShadowSync
} from '../src/app/sync/cloud-sync-v2-shadow.js';
import {
  deterministicUuid,
  encodeWorkspaceConversationShadow
} from '../src/app/sync/cloud-sync-v2-codecs.js';
import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { withWorkspaceStorageExclusive } from '../src/app/sync/workspace-storage-coordinator.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const astraId = '44444444-4444-4444-8444-444444444444';
const workspace = {
  folders: [{
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Synced',
    color: 'blue',
    icon: 'star',
    textColor: 'white'
  }],
  conversations: [{
    id: conversationId,
    title: 'Local survives',
    model: 'model-1',
    provider: 'provider-1',
    folderId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-07-06T01:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  }]
};
const laterConversationId = '66666666-6666-4666-8666-666666666666';

function workspaceWithLaterConversation() {
  return {
    ...structuredClone(workspace),
    conversations: [
      ...structuredClone(workspace.conversations),
      {
        id: laterConversationId,
        title: 'Saved while sync starts',
        createdAt: '2026-07-06T03:00:00.000Z',
        messages: [{ role: 'user', parts: [{ text: 'Newest local data' }] }]
      }
    ]
  };
}

async function remoteRowsFor(localWorkspace = workspace) {
  const encoded = await encodeWorkspaceConversationShadow({
    workspace: localWorkspace,
    userId,
    cryptoProvider: webcrypto
  });
  return {
    folders: encoded.folders.map(row => ({ ...row })),
    conversations: encoded.conversations.map(row => ({
      ...row,
      updated_at: row.created_at
    })),
    messages: encoded.messages.map(row => ({
      ...row,
      updated_at: row.created_at
    })),
    astras: encoded.astras.map(row => ({
      ...row,
      updated_at: '2026-07-06T00:00:00.000Z',
      deleted_at: null
    }))
  };
}

test('shadow initialization refreshes, writes local, then uploads and verifies', async () => {
  const calls = [];
  const repository = {
    probe: async () => calls.push(['probe']),
    fetchTombstones: async () => { calls.push(['tombstones']); return []; },
    fetchWorkspace: async () => { calls.push(['fetch']); return { folders: [], conversations: [], messages: [] }; },
    setMigrationState: async (...args) => calls.push(['state', ...args]),
    upsertFolders: async rows => calls.push(['folders', rows]),
    upsertConversations: async rows => calls.push(['conversations', rows]),
    upsertMessages: async rows => calls.push(['messages', rows]),
    verify: async rows => { calls.push(['verify', rows]); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => { calls.push(['read']); return workspace; },
    writeWorkspace: async value => calls.push(['write', value]),
    userId,
    cryptoProvider: webcrypto,
    now: () => '2026-07-06T02:00:00.000Z'
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(status.conversations, 1);
  assert.equal(status.messages, 1);
  assert.deepEqual(calls.map(call => call[0]), [
    'probe', 'read', 'tombstones', 'fetch', 'write', 'state', 'folders', 'conversations', 'messages', 'verify', 'state'
  ]);
  assert.equal(calls[5][1], 'shadow');
  assert.equal(calls.at(-1)[1], 'ready');
});

test('trusted identical baseline skips every upsert but still verifies the full encoded workspace', async () => {
  const remoteRows = await remoteRowsFor();
  const upserts = [];
  const migrationStates = [];
  const verified = [];
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async state => migrationStates.push(state),
    upsertFolders: async rows => upserts.push(['folders', rows]),
    upsertConversations: async rows => upserts.push(['conversations', rows]),
    upsertMessages: async rows => upserts.push(['messages', rows]),
    upsertAstras: async rows => upserts.push(['astras', rows]),
    verify: async rows => { verified.push(rows); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    commitWorkspace: async () => structuredClone(workspace),
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(status.uploadedRows, 0);
  assert.equal(status.fullConversations, 1);
  assert.equal(status.fullMessages, 1);
  assert.equal(status.fullFolders, 1);
  assert.equal(status.fullUpload, false);
  assert.equal(status.baselineTrusted, true);
  assert.deepEqual(upserts, []);
  assert.deepEqual(migrationStates, []);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].conversations.length, 1);
  assert.equal(verified[0].messages.length, 1);
  assert.equal(verified[0].folders.length, 1);
});

test('trusted baseline uploads only one new message and then only one new folder', async () => {
  const remoteRows = await remoteRowsFor();
  const uploads = [];
  const verifies = [];
  let scheduled;
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async state => uploads.push(['state', state]),
    upsertFolders: async rows => uploads.push(['folders', rows]),
    upsertConversations: async rows => uploads.push(['conversations', rows]),
    upsertMessages: async rows => uploads.push(['messages', rows]),
    upsertAstras: async rows => uploads.push(['astras', rows]),
    verify: async rows => { verifies.push(rows); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    canSkipInitialUpload: () => true,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {}
  });
  assert.equal((await sync.initialize()).uploadSkipped, true);

  const withNewMessage = structuredClone(workspace);
  withNewMessage.conversations[0].messages.push({
    role: 'model',
    parts: [{ text: 'One new message' }]
  });
  assert.equal(sync.captureWorkspace(withNewMessage), true);
  await scheduled();
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [['messages', 1]]);
  assert.equal(verifies.at(-1).messages.length, 2);
  assert.equal(sync.getStatus().uploadedMessages, 1);

  uploads.length = 0;
  const withNewFolder = structuredClone(withNewMessage);
  withNewFolder.folders.push({
    id: '99999999-9999-4999-8999-999999999999',
    name: 'One new folder',
    color: 'gray',
    icon: 'folder',
    textColor: 'gray'
  });
  assert.equal(sync.captureWorkspace(withNewFolder), true);
  await scheduled();
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [['folders', 1]]);
  assert.equal(verifies.at(-1).folders.length, 2);
  assert.equal(sync.getStatus().uploadedFolders, 1);

  uploads.length = 0;
  const withNewAstra = structuredClone(withNewFolder);
  withNewAstra.astras = [{
    id: astraId,
    name: 'One new Noura',
    description: '',
    instructions: 'Help safely',
    metadata: {}
  }];
  assert.equal(sync.captureWorkspace(withNewAstra), true);
  await scheduled();
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [['astras', 1]]);

  uploads.length = 0;
  assert.equal(sync.captureWorkspace(structuredClone(withNewAstra)), true);
  await scheduled();
  assert.deepEqual(uploads, []);
  assert.equal(sync.getStatus().uploadedRows, 0);
});

test('journal fullResyncRequired forces a full upload and migration state transition', async () => {
  const remoteRows = await remoteRowsFor();
  const uploads = [];
  const states = [];
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async state => states.push(state),
    upsertFolders: async rows => uploads.push(['folders', rows]),
    upsertConversations: async rows => uploads.push(['conversations', rows]),
    upsertMessages: async rows => uploads.push(['messages', rows]),
    upsertAstras: async rows => uploads.push(['astras', rows]),
    verify: async () => true
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    writeWorkspace: async () => {},
    readCaptureState: async ({ workspace: captured }) => ({
      workspace: captured,
      revision: 'full-resync-revision',
      journal: { fullResyncRequired: true }
    }),
    acknowledgeCapture: async () => ({ acknowledged: true }),
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(status.fullUpload, true);
  assert.equal(status.fullUploadReason, 'journal-full-resync');
  assert.equal(status.uploadedRows, 3);
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [
    ['folders', 1],
    ['conversations', 1],
    ['messages', 1]
  ]);
  assert.deepEqual(states, ['shadow', 'ready']);
});

test('trusted baseline reconciles message IDs by conversation and sequence before delta and verification', async () => {
  const remoteRows = await remoteRowsFor();
  const remoteMessageId = '88888888-8888-4888-8888-888888888888';
  remoteRows.messages[0].id = remoteMessageId;
  const messageUploads = [];
  let verified;
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async rows => messageUploads.push(rows),
    upsertAstras: async () => {},
    verify: async rows => { verified = rows; return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    commitWorkspace: async () => structuredClone(workspace),
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(status.uploadedMessages, 0);
  assert.deepEqual(messageUploads, []);
  assert.equal(verified.messages[0].id, remoteMessageId);
});

test('ambiguous baseline message sequences stop conservatively without upload, verify, or ACK', async () => {
  const remoteRows = await remoteRowsFor();
  remoteRows.messages.push({
    ...remoteRows.messages[0],
    id: '77777777-7777-4777-8777-777777777777'
  });
  const calls = [];
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async () => calls.push('state'),
    upsertFolders: async () => calls.push('folders'),
    upsertConversations: async () => calls.push('conversations'),
    upsertMessages: async () => calls.push('messages'),
    upsertAstras: async () => calls.push('astras'),
    verify: async () => { calls.push('verify'); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    commitWorkspace: async () => structuredClone(workspace),
    readCaptureState: async ({ workspace: captured }) => ({
      workspace: captured,
      revision: 'ambiguous-revision',
      journal: { dirty: true, fullResyncRequired: false }
    }),
    acknowledgeCapture: async () => { calls.push('ack'); return { acknowledged: true }; },
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.equal(status.code, 'ASTRA_MESSAGE_ID_RECONCILIATION_AMBIGUOUS');
  assert.deepEqual(calls, []);
});

test('a newer revision saved during upload is retried as a second delta before acknowledgement', async () => {
  const remoteRows = await remoteRowsFor();
  const firstWorkspace = structuredClone(workspace);
  firstWorkspace.conversations[0].title = 'First revision';
  const secondWorkspace = structuredClone(workspace);
  secondWorkspace.conversations[0].title = 'Newer revision';
  const scheduled = [];
  const uploadedTitles = [];
  const acknowledged = [];
  let captureRead = 0;
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async rows => uploadedTitles.push(...rows.map(row => row.title)),
    upsertMessages: async () => {},
    upsertAstras: async () => {},
    verify: async () => true
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    commitWorkspace: async () => structuredClone(workspace),
    readCaptureState: async () => {
      captureRead += 1;
      if (captureRead === 1) {
        return {
          workspace: structuredClone(workspace),
          journal: { dirty: false, fullResyncRequired: false },
          revision: null
        };
      }
      if (captureRead === 2) {
        return {
          workspace: structuredClone(firstWorkspace),
          journal: { dirty: true, fullResyncRequired: false },
          revision: 'revision-1'
        };
      }
      return {
        workspace: structuredClone(secondWorkspace),
        journal: { dirty: true, fullResyncRequired: false },
        revision: 'revision-2'
      };
    },
    acknowledgeCapture: async ({ attemptedRevision }) => {
      acknowledged.push(attemptedRevision);
      return { acknowledged: attemptedRevision === 'revision-2' };
    },
    canSkipInitialUpload: ({ journal }) => journal?.dirty === false,
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    userId,
    cryptoProvider: webcrypto
  });
  assert.equal((await sync.initialize()).uploadSkipped, true);

  assert.equal(sync.captureWorkspace(firstWorkspace), true);
  await scheduled.shift()();
  assert.equal(scheduled.length, 1);
  await scheduled.shift()();

  assert.deepEqual(uploadedTitles, ['First revision', 'Newer revision']);
  assert.deepEqual(acknowledged, ['revision-1', 'revision-2']);
  assert.equal(sync.getStatus().journalAcknowledged, true);
  assert.equal(sync.getStatus().fullUpload, false);
  assert.equal(sync.getStatus().uploadedConversations, 1);
});

test('verification failure never ACKs, invalidates baseline, and makes the next capture full', async () => {
  const remoteRows = await remoteRowsFor();
  const recoveredRemoteMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  remoteRows.messages[0].id = recoveredRemoteMessageId;
  const changedWorkspace = structuredClone(workspace);
  changedWorkspace.conversations[0].title = 'Needs verification';
  const scheduled = [];
  const uploads = [];
  const states = [];
  const acknowledged = [];
  const verifyResults = [false, true];
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async state => states.push(state),
    upsertFolders: async rows => uploads.push(['folders', rows]),
    upsertConversations: async rows => uploads.push(['conversations', rows]),
    upsertMessages: async rows => uploads.push(['messages', rows]),
    upsertAstras: async rows => uploads.push(['astras', rows]),
    verify: async () => verifyResults.shift()
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    commitWorkspace: async () => structuredClone(workspace),
    acknowledgeCapture: async ({ attemptedRevision }) => {
      acknowledged.push(attemptedRevision);
      return { acknowledged: true };
    },
    canSkipInitialUpload: () => true,
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });
  assert.equal((await sync.initialize()).uploadSkipped, true);

  assert.equal(sync.captureWorkspace(changedWorkspace, { revision: 'failed-revision' }), true);
  await scheduled.shift()();
  assert.equal(sync.getStatus().state, 'retry');
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [
    ['conversations', 1]
  ]);
  assert.deepEqual(acknowledged, []);

  uploads.length = 0;
  assert.equal(sync.captureWorkspace(changedWorkspace, { revision: 'verified-revision' }), true);
  await scheduled.shift()();
  assert.deepEqual(uploads.map(([collection, rows]) => [collection, rows.length]), [
    ['folders', 1],
    ['conversations', 1],
    ['messages', 1]
  ]);
  assert.equal(uploads.find(([collection]) => collection === 'messages')[1][0].id, recoveredRemoteMessageId);
  assert.deepEqual(states, ['shadow', 'ready']);
  assert.deepEqual(acknowledged, ['verified-revision']);
  assert.equal(sync.getStatus().state, 'ready');
  assert.equal(sync.getStatus().fullUpload, true);
  assert.equal(sync.getStatus().uploadedRows, 3);
});

test('trusted baseline delta cannot resurrect a conversation covered by a tombstone', async () => {
  const remoteRows = await remoteRowsFor();
  const uploads = [];
  const verified = [];
  let scheduled;
  const repository = {
    paginatedSnapshotsAreComplete: true,
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [{
      entity_type: 'conversation',
      entity_id: conversationId,
      deleted_at: '2026-07-06T05:00:00.000Z'
    }],
    fetchWorkspace: async () => structuredClone(remoteRows),
    setMigrationState: async () => {},
    upsertFolders: async rows => uploads.push(['folders', rows]),
    upsertConversations: async rows => uploads.push(['conversations', rows]),
    upsertMessages: async rows => uploads.push(['messages', rows]),
    upsertAstras: async rows => uploads.push(['astras', rows]),
    verify: async rows => { verified.push(rows); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    writeWorkspace: async () => {},
    canSkipInitialUpload: () => true,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {},
    userId,
    cryptoProvider: webcrypto
  });
  assert.equal((await sync.initialize()).uploadSkipped, true);

  assert.equal(sync.captureWorkspace(structuredClone(workspace)), true);
  await scheduled();

  assert.deepEqual(uploads, []);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].conversations.length, 0);
  assert.equal(verified[0].messages.length, 0);
  assert.equal(sync.getStatus().uploadedRows, 0);
});

test('shadow sync externalizes upload assets and hydrates remote image assets', async () => {
  const inlineMarker = {
    __astraCloudAsset: {
      path: `${userId}/inline-image`,
      mimeType: 'image/png',
      encoding: 'base64'
    }
  };
  const generatedMarker = {
    __astraCloudAsset: {
      path: `${userId}/generated-image`,
      mimeType: 'image/webp',
      encoding: 'blob'
    }
  };
  const localWorkspace = {
    conversations: [{
      id: conversationId,
      title: 'Image sync',
      model: 'model-1',
      provider: 'provider-1',
      createdAt: '2026-07-06T01:00:00.000Z',
      messages: [{
        role: 'model',
        createdAt: '2026-07-06T01:00:01.000Z',
        parts: [
          { inlineData: { name: 'photo.png', mimeType: 'image/png', data: 'LOCAL_IMAGE_BYTES' } },
          { generatedImage: {
            id: 'generated-1',
            storageKey: `generatedImage:supabase:${userId}:generated-1`,
            mediaType: 'image/webp'
          } }
        ]
      }]
    }]
  };
  const remoteRows = { folders: [], conversations: [], messages: [], astras: [] };
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => remoteRows,
    setMigrationState: async () => {},
    upsertFolders: async rows => { remoteRows.folders = rows; },
    upsertConversations: async rows => { remoteRows.conversations = rows; },
    upsertMessages: async rows => { remoteRows.messages = rows; },
    upsertAstras: async rows => { remoteRows.astras = rows; },
    verify: async () => true
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => localWorkspace,
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    prepareWorkspaceForUpload: async value => ({
      ...structuredClone(value),
      conversations: value.conversations.map(conversation => ({
        ...structuredClone(conversation),
        messages: conversation.messages.map(message => ({
          ...structuredClone(message),
          parts: message.parts.map(part => {
            if (part.inlineData) {
              return { inlineData: { ...part.inlineData, data: inlineMarker } };
            }
            if (part.generatedImage) {
              return { generatedImage: { ...part.generatedImage, cloudAsset: generatedMarker } };
            }
            return structuredClone(part);
          })
        }))
      }))
    }),
    hydrateRemoteWorkspace: async value => ({
      ...structuredClone(value),
      conversations: value.conversations.map(conversation => ({
        ...structuredClone(conversation),
        messages: conversation.messages.map(message => ({
          ...structuredClone(message),
          parts: message.parts.map(part => {
            if (part.inlineData?.data?.__astraCloudAsset) {
              return { inlineData: { ...part.inlineData, data: 'RESTORED_IMAGE_BYTES' } };
            }
            if (part.generatedImage?.cloudAsset?.__astraCloudAsset) {
              const generatedImage = { ...part.generatedImage };
              delete generatedImage.cloudAsset;
              return { generatedImage };
            }
            return structuredClone(part);
          })
        }))
      }))
    })
  });

  assert.equal((await sync.initialize()).state, 'ready');
  assert.deepEqual(remoteRows.messages[0].parts[0].inlineData.data, inlineMarker);
  assert.equal(JSON.stringify(remoteRows).includes('LOCAL_IMAGE_BYTES'), false);
  assert.deepEqual(remoteRows.messages[0].parts[1].generatedImage.cloudAsset, generatedMarker);

  const pulled = await sync.pullWorkspace({ conversations: [], folders: [], astras: [] });
  const pulledParts = pulled.conversations[0].messages[0].parts;
  assert.equal(pulledParts[0].inlineData.data, 'RESTORED_IMAGE_BYTES');
  assert.equal('cloudAsset' in pulledParts[1].generatedImage, false);
  assert.equal(pulledParts[1].generatedImage.storageKey, `generatedImage:supabase:${userId}:generated-1`);
});

test('repository uses tombstone select and protected RPC upserts', async () => {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(from, to) { calls.push(['range', from, to]); return Promise.resolve({ data: [], error: null }); }
  };
  const supabase = {
    from(table) { calls.push(['from', table]); return query; },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.fetchTombstones();
  await repository.upsertFolders([{ id: 'folder' }]);
  await repository.upsertConversations([{ id: 'conversation' }]);
  await repository.upsertMessages([{ id: 'message' }]);

  assert.deepEqual(calls.slice(0, 3), [
    ['from', 'workspace_tombstones'],
    ['select', 'entity_type,entity_id,deleted_at'],
    ['eq', 'user_id', userId]
  ]);
  assert.deepEqual(calls.filter(call => call[0] === 'rpc').map(call => call.slice(1)), [
    ['upsert_workspace_folders', { p_rows: [{ id: 'folder' }] }],
    ['upsert_workspace_conversations', { p_rows: [{ id: 'conversation' }] }],
    ['upsert_workspace_messages', { p_rows: [{ id: 'message' }] }]
  ]);
});

test('repository fetches every workspace table concurrently and returns only after all complete', async () => {
  const tables = [
    'workspace_folders',
    'workspace_conversations',
    'workspace_messages',
    'workspace_astras'
  ];
  const started = [];
  const controls = new Map();
  const pageCounts = new Map();
  const supabase = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range() {
          const count = pageCounts.get(table) || 0;
          pageCounts.set(table, count + 1);
          if (count > 0) return Promise.resolve({ data: [], error: null });
          started.push(table);
          return new Promise(resolve => controls.set(table, resolve));
        }
      };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  let settled = false;
  const resultPromise = repository.fetchWorkspace().then(result => {
    settled = true;
    return result;
  });

  assert.deepEqual(started, tables);
  controls.get('workspace_folders')({ data: [{ id: 'folder' }], error: null });
  controls.get('workspace_conversations')({ data: [{ id: 'conversation' }], error: null });
  controls.get('workspace_messages')({ data: [{ id: 'message' }], error: null });
  await Promise.resolve();
  assert.equal(settled, false);

  controls.get('workspace_astras')({ data: [{ id: 'astra' }], error: null });
  assert.deepEqual(await resultPromise, {
    folders: [{ id: 'folder' }],
    conversations: [{ id: 'conversation' }],
    messages: [{ id: 'message' }],
    astras: [{ id: 'astra' }]
  });
});

test('repository workspace fetch rejects the whole snapshot when any table query fails', async () => {
  const queryError = new Error('messages unavailable');
  const started = [];
  const supabase = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range() {
          started.push(table);
          return Promise.resolve(table === 'workspace_messages'
            ? { data: null, error: queryError }
            : { data: [], error: null });
        }
      };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await assert.rejects(() => repository.fetchWorkspace(), error => error === queryError);
  assert.deepEqual(started, [
    'workspace_folders',
    'workspace_conversations',
    'workspace_messages',
    'workspace_astras'
  ]);
});

test('repository range-paginates every workspace table and tombstones to completion', async () => {
  const tables = {
    workspace_folders: Array.from({ length: 5 }, (_, index) => ({ id: `folder-${index}` })),
    workspace_conversations: Array.from({ length: 5 }, (_, index) => ({ id: `conversation-${index}` })),
    workspace_messages: Array.from({ length: 5 }, (_, index) => ({ id: `message-${index}` })),
    workspace_astras: Array.from({ length: 5 }, (_, index) => ({ id: `astra-${index}` })),
    workspace_tombstones: Array.from({ length: 5 }, (_, index) => ({
      entity_type: index % 2 ? 'folder' : 'conversation',
      entity_id: `entity-${index}`,
      deleted_at: '2026-07-06T00:00:00.000Z'
    }))
  };
  const ranges = [];
  const supabase = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(from, to) {
          ranges.push([table, from, to]);
          return Promise.resolve({ data: tables[table].slice(from, to + 1), error: null });
        }
      };
    }
  };
  const repository = createConversationShadowRepository({
    supabase,
    userId,
    fetchPageSize: 2
  });

  const rows = await repository.fetchWorkspace();
  const tombstones = await repository.fetchTombstones();

  assert.deepEqual(rows.folders, tables.workspace_folders);
  assert.deepEqual(rows.conversations, tables.workspace_conversations);
  assert.deepEqual(rows.messages, tables.workspace_messages);
  assert.deepEqual(rows.astras, tables.workspace_astras);
  assert.deepEqual(tombstones, tables.workspace_tombstones);
  for (const table of Object.keys(tables)) {
    assert.deepEqual(ranges.filter(([name]) => name === table).map(([, from, to]) => [from, to]), [
      [0, 1], [2, 3], [4, 5], [5, 6]
    ]);
  }
  assert.equal(repository.paginatedSnapshotsAreComplete, true);
});

test('repository rejects a complete snapshot when a later range page fails', async () => {
  const pageError = new Error('second message page failed');
  const ranges = [];
  const supabase = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(from, to) {
          ranges.push([table, from, to]);
          if (table === 'workspace_messages' && from === 2) {
            return Promise.resolve({ data: null, error: pageError });
          }
          return Promise.resolve({
            data: from === 0 ? [{ id: `${table}-0` }, { id: `${table}-1` }] : [],
            error: null
          });
        }
      };
    }
  };
  const repository = createConversationShadowRepository({
    supabase,
    userId,
    fetchPageSize: 2
  });

  await assert.rejects(() => repository.fetchWorkspace(), error => error === pageError);
  assert.equal(ranges.some(([table, from]) => table === 'workspace_messages' && from === 2), true);
});

test('repository reuses remote message ids for existing conversation sequence rows', async () => {
  const calls = [];
  const remoteMessageId = 'remote-message-id';
  const localMessageId = 'local-message-id';
  const supabase = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) { calls.push(['select', columns]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        in(column, values) {
          calls.push(['in', column, values]);
          return this;
        },
        order(column, options) { calls.push(['order', column, options]); return this; },
        range(from, to) {
          calls.push(['range', from, to]);
          return Promise.resolve({
            data: from === 0
              ? [{ id: remoteMessageId, conversation_id: conversationId, sequence: 0 }]
              : [],
            error: null
          });
        }
      };
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.upsertMessages([{
    id: localMessageId,
    user_id: userId,
    conversation_id: conversationId,
    role: 'user',
    parts: [],
    status: 'complete',
    sequence: 0,
    created_at: '2026-07-06T00:00:00.000Z',
    deleted_at: null
  }]);

  const rpcCall = calls.find(call => call[0] === 'rpc');
  assert.equal(rpcCall[1], 'upsert_workspace_messages');
  assert.equal(rpcCall[2].p_rows[0].id, remoteMessageId);
  assert.deepEqual(calls.slice(0, 4), [
    ['from', 'workspace_messages'],
    ['select', 'id,conversation_id,sequence'],
    ['eq', 'user_id', userId],
    ['in', 'conversation_id', [conversationId]]
  ]);
});

test('repository removes duplicate message ids before protected RPC upload', async () => {
  const calls = [];
  const duplicateMessageId = 'message-1';
  const supabase = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) { calls.push(['select', columns]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        in(column, values) {
          calls.push(['in', column, values]);
          return this;
        },
        order(column, options) { calls.push(['order', column, options]); return this; },
        range(from, to) {
          calls.push(['range', from, to]);
          return Promise.resolve({ data: [], error: null });
        }
      };
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.upsertMessages([
    {
      id: duplicateMessageId,
      user_id: userId,
      conversation_id: conversationId,
      role: 'user',
      parts: [{ text: 'smaller' }],
      status: 'complete',
      sequence: 0,
      created_at: '2026-07-06T00:00:00.000Z',
      deleted_at: null
    },
    {
      id: duplicateMessageId,
      user_id: userId,
      conversation_id: conversationId,
      role: 'user',
      parts: [{ text: 'larger content wins' }],
      status: 'complete',
      sequence: 0,
      created_at: '2026-07-06T00:00:01.000Z',
      deleted_at: null
    }
  ]);

  const rpcCall = calls.find(call => call[0] === 'rpc');
  assert.equal(rpcCall[1], 'upsert_workspace_messages');
  assert.equal(rpcCall[2].p_rows.length, 1);
  assert.equal(rpcCall[2].p_rows[0].parts[0].text, 'larger content wins');
});

test('repository permanently deletes conversations through the protected RPC', async () => {
  const calls = [];
  const supabase = {
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.permanentlyDeleteConversations(['a', 'a', '', null, 'b']);

  assert.deepEqual(calls, [
    ['rpc', 'permanently_delete_workspace_conversations', { p_conversation_ids: ['a', 'b'] }]
  ]);
});

test('repository permanently deletes folders through the protected RPC', async () => {
  const calls = [];
  const supabase = {
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.permanentlyDeleteFolder('folder-1');
  await repository.permanentlyDeleteFolder('');

  assert.deepEqual(calls, [
    ['rpc', 'permanently_delete_workspace_folder', { p_folder_id: 'folder-1' }]
  ]);
});

test('repository permanent delete rejects instead of bypassing tombstones when the RPC is unavailable', async () => {
  const calls = [];
  const supabase = {
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { error: { message: 'Could not find the function', code: 'PGRST202', status: 404 } };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await assert.rejects(
    () => repository.permanentlyDeleteConversations([conversationId]),
    error => error?.code === 'PGRST202'
  );

  assert.deepEqual(calls, [
    ['rpc', 'permanently_delete_workspace_conversations', { p_conversation_ids: [conversationId] }]
  ]);
});

test('repository upserts active Astras without clearing tombstones and persists Astra deletions', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        upsert(rows, options) {
          calls.push([table, rows, options]);
          return Promise.resolve({ error: null });
        }
      };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });
  const row = {
    id: astraId,
    user_id: userId,
    name: 'Synced Astra',
    description: '',
    instructions: 'Help',
    metadata: {}
  };

  await repository.upsertAstras([row]);
  await repository.permanentlyDeleteAstras([row], '2026-07-06T08:00:00.000Z');

  assert.equal('deleted_at' in calls[0][1][0], false);
  assert.equal(calls[1][1][0].deleted_at, '2026-07-06T08:00:00.000Z');
  assert.deepEqual(calls.map(call => call[2]), [
    { onConflict: 'id' },
    { onConflict: 'id' }
  ]);
});

test('repository retries Astra upserts with client sync sequence when sequence grants are missing', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        upsert(rows, options) {
          calls.push([table, rows, options]);
          return Promise.resolve(calls.length === 1
            ? { error: { code: '42501', message: 'permission denied for sequence workspace_sync_seq' } }
            : { error: null });
        }
      };
    }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.upsertAstras([{
    id: astraId,
    user_id: userId,
    name: 'Synced Astra',
    description: '',
    instructions: 'Help',
    metadata: {}
  }]);

  assert.equal(calls.length, 2);
  assert.equal('sync_seq' in calls[0][1][0], false);
  assert.equal(Number.isInteger(calls[1][1][0].sync_seq), true);
  assert.deepEqual(calls.map(call => call[2]), [
    { onConflict: 'id' },
    { onConflict: 'id' }
  ]);
});

test('sync permanent deletion requires ready state, calls RPC, and refreshes tombstones', async () => {
  const calls = [];
  let deletedIds = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => {
      calls.push(['tombstones']);
      return deletedIds.map(entity_id => ({ entity_type: 'conversation', entity_id, deleted_at: '2026-07-06T00:00:00.000Z' }));
    },
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => {
      calls.push(['delete', ids]);
      deletedIds = ids;
    }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await assert.rejects(
    () => sync.permanentlyDeleteConversations([conversationId]),
    /not ready/
  );

  await sync.initialize();
  await sync.permanentlyDeleteConversations([conversationId, conversationId]);

  assert.deepEqual(calls.at(-2), ['delete', [conversationId]]);
  assert.deepEqual(calls.at(-1), ['tombstones']);
  assert.equal(sync.getStatus().state, 'ready');
  assert.equal(sync.getStatus().lastPermanentDeleteVerifiedCount, 1);
});

test('sync folder deletion calls RPC and verifies durable folder tombstone', async () => {
  const calls = [];
  const deletedFolderId = workspace.folders[0].id;
  let deletedId = null;
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => {
      calls.push(['tombstones']);
      return deletedId ? [{
        entity_type: 'folder',
        entity_id: deletedId,
        deleted_at: '2026-07-06T00:00:00.000Z'
      }] : [];
    },
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteFolder: async id => {
      calls.push(['deleteFolder', id]);
      deletedId = id;
    }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => workspace,
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    now: () => '2026-07-06T02:30:00.000Z'
  });

  await assert.rejects(
    () => sync.permanentlyDeleteFolder(deletedFolderId),
    /not ready/
  );

  await sync.initialize();
  await sync.permanentlyDeleteFolder(deletedFolderId);

  assert.deepEqual(calls.at(-2), ['deleteFolder', deletedFolderId]);
  assert.deepEqual(calls.at(-1), ['tombstones']);
  assert.equal(sync.getStatus().state, 'ready');
  assert.equal(sync.getStatus().lastFolderDeleteCount, 1);
  assert.equal(sync.getStatus().lastFolderDeleteError, undefined);
});

test('sync permanent deletion refuses to clear local trash when required snapshots are missing', async () => {
  const calls = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => calls.push(['delete', ids])
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await assert.rejects(
    () => sync.permanentlyDeleteConversations([conversationId], { requireSnapshots: true }),
    /requires local conversation snapshots/
  );

  assert.deepEqual(calls, []);
  assert.equal(sync.getStatus().code, 'ASTRA_DELETE_SNAPSHOT_REQUIRED');
});

test('sync permanent deletion maps legacy non-UUID ids to repaired cloud ids', async () => {
  const calls = [];
  const legacyConversationId = 'legacy-chat-id';
  const cloudConversationId = await deterministicUuid(
    `astra-sync-v2:${userId}:conversation:${legacyConversationId}`,
    webcrypto
  );
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => {
      calls.push(['tombstones']);
      return [{ entity_type: 'conversation', entity_id: cloudConversationId }];
    },
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => calls.push(['delete', ids])
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await sync.permanentlyDeleteConversations([legacyConversationId]);

  assert.deepEqual(calls.at(-2), ['delete', [cloudConversationId]]);
  assert.deepEqual(calls.at(-1), ['tombstones']);
});

test('sync permanent deletion matches remote aliases by conversation snapshot before deleting', async () => {
  const calls = [];
  const localConversationId = conversationId;
  const remoteConversationId = '44444444-4444-4444-8444-444444444444';
  const snapshot = {
    id: localConversationId,
    title: 'Same deleted chat',
    summary: '',
    model: 'model-1',
    provider: 'provider-1',
    createdAt: '2026-07-06T02:00:00.000Z',
    deletedAt: '2026-07-06T02:10:00.000Z',
    messages: [{
      role: 'user',
      createdAt: '2026-07-06T02:00:00.000Z',
      parts: [{ text: 'delete this alias too' }]
    }]
  };
  let remoteRows = { folders: [], conversations: [], messages: [] };
  let deletedIds = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => deletedIds.map(id => ({ entity_type: 'conversation', entity_id: id })),
    fetchWorkspace: async () => remoteRows,
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => {
      calls.push(['delete', ids]);
      deletedIds = ids;
      remoteRows = {
        ...remoteRows,
        conversations: (remoteRows.conversations || []).filter(row => !ids.includes(row.id)),
        messages: (remoteRows.messages || []).filter(row => !ids.includes(row.conversation_id))
      };
    }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  remoteRows = {
    folders: [],
    conversations: [{
      id: remoteConversationId,
      user_id: userId,
      folder_id: null,
      title: snapshot.title,
      summary: snapshot.summary,
      model: snapshot.model,
      provider: snapshot.provider,
      metadata: { clientUpdatedAt: snapshot.createdAt },
      archived: false,
      pinned: false,
      created_at: snapshot.createdAt,
      updated_at: snapshot.createdAt,
      deleted_at: snapshot.deletedAt
    }],
    messages: [{
      id: '55555555-5555-4555-8555-555555555555',
      user_id: userId,
      conversation_id: remoteConversationId,
      role: 'user',
      parts: snapshot.messages[0].parts,
      status: 'complete',
      sequence: 0,
      created_at: snapshot.messages[0].createdAt,
      updated_at: snapshot.messages[0].createdAt,
      deleted_at: null
    }]
  };

  await sync.permanentlyDeleteConversations([localConversationId], { conversations: [snapshot] });

  assert.deepEqual(calls.at(-1), ['delete', [localConversationId, remoteConversationId]]);
  assert.equal(sync.getStatus().lastPermanentDeleteVerifiedCount, 2);
});

test('sync permanent deletion self-loads local trash snapshots and matches renamed remote aliases', async () => {
  const localConversationId = conversationId;
  const remoteConversationId = '88888888-8888-4888-8888-888888888888';
  const localSnapshot = {
    id: localConversationId,
    title: 'Local deleted title',
    summary: '',
    model: 'provider-model',
    provider: 'provider',
    createdAt: '2026-07-06T03:00:00.000Z',
    deletedAt: '2026-07-06T03:20:00.000Z',
    messages: [{
      role: 'user',
      createdAt: '2026-07-06T03:00:01.000Z',
      parts: [{ text: 'delete the same trashed conversation even after title drift' }]
    }]
  };
  let remoteRows = {
    folders: [],
    conversations: [{
      id: remoteConversationId,
      user_id: userId,
      folder_id: null,
      title: 'Remote title drifted',
      summary: '',
      model: 'unknown',
      provider: 'unknown',
      metadata: {},
      archived: false,
      pinned: false,
      created_at: localSnapshot.createdAt,
      updated_at: localSnapshot.createdAt,
      deleted_at: '2026-07-06T03:21:00.000Z'
    }],
    messages: [{
      id: '99999999-9999-4999-8999-999999999999',
      user_id: userId,
      conversation_id: remoteConversationId,
      role: 'user',
      parts: localSnapshot.messages[0].parts,
      status: 'complete',
      sequence: 0,
      created_at: localSnapshot.messages[0].createdAt,
      updated_at: localSnapshot.messages[0].createdAt,
      deleted_at: null
    }]
  };
  let deletedIds = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => deletedIds.map(id => ({ entity_type: 'conversation', entity_id: id })),
    fetchWorkspace: async () => remoteRows,
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => {
      deletedIds = ids;
      remoteRows = {
        ...remoteRows,
        conversations: (remoteRows.conversations || []).filter(row => !ids.includes(row.id)),
        messages: (remoteRows.messages || []).filter(row => !ids.includes(row.conversation_id))
      };
    }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [localSnapshot], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await sync.permanentlyDeleteConversations([localConversationId]);

  assert.deepEqual(deletedIds, [localConversationId, remoteConversationId]);
  assert.equal(sync.getStatus().lastPermanentDeleteVerifiedCount, 2);
});

test('sync permanent deletion rejects when matching remote rows remain after RPC', async () => {
  const localConversationId = conversationId;
  const snapshot = {
    id: localConversationId,
    title: 'Still remote',
    createdAt: '2026-07-06T02:00:00.000Z',
    messages: [{
      role: 'user',
      createdAt: '2026-07-06T02:00:01.000Z',
      parts: [{ text: 'this row must not survive' }]
    }]
  };
  const remoteRows = {
    folders: [],
    conversations: [{
      id: localConversationId,
      user_id: userId,
      folder_id: null,
      title: snapshot.title,
      summary: '',
      model: 'unknown',
      provider: 'unknown',
      metadata: {},
      archived: false,
      pinned: false,
      created_at: snapshot.createdAt,
      updated_at: snapshot.createdAt,
      deleted_at: snapshot.deletedAt || '2026-07-06T02:10:00.000Z'
    }],
    messages: [{
      id: '77777777-7777-4777-8777-777777777777',
      user_id: userId,
      conversation_id: localConversationId,
      role: 'user',
      parts: snapshot.messages[0].parts,
      status: 'complete',
      sequence: 0,
      created_at: snapshot.messages[0].createdAt,
      updated_at: snapshot.messages[0].createdAt,
      deleted_at: null
    }]
  };
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [{ entity_type: 'conversation', entity_id: localConversationId }],
    fetchWorkspace: async () => remoteRows,
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async () => {}
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await assert.rejects(
    () => sync.permanentlyDeleteConversations([localConversationId], { conversations: [snapshot] }),
    /left matching remote conversations/
  );

  assert.equal(sync.getStatus().state, 'retry');
  assert.equal(sync.getStatus().lastPermanentDeleteError.code, 'ASTRA_REMOTE_DELETE_VERIFY_FAILED');
  assert.deepEqual(sync.getStatus().lastPermanentDeleteError.details, {
    remainingConversationIds: [localConversationId]
  });
});

test('sync permanent deletion exposes protected RPC errors in status', async () => {
  const deleteError = { message: 'Could not find the function', code: 'PGRST202', status: 404 };
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async () => { throw deleteError; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await assert.rejects(() => sync.permanentlyDeleteConversations([conversationId]));

  assert.equal(sync.getStatus().state, 'retry');
  assert.equal(sync.getStatus().lastPermanentDeleteError.code, 'PGRST202');
  assert.equal(sync.getStatus().lastPermanentDeleteError.status, 404);
});

test('sync permanent deletion rejects when remote rows are gone without durable tombstones', async () => {
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async () => {}
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [], folders: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  await sync.initialize();
  await assert.rejects(
    () => sync.permanentlyDeleteConversations([conversationId]),
    error => error?.code === 'ASTRA_TOMBSTONE_VERIFY_FAILED'
  );

  assert.equal(sync.getStatus().state, 'retry');
  assert.deepEqual(sync.getStatus().lastPermanentDeleteError.details, {
    missingConversationIds: [conversationId]
  });
});

test('sync permanent deletion cancels a queued pre-delete upload before committing the tombstone', async () => {
  let scheduled;
  const cancelled = [];
  let conversationUploads = 0;
  let deletedIds = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => deletedIds.map(entity_id => ({
      entity_type: 'conversation',
      entity_id,
      deleted_at: '2026-07-06T00:00:00.000Z'
    })),
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => { conversationUploads += 1; },
    upsertMessages: async () => {},
    verify: async () => true,
    permanentlyDeleteConversations: async ids => { deletedIds = ids; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => workspace,
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    schedule: callback => { scheduled = callback; return 77; },
    cancel: timerId => cancelled.push(timerId)
  });

  await sync.initialize();
  assert.equal(conversationUploads, 1);
  assert.equal(sync.captureWorkspace(workspace), true);
  assert.equal(typeof scheduled, 'function');

  await sync.permanentlyDeleteConversations([conversationId]);
  await sync.flush();

  assert.deepEqual(cancelled, [77]);
  assert.equal(conversationUploads, 1);
  assert.equal(sync.getStatus().lastPermanentDeleteVerifiedCount, 1);
});

test('sync uploads active Astras and verifies durable Astra deletion tombstones', async () => {
  const localAstra = {
    id: astraId,
    name: 'Synced Astra',
    description: 'Shared',
    instructions: 'Help carefully',
    avatarUrl: null,
    officialId: null
  };
  let remoteAstras = [];
  let uploadedAstras = [];
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [], astras: remoteAstras }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    upsertAstras: async rows => {
      uploadedAstras = rows;
      remoteAstras = rows.map(row => ({ ...row, updated_at: '2026-07-06T08:00:00.000Z', deleted_at: null }));
    },
    verify: async () => true,
    permanentlyDeleteAstras: async (rows, deletedAt) => {
      remoteAstras = rows.map(row => ({ ...row, updated_at: deletedAt, deleted_at: deletedAt }));
    }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ folders: [], conversations: [], astras: [localAstra] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    now: () => '2026-07-06T08:00:00.000Z'
  });

  await sync.initialize();
  assert.equal(uploadedAstras[0].id, astraId);

  await sync.permanentlyDeleteAstras([astraId], { astras: [localAstra] });

  assert.equal(remoteAstras[0].deleted_at, '2026-07-06T08:00:00.000Z');
  assert.equal(sync.getStatus().lastAstraDeleteCount, 1);
});

test('missing migration never reads or changes the local workspace', async () => {
  let localReads = 0;
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => { throw { code: 'PGRST205', message: 'table missing' }; }
    },
    readWorkspace: async () => { localReads += 1; return workspace; },
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'migration-required');
  assert.equal(localReads, 0);
});

test('upload failure remains retryable and cannot reject app startup', async () => {
  const warnings = [];
  const writes = [];
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async () => { throw new Error('network down'); },
      upsertMessages: async () => assert.fail('messages wait for conversations'),
      verify: async () => assert.fail('failed upload is never marked verified')
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async value => writes.push(value),
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: (...args) => warnings.push(args) }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.match(status.error, /network down/);
  assert.equal(warnings.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].conversations[0].id, conversationId);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('tombstones sanitize local data before local write and upload', async () => {
  const deletedFolderId = workspace.folders[0].id;
  const writes = [];
  let uploaded;
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [{
        entity_type: 'folder',
        entity_id: deletedFolderId,
        deleted_at: '2026-07-06T02:00:00.000Z'
      }],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async rows => assert.deepEqual(rows, []),
      upsertConversations: async rows => { uploaded = rows; },
      upsertMessages: async () => {},
      verify: async () => true
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async value => writes.push(value),
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(writes[0].folders.length, 0);
  assert.equal(writes[0].conversations[0].folderId, null);
  assert.equal(uploaded[0].folder_id, null);
});

test('missing tombstone migration and fetch failures leave local storage untouched', async () => {
  for (const error of [
    { code: 'PGRST205', message: 'workspace_tombstones missing' },
    new Error('network down')
  ]) {
    let writes = 0;
    const sync = createConversationShadowSync({
      repository: {
        probe: async () => null,
        fetchTombstones: async () => { throw error; }
      },
      readWorkspace: async () => workspace,
      writeWorkspace: async () => { writes += 1; },
      userId,
      cryptoProvider: webcrypto,
      logger: { warn: () => {} }
    });

    const status = await sync.initialize();
    assert.equal(status.state, error.code ? 'migration-required' : 'retry');
    assert.equal(writes, 0);
    assert.equal(sync.captureWorkspace(workspace), false);
  }
});

test('local tombstones are applied before remote workspace rows are fetched', async () => {
  const calls = [];
  const guardedWorkspace = {
    folders: [],
    get conversations() {
      calls.push('sanitize-local');
      Object.defineProperty(this, 'conversations', { value: [], enumerable: true });
      return [];
    }
  };
  const sync = createConversationShadowSync({
    repository: {
      fetchTombstones: async () => { calls.push('tombstones'); return []; },
      fetchWorkspace: async () => {
        calls.push('fetch-workspace');
        assert.ok(calls.indexOf('sanitize-local') < calls.indexOf('fetch-workspace'));
        return { folders: [], conversations: [], messages: [] };
      }
    },
    readWorkspace: async () => guardedWorkspace,
    userId,
    cryptoProvider: webcrypto
  });

  await sync.pullWorkspace(guardedWorkspace);

  assert.deepEqual(calls.slice(0, 3), ['tombstones', 'sanitize-local', 'fetch-workspace']);
});

test('shadow initialization waits for tombstones before starting the workspace fetch', async () => {
  const calls = [];
  let releaseTombstones;
  let tombstonesStarted;
  const tombstoneStarted = new Promise(resolve => { tombstonesStarted = resolve; });
  const repository = {
    probe: async () => null,
    fetchTombstones: () => {
      calls.push('tombstones-start');
      tombstonesStarted();
      return new Promise(resolve => { releaseTombstones = resolve; });
    },
    fetchWorkspace: async () => {
      calls.push('workspace-start');
      return { folders: [], conversations: [], messages: [], astras: [] };
    },
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    upsertAstras: async () => {},
    verify: async () => true
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ folders: [], conversations: [], astras: [] }),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto
  });

  const initialization = sync.initialize();
  await tombstoneStarted;
  assert.deepEqual(calls, ['tombstones-start']);

  releaseTombstones([]);
  assert.equal((await initialization).state, 'ready');
  assert.deepEqual(calls.slice(0, 2), ['tombstones-start', 'workspace-start']);
});

test('shadow initialization hands the committed workspace and tombstones to the live runtime', async () => {
  const committed = {
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: []
  };
  const handoffs = [];
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [
        { entity_type: 'conversation', entity_id: 'conversation-deleted' },
        { entity_type: 'folder', entity_id: 'folder-deleted' }
      ],
      fetchWorkspace: async () => ({
        folders: [],
        conversations: [],
        messages: [],
        astras: [{ id: 'astra-deleted', deleted_at: '2026-07-15T00:00:00.000Z' }]
      }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async () => {},
      upsertMessages: async () => {},
      upsertAstras: async () => {},
      verify: async () => true
    },
    readWorkspace: async () => committed,
    commitWorkspace: async () => committed,
    onWorkspaceCommitted: detail => handoffs.push(detail),
    userId,
    cryptoProvider: webcrypto
  });

  assert.equal((await sync.initialize()).state, 'ready');
  assert.deepEqual(handoffs, [{
    workspace: committed,
    tombstones: {
      conversationIds: ['conversation-deleted'],
      folderIds: ['folder-deleted'],
      astraIds: ['astra-deleted']
    }
  }]);
});

test('legacy conversation IDs are repaired before shadow upload instead of being skipped', async () => {
  const writes = [];
  const uploads = [];
  const legacyWorkspace = {
    folders: [{ id: 'legacy-folder', conversationIds: ['legacy-chat'] }],
    conversations: [{
      id: 'legacy-chat',
      folderId: 'legacy-folder',
      title: 'Legacy chat',
      createdAt: '2026-07-06T01:00:00.000Z',
      messages: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    }]
  };
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async rows => uploads.push(['folders', rows]),
      upsertConversations: async rows => uploads.push(['conversations', rows]),
      upsertMessages: async rows => uploads.push(['messages', rows]),
      verify: async () => true
    },
    readWorkspace: async () => legacyWorkspace,
    writeWorkspace: async workspace => writes.push(workspace),
    normalizeWorkspace: async workspace => {
      const { repairWorkspaceEntityIds } = await import('../src/app/sync/cloud-sync-v2-id-repair.js');
      return (await repairWorkspaceEntityIds({ workspace, userId, cryptoProvider: webcrypto })).workspace;
    },
    userId,
    cryptoProvider: webcrypto
  });

  const status = await sync.initialize();
  const conversationUpload = uploads.find(([kind]) => kind === 'conversations')[1][0];
  const folderUpload = uploads.find(([kind]) => kind === 'folders')[1][0];

  assert.equal(status.state, 'ready');
  assert.equal(status.skipped, 0);
  assert.match(conversationUpload.id, /^[0-9a-f-]{36}$/);
  assert.match(folderUpload.id, /^[0-9a-f-]{36}$/);
  assert.equal(conversationUpload.folder_id, folderUpload.id);
  assert.equal(writes[0].conversations[0].id, conversationUpload.id);
});

test('missing protected upload RPC keeps merged local data and requires migration', async () => {
  const writes = [];
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async () => {
        throw {
          code: 'PGRST202',
          message: 'Could not find the function public.upsert_workspace_conversations(p_rows) in the schema cache'
        };
      },
      upsertMessages: async () => assert.fail('messages wait for conversations')
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async value => writes.push(value),
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'migration-required');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].conversations[0].id, conversationId);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('remote fetch failure keeps capture disabled and never writes local data', async () => {
  let writes = 0;
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => { throw new Error('remote fetch failed'); }
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async () => { writes += 1; },
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.equal(writes, 0);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('stop during probe prevents reads, writes, uploads, and re-enable', async () => {
  let resolveProbe;
  let reads = 0;
  const sync = createConversationShadowSync({
    repository: {
      probe: () => new Promise(resolve => { resolveProbe = resolve; })
    },
    readWorkspace: async () => { reads += 1; return workspace; },
    userId,
    cryptoProvider: webcrypto
  });

  const initializing = sync.initialize();
  await Promise.resolve();
  sync.stop();
  resolveProbe(null);

  assert.equal((await initializing).state, 'stopped');
  assert.equal(reads, 0);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('stop during remote fetch prevents commit and upload', async () => {
  let resolveFetch;
  let writes = 0;
  let uploads = 0;
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: () => new Promise(resolve => { resolveFetch = resolve; }),
      setMigrationState: async () => { uploads += 1; }
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async () => { writes += 1; },
    userId,
    cryptoProvider: webcrypto
  });

  const initializing = sync.initialize();
  while (!resolveFetch) await new Promise(resolve => setTimeout(resolve, 0));
  sync.stop();
  resolveFetch({ folders: [], conversations: [], messages: [] });

  assert.equal((await initializing).state, 'stopped');
  assert.equal(writes, 0);
  assert.equal(uploads, 0);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('stop during pull prevents tombstone and trusted-baseline state from being restored', async () => {
  let releaseTombstones;
  let markTombstonesStarted;
  const tombstonesStarted = new Promise(resolve => { markTombstonesStarted = resolve; });
  const tombstoneGate = new Promise(resolve => { releaseTombstones = resolve; });
  const sync = createConversationShadowSync({
    repository: {
      paginatedSnapshotsAreComplete: true,
      fetchTombstones: async () => {
        markTombstonesStarted();
        await tombstoneGate;
        return [];
      },
      fetchWorkspace: async () => remoteRowsFor()
    },
    readWorkspace: async () => structuredClone(workspace),
    userId,
    cryptoProvider: webcrypto
  });

  const pulling = sync.pullWorkspace(structuredClone(workspace));
  await tombstonesStarted;
  sync.stop();
  releaseTombstones();

  await assert.rejects(pulling, error => error?.name === 'ShadowSyncStoppedError');
  assert.equal(sync.getStatus().state, 'stopped');
  assert.equal(sync.getStatus().baselineTrusted, false);
});

test('stop during upload prevents later upload phases and re-enable', async () => {
  let resolveUpload;
  let verifies = 0;
  const writes = [];
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: () => new Promise(resolve => { resolveUpload = resolve; }),
      upsertMessages: async () => {},
      verify: async () => { verifies += 1; return true; }
    },
    readWorkspace: async () => workspace,
    writeWorkspace: async value => writes.push(value),
    userId,
    cryptoProvider: webcrypto
  });

  const initializing = sync.initialize();
  while (!resolveUpload) await new Promise(resolve => setTimeout(resolve, 0));
  sync.stop();
  resolveUpload();

  assert.equal((await initializing).state, 'stopped');
  assert.equal(writes.length, 1);
  assert.equal(verifies, 0);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('initializer rejects invalid local JSON without commit or upload', async () => {
  let writes = 0;
  let uploads = 0;
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
    async upsert() { return { error: null }; }
  };
  const sync = initializeConversationShadowSync({
    window: {},
    supabase: {
      from: () => query,
      rpc: async () => { uploads += 1; return { error: null }; }
    },
    storage: {
      getItem: async () => '{broken-json',
      setItem: async () => { writes += 1; }
    },
    user: { id: userId },
    username: 'alice',
    logger: { warn: () => {} }
  });

  for (let index = 0; index < 10 && sync.getStatus().state === 'idle'; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  assert.equal(sync.getStatus().state, 'retry');
  assert.equal(sync.getStatus().error, 'Local workspace JSON is invalid.');
  assert.equal(writes, 0);
  assert.equal(uploads, 0);
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('runtime save between initial read and cloud commit is re-read and uploaded', async () => {
  let storedRaw = JSON.stringify(workspace);
  let resolveFetch;
  let uploadedConversations = [];
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: () => new Promise(resolve => { resolveFetch = resolve; }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async rows => { uploadedConversations = rows; },
      upsertMessages: async () => {},
      verify: async () => true
    },
    readWorkspace: async () => JSON.parse(storedRaw),
    commitWorkspace: ({ assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const latest = JSON.parse(storedRaw);
      assertCurrent();
      storedRaw = JSON.stringify(latest);
      return latest;
    }),
    userId,
    cryptoProvider: webcrypto
  });
  const laterWorkspace = workspaceWithLaterConversation();
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => laterWorkspace,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (_key, value) => { storedRaw = value; }
  });

  const initializing = sync.initialize();
  while (!resolveFetch) await new Promise(resolve => setTimeout(resolve, 0));
  await persistence.saveAppData();
  resolveFetch({ folders: [], conversations: [], messages: [] });

  assert.equal((await initializing).state, 'ready');
  assert.ok(JSON.parse(storedRaw).conversations.some(({ id }) => id === laterConversationId));
  assert.ok(uploadedConversations.some(({ id }) => id === laterConversationId));
});

test('runtime save during failed upload remains newest local storage', async () => {
  let storedRaw = JSON.stringify(workspace);
  let rejectUpload;
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: () => new Promise((_resolve, reject) => { rejectUpload = reject; }),
      upsertMessages: async () => {},
      verify: async () => true
    },
    readWorkspace: async () => JSON.parse(storedRaw),
    commitWorkspace: ({ assertCurrent }) => withWorkspaceStorageExclusive(async () => {
      const latest = JSON.parse(storedRaw);
      assertCurrent();
      storedRaw = JSON.stringify(latest);
      return latest;
    }),
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });
  const laterWorkspace = workspaceWithLaterConversation();
  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getAppData: () => laterWorkspace,
    getAppDataKey: () => 'chatAppData_v8.6_alice',
    setItem: async (_key, value) => { storedRaw = value; }
  });

  const initializing = sync.initialize();
  while (!rejectUpload) await new Promise(resolve => setTimeout(resolve, 0));
  await persistence.saveAppData();
  rejectUpload(new Error('upload failed'));

  assert.equal((await initializing).state, 'retry');
  assert.ok(JSON.parse(storedRaw).conversations.some(({ id }) => id === laterConversationId));
  assert.equal(sync.captureWorkspace(workspace), false);
});

test('stop invalidates an in-flight post-init capture before later upload phases', async () => {
  let scheduled;
  let rejectOrResolveCapture;
  let conversationUploads = 0;
  let messageUploads = 0;
  let verifies = 0;
  let readyStates = 0;
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async state => { if (state === 'ready') readyStates += 1; },
    upsertFolders: async () => {},
    upsertConversations: async () => {
      conversationUploads += 1;
      if (conversationUploads > 1) {
        await new Promise(resolve => { rejectOrResolveCapture = resolve; });
      }
    },
    upsertMessages: async () => { messageUploads += 1; },
    verify: async () => { verifies += 1; return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => workspace,
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {},
    logger: { warn: () => {} }
  });
  assert.equal((await sync.initialize()).state, 'ready');
  const baseline = { messageUploads, verifies, readyStates };

  const changedWorkspace = structuredClone(workspace);
  changedWorkspace.conversations[0].title = 'Changed while stopping';
  assert.equal(sync.captureWorkspace(changedWorkspace), true);
  const capturing = scheduled();
  while (!rejectOrResolveCapture) await new Promise(resolve => setTimeout(resolve, 0));
  sync.stop();
  rejectOrResolveCapture();
  await capturing;

  assert.equal(messageUploads, baseline.messageUploads);
  assert.equal(verifies, baseline.verifies);
  assert.equal(readyStates, baseline.readyStates);
  assert.notEqual(sync.getStatus().state, 'ready');
});

test('empty local JSON is invalid and remains untouched', async () => {
  let writes = 0;
  let uploads = 0;
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
    async upsert() { return { error: null }; }
  };
  const sync = initializeConversationShadowSync({
    window: {},
    supabase: {
      from: () => query,
      rpc: async () => { uploads += 1; return { error: null }; }
    },
    storage: {
      getItem: async () => '',
      setItem: async () => { writes += 1; }
    },
    user: { id: userId },
    username: 'empty-json',
    logger: { warn: () => {} }
  });

  for (let index = 0; index < 10 && sync.getStatus().state === 'idle'; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  assert.equal(sync.getStatus().state, 'retry');
  assert.equal(sync.getStatus().error, 'Local workspace JSON is invalid.');
  assert.equal(writes, 0);
  assert.equal(uploads, 0);
});

test('ready settles tombstoned merge before legacy load and subsequent runtime save', async () => {
  const remoteId = '77777777-7777-4777-8777-777777777777';
  const tables = {
    workspace_tombstones: [{
      entity_type: 'conversation',
      entity_id: conversationId,
      deleted_at: '2026-07-06T04:00:00.000Z'
    }],
    workspace_folders: [],
    workspace_conversations: [{
      id: remoteId,
      user_id: userId,
      folder_id: null,
      title: 'Remote only',
      summary: '',
      model: null,
      provider: null,
      metadata: {},
      archived: false,
      pinned: false,
      created_at: '2026-07-06T03:00:00.000Z',
      updated_at: '2026-07-06T03:00:00.000Z',
      deleted_at: null
    }],
    workspace_messages: []
  };
  const queryFor = table => ({
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range(from, to) {
      return Promise.resolve({
        data: (tables[table] || []).slice(from, to + 1),
        error: null
      });
    },
    async maybeSingle() { return { data: null, error: null }; },
    async upsert() { return { error: null }; },
    in(_column, ids) {
      return Promise.resolve({
        data: (tables[table] || []).filter(row => ids.includes(row.id)),
        error: null
      });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject);
    }
  });
  const rpcTables = {
    upsert_workspace_folders: 'workspace_folders',
    upsert_workspace_conversations: 'workspace_conversations',
    upsert_workspace_messages: 'workspace_messages'
  };
  const supabase = {
    from: table => queryFor(table),
    rpc: async (name, { p_rows }) => {
      const table = rpcTables[name];
      const byId = new Map((tables[table] || []).map(row => [row.id, row]));
      for (const row of p_rows) byId.set(row.id, row);
      tables[table] = [...byId.values()];
      return { error: null };
    }
  };
  const appDataKey = 'chatAppData_v8.6_ordering';
  const journalKey = 'chatCloudSyncJournal_v1_ordering';
  const stored = new Map([
    [appDataKey, JSON.stringify({ folders: [], conversations: workspace.conversations })],
    [journalKey, JSON.stringify({
      version: 1,
      username: 'ordering',
      workspaceRevision: 'ordering-revision',
      lastAcknowledgedRevision: null,
      dirty: true,
      dirtySince: '2026-07-06T03:30:00.000Z',
      dirtyEntities: { unknown: true, conversations: [], folders: [], astras: [] },
      fullResyncRequired: false,
      lastRemoteWatermark: null,
      lastSuccessfulSyncAt: null,
      lastError: null
    })]
  ]);
  const atomicReads = [];
  const storage = {
    getItem: async key => stored.get(key) ?? null,
    readItems: async keys => {
      atomicReads.push(keys);
      return keys.map(key => stored.get(key) ?? null);
    },
    setItem: async (key, value) => { stored.set(key, value); }
  };
  const sync = initializeConversationShadowSync({
    window: {},
    supabase,
    storage,
    user: { id: userId },
    username: 'ordering',
    logger: { warn: () => {} }
  });

  assert.equal((await sync.ready).state, 'ready');
  assert.equal(atomicReads.length >= 3, true);
  assert.equal(atomicReads.every(keys => (
    keys.length === 2 && keys[0] === appDataKey && keys[1] === journalKey
  )), true);
  const legacyLoadedWorkspace = JSON.parse(stored.get(appDataKey));
  assert.deepEqual(legacyLoadedWorkspace.conversations.map(({ id }) => id), [remoteId]);

  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'ordering' }),
    getAppData: () => legacyLoadedWorkspace,
    getAppDataKey: () => 'chatAppData_v8.6_ordering',
    setItem: storage.setItem
  });
  await persistence.saveAppData();

  assert.deepEqual(JSON.parse(stored.get(appDataKey)).conversations.map(({ id }) => id), [remoteId]);
});

test('probe failure exposes Supabase error metadata for debugging', async () => {
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => {
        throw {
          message: 'permission denied for table sync_profiles',
          code: '42501',
          status: 403
        };
      }
    },
    readWorkspace: async () => workspace,
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: () => {} }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.equal(status.code, '42501');
  assert.equal(status.status, 403);
  assert.match(status.error, /permission denied/);
});

test('diagnose reports local and remote shadow counts with current status', async () => {
  const repository = {
    probe: async () => ({ user_id: userId, schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [
      { entity_type: 'conversation', entity_id: conversationId, deleted_at: '2026-07-06T01:00:00.000Z' }
    ],
    fetchWorkspace: async () => ({
      folders: [{ id: '33333333-3333-4333-8333-333333333333' }],
      conversations: [{ id: conversationId }],
      messages: [{ id: '55555555-5555-4555-8555-555555555555' }]
    })
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => workspace,
    userId,
    cryptoProvider: webcrypto
  });

  const diagnosis = await sync.diagnose();

  assert.equal(diagnosis.status.state, 'idle');
  assert.equal(diagnosis.status.enabled, false);
  assert.deepEqual(diagnosis.local, {
    conversations: 1,
    activeConversations: 1,
    trashedConversations: 0,
    trashedConversationIds: [],
    messages: 1,
    folders: 1,
    astras: 0
  });
  assert.deepEqual(diagnosis.remote, {
    conversations: 1,
    messages: 1,
    folders: 1,
    astras: 0,
    deletedAstras: 0
  });
  assert.deepEqual(diagnosis.tombstones, { total: 1, conversations: 1, folders: 0 });
  assert.deepEqual(diagnosis.permanentDelete, {
    at: null,
    count: 0,
    verifiedCount: 0,
    error: null
  });
});

test('successful local save is debounced and captured without waiting in the UI', async () => {
  let scheduled;
  let uploads = 0;
  const repository = {
    probe: async () => null,
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => { uploads += 1; },
    upsertMessages: async () => {},
    verify: async () => true
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => ({ conversations: [] }),
    userId,
    cryptoProvider: webcrypto,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {}
  });
  await sync.initialize();

  assert.equal(sync.captureWorkspace(workspace), true);
  assert.equal(uploads, 0);
  await scheduled();
  assert.equal(uploads, 1);
  assert.equal(sync.getStatus().state, 'ready');
});

test('pullWorkspace merges remote shadow rows without dropping local-only chats', async () => {
  const remoteConversationId = '44444444-4444-4444-8444-444444444444';
  const sync = createConversationShadowSync({
    repository: {
      fetchTombstones: async () => [],
      fetchWorkspace: async () => ({
        folders: [],
        conversations: [{
          id: remoteConversationId,
          user_id: userId,
          folder_id: null,
          title: 'Remote chat',
          summary: '',
          model: 'model-2',
          provider: 'provider-2',
          metadata: {},
          archived: false,
          pinned: false,
          created_at: '2026-07-06T02:00:00+00:00',
          updated_at: '2026-07-06T02:00:00+00:00',
          deleted_at: null
        }],
        messages: [{
          id: '55555555-5555-4555-8555-555555555555',
          user_id: userId,
          conversation_id: remoteConversationId,
          role: 'model',
          parts: [{ text: 'Remote answer' }],
          status: 'complete',
          sequence: 0,
          created_at: '2026-07-06T02:00:01+00:00',
          updated_at: '2026-07-06T02:00:01+00:00',
          deleted_at: null
        }]
      })
    },
    readWorkspace: async () => workspace,
    userId,
    cryptoProvider: webcrypto
  });

  const merged = await sync.pullWorkspace({
    conversations: [{ id: conversationId, messages: [{ role: 'user', parts: [{ text: 'Local' }] }] }],
    folders: [],
    astras: [],
    personalMemories: []
  });

  assert.deepEqual(
    merged.conversations.map(conversation => conversation.id).sort(),
    [conversationId, remoteConversationId].sort()
  );
  assert.equal(
    merged.conversations.find(conversation => conversation.id === remoteConversationId).messages[0].parts[0].text,
    'Remote answer'
  );
});
