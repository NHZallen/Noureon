import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCloudAstraDeletion,
  createCloudFolderDeletion
} from '../src/app/runtime/legacy-core/cloud-delete-lifecycle.js';

test('cloud Astra deletion forwards complete local snapshots to Sync V2', async () => {
  const calls = [];
  const astra = { id: 'astra-1', name: 'Astra One' };
  const deletion = createCloudAstraDeletion({
    getCurrentUser: () => ({ authProvider: 'supabase' }),
    getAstras: () => [astra],
    getSync: () => ({
      ready: Promise.resolve(),
      getStatus: () => ({ state: 'ready', enabled: true }),
      permanentlyDeleteAstras: async (...args) => calls.push(args)
    })
  });

  await deletion(['astra-1']);

  assert.deepEqual(calls, [[['astra-1'], { astras: [astra] }]]);
});

test('cloud Astra deletion refuses false local success when Sync V2 is unavailable', async () => {
  const deletion = createCloudAstraDeletion({
    getCurrentUser: () => ({ authProvider: 'supabase' }),
    getAstras: () => [{ id: 'astra-1' }],
    getSync: () => null
  });

  await assert.rejects(() => deletion(['astra-1']), /not ready/);
});

test('cloud folder deletion forwards to Sync V2 and refuses false local success', async () => {
  const calls = [];
  const deletion = createCloudFolderDeletion({
    getCurrentUser: () => ({ authProvider: 'supabase' }),
    getSync: () => ({
      ready: Promise.resolve(),
      getStatus: () => ({ state: 'ready', enabled: true }),
      permanentlyDeleteFolder: async (...args) => calls.push(args)
    })
  });

  await deletion('folder-1');

  assert.deepEqual(calls, [['folder-1']]);

  const unavailable = createCloudFolderDeletion({
    getCurrentUser: () => ({ authProvider: 'supabase' }),
    getSync: () => null
  });
  await assert.rejects(() => unavailable('folder-1'), /not ready/);
});
