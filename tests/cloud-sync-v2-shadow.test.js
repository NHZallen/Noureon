import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createConversationShadowSync } from '../src/app/sync/cloud-sync-v2-shadow.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const workspace = {
  conversations: [{
    id: conversationId,
    title: 'Local survives',
    model: 'model-1',
    provider: 'provider-1',
    createdAt: '2026-07-06T01:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  }]
};

test('shadow initialization only uploads and verifies local rows', async () => {
  const calls = [];
  const repository = {
    probe: async () => calls.push(['probe']),
    setMigrationState: async (...args) => calls.push(['state', ...args]),
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
    'probe', 'state', 'conversations', 'messages', 'verify', 'state'
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

test('successful local save is debounced and captured without waiting in the UI', async () => {
  let scheduled;
  let uploads = 0;
  const repository = {
    probe: async () => null,
    setMigrationState: async () => {},
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
