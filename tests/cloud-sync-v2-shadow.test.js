import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  createConversationShadowRepository,
  createConversationShadowSync,
  initializeConversationShadowSync
} from '../src/app/sync/cloud-sync-v2-shadow.js';
import { deterministicUuid } from '../src/app/sync/cloud-sync-v2-codecs.js';
import { createLegacyRuntimeAppDataPersistence } from '../src/app/runtime/kernel/app-data-persistence.js';
import { withWorkspaceStorageExclusive } from '../src/app/sync/workspace-storage-coordinator.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
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

test('repository uses tombstone select and protected RPC upserts', async () => {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return Promise.resolve({ data: [] }); }
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

test('repository permanently deletes conversations through the protected RPC', async () => {
  const calls = [];
  const supabase = {
    async rpc(name, args) { calls.push(['rpc', name, args]); return { error: null }; }
  };
  const repository = createConversationShadowRepository({ supabase, userId });

  await repository.permanentlyDeleteConversations(['a', 'a', '', null, 'b']);

  assert.deepEqual(calls, [[
    'rpc',
    'permanently_delete_workspace_conversations',
    { p_conversation_ids: ['a', 'b'] }
  ]]);
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
  assert.deepEqual(sync.getStatus().lastPermanentDeleteMappedIds, [{
    localId: legacyConversationId,
    cloudId: cloudConversationId
  }]);
  assert.deepEqual(sync.getStatus().lastPermanentDeleteSkippedIds, []);
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
  assert.deepEqual(sync.getStatus().lastPermanentDeleteMatchedRemoteIds, [remoteConversationId]);
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
  assert.deepEqual(sync.getStatus().lastPermanentDeleteMatchedRemoteIds, [remoteConversationId]);
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

test('sync permanent deletion rejects successful RPCs that do not create tombstones', async () => {
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
    /tombstones/
  );

  assert.equal(sync.getStatus().state, 'retry');
  assert.equal(sync.getStatus().lastPermanentDeleteError.code, 'ASTRA_TOMBSTONE_VERIFY_FAILED');
  assert.deepEqual(sync.getStatus().lastPermanentDeleteError.details, {
    missingConversationIds: [conversationId]
  });
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

  assert.equal(sync.captureWorkspace(workspace), true);
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
  let storedRaw = JSON.stringify({ folders: [], conversations: workspace.conversations });
  const storage = {
    getItem: async () => storedRaw,
    setItem: async (_key, value) => { storedRaw = value; }
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
  const legacyLoadedWorkspace = JSON.parse(storedRaw);
  assert.deepEqual(legacyLoadedWorkspace.conversations.map(({ id }) => id), [remoteId]);

  const persistence = createLegacyRuntimeAppDataPersistence({
    getCurrentUser: () => ({ username: 'ordering' }),
    getAppData: () => legacyLoadedWorkspace,
    getAppDataKey: () => 'chatAppData_v8.6_ordering',
    setItem: storage.setItem
  });
  await persistence.saveAppData();

  assert.deepEqual(JSON.parse(storedRaw).conversations.map(({ id }) => id), [remoteId]);
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
    folders: 1
  });
  assert.deepEqual(diagnosis.remote, { conversations: 1, messages: 1, folders: 1 });
  assert.deepEqual(diagnosis.tombstones, { total: 1, conversations: 1, folders: 0 });
  assert.deepEqual(diagnosis.permanentDelete, {
    at: null,
    count: 0,
    verifiedCount: 0,
    mappedIds: [],
    matchedRemoteIds: [],
    residualRemoteIds: [],
    skippedIds: [],
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
