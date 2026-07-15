import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_OWNER_KEY,
  getStoredUserWorkspaceKeys,
  reconcileStoredWorkspaceOwner,
  removeStoredUserWorkspace
} from '../src/app/runtime/kernel/user-data-retention.js';

test('stored user workspace keys cover account config app data sensitive config and sync vault', () => {
  assert.deepEqual(getStoredUserWorkspaceKeys('alice'), [
    'chatUser_alice',
    'chatConfig_v_v8.6_alice',
    'chatAppData_v8.6_alice',
    'chatSensitiveConfig_v1_alice',
    'chatSyncVault_v1_alice',
    'chatSyncVaultRecovery_v1_alice',
    'chatSyncVaultRotationPending_v1_alice',
    'chatCloudSyncMeta_v1_alice',
    'chatCloudSyncJournal_v1_alice',
    'chatCloudSyncBootstrapPending_v1_alice_config',
    'chatCloudSyncBootstrapPending_v1_alice_sensitive',
    'chatCloudSyncBootstrapPending_v1_alice_vault',
    'chatCloudAppDataBase_v1_alice',
    'chatRecoveryBackup_v1_alice',
    'chatFolderUiState_v1_alice'
  ]);
});

test('same workspace owner is remembered without removing existing data', async () => {
  const calls = [];
  const storage = new Map([[STORAGE_OWNER_KEY, 'alice']]);

  await reconcileStoredWorkspaceOwner({
    nextUsername: 'alice',
    getItem: async (key) => storage.get(key) || null,
    setItem: async (key, value) => {
      calls.push(['setItem', key, value]);
      storage.set(key, value);
    },
    removeItem: async (...args) => calls.push(['removeItem', ...args]),
    storageAdapter: { removeItemsByPrefix: async (...args) => calls.push(['removeItemsByPrefix', ...args]) }
  });

  assert.deepEqual(calls, [
    ['setItem', STORAGE_OWNER_KEY, 'alice']
  ]);
});

test('switching workspace owner removes the previous account namespace', async () => {
  const calls = [];
  const storage = new Map([[STORAGE_OWNER_KEY, 'alice']]);

  await reconcileStoredWorkspaceOwner({
    nextUsername: 'bob',
    getItem: async (key) => storage.get(key) || null,
    setItem: async (key, value) => calls.push(['setItem', key, value]),
    removeItem: async (key) => calls.push(['removeItem', key]),
    storageAdapter: { removeItemsByPrefix: async (prefix) => calls.push(['removeItemsByPrefix', prefix]) }
  });

  assert.deepEqual(calls, [
    ['removeItem', 'chatUser_alice'],
    ['removeItem', 'chatConfig_v_v8.6_alice'],
    ['removeItem', 'chatAppData_v8.6_alice'],
    ['removeItem', 'chatSensitiveConfig_v1_alice'],
    ['removeItem', 'chatSyncVault_v1_alice'],
    ['removeItem', 'chatSyncVaultRecovery_v1_alice'],
    ['removeItem', 'chatSyncVaultRotationPending_v1_alice'],
    ['removeItem', 'chatCloudSyncMeta_v1_alice'],
    ['removeItem', 'chatCloudSyncJournal_v1_alice'],
    ['removeItem', 'chatCloudSyncBootstrapPending_v1_alice_config'],
    ['removeItem', 'chatCloudSyncBootstrapPending_v1_alice_sensitive'],
    ['removeItem', 'chatCloudSyncBootstrapPending_v1_alice_vault'],
    ['removeItem', 'chatCloudAppDataBase_v1_alice'],
    ['removeItem', 'chatRecoveryBackup_v1_alice'],
    ['removeItem', 'chatFolderUiState_v1_alice'],
    ['removeItemsByPrefix', 'generatedImage:alice:'],
    ['setItem', STORAGE_OWNER_KEY, 'bob']
  ]);
});

test('removing a stored workspace tolerates missing generated image prefix support', async () => {
  const calls = [];

  await removeStoredUserWorkspace({
    username: 'alice',
    removeItem: async (key) => calls.push(key),
    storageAdapter: {}
  });

  assert.deepEqual(calls, getStoredUserWorkspaceKeys('alice'));
});
