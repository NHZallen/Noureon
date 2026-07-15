import assert from 'node:assert/strict';
import test from 'node:test';

import { getCloudSyncJournalKey } from '../src/app/sync/cloud-sync-journal.js';
import { repairCloudWorkspaceGeneratedImageKeys } from '../src/app/sync/cloud-workspace-image-repair.js';

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

test('image repair rereads the latest locked workspace and atomically marks its journal dirty', async () => {
  const username = 'supabase:user-1';
  const appDataKey = `chatAppData_v8.6_${username}`;
  const journalKey = getCloudSyncJournalKey(username);
  const lockGate = deferred();
  const values = new Map();
  const atomicWrites = [];
  const storage = {
    readItems: async keys => keys.map(key => values.get(key) ?? null),
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    setItemsAtomic: async entries => {
      atomicWrites.push(entries);
      for (const { key, value } of entries) values.set(key, value);
    }
  };
  const operation = repairCloudWorkspaceGeneratedImageKeys({
    storage,
    username,
    appDataKey,
    withExclusive: async callback => {
      await lockGate.promise;
      return callback();
    },
    repair: async ({ value }) => {
      value.conversations[0].messages[0].generatedImage.storageKey = `generatedImage:${username}:image-1`;
      return true;
    }
  });

  values.set(appDataKey, JSON.stringify({
    conversations: [
      {
        id: 'conversation-latest',
        title: 'latest save',
        messages: [{ generatedImage: { id: 'image-1', storageKey: 'old-key' } }]
      }
    ],
    folders: [],
    astras: []
  }));
  lockGate.resolve();
  const result = await operation;

  assert.equal(result.changed, true);
  assert.equal(atomicWrites.length, 1);
  assert.deepEqual(atomicWrites[0].map(entry => entry.key), [appDataKey, journalKey]);
  const savedWorkspace = JSON.parse(values.get(appDataKey));
  const savedJournal = JSON.parse(values.get(journalKey));
  assert.equal(savedWorkspace.conversations[0].title, 'latest save');
  assert.equal(
    savedWorkspace.conversations[0].messages[0].generatedImage.storageKey,
    `generatedImage:${username}:image-1`
  );
  assert.equal(savedJournal.dirty, true);
  assert.deepEqual(savedJournal.dirtyEntities.conversations, ['conversation-latest']);
});

test('unchanged or missing workspaces do not write workspace or journal', async () => {
  const username = 'supabase:user-1';
  const appDataKey = `chatAppData_v8.6_${username}`;
  let writes = 0;
  const storage = {
    readItems: async () => [JSON.stringify({ conversations: [], folders: [], astras: [] }), null],
    setItemsAtomic: async () => { writes += 1; }
  };

  assert.deepEqual(await repairCloudWorkspaceGeneratedImageKeys({
    storage,
    username,
    appDataKey,
    repair: async () => false
  }), { changed: false });
  assert.equal(writes, 0);
});
