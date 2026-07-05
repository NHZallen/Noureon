import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createConversationShadowSync } from '../src/app/sync/cloud-sync-v2-shadow.js';

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

test('shadow initialization only uploads and verifies local rows', async () => {
  const calls = [];
  const repository = {
    probe: async () => calls.push(['probe']),
    setMigrationState: async (...args) => calls.push(['state', ...args]),
    upsertFolders: async rows => calls.push(['folders', rows]),
    upsertConversations: async rows => calls.push(['conversations', rows]),
    upsertMessages: async rows => calls.push(['messages', rows]),
    verify: async rows => { calls.push(['verify', rows]); return true; }
  };
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => workspace,
    userId,
    cryptoProvider: webcrypto,
    now: () => '2026-07-06T02:00:00.000Z'
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'ready');
  assert.equal(status.conversations, 1);
  assert.equal(status.messages, 1);
  assert.deepEqual(calls.map(call => call[0]), [
    'probe', 'state', 'folders', 'conversations', 'messages', 'verify', 'state'
  ]);
  assert.equal(calls[1][1], 'shadow');
  assert.equal(calls.at(-1)[1], 'ready');
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
  const sync = createConversationShadowSync({
    repository: {
      probe: async () => null,
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async () => { throw new Error('network down'); },
      upsertMessages: async () => assert.fail('messages wait for conversations'),
      verify: async () => assert.fail('failed upload is never marked verified')
    },
    readWorkspace: async () => workspace,
    userId,
    cryptoProvider: webcrypto,
    logger: { warn: (...args) => warnings.push(args) }
  });

  const status = await sync.initialize();

  assert.equal(status.state, 'retry');
  assert.match(status.error, /network down/);
  assert.equal(warnings.length, 1);
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

test('successful local save is debounced and captured without waiting in the UI', async () => {
  let scheduled;
  let uploads = 0;
  const repository = {
    probe: async () => null,
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
