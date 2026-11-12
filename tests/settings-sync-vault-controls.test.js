import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSettingsSyncVaultControls } from '../src/app/runtime/settings/settings-sync-vault-controls.js';
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
  const announced = [];
  window.document.addEventListener('noureon:user-ready', (event) => announced.push(event.detail.user));
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;

  assert.equal(document.getElementById('sync-vault-account').textContent, 'person@example.com');
  // The round picture is drawn by ui/user-avatar/: the page only says who is signed in, and the places for it are in the markup.
  assert.equal(announced.at(-1)?.email, 'person@example.com');
  assert.ok(document.getElementById('user-avatar'));
  assert.ok(document.getElementById('user-avatar-edit'));
  assert.ok(document.getElementById('user-avatar-menu'));
  assert.ok(document.getElementById('user-avatar-input'));
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
  assert.match(window.document.getElementById('security-message').textContent, /所有裝置已登出/);
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
  assert.equal(window.document.getElementById('security-message').textContent, '登入密碼已更新。');
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
  assert.match(window.document.getElementById('security-message').textContent, /登出其他裝置失敗/);
  assert.equal(window.document.getElementById('security-message').classList.contains('is-error'), true);
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
  assert.equal(document.getElementById('sync-vault-account').nextElementSibling, row.parentElement, 'the tags come right under the email');
  assert.equal(row.previousElementSibling, document.getElementById('user-signin-summary'), 'the UID sits next to the way of signing in');

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
    const message = window.document.getElementById('security-message');
    assert.equal(message.textContent, expected);
    assert.equal(message.classList.contains('is-error'), true);
  }
});

const fillEmailForm = (document, { email = '', password = 'long-enough-1', confirmation = password } = {}) => {
  document.getElementById('account-link-email').value = email;
  document.getElementById('account-link-password').value = password;
  document.getElementById('account-link-password-confirmation').value = confirmation;
};
const submitEmailForm = async (document, window) => {
  document.getElementById('account-email-link-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
};

test('an account made with Google that set a password has an Email login although it has no Email identity: the page says so (the password is what counts)', async () => {
  const state = { password: false, calls: [] };
  const client = {
    auth: {
      getUserIdentities: async () => ({ data: { identities: [{ provider: 'google' }] }, error: null }),
      getUser: async () => ({ data: { user: { email: 'person@example.com', user_metadata: {} } }, error: null }),
      updateUser: async (payload) => { state.calls.push(payload); state.password = true; return { error: null }; }
    },
    rpc: async (name) => (name === 'account_has_password' ? { data: state.password, error: null } : { data: null, error: { message: 'no' } })
  };
  const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => client, isConfigured: () => true });
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;
  assert.equal(document.getElementById('account-email-link-toggle').classList.contains('hidden'), false, 'no password yet: there is a button to set it');
  assert.equal(document.getElementById('login-password-row').classList.contains('hidden'), true);

  document.getElementById('account-email-link-toggle').click();
  fillEmailForm(document);
  await submitEmailForm(document, window);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].password, 'long-enough-1');
  assert.equal(state.calls[0].data.email_password_set, true, 'the mark that stands in for the answer where the function is not in the project');
  assert.match(document.getElementById('account-email-message')?.textContent || document.getElementById('user-section').textContent, /Email 登入密碼已設定/);
  assert.equal(document.getElementById('account-email-link-toggle').classList.contains('hidden'), true, 'the button is gone: it is bound now');
  assert.equal(document.getElementById('account-email-status').classList.contains('hidden'), false);
  assert.equal(document.getElementById('login-password-row').classList.contains('hidden'), false, 'the login password can be changed now');
});

test('where the function is not in the project yet, the mark in the metadata of the account stands in; a function that says there is no password wins over a stale mark', async () => {
  const makeClient = (rpc, mark) => ({
    auth: {
      getUserIdentities: async () => ({ data: { identities: [{ provider: 'google' }] }, error: null }),
      getUser: async () => ({ data: { user: { user_metadata: mark ? { email_password_set: true } : {} } }, error: null })
    },
    rpc
  });
  const bound = async (client) => {
    const { window, controls, setCurrentUser } = createFixture({ getSupabase: () => client, isConfigured: () => true });
    setCurrentUser(cloudUser);
    controls.ensureSyncVaultSettings();
    await controls.refreshSyncVaultControls();
    return window.document.getElementById('account-email-link-toggle').classList.contains('hidden');
  };
  assert.equal(await bound(makeClient(async () => ({ data: null, error: { code: 'PGRST202' } }), true)), true, 'no function, marked: bound');
  assert.equal(await bound(makeClient(async () => ({ data: null, error: { code: 'PGRST202' } }), false)), false, 'no function, not marked: not bound');
  assert.equal(await bound(makeClient(async () => ({ data: false, error: null }), true)), false, 'the function says no password: the mark is stale');
});

test('an Email that is registered already is told so (no mail is sent for it), the wait for the local data is cleared, and nothing is said about a mail', async () => {
  const log = [];
  const client = {
    auth: {
      getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
      signInWithPassword: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
      signUp: async () => { log.push('signUp'); return { data: { user: { id: 'u1', identities: [] }, session: null }, error: null }; }
    }
  };
  const { window, controls, storage, values } = createFixture({ getSupabase: () => client, isConfigured: () => true });
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;
  document.getElementById('account-email-link-toggle').click();
  fillEmailForm(document, { email: 'me@example.com' });
  await submitEmailForm(document, window);
  assert.deepEqual(log, ['signUp']);
  const message = document.getElementById('user-section').textContent;
  assert.match(message, /已經註冊過/);
  assert.doesNotMatch(message, /驗證信已寄出/);
  assert.equal(values.has('chat_pendingCloudLink_v1'), false, 'the account is not waiting for a mail that does not come');
  void storage;
});

test('a new Email is told to wait for the mail, as before', async () => {
  const client = {
    auth: {
      getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
      signInWithPassword: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
      signUp: async () => ({ data: { user: { id: 'u2', identities: [{ provider: 'email' }] }, session: null }, error: null })
    }
  };
  const { window, controls, values } = createFixture({ getSupabase: () => client, isConfigured: () => true });
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  const { document } = window;
  document.getElementById('account-email-link-toggle').click();
  fillEmailForm(document, { email: 'new@example.com' });
  await submitEmailForm(document, window);
  assert.match(document.getElementById('user-section').textContent, /驗證信已寄出/);
  assert.equal(values.has('chat_pendingCloudLink_v1'), true, 'the local data waits for the confirmation');
});

// Start over: the password is forgotten and nothing else can open the vault. The Email sign-in of the recovery is the proof (no current password).
const startOverFixture = async ({ serverAnswer }) => {
  const requests = [];
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } }, error: null }), getUserIdentities: async () => ({ data: { identities: [] }, error: null }), getUser: async () => ({ data: { user: { email: 'person@example.com' } }, error: null }) } };
  const notices = [];
  const fixture = createFixture({ getSupabase: () => supabase, showNotification: (message, type) => notices.push({ message, type }) });
  fixture.window.confirm = () => true;
  fixture.window.fetch = async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return serverAnswer(); };
  fixture.setCurrentUser(cloudUser);
  await createAndUnlockSyncVault({ storage: fixture.storage, username: cloudUser.username, password: 'old-password-123' });
  await fixture.storage.setItem(`chatSyncVaultRecovery_v1_${cloudUser.username}`, 'state-1');
  fixture.window.happyDOM.setURL('https://noureon.test/?vault_recovery=state-1');
  fixture.controls.ensureSyncVaultSettings();
  await fixture.controls.refreshSyncVaultControls();
  return { ...fixture, requests, notices };
};
const answer = (status, body) => () => ({ ok: status < 400, status, json: async () => body });

test('start over: the recovery panel offers it, asks the server to delete the recovery data with no password, and clears the local vault', async () => {
  const { window, requests, notices, values } = await startOverFixture({ serverAnswer: answer(200, { deleted: true }) });
  assert.equal(window.document.getElementById('sync-vault-recovery-panel').classList.contains('hidden'), false);
  assert.ok(window.document.getElementById('sync-vault-start-over-btn'));
  assert.ok(values.has(`chatSyncVault_v1_${cloudUser.username}`));

  window.document.getElementById('sync-vault-start-over-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(requests.map((request) => request.body), [{ action: 'delete' }], 'no password is sent: the Email sign-in is the proof');
  assert.equal(values.has(`chatSyncVault_v1_${cloudUser.username}`), false, 'the vault record of this device is gone');
  assert.equal(values.has(`chatSyncVaultRecovery_v1_${cloudUser.username}`), false, 'the recovery state is gone');
  assert.equal(new URL(window.location.href).searchParams.has('vault_recovery'), false, 'and the address is clean');
  assert.equal(window.document.getElementById('sync-vault-recovery-panel').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('sync-vault-create-panel').classList.contains('hidden'), false, 'a new sync password can be made now');
  assert.match(notices.at(-1).message, /重新開始/);
});

test('start over: an Email sign-in that is too old changes nothing and says to ask for a new verification Email', async () => {
  const { window, notices, values } = await startOverFixture({ serverAnswer: answer(403, { error: 'The current sync password is required', code: 'current_password_required' }) });

  window.document.getElementById('sync-vault-start-over-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(values.has(`chatSyncVault_v1_${cloudUser.username}`), 'the vault is kept');
  assert.equal(notices.at(-1).type, 'error');
  assert.match(notices.at(-1).message, /逾時/);
});

test('start over: declining the confirmation does nothing', async () => {
  const { window, requests, values } = await startOverFixture({ serverAnswer: answer(200, { deleted: true }) });
  window.confirm = () => false;

  window.document.getElementById('sync-vault-start-over-btn').click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(requests.length, 0);
  assert.ok(values.has(`chatSyncVault_v1_${cloudUser.username}`));
});

test('the security page sits right after the user page and holds the login password and the sync password; the user page keeps who the person is and the ways to sign in', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  const { document } = window;

  assert.deepEqual([...document.querySelectorAll('#settings-nav .settings-nav-item')].map((item) => item.dataset.section), ['user', 'security', 'personalization']);
  assert.equal(document.getElementById('security-section-nav').dataset.langKey, 'securitySettings');
  assert.equal(document.getElementById('user-section').nextElementSibling.id, 'security-section');

  const inSecurity = ['login-password-row', 'login-password-panel', 'sync-vault-create-panel', 'sync-vault-unlock-panel', 'sync-vault-recovery-panel', 'sync-vault-start-over-btn', 'sync-vault-manage-toggle', 'security-message'];
  const inUser = ['user-avatar', 'account-email-status', 'account-google-status', 'account-email-link-form', 'account-link-message'];
  for (const id of inSecurity) assert.ok(document.getElementById('security-section').querySelector(`#${id}`), `${id} is on the security page`);
  for (const id of inUser) assert.ok(document.getElementById('user-section').querySelector(`#${id}`), `${id} is on the user page`);
  assert.equal(document.getElementById('user-section').querySelector('#login-password-row, #sync-vault-create-panel'), null, 'nothing of the passwords is left on the user page');

  // Asking again builds nothing twice.
  controls.ensureSyncVaultSettings();
  assert.equal(document.querySelectorAll('#security-section-nav').length, 1);
  assert.equal(document.querySelectorAll('#security-section').length, 1);
});

test('the show/hide button of the password boxes of the security page works, and the page follows a change of language', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser(cloudUser);
  controls.ensureSyncVaultSettings();
  const eye = window.document.querySelector('#sync-vault-create-password').parentElement.querySelector('[data-us-eye]');
  const input = window.document.getElementById('sync-vault-create-password');
  eye.click();
  assert.equal(input.type, 'text');
  eye.click();
  assert.equal(input.type, 'password');
});

// The authenticator app: Supabase's TOTP factor. A fake `auth.mfa` keeps the factors; `aal` is what the session has confirmed.
const mfaFixture = async ({ factors = [], aal = { currentLevel: 'aal1', nextLevel: 'aal1' }, goodCode = '123456' } = {}) => {
  const state = { factors: [...factors], aal: { ...aal }, enrolled: 0, verified: [], unenrolled: [] };
  const mfa = {
    listFactors: async () => ({ data: { all: state.factors, totp: state.factors.filter((factor) => factor.factor_type === 'totp') }, error: null }),
    enroll: async () => {
      state.enrolled += 1;
      const factor = { id: `factor-${state.enrolled}`, factor_type: 'totp', status: 'unverified' };
      state.factors.push(factor);
      return { data: { id: factor.id, totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'ABCDEFGHJKLMNPQR', uri: 'otpauth://totp/Noureon:me?secret=ABCDEFGHJKLMNPQR&issuer=Noureon' } }, error: null };
    },
    challengeAndVerify: async ({ factorId, code }) => {
      state.verified.push({ factorId, code });
      if (code !== goodCode) return { data: null, error: { message: 'Invalid TOTP code entered' } };
      const factor = state.factors.find((entry) => entry.id === factorId);
      if (factor) factor.status = 'verified';
      state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' };
      return { data: {}, error: null };
    },
    unenroll: async ({ factorId }) => { state.unenrolled.push(factorId); state.factors = state.factors.filter((factor) => factor.id !== factorId); return { data: {}, error: null }; },
    getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null })
  };
  const supabase = { auth: { mfa, getSession: async () => ({ data: { session: { access_token: 'token-1' } }, error: null }), getUserIdentities: async () => ({ data: { identities: [] }, error: null }), getUser: async () => ({ data: { user: { email: 'person@example.com' } }, error: null }) } };
  const notices = [];
  const fixture = createFixture({ getSupabase: () => supabase, showNotification: (message, type) => notices.push({ message, type }) });
  fixture.window.confirm = () => true;
  const requests = [];
  fixture.window.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ deleted: true }) }; };
  fixture.setCurrentUser(cloudUser);
  await createAndUnlockSyncVault({ storage: fixture.storage, username: cloudUser.username, password: 'old-password-123' });
  fixture.controls.ensureSyncVaultSettings();
  await fixture.controls.refreshSyncVaultControls();
  await flush();
  return { ...fixture, state, notices, requests, byId: (id) => fixture.window.document.getElementById(id) };
};

test('authenticator: the card shows for a cloud account, setup draws the QR code and the setup key to type in, and six digits turn it on', async () => {
  const { byId, state, notices } = await mfaFixture();
  assert.equal(byId('security-totp-card').classList.contains('hidden'), false);
  assert.equal(byId('security-totp-off').classList.contains('hidden'), false);

  byId('security-totp-start-btn').click();
  await flush();
  assert.equal(byId('security-totp-setup').classList.contains('hidden'), false);
  assert.match(byId('security-totp-qr').getAttribute('src'), /^data:image/);
  assert.equal(byId('security-totp-secret').value, 'ABCD EFGH JKLM NPQR', 'the key to type in, in groups of four');
  assert.match(byId('security-totp-open').getAttribute('href'), /^otpauth:\/\/totp\//);

  byId('security-totp-code').value = '12ab34';
  byId('security-totp-code').dispatchEvent(new (byId('security-totp-code').ownerDocument.defaultView.Event)('input'));
  assert.equal(byId('security-totp-code').value, '1234', 'only digits are kept');

  byId('security-totp-code').value = '123456';
  byId('security-totp-confirm-btn').click();
  await flush();
  assert.deepEqual(state.verified.at(-1), { factorId: 'factor-1', code: '123456' });
  assert.equal(byId('security-totp-on').classList.contains('hidden'), false);
  assert.equal(byId('security-totp-setup').classList.contains('hidden'), true);
  assert.match(notices.at(-1).message, /驗證器已啟用/);
});

test('authenticator: a wrong code keeps the setup open and nothing is turned on', async () => {
  const { byId, state, notices } = await mfaFixture();
  byId('security-totp-start-btn').click();
  await flush();
  byId('security-totp-code').value = '000000';
  byId('security-totp-confirm-btn').click();
  await flush();
  assert.equal(byId('security-totp-setup').classList.contains('hidden'), false);
  assert.equal(state.factors[0].status, 'unverified');
  assert.equal(notices.at(-1).type, 'error');
  assert.match(notices.at(-1).message, /不正確/);
});

test('authenticator: cancelling the setup removes the unfinished factor', async () => {
  const { byId, state } = await mfaFixture();
  byId('security-totp-start-btn').click();
  await flush();
  byId('security-totp-cancel-btn').click();
  await flush();
  assert.deepEqual(state.unenrolled, ['factor-1']);
  assert.equal(byId('security-totp-off').classList.contains('hidden'), false);
});

test('authenticator: with one set up, the six digits are asked for before the recovery is changed, and the action goes on only after they are right', async () => {
  const { byId, state, requests, values } = await mfaFixture({
    factors: [{ id: 'factor-9', factor_type: 'totp', status: 'verified' }],
    aal: { currentLevel: 'aal1', nextLevel: 'aal2' }
  });
  assert.equal(byId('security-totp-on').classList.contains('hidden'), false);

  byId('sync-vault-current-password').value = 'old-password-123';
  byId('sync-vault-reset-btn').click();
  await flush();
  assert.equal(byId('security-mfa-challenge').classList.contains('hidden'), false, 'the code is asked for');
  assert.equal(requests.length, 0, 'nothing is sent to the server yet');

  byId('security-mfa-code').value = '999999';
  byId('security-mfa-confirm-btn').click();
  await flush();
  assert.equal(byId('security-mfa-challenge').classList.contains('hidden'), false, 'a wrong code keeps it open');
  assert.equal(byId('security-mfa-error').classList.contains('hidden'), false);
  assert.equal(requests.length, 0);

  byId('security-mfa-code').value = '123456';
  byId('security-mfa-confirm-btn').click();
  await flush();
  assert.deepEqual(state.verified.map((entry) => entry.code), ['999999', '123456']);
  assert.equal(byId('security-mfa-challenge').classList.contains('hidden'), true);
  assert.deepEqual(requests, [{ action: 'delete', currentPassword: 'old-password-123' }], 'the action went on');
  assert.equal(values.has(`chatSyncVault_v1_${cloudUser.username}`), false);
});

test('authenticator: giving up at the code stops the action, and a session that already confirmed the code is not asked again', async () => {
  const asked = await mfaFixture({ factors: [{ id: 'factor-9', factor_type: 'totp', status: 'verified' }], aal: { currentLevel: 'aal1', nextLevel: 'aal2' } });
  asked.byId('sync-vault-current-password').value = 'old-password-123';
  asked.byId('sync-vault-reset-btn').click();
  await flush();
  asked.byId('security-mfa-cancel-btn').click();
  await flush();
  assert.equal(asked.requests.length, 0);
  assert.equal(asked.byId('security-mfa-challenge').classList.contains('hidden'), true);

  const done = await mfaFixture({ factors: [{ id: 'factor-9', factor_type: 'totp', status: 'verified' }], aal: { currentLevel: 'aal2', nextLevel: 'aal2' } });
  done.byId('sync-vault-current-password').value = 'old-password-123';
  done.byId('sync-vault-reset-btn').click();
  await flush();
  assert.equal(done.byId('security-mfa-challenge').classList.contains('hidden'), true);
  assert.equal(done.requests.length, 1);
});

test('authenticator: removing it asks for the code first and then unenrolls the factor', async () => {
  const { byId, state } = await mfaFixture({ factors: [{ id: 'factor-9', factor_type: 'totp', status: 'verified' }], aal: { currentLevel: 'aal1', nextLevel: 'aal2' } });
  byId('security-totp-remove-btn').click();
  await flush();
  assert.equal(byId('security-mfa-challenge').classList.contains('hidden'), false);
  byId('security-mfa-code').value = '123456';
  byId('security-mfa-confirm-btn').click();
  await flush();
  assert.deepEqual(state.unenrolled, ['factor-9']);
  assert.equal(byId('security-totp-off').classList.contains('hidden'), false);
});

test('authenticator: a client with no auth.mfa hides the card and never asks for a code; a local account has no card', async () => {
  const { byId } = await mfaFixture();
  assert.equal(byId('security-totp-card').classList.contains('hidden'), false);
  const local = createFixture({ getSupabase: () => ({ auth: { getUserIdentities: async () => ({ data: { identities: [] }, error: null }) } }) });
  local.controls.ensureSyncVaultSettings();
  await local.controls.refreshSyncVaultControls();
  assert.equal(local.window.document.getElementById('security-totp-card').classList.contains('hidden'), true);
});
