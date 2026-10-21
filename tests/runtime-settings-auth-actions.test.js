import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacySettingsAuthProviderLifecycle } from '../src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';
import { createTrackedElement, createDependencies } from './helpers/settings-lifecycle-harness.js';

test('delete-all path uses injected storage adapter and preserves reload ordering', async () => {
  const { dependencies, calls } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls.slice(0, 4), [
    'clear',
    ['notification', 'Deleted', 'success'],
    ['timeout', 2000],
    'reload'
  ]);
});

test('login success preserves auth storage, visibility transitions, and init handoff', async () => {
  const { dependencies, calls, state } = createDependencies();
  const authContainer = createTrackedElement(calls, 'authContainer');
  const appContainer = createTrackedElement(calls, 'appContainer');
  const event = { preventDefault: () => calls.push('preventDefault') };
  dependencies.elements.usernameInput.value = ' alice ';
  dependencies.elements.passwordInput.value = 'correct-password';
  dependencies.elements.authContainer = authContainer;
  dependencies.elements.appContainer = appContainer;
  dependencies.createPasswordRecord = async (username, password) => {
    calls.push(['createPasswordRecord', username, password]);
    return { username, passwordHash: 'new-hash' };
  };

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.handleLogin(event);

  assert.deepEqual(calls.filter((call) => call === 'preventDefault'), ['preventDefault']);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'createPasswordRecord'), [
    ['createPasswordRecord', 'alice', 'correct-password']
  ]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), [
    ['setItem', 'user:alice', JSON.stringify({ username: 'alice', passwordHash: 'new-hash' })],
    ['setItem', 'chat_storageOwnerUser', 'alice'],
    ['setItem', 'chat_lastUser', 'alice']
  ]);
  assert.deepEqual(state.currentUser, { username: 'alice', passwordHash: 'new-hash' });
  assert.equal(authContainer.hasClass('visible'), false);
  assert.equal(authContainer.hasClass('fade-out'), true);
  assert.equal(appContainer.hasClass('hidden'), false);
  assert.equal(appContainer.hasClass('visible'), true);
  assert.equal(authContainer.listeners[0]?.event, 'transitionend');
  assert.deepEqual(calls.slice(-1), [
    ['initChatApp']
  ]);
});

test('login failure keeps failure path isolated and does not initialize app', async () => {
  const { dependencies, calls, state } = createDependencies({
    getItem: async (key) => {
      calls.push(['getItem', key]);
      return JSON.stringify({ username: 'alice', passwordHash: 'old-hash' });
    },
    verifyPasswordRecord: async (password, record) => {
      calls.push(['verifyPasswordRecord', password, record.username]);
      return false;
    }
  });
  dependencies.elements.usernameInput.value = 'alice';
  dependencies.elements.passwordInput.value = 'wrong-password';

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  await lifecycle.handleLogin({ preventDefault: () => calls.push('preventDefault') });

  assert.equal(state.currentUser, null);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === 'setItem'), []);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'notification' && call[2] === 'error'), true);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'initChatApp'), false);
  assert.equal(calls.includes('renderAll'), false);
});

test('logout confirm accepted clears last user and reloads', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return true;
    },
    removeItem: async (...args) => calls.push(['removeItem', ...args])
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleLogout();

  assert.deepEqual(calls, [
    'confirmLogout',
    ['removeItem', 'chat_lastUser'],
    'reload'
  ]);
});

test('logout confirm rejected does not clear storage or reload', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomConfirm: async () => {
      calls.push('confirmLogout');
      return false;
    },
    removeItem: async (...args) => calls.push(['removeItem', ...args])
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleLogout();

  assert.deepEqual(calls, ['confirmLogout']);
});

test('delete-all confirm accepted clears storage, notifies, and reloads after delay', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomDialog: async (options) => {
      calls.push(['dialog', options.input.type, options.buttons.length]);
      return 'DELETE';
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls, [
    ['dialog', 'text', 2],
    'clear',
    ['notification', 'Deleted', 'success'],
    ['timeout', 2000],
    'reload'
  ]);
});

test('delete-all confirm rejected does not clear storage or reload', async () => {
  const { dependencies, calls } = createDependencies({
    showCustomDialog: async () => {
      calls.push('dialog');
      return null;
    }
  });
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.handleDeleteAllData();

  assert.deepEqual(calls, ['dialog']);
});
