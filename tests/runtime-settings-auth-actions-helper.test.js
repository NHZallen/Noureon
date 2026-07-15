import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSettingsAuthActionsHelper } from '../src/app/runtime/legacy-core/settings-auth-actions-helper.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createTrackedElement = (calls, name) => {
  const classes = new Set();
  const listeners = [];
  return {
    value: '',
    style: {},
    listeners,
    classList: {
      add: (...tokens) => {
        calls.push(['class:add', name, ...tokens]);
        for (const token of tokens) classes.add(token);
      },
      remove: (...tokens) => {
        calls.push(['class:remove', name, ...tokens]);
        for (const token of tokens) classes.delete(token);
      },
      contains: (token) => classes.has(token)
    },
    addEventListener: (event, listener, options) => {
      calls.push(['listener', name, event, options]);
      listeners.push({ event, listener, options });
    },
    hasClass: (token) => classes.has(token)
  };
};

const createHarness = (overrides = {}) => {
  const calls = [];
  const state = { currentUser: null };
  const config = { uiLanguage: 'en' };
  const elements = {
    usernameInput: { value: '' },
    passwordInput: { value: '' },
    authContainer: createTrackedElement(calls, 'authContainer'),
    appContainer: createTrackedElement(calls, 'appContainer')
  };
  const dependencies = {
    window: { location: { reload: () => calls.push('reload') } },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, delay) => {
      calls.push(['timeout', delay]);
      callback();
      return 1;
    },
    console: { error: (...args) => calls.push(['error', ...args]) },
    elements,
    state,
    getConfig: () => config,
    legacyRuntimeContext: {
      resolveBinding: (name) => {
        calls.push(['resolveBinding', name]);
        return () => calls.push(['binding', name]);
      }
    },
    runtimeStorageAdapter: { clear: async () => calls.push('clear') },
    i18n: {
      en: {
        usernamePasswordRequired: 'Required',
        passwordIncorrect: 'Wrong password',
        confirmLogout: 'Confirm logout?',
        logoutConfirmation: 'Logout',
        deleteAllDataTitle: 'Delete all',
        deleteAllDataMessage: 'Type DELETE',
        cancel: 'Cancel',
        confirmDelete: 'Delete',
        deleteAllDataSuccess: 'Deleted',
        deleteAllDataError: 'Delete failed',
        incorrectInput: 'Incorrect'
      }
    },
    showNotification: (...args) => calls.push(['notification', ...args]),
    showCustomConfirm: async () => true,
    showCustomDialog: async () => 'DELETE',
    getUserKey: (username) => `user:${username}`,
    getItem: async () => null,
    setItem: async (...args) => calls.push(['setItem', ...args]),
    removeItem: async (...args) => calls.push(['removeItem', ...args]),
    verifyPasswordRecord: async () => false,
    upgradeLegacyPasswordRecord: async () => null,
    createPasswordRecord: async (username, password) => {
      calls.push(['createPasswordRecord', username, password]);
      return { username, passwordHash: 'new-hash' };
    },
    loadConfig: async () => calls.push('loadConfig'),
    loadAppData: async () => calls.push('loadAppData'),
    applyCustomWallpaper: () => calls.push('applyCustomWallpaper'),
    applyUiTheme: () => calls.push('applyUiTheme'),
    ...overrides
  };
  return {
    calls,
    state,
    config,
    elements,
    helper: createSettingsAuthActionsHelper(dependencies)
  };
};

test('module exports createSettingsAuthActionsHelper', () => {
  assert.equal(typeof createSettingsAuthActionsHelper, 'function');
});

test('login success writes auth storage, transitions containers, and initializes app', async () => {
  const { helper, calls, state, elements } = createHarness();
  elements.usernameInput.value = ' alice ';
  elements.passwordInput.value = 'correct-password';

  await helper.handleLogin({ preventDefault: () => calls.push('preventDefault') });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'createPasswordRecord'), [
    ['createPasswordRecord', 'alice', 'correct-password']
  ]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), [
    ['setItem', 'user:alice', JSON.stringify({ username: 'alice', passwordHash: 'new-hash' })],
    ['setItem', 'chat_storageOwnerUser', 'alice'],
    ['setItem', 'chat_lastUser', 'alice']
  ]);
  assert.deepEqual(state.currentUser, { username: 'alice', passwordHash: 'new-hash' });
  assert.equal(elements.authContainer.hasClass('visible'), false);
  assert.equal(elements.authContainer.hasClass('fade-out'), true);
  assert.equal(elements.appContainer.hasClass('hidden'), false);
  assert.equal(elements.appContainer.hasClass('visible'), true);
  assert.deepEqual(calls.filter((call) => typeof call === 'string' && [
    'loadConfig',
    'loadAppData',
    'applyCustomWallpaper',
    'applyUiTheme'
  ].includes(call)), [
    'loadConfig',
    'loadAppData',
    'applyCustomWallpaper',
    'applyUiTheme'
  ]);
  assert.deepEqual(calls.slice(-2), [
    ['resolveBinding', 'app.initChatApp'],
    ['binding', 'app.initChatApp']
  ]);
});

test('login failure reports error and does not initialize app', async () => {
  const { helper, calls, state, elements } = createHarness({
    getItem: async () => JSON.stringify({ username: 'alice' }),
    verifyPasswordRecord: async () => false
  });
  elements.usernameInput.value = 'alice';
  elements.passwordInput.value = 'wrong';

  await helper.handleLogin({ preventDefault: () => calls.push('preventDefault') });

  assert.equal(state.currentUser, null);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), []);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'notification' && call[2] === 'error'), true);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'resolveBinding'), false);
});

test('logout accepted removes last user and reloads', async () => {
  const { helper, calls } = createHarness({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return true;
    }
  });

  await helper.handleLogout();

  assert.deepEqual(calls, [
    'confirmLogout',
    ['removeItem', 'chat_lastUser'],
    'reload'
  ]);
});

test('logout remembers current owner before clearing active session marker', async () => {
  const { helper, calls, state } = createHarness({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return true;
    }
  });
  state.currentUser = { username: 'alice' };

  await helper.handleLogout();

  assert.deepEqual(calls, [
    'confirmLogout',
    ['setItem', 'chat_storageOwnerUser', 'alice'],
    ['removeItem', 'chat_lastUser'],
    'reload'
  ]);
});

test('login as another stored owner removes the previous workspace data', async () => {
  const { helper, calls, elements } = createHarness({
    getItem: async (key) => (key === 'chat_storageOwnerUser' ? 'alice' : null),
    runtimeStorageAdapter: {
      clear: async () => calls.push('clear'),
      removeItemsByPrefix: async (...args) => calls.push(['removeItemsByPrefix', ...args])
    }
  });
  elements.usernameInput.value = 'bob';
  elements.passwordInput.value = 'correct-password';

  await helper.handleLogin({ preventDefault: () => calls.push('preventDefault') });

  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'removeItem'), [
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
    ['removeItem', 'chatFolderUiState_v1_alice']
  ]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'removeItemsByPrefix'), [
    ['removeItemsByPrefix', 'generatedImage:alice:']
  ]);
});

test('logout rejected leaves storage and page state untouched', async () => {
  const { helper, calls } = createHarness({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return false;
    }
  });

  await helper.handleLogout();

  assert.deepEqual(calls, ['confirmLogout']);
});

test('delete-all accepted clears storage, notifies, and reloads after delay', async () => {
  const { helper, calls } = createHarness({
    showCustomDialog: async (options) => {
      calls.push(['dialog', options.input.type, options.buttons.length]);
      return 'DELETE';
    }
  });

  await helper.handleDeleteAllData();

  assert.deepEqual(calls, [
    ['dialog', 'text', 2],
    'clear',
    ['notification', 'Deleted', 'success'],
    ['timeout', 2000],
    'reload'
  ]);
});

test('delete-all rejected does not clear storage or reload', async () => {
  const { helper, calls } = createHarness({
    showCustomDialog: async () => {
      calls.push('dialog');
      return null;
    }
  });

  await helper.handleDeleteAllData();

  assert.deepEqual(calls, ['dialog']);
});

test('import is inert and helper avoids runtime entry, bootstrap, and API key security ownership', () => {
  const source = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');

  assert.match(source, /export\s+function\s+createSettingsAuthActionsHelper/);
  assert.match(source, /handleLogin/);
  assert.match(source, /handleLogout/);
  assert.match(source, /handleDeleteAllData/);
  assert.doesNotMatch(source, /runtime-entry|legacy-app|main\.js|bootstrap|sidebar/);
  assert.doesNotMatch(source, /settings-save-settings-helper|settings-api-key-controls|sensitive-config-store|api-key-input-intent/);
});
