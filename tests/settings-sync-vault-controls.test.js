import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSettingsSyncVaultControls } from '../src/app/runtime/legacy-core/settings-sync-vault-controls.js';
import { createAndUnlockSyncVault, lockSyncVault } from '../src/app/sync/sync-vault.js';

function createFixture(overrides = {}) {
  const window = new Window();
  window.document.body.innerHTML = `
    <div id="settings-modal">
      <ul id="settings-nav">
        <li class="settings-nav-item" data-section="personalization">Personalization</li>
      </ul>
      <div id="personalization-section" class="settings-section"></div>
    </div>
  `;
  let currentUser = { username: 'local-user', displayName: 'Local User' };
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const controls = createSettingsSyncVaultControls({
    window,
    document: window.document,
    storage,
    getCurrentUser: () => currentUser,
    getText: (_key, fallback) => fallback,
    showNotification: () => {},
    loadStyles: async () => {},
    ...overrides
  });
  return {
    window,
    controls,
    storage,
    values,
    setCurrentUser: user => { currentUser = user; }
  };
}

test('sync vault settings add a user section while keeping local accounts read only', async () => {
  const { window, controls } = createFixture();

  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();

  assert.equal(window.document.querySelector('#settings-nav').firstElementChild.id, 'user-section-nav');
  assert.ok(window.document.getElementById('user-section'));
  assert.equal(window.document.getElementById('sync-vault-cloud-only-panel').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('sync-vault-create-panel').classList.contains('hidden'), true);
  assert.match(window.document.getElementById('sync-vault-status').textContent, /不可用/);
  assert.doesNotMatch(window.document.getElementById('sync-vault-cloud-only-panel').className, /amber|yellow/);
});

test('sync vault settings hydrate an already-rendered user navigation shell', () => {
  const { window, controls } = createFixture();
  const nav = window.document.createElement('li');
  nav.id = 'user-section-nav';
  nav.className = 'settings-nav-item p-3 rounded-md';
  nav.dataset.section = 'user';
  window.document.getElementById('settings-nav').prepend(nav);
  const section = window.document.createElement('div');
  section.id = 'user-section';
  section.className = 'settings-section';
  window.document.getElementById('personalization-section').before(section);

  controls.ensureSyncVaultSettings();

  assert.equal(window.document.querySelectorAll('#user-section-nav').length, 1);
  assert.equal(section.dataset.syncVaultSettingsInitialized, 'true');
  assert.notEqual(window.document.getElementById('sync-vault-account'), null);
});

test('linked Supabase accounts can create a sync vault password', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser({
    username: 'supabase:user-123',
    email: 'person@example.com',
    authProvider: 'supabase'
  });

  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();

  assert.equal(window.document.getElementById('sync-vault-cloud-only-panel').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('sync-vault-create-panel').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('sync-vault-account').textContent, 'person@example.com');
});

const cloudUser = { username: 'supabase:user-123', email: 'person@example.com', authProvider: 'supabase' };

const fakeSupabase = ({ signOutError = null } = {}) => {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
        getUser: async () => ({ data: { user: { email: 'person@example.com' } }, error: null }),
        signInWithPassword: async () => { calls.push('signIn'); return { error: null }; },
        updateUser: async () => { calls.push('update'); return { error: null }; },
        signOut: async (options) => { calls.push(`signOut:${options?.scope}`); return { error: signOutError }; }
      }
    }
  };
};

const fillPasswordChange = (document, { current = 'old-password', next = 'new-password-1', confirmation = next } = {}) => {
  document.getElementById('login-current-password').value = current;
  document.getElementById('login-new-password').value = next;
  document.getElementById('login-new-password-confirmation').value = confirmation;
};

test('the user page has the identity card, folded password settings and a place for the verification check', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;

  assert.equal(document.getElementById('sync-vault-account').textContent, 'person@example.com');
  assert.equal(document.getElementById('user-avatar').textContent, 'P');
  assert.equal(document.getElementById('login-password-panel').classList.contains('hidden'), true, 'the password settings start folded');
  assert.equal(document.getElementById('login-password-signout-all').checked, true, 'signing out of every device is the default');
  assert.equal(document.getElementById('sync-vault-turnstile-slot').classList.contains('hidden'), true, 'no check, no box');
  assert.ok(document.getElementById('sync-vault-turnstile-anchor'), 'the check goes into its own box');
  for (const id of ['sync-vault-manage-toggle', 'sync-vault-manage-panel', 'login-password-row', 'login-password-toggle']) assert.ok(document.getElementById(id), id);
});

test('the password row opens and folds its settings, and the show/hide button turns a box between dots and text', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  const { document } = window;
  const toggle = document.getElementById('login-password-toggle');
  toggle.click();
  assert.equal(document.getElementById('login-password-panel').classList.contains('hidden'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, '取消');
  toggle.click();
  assert.equal(document.getElementById('login-password-panel').classList.contains('hidden'), true);
  assert.equal(toggle.textContent, '修改');

  const input = document.getElementById('login-current-password');
  const eye = input.parentElement.querySelector('[data-us-eye]');
  assert.equal(input.type, 'password');
  eye.click();
  assert.equal(input.type, 'text');
  assert.equal(eye.getAttribute('aria-pressed'), 'true');
  eye.click();
  assert.equal(input.type, 'password');
});

test('the sync state beside the title follows the vault: locked, unlocked, and the manage row only opens while it is unlocked', async () => {
  const { window, controls, setCurrentUser, storage } = createFixture();
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  await createAndUnlockSyncVault({ storage, username: cloudUser.username, password: 'correct horse battery' });
  await controls.refreshSyncVaultControls();
  const { document } = window;
  const state = document.getElementById('sync-vault-state');
  assert.equal(state.textContent.trim(), '已解鎖');
  assert.equal(state.classList.contains('is-on'), true);
  const manage = document.getElementById('sync-vault-manage-toggle');
  assert.equal(manage.classList.contains('hidden'), false);
  assert.equal(manage.getAttribute('aria-disabled'), 'false');
  manage.click();
  assert.equal(document.getElementById('sync-vault-manage-panel').classList.contains('hidden'), false);

  lockSyncVault(cloudUser.username);
  await controls.refreshSyncVaultControls();
  assert.equal(state.textContent.trim(), '已鎖定');
  assert.equal(state.classList.contains('is-warn'), true);
  assert.equal(manage.getAttribute('aria-disabled'), 'true');
  assert.equal(document.getElementById('sync-vault-manage-panel').classList.contains('hidden'), true, 'folded again when locked');
  manage.click();
  assert.equal(document.getElementById('sync-vault-manage-panel').classList.contains('hidden'), true, 'a locked vault does not open');
  assert.match(document.getElementById('sync-vault-status').textContent, /輸入同步密碼/);
});

test('a local account has no sync state and no password row', async () => {
  const { window, controls } = createFixture();
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  assert.equal(window.document.getElementById('sync-vault-state').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('sync-vault-manage-toggle').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('login-password-row').classList.contains('hidden'), true);
  assert.match(window.document.getElementById('user-signin-summary').textContent, /本機帳號/);
});

test('updating the login password signs out every device, this one too, and loads the page again', async () => {
  const { client, calls } = fakeSupabase();
  let reloads = 0;
  const { window, controls, setCurrentUser, values } = createFixture({ getSupabase: () => client, reloadPage: () => { reloads += 1; }, scheduleTimeout: (callback) => callback() });
  setCurrentUser(cloudUser);
  values.set('chat_lastUser', 'supabase:user-123');
  controls.ensureSyncVaultSettings();
  fillPasswordChange(window.document);
  window.document.getElementById('login-password-change-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(calls, ['signIn', 'update', 'signOut:global']);
  assert.equal(values.has('chat_lastUser'), false, 'the page asks for a sign-in after it loads');
  assert.equal(reloads, 1);
  assert.match(window.document.getElementById('account-link-message').textContent, /所有裝置已登出/);
  assert.equal(window.document.getElementById('login-new-password').value, '', 'the boxes are emptied');
});

test('with the box unticked the password is updated and nobody is signed out', async () => {
  const { client, calls } = fakeSupabase();
  let reloads = 0;
  const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => client, reloadPage: () => { reloads += 1; }, scheduleTimeout: (callback) => callback() });
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  window.document.getElementById('login-password-signout-all').checked = false;
  fillPasswordChange(window.document);
  window.document.getElementById('login-password-change-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['signIn', 'update']);
  assert.equal(reloads, 0);
  assert.equal(window.document.getElementById('account-link-message').textContent, '登入密碼已更新。');
});

test('when signing out of the other devices fails the person is told, and the page is not reloaded', async () => {
  const { client, calls } = fakeSupabase({ signOutError: new Error('network') });
  let reloads = 0;
  const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => client, reloadPage: () => { reloads += 1; }, scheduleTimeout: (callback) => callback() });
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  fillPasswordChange(window.document);
  window.document.getElementById('login-password-change-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['signIn', 'update', 'signOut:global']);
  assert.equal(reloads, 0);
  assert.match(window.document.getElementById('account-link-message').textContent, /登出其他裝置失敗/);
  assert.equal(window.document.getElementById('account-link-message').classList.contains('is-error'), true);
});

test('a password that is too short or does not match changes nothing', async () => {
  const { client, calls } = fakeSupabase();
  const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => client, scheduleTimeout: (callback) => callback() });
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  fillPasswordChange(window.document, { next: 'short' });
  window.document.getElementById('login-password-change-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  fillPasswordChange(window.document, { next: 'new-password-1', confirmation: 'other-password-2' });
  window.document.getElementById('login-password-change-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, []);
});
