import assert from 'node:assert/strict';
import test from 'node:test';

import { createCloudDeletionLifecycle } from '../src/app/runtime/shell/cloud-delete-lifecycle.js';

// What the saves hand to the cloud sync (the debounce, the immediate flush) is tested in tests/cloud-conversation-save-observer.test.js
// and tests/runtime-app-data-persistence.test.js.

const cloudUser = { username: 'supabase:user-1', authProvider: 'supabase' };
const localUser = { username: 'alice' };

function createSync({ status = { state: 'ready', enabled: true }, ready = null } = {}) {
  const calls = [];
  return {
    calls,
    ready,
    getStatus: () => status,
    permanentlyDeleteConversations: async (ids, payload) => calls.push(['conversations', ids, payload]),
    permanentlyDeleteAstras: async (ids, payload) => calls.push(['astras', ids, payload]),
    permanentlyDeleteFolder: async (id) => calls.push(['folder', id])
  };
}

function createDeletion({ user = cloudUser, conversations = [], astras = [], getSync }) {
  return createCloudDeletionLifecycle({
    getCurrentUser: () => user,
    getConversations: () => conversations,
    getAstras: () => astras,
    getSync
  });
}

test('cloud permanent delete hands the ids and their local snapshots to the active sync', async () => {
  const sync = createSync();
  const kept = { id: 'c1', title: 'local' };
  const deletion = createDeletion({ conversations: [kept, { id: 'other' }], getSync: () => sync });

  await deletion.deleteConversations(['c1', 'c1', '', 'c2'], {
    conversations: [{ id: 'c2', title: 'snapshot' }],
    requireSnapshots: true
  });

  assert.deepEqual(sync.calls, [[
    'conversations',
    ['c1', 'c2'],
    { conversations: [kept, { id: 'c2', title: 'snapshot' }], requireSnapshots: true }
  ]]);
});

test('cloud delete reads the sync at call time and waits until it is ready', async () => {
  let current = null;
  const order = [];
  const deletion = createDeletion({ getSync: () => current, conversations: [{ id: 'c1' }] });
  const later = createSync({ ready: Promise.resolve().then(() => order.push('ready')) });
  later.permanentlyDeleteConversations = async (ids) => order.push(['delete', ids]);
  current = later;

  await deletion.deleteConversations(['c1']);

  assert.deepEqual(order, ['ready', ['delete', ['c1']]]);
});

test('a cloud account refuses to delete while the sync is not ready or disabled', async () => {
  await assert.rejects(
    createDeletion({ getSync: () => null }).deleteConversations(['c1']),
    /Cloud conversation sync is not ready yet/
  );
  await assert.rejects(
    createDeletion({ getSync: () => createSync({ status: { state: 'disabled' } }) }).deleteConversations(['c1']),
    /Cloud conversation sync is disabled/
  );
  await assert.rejects(
    createDeletion({ getSync: () => createSync({ status: { enabled: false, error: 'Signed out of the cloud.' } }) })
      .deleteConversations(['c1']),
    /Signed out of the cloud/
  );
});

test('the account kind comes from its auth provider, not from a username prefix', async () => {
  // A local account named like a cloud one has nothing to delete in the cloud, so a missing sync is not an error.
  await createDeletion({ user: { username: 'supabase:lookalike' }, getSync: () => null }).deleteConversations(['c1']);
  await createDeletion({ user: localUser, getSync: () => createSync({ status: { state: 'disabled' } }) })
    .deleteConversations(['c1']);
  await createDeletion({ user: localUser, getSync: () => null }).deleteFolder('f1');
});

test('nothing is asked of the sync when there is nothing to delete', async () => {
  const sync = createSync();
  const deletion = createDeletion({ getSync: () => sync });

  await deletion.deleteConversations([]);
  await deletion.deleteConversations([null, '']);
  await deletion.deleteFolder('');

  assert.deepEqual(sync.calls, []);
});

test('a delete that requires snapshots is refused when one is missing', async () => {
  const sync = createSync();
  const deletion = createDeletion({ conversations: [{ id: 'c1' }], astras: [{ id: 'a1' }], getSync: () => sync });

  await assert.rejects(deletion.deleteConversations(['c1', 'gone'], { requireSnapshots: true }), /missing local snapshots/);
  // A Noura always needs its snapshot.
  await assert.rejects(deletion.deleteAstras(['a1', 'gone']), /Noura delete is missing local snapshots/);
  assert.deepEqual(sync.calls, []);

  await deletion.deleteConversations(['c1', 'gone']);
  await deletion.deleteAstras(['a1']);
  assert.deepEqual(sync.calls, [
    ['conversations', ['c1', 'gone'], { conversations: [{ id: 'c1' }], requireSnapshots: false }],
    ['astras', ['a1'], { astras: [{ id: 'a1' }] }]
  ]);
});

test('a folder is deleted through the sync, and a cloud account refuses while it is disabled', async () => {
  const sync = createSync();
  await createDeletion({ getSync: () => sync }).deleteFolder('f1');
  assert.deepEqual(sync.calls, [['folder', 'f1']]);

  await assert.rejects(
    createDeletion({ getSync: () => createSync({ status: { state: 'disabled' } }) }).deleteFolder('f1'),
    /Cloud folder sync is not ready yet/
  );
});
