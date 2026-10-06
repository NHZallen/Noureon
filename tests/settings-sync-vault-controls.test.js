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
  assert.ok(eye.querySelector('.us-eye-off') && eye.querySelector('.us-eye-on'), 'the slashed eye and the open eye are both there');
  assert.ok(eye.querySelector('.us-eye-off path[d="m3 3 18 18"]'), 'the one for a hidden password has the slash');
  assert.equal(eye.querySelector('.us-eye-on path[d="m3 3 18 18"]'), null, 'the open one has none');
  assert.equal(eye.getAttribute('aria-pressed'), 'false', 'hidden: the slashed eye is the one drawn');
  eye.click();
  assert.equal(input.type, 'text');
  assert.equal(eye.getAttribute('aria-pressed'), 'true', 'shown: the open eye is the one drawn');
  eye.click();
  assert.equal(input.type, 'password');
  assert.equal(eye.getAttribute('aria-pressed'), 'false');
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

const identitiesClient = (providers) => ({ auth: { getUserIdentities: async () => ({ data: { identities: providers.map((provider) => ({ provider })) }, error: null }) } });

test('a way to sign in that is not set up has a button, the Email one opens its form, and a bound one shows its status instead', async () => {
  const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => identitiesClient(['google']), isConfigured: () => true });
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;
  const toggle = document.getElementById('account-email-link-toggle');
  const form = document.getElementById('account-email-link-form');

  assert.equal(toggle.classList.contains('hidden'), false, 'there is a button to set Email up');
  assert.equal(toggle.textContent, '綁定 Email');
  assert.equal(document.getElementById('account-email-link-btn').textContent, '設定 Email 登入密碼', 'an account that is signed in already only needs a password');
  assert.equal(document.getElementById('account-email-status').classList.contains('hidden'), true, 'the button stands in for the status');
  assert.equal(form.classList.contains('hidden'), true, 'the form starts folded');
  assert.equal(document.getElementById('account-link-email').closest('.us-field').classList.contains('hidden'), true, 'its Email is known: no box for it');
  toggle.click();
  assert.equal(form.classList.contains('hidden'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, '取消');
  toggle.click();
  assert.equal(form.classList.contains('hidden'), true);
  assert.equal(toggle.textContent, '綁定 Email');

  assert.equal(document.getElementById('account-google-link-btn').classList.contains('hidden'), true, 'Google is bound: no button');
  assert.equal(document.getElementById('account-google-status').classList.contains('hidden'), false);
  assert.equal(document.getElementById('account-google-status').textContent.trim(), '已綁定');
});

test('a cloud account shows its UID under the email with a copy button, and a local account shows none', async () => {
  const uidClient = (uid) => ({
    ...identitiesClient(['google']),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { uid }, error: null }) }) }) })
  });
  const cloud = createFixture({ getSupabase: () => uidClient('48201735'), isConfigured: () => true });
  cloud.setCurrentUser({ ...cloudUser, supabaseUserId: 'user-1' });
  cloud.controls.ensureSyncVaultSettings();
  await cloud.controls.refreshSyncVaultControls();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { document } = cloud.window;
  const row = document.getElementById('user-uid-row');
  assert.equal(row.classList.contains('hidden'), false);
  assert.equal(document.getElementById('user-uid-value').textContent, 'NR-48201735');
  assert.equal(document.getElementById('user-uid-copy').getAttribute('aria-label'), '複製 UID');
  assert.equal(document.getElementById('sync-vault-account').nextElementSibling, row, 'it sits right under the email');

  const local = createFixture({ getSupabase: () => uidClient('48201735'), isConfigured: () => true });
  local.controls.ensureSyncVaultSettings();
  await local.controls.refreshSyncVaultControls();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(local.window.document.getElementById('user-uid-row').classList.contains('hidden'), true);
});

test('a local account is asked for its Email and a password, and bound Email shows only its status', async () => {
  const local = createFixture({ getSupabase: () => identitiesClient([]), isConfigured: () => true });
  local.controls.ensureSyncVaultSettings();
  await local.controls.refreshSyncVaultControls();
  assert.equal(local.window.document.getElementById('account-email-link-toggle').textContent, '綁定 Email');
  assert.equal(local.window.document.getElementById('account-link-email').closest('.us-field').classList.contains('hidden'), false);
  assert.equal(local.window.document.getElementById('account-google-link-btn').classList.contains('hidden'), false);

  const both = createFixture({ getSupabase: () => identitiesClient(['email', 'google']), isConfigured: () => true });
  both.setCurrentUser(cloudUser);
  both.controls.ensureSyncVaultSettings();
  await both.controls.refreshSyncVaultControls();
  assert.equal(both.window.document.getElementById('account-email-link-toggle').classList.contains('hidden'), true);
  assert.equal(both.window.document.getElementById('account-email-status').classList.contains('hidden'), false);
  assert.equal(both.window.document.getElementById('login-password-row').classList.contains('hidden'), false, 'with Email set up the password can be changed');
});

test('without a cloud connection there is no bind button, only the status', async () => {
  const { window, controls } = createFixture({ isConfigured: () => false });
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  assert.equal(window.document.getElementById('account-email-link-toggle').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('account-email-status').classList.contains('hidden'), false);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

test('a sync password that is too short is reported in the person\'s language, not in the vault\'s English', async () => {
  const notices = [];
  const { window, controls, setCurrentUser, storage } = createFixture({ showNotification: (message, kind) => notices.push([message, kind]) });
  setCurrentUser(cloudUser);
  await createAndUnlockSyncVault({ storage, username: cloudUser.username, password: 'correct horse battery' });
  lockSyncVault(cloudUser.username);
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  window.document.getElementById('sync-vault-unlock-password').value = 'short';
  window.document.getElementById('sync-vault-unlock-btn').click();
  await flush();
  assert.deepEqual(notices.at(-1), ['同步密碼至少需要 10 碼。', 'error']);

  const before = notices.length;
  window.document.getElementById('sync-vault-unlock-password').value = 'a wrong password, long enough';
  window.document.getElementById('sync-vault-unlock-btn').click();
  // Unlocking derives a key, which takes a moment.
  for (let waited = 0; notices.length === before && waited < 5000; waited += 20) await flush();
  assert.deepEqual(notices.at(-1), ['同步密碼不正確。', 'error']);
});

test('the errors Supabase answers in English are shown in the person\'s language when changing the login password', async () => {
  const failing = (error) => ({ auth: {
    getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
    getUser: async () => ({ data: { user: { email: 'person@example.com' } }, error: null }),
    signInWithPassword: async () => ({ error: error.at === 'signIn' ? error.value : null }),
    updateUser: async () => ({ error: error.at === 'update' ? error.value : null }),
    signOut: async () => ({ error: null })
  } });
  const cases = [
    [{ at: 'signIn', value: { code: 'invalid_credentials', message: 'Invalid login credentials' } }, '目前登入密碼不正確。'],
    [{ at: 'update', value: { code: 'same_password', message: 'New password should be different from the old password.' } }, '新密碼不能和目前的密碼相同。'],
    [{ at: 'update', value: { code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' } }, '嘗試次數過多，請稍後再試。'],
    [{ at: 'update', value: { message: 'Something else from the server' } }, 'Something else from the server']
  ];
  for (const [error, expected] of cases) {
    const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => failing(error), scheduleTimeout: (callback) => callback() });
    setCurrentUser(cloudUser);
    controls.ensureSyncVaultSettings();
    fillPasswordChange(window.document);
    window.document.getElementById('login-password-change-btn').click();
    await flush();
    const message = window.document.getElementById('account-link-message');
    assert.equal(message.textContent, expected);
    assert.equal(message.classList.contains('is-error'), true);
  }
});
