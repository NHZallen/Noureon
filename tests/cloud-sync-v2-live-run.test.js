import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createConversationShadowRepository, createConversationShadowSync } from '../src/app/sync/cloud-sync-v2.js';
import { encodeWorkspaceConversationShadow } from '../src/app/sync/cloud-sync-v2-codecs.js';
import { createConversationRealtimeRefreshScheduler } from '../src/app/sync/cloud-sync-realtime-refresh.js';

// A reply the server is still writing is not overwritten by the browser's copy (the database skips that row), so the cloud differs from the
// browser on purpose. That must not stop the sync, and a sync that did stop is started again by the next request to send or look.

const userId = '11111111-1111-4111-8111-111111111111';
const workspace = {
  folders: [],
  conversations: [{
    id: '22222222-2222-4222-8222-222222222222',
    title: 'A deck',
    model: 'model-1',
    provider: 'provider-1',
    createdAt: '2026-07-06T01:00:00.000Z',
    messages: [{ role: 'user', parts: [{ text: 'Make a deck' }] }, { role: 'model', parts: [{ text: 'Working on it' }] }]
  }]
};

const encoded = () => encodeWorkspaceConversationShadow({ workspace, userId, cryptoProvider: webcrypto });

// A cloud that holds `remoteMessages`, and says whether a run is live for the message `liveFor`.
const cloudWith = ({ remoteMessages, liveFor = null }) => ({
  from(table) {
    if (table === 'server_runs') {
      let messageId = null;
      const query = {
        select() { return query; },
        eq(column, value) { if (column === 'message_id') messageId = value; return query; },
        in() { return query; },
        limit() { return Promise.resolve({ data: messageId === liveFor ? [{ id: 'run-1' }] : [], error: null }); }
      };
      return query;
    }
    assert.equal(table, 'workspace_messages');
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return Promise.resolve({ data: remoteMessages, error: null }); }
    };
    return query;
  }
});

test('verification lets a message pass when the server is still writing it, and only that one', async () => {
  const { messages } = await encoded();
  const model = messages.find((row) => row.role === 'model');
  const stale = { ...structuredClone(model), parts: [{ text: 'half of the reply' }] };
  const others = messages.filter((row) => row !== model).map((row) => structuredClone(row));

  const live = createConversationShadowRepository({ supabase: cloudWith({ remoteMessages: [stale, ...others], liveFor: model.id }), userId });
  assert.deepEqual(await live.verify({ messages }), { verified: true, mismatch: null });

  const finished = createConversationShadowRepository({ supabase: cloudWith({ remoteMessages: [stale, ...others], liveFor: null }), userId });
  const result = await finished.verify({ messages });
  assert.equal(result.verified, false);
  assert.equal(result.mismatch.collection, 'messages');
  assert.equal(result.mismatch.id, model.id);

  // A live run of another message does not excuse this one.
  const elsewhere = createConversationShadowRepository({ supabase: cloudWith({ remoteMessages: [stale, ...others], liveFor: others[0].id }), userId });
  assert.equal((await elsewhere.verify({ messages })).verified, false);
});

test('a sync that could not start is started again by a request to send, at most once in a while', async () => {
  let verifications = 0;
  let verdict = false;
  const repository = {
    probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
    fetchTombstones: async () => [],
    fetchWorkspace: async () => ({ folders: [], conversations: [], messages: [] }),
    setMigrationState: async () => {},
    upsertFolders: async () => {},
    upsertConversations: async () => {},
    upsertMessages: async () => {},
    upsertAstras: async () => {},
    verify: async () => { verifications += 1; return verdict; }
  };
  let clock = 1_000_000;
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(workspace),
    writeWorkspace: async () => {},
    userId,
    cryptoProvider: webcrypto,
    clock: () => clock,
    logger: { warn: () => {} }
  });

  const failed = await sync.initialize();
  assert.equal(failed.state, 'retry');
  assert.equal(failed.enabled, false);
  assert.equal(verifications, 1);

  // Asked to send while stuck: it tries to start again, and fails the same way.
  await sync.flush();
  assert.equal(verifications, 2);
  // Asked again at once: it waits.
  await sync.flush();
  assert.equal(verifications, 2);

  // The cause is gone, and the wait is over: the next request starts it.
  verdict = true;
  clock += 16_000;
  const recovered = await sync.flush();
  assert.equal(verifications, 3);
  assert.equal(recovered.state, 'ready');
  assert.equal(sync.getStatus().enabled, true);
});

test('the realtime refresh asks a sync that could not start to start again, and leaves an enabled one to refresh', async () => {
  const calls = [];
  const timers = [];
  const make = (status) => createConversationRealtimeRefreshScheduler({
    getSync: () => ({
      getStatus: () => status,
      flush: async () => { calls.push('flush'); },
      retry: async () => { calls.push('retry'); }
    }),
    schedule: (callback) => { timers.push(callback); return timers.length; },
    cancel: () => {},
    logger: { warn: () => {} }
  });

  const stuck = make({ state: 'retry', enabled: false });
  stuck.request({ new: { sync_seq: '5' } });
  await timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['flush']);

  calls.length = 0;
  const working = make({ state: 'ready', enabled: true, currentRemoteWatermark: '1' });
  working.request({ new: { sync_seq: '5' } });
  await timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['retry']);
});
