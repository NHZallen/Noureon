import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCloudSyncBootstrapPendingKey,
  installCloudSyncBootstrapQueue
} from '../src/app/sync/cloud-sync-bootstrap-queue.js';

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
}

function createWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const current = listeners.get(type) || new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, detail) {
      for (const listener of listeners.get(type) || []) listener({ type, detail });
    }
  };
}

test('bootstrap queue durably captures an early change and drains it during handoff', async () => {
  const username = 'supabase:bootstrap-user';
  const storage = createStorage();
  const window = createWindow();
  const bootstrap = installCloudSyncBootstrapQueue({ window, username, storage });
  const markerKey = getCloudSyncBootstrapPendingKey(username, 'config');

  assert.equal(await window.__astraCloudWorkspaceSync.queueLocalChange('config'), true);
  assert.equal(storage.values.get(markerKey), '1');

  const queued = [];
  const realApi = {
    queueLocalChange: async kind => {
      queued.push(kind);
      return `revision-${kind}`;
    }
  };
  await bootstrap.handoff(realApi);

  assert.deepEqual(queued, ['config']);
  assert.equal(storage.values.has(markerKey), false);
  assert.equal(window.__astraCloudWorkspaceSync, realApi);
});

test('bootstrap queue retains the durable marker when the real queue rejects a change', async () => {
  const username = 'supabase:retry-user';
  const storage = createStorage();
  const window = createWindow();
  const bootstrap = installCloudSyncBootstrapQueue({ window, username, storage, logger: { warn() {} } });
  const markerKey = getCloudSyncBootstrapPendingKey(username, 'sensitive');

  await bootstrap.stub.queueLocalChange('sensitive');
  await bootstrap.handoff({ queueLocalChange: async () => false });

  assert.equal(storage.values.get(markerKey), '1');
});

test('bootstrap queue captures a vault-unlocked event before cloud initialization', async () => {
  const username = 'supabase:vault-event-user';
  const storage = createStorage();
  const window = createWindow();
  const bootstrap = installCloudSyncBootstrapQueue({ window, username, storage });
  const queued = [];

  window.dispatch('astra:sync-vault-unlocked', { username });
  await bootstrap.handoff({
    queueLocalChange: async kind => {
      queued.push(kind);
      return 'revision';
    }
  });

  assert.deepEqual(queued, ['vault']);
  assert.equal(bootstrap.takePendingVaultUnlock(), true);
  assert.equal(bootstrap.takePendingVaultUnlock(), false);
  assert.equal(storage.values.has(getCloudSyncBootstrapPendingKey(username, 'vault')), false);
});
