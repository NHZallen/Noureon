import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { initializeSupabaseAuthBridge } from '../src/app/auth/supabase-auth-bridge.js';

// The sign-in page's behaviour, with a cloud, a device storage and a human check of its own (the `deps` hook): what happens when a person
// signs in, signs up, is refused, is rate limited, signs in with Google, goes to the old local accounts, or signs out.

const USER = { id: 'u1', email: 'ada@example.com' };
const CLOUD_NAME = 'supabase:u1';

const makeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async (key) => { data.delete(key); },
    removeItemsByPrefix: async (prefix) => { for (const key of [...data.keys()]) if (key.startsWith(prefix)) data.delete(key); }
  };
};

const page = ({ lang = 'en' } = {}) => {
  const happy = new Window();
  happy.document.documentElement.lang = lang;
  // The words of the page, one for each thing the sign-in can tell, so what is shown can be told apart.
  happy.i18n = { en: { cloudAuthMissingFields: 'MISSING', cloudAuthCheckEmail: 'CHECK-MAIL', loginWeakPassword: 'WEAK', authRateLimited: 'LIMITED', loginNetworkError: 'NETWORK', loginCaptchaFailed: 'CAPTCHA', loginUserExists: 'EXISTS', turnstileRequired: 'CHECK-REQUIRED', turnstileAgain: 'CHECK-AGAIN' } };
  happy.document.body.innerHTML = `
    <form id="auth-form">
      <input id="username-input"><input id="password-input" type="password">
      <button id="register-btn" type="submit">Login</button>
      <button id="import-btn-auth" type="button">Import</button>
    </form>
    <button id="logout-btn" type="button">Logout</button>`;
  const calls = { reload: 0, confirms: [], replaced: 0 };
  const win = {
    location: { origin: 'https://noureon.test', pathname: '/', reload: () => { calls.reload += 1; } },
    history: { replaceState: () => { calls.replaced += 1; } },
    document: happy.document,
    crypto: globalThis.crypto,
    answers: [],
    confirm: (message) => { calls.confirms.push(message); return win.answers.length ? win.answers.shift() : false; }
  };
  return { happy, document: happy.document, window: win, calls };
};

const makeAuth = (overrides = {}) => {
  const log = { signIn: [], signUp: [], oauth: [], signOut: [] };
  const listeners = [];
  const auth = {
    log,
    listeners,
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (listener) => { listeners.push(listener); },
    signInWithPassword: async (args) => { log.signIn.push(args); return { data: {}, error: { message: 'Invalid login credentials' } }; },
    signUp: async (args) => { log.signUp.push(args); return { data: { user: USER, session: null }, error: null }; },
    signInWithOAuth: async (args) => { log.oauth.push(args); return { error: null }; },
    signOut: async (args) => { log.signOut.push(args); return {}; },
    ...overrides
  };
  return auth;
};

const noTurnstile = () => ({ enabled: false, mount: async () => {}, getToken: () => '', reset: () => {}, waitForToken: async () => '' });

const boot = async ({ auth = makeAuth(), storage = makeStorage(), turnstile = noTurnstile(), startupIdentity, lang } = {}) => {
  const ui = page({ lang });
  const result = await initializeSupabaseAuthBridge({ window: ui.window, document: ui.document, startupIdentity, deps: { configured: true, supabase: { auth }, storage, turnstile } });
  const field = (id) => ui.document.getElementById(id);
  const submit = async ({ email = 'ada@example.com', password = 'correct horse' } = {}) => {
    field('username-input').value = email;
    field('password-input').value = password;
    const event = new ui.happy.Event('submit', { cancelable: true, bubbles: true });
    field('auth-form').dispatchEvent(event);
    for (let tick = 0; tick < 20; tick += 1) await new Promise((resolve) => setImmediate(resolve));
    return event;
  };
  const press = async (id) => {
    field(id).dispatchEvent(new ui.happy.Event('click', { cancelable: true, bubbles: true }));
    for (let tick = 0; tick < 20; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  const status = () => ui.document.getElementById('supabase-auth-status').textContent;
  return { ...ui, auth, storage, result, field, submit, press, status };
};

test('the sign-in page is not touched when the cloud is not set up, and the page without the sign-in form is left alone', async () => {
  const ui = page();
  assert.deepEqual(await initializeSupabaseAuthBridge({ window: ui.window, document: ui.document, deps: { configured: false } }), { enabled: false });
  ui.document.body.innerHTML = '';
  assert.deepEqual(await initializeSupabaseAuthBridge({ window: ui.window, document: ui.document, deps: { configured: true, supabase: { auth: makeAuth() }, storage: makeStorage(), turnstile: noTurnstile() } }), { enabled: true });
});

test('a person already signed in on this device is kept as the account of the device, without asking and without reloading', async () => {
  const storage = makeStorage({ chat_lastUser: CLOUD_NAME });
  const ui = await boot({ storage, startupIdentity: { sessionChecked: true, session: { user: USER } } });
  assert.equal(ui.calls.reload, 0);
  assert.equal(ui.calls.confirms.length, 0);
  assert.equal(JSON.parse(storage.data.get(`chatUser_${CLOUD_NAME}`)).authProvider, 'supabase');
  assert.equal(storage.data.get('chat_lastUser'), CLOUD_NAME);
  assert.equal(storage.data.get('chat_storageOwnerUser'), CLOUD_NAME);
});

test('signing in on a new device asks whether to bring the old local data: no keeps the account and reloads, yes waits for the old password', async () => {
  const declined = await boot({ storage: makeStorage(), startupIdentity: { sessionChecked: true, session: { user: USER } } });
  assert.equal(declined.calls.confirms.length, 1);
  assert.equal(declined.calls.reload, 1);
  assert.equal(declined.storage.data.get('chat_lastUser'), CLOUD_NAME);

  const wantsImport = page();
  wantsImport.window.answers.push(true);
  const storage = makeStorage();
  await initializeSupabaseAuthBridge({ window: wantsImport.window, document: wantsImport.document, startupIdentity: { sessionChecked: true, session: { user: USER } }, deps: { configured: true, supabase: { auth: makeAuth() }, storage, turnstile: noTurnstile() } });
  assert.equal(wantsImport.calls.reload, 0, 'no reload while the person answers the old account\'s password');
  assert.equal(storage.data.has('chat_lastUser'), false, 'the device is not yet the cloud account\'s');
  assert.equal(wantsImport.document.getElementById('auth-form').dataset.authMode, 'local');
});

test('a cloud account left over on a device that has no session any more is forgotten, and a legacy local account is left alone', async () => {
  const stale = makeStorage({ chat_lastUser: CLOUD_NAME, [`chatUser_${CLOUD_NAME}`]: JSON.stringify({ authProvider: 'supabase' }) });
  await boot({ storage: stale });
  assert.equal(stale.data.has('chat_lastUser'), false);
  const legacy = makeStorage({ chat_lastUser: 'old-name', 'chatUser_old-name': JSON.stringify({ username: 'old-name' }) });
  await boot({ storage: legacy });
  assert.equal(legacy.data.get('chat_lastUser'), 'old-name');
});

test('an email or a password that is too short is told and nothing is sent', async () => {
  const ui = await boot();
  const event = await ui.submit({ email: '', password: 'longenough' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.status(), 'MISSING');
  await ui.submit({ email: 'ada@example.com', password: 'short' });
  assert.equal(ui.status(), 'MISSING');
  assert.equal(ui.auth.log.signIn.length, 0);
});

test('a correct email and password signs in; a new email creates the account and asks to check the mailbox', async () => {
  const auth = makeAuth({ signInWithPassword: async (args) => { auth.log.signIn.push(args); return { data: { user: USER, session: { user: USER } }, error: null }; } });
  const ui = await boot({ auth });
  await ui.submit();
  assert.equal(auth.log.signIn[0].email, 'ada@example.com');
  assert.equal(auth.log.signUp.length, 0);
  assert.equal(ui.calls.confirms.length, 1, 'the person is asked about the old data');
  assert.equal(ui.calls.reload, 1);

  const fresh = await boot();
  await fresh.submit();
  assert.equal(fresh.auth.log.signUp.length, 1, 'the sign-in failed, so the account is made');
  assert.equal(fresh.auth.log.signUp[0].options.emailRedirectTo, 'https://noureon.test');
  assert.equal(fresh.calls.reload, 0, 'no session until the mailbox is checked');
  assert.equal(fresh.status(), 'CHECK-MAIL');
  assert.equal(fresh.field('register-btn').disabled, false, 'the buttons are given back');
});

test('what the sign-in service refuses with is told in the page\'s words: weak password, rate limit, network, captcha, already registered', async () => {
  const cases = [
    [{ code: 'weak_password', message: 'Password should be at least 8' }, 'WEAK'],
    [{ status: 429, message: 'Too many' }, 'LIMITED'],
    [{ message: 'Failed to fetch' }, 'NETWORK'],
    [{ message: 'captcha verification failed' }, 'CAPTCHA'],
    [{ code: 'user_already_exists', message: 'User already registered' }, 'EXISTS'],
    [{ message: 'Something the page does not know' }, 'Something the page does not know']
  ];
  for (const [error, shown] of cases) {
    const auth = makeAuth({ signUp: async () => ({ data: {}, error }) });
    const ui = await boot({ auth });
    await ui.submit();
    assert.equal(ui.calls.reload, 0, JSON.stringify(error));
    assert.equal(ui.field('register-btn').disabled, false);
    assert.equal(ui.status(), shown);
  }
});

test('with the human check on: no token means nothing is sent; a failed sign-in asks for a fresh token before it creates the account', async () => {
  let token = '';
  const resets = [];
  const turnstile = { enabled: true, mount: async () => {}, getToken: () => token, reset: () => resets.push('reset'), waitForToken: async () => 'fresh-token' };
  const ui = await boot({ turnstile });
  await ui.submit();
  assert.equal(ui.status(), 'CHECK-REQUIRED');
  assert.equal(ui.auth.log.signIn.length, 0, 'not done, so not sent');

  token = 'first-token';
  await ui.submit();
  assert.equal(ui.auth.log.signIn[0].options.captchaToken, 'first-token');
  assert.equal(ui.auth.log.signUp[0].options.captchaToken, 'fresh-token', 'a check is good for one request only');
  assert.ok(resets.length >= 2);

  const none = await boot({ turnstile: { ...turnstile, getToken: () => 'first-token', waitForToken: async () => '' } });
  await none.submit();
  assert.equal(none.auth.log.signUp.length, 0, 'no second token: the person is asked to do the check again');
  assert.equal(none.status(), 'CHECK-AGAIN');
});

test('Google sign-in goes back to the site, and when the service refuses the buttons come back', async () => {
  const ui = await boot();
  await ui.press('supabase-google-btn');
  assert.deepEqual(ui.auth.log.oauth[0], { provider: 'google', options: { redirectTo: 'https://noureon.test' } });

  const refused = await boot({ auth: makeAuth({ signInWithOAuth: async () => ({ error: { message: 'Failed to fetch' } }) }) });
  await refused.press('supabase-google-btn');
  assert.equal(refused.field('register-btn').disabled, false);
  assert.equal(refused.status(), 'NETWORK');
});

test('the button for the old local accounts opens that page, signs out of the cloud on this device, and closes it again', async () => {
  const ui = await boot();
  await ui.press('local-mode-btn');
  assert.equal(ui.field('auth-form').dataset.authMode, 'local');
  assert.deepEqual(ui.auth.log.signOut, [{ scope: 'local' }]);
  await ui.press('local-mode-btn');
  assert.equal(ui.field('auth-form').dataset.authMode, 'cloud');
});

test('importing into a cloud account from an old local account needs that old account\'s name and password', async () => {
  const storage = makeStorage({ chat_storageOwnerUser: 'old-name', 'chatUser_old-name': JSON.stringify({ username: 'old-name', passwordRecord: { version: 1 } }) });
  const ui = await boot({ storage });
  ui.field('auth-form').dataset.importTargetUser = JSON.stringify({ username: CLOUD_NAME, authProvider: 'supabase' });
  await ui.press('local-mode-btn');
  ui.field('auth-form').dataset.importTargetUser = JSON.stringify({ username: CLOUD_NAME, authProvider: 'supabase' });
  const event = await ui.submit({ email: 'wrong-name', password: 'whatever' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.calls.reload, 0, 'a wrong name or password changes nothing');
  assert.equal(storage.data.get('chat_lastUser') ?? null, null);
  assert.equal(storage.data.get('chat_storageOwnerUser'), 'old-name');
});

test('signing out asks first; yes ends the session and forgets the account of the device even when the service fails, no changes nothing', async () => {
  const signedIn = { sessionChecked: true, session: { user: USER } };
  const storage = makeStorage({ chat_lastUser: CLOUD_NAME });
  const ui = await boot({ storage, startupIdentity: signedIn });
  ui.window.answers.push(false);
  await ui.press('logout-btn');
  assert.equal(ui.auth.log.signOut.length, 0);
  assert.equal(storage.data.get('chat_lastUser'), CLOUD_NAME);

  ui.window.answers.push(true);
  await ui.press('logout-btn');
  assert.deepEqual(ui.auth.log.signOut, [{ scope: 'local' }]);
  assert.equal(storage.data.has('chat_lastUser'), false);
  assert.equal(ui.calls.reload, 1);

  const failing = makeAuth({ signOut: async () => { throw new Error('offline'); } });
  const storage2 = makeStorage({ chat_lastUser: CLOUD_NAME });
  const second = await boot({ auth: failing, storage: storage2, startupIdentity: signedIn });
  second.window.answers.push(true);
  const warn = console.warn; console.warn = () => {};
  try { await second.press('logout-btn'); } finally { console.warn = warn; }
  assert.equal(storage2.data.has('chat_lastUser'), false, 'forgotten anyway');
  assert.equal(second.calls.reload, 1);
});

test('a logout button when nobody is signed in is left to the page\'s own handler', async () => {
  const ui = await boot();
  const event = new ui.happy.Event('click', { cancelable: true, bubbles: true });
  ui.field('logout-btn').dispatchEvent(event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(event.defaultPrevented, false);
  assert.equal(ui.calls.confirms.length, 0, 'no question is asked');
});
