import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';
import { startLocalKeyRuntime } from '../../src/app/runtime/security/local-key-runtime.js';
import { createLocalKeyProtection } from '../../src/app/runtime/security/local-key-protection.js';
import { createAndUnlockSyncVault, isSyncVaultUnlocked, lockSyncVault, setSyncVaultRememberPolicy } from '../../src/app/sync/sync-vault.js';

const USERNAME = 'supabase:runtime-user';
const PASSWORD = 'a long sync password';
const flush = () => new Promise((resolve) => setTimeout(resolve, 900)); // the sync password is checked with a slow key derivation
const open = [];
afterEach(async () => {
  lockSyncVault(USERNAME);
  setSyncVaultRememberPolicy(null);
  for (const { runtime, window } of open.splice(0)) { runtime.destroy(); await window.happyDOM.close(); }
});

async function setup({ protectedKeys = true } = {}) {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<form id="chat-form"><textarea id="message-input">hello</textarea><button type="submit">send</button></form><input id="gemini-api-key-input">';
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
  await createAndUnlockSyncVault({ storage, username: USERNAME, password: PASSWORD, cryptoProvider: webcrypto });
  const protection = createLocalKeyProtection({ storage, getUsername: () => USERNAME, area: window.localStorage, target: window });
  if (protectedKeys) await protection.enable({ days: 7 });
  // The cloud has no passkey slots here: the sync password is the way.
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slots: [] }, error: null }) }) }) }) };
  const runtime = startLocalKeyRuntime({ window, storage, username: USERNAME, supabase, getText: (_key, fallback) => fallback });
  const form = window.document.getElementById('chat-form');
  open.push({ runtime, window });
  const submitted = [];
  form.requestSubmit = () => submitted.push('again');
  const sent = [];
  form.addEventListener('submit', (event) => { event.preventDefault(); sent.push('sent'); });
  return { window, document: window.document, protection, runtime, form, submitted, sent, storage };
}

const lockIcon = (f) => f.document.querySelector('.keyguard-lock');
const dialog = (f) => f.document.querySelector('.keyguard-overlay');
const send = (f) => f.form.dispatchEvent(new f.window.Event('submit', { cancelable: true, bubbles: true }));

test('with the protection on and the keys locked, the lock shows at the top right; unlocked, it goes', async () => {
  const f = await setup();
  assert.equal(lockIcon(f).classList.contains('hidden'), true, 'unlocked: no lock');
  await f.protection.lockNow();
  assert.equal(lockIcon(f).classList.contains('hidden'), false);
  assert.ok(lockIcon(f).getAttribute('aria-label'));
  await f.protection.unlockWithPassword(PASSWORD);
  assert.equal(lockIcon(f).classList.contains('hidden'), true);
});

test('without the protection nothing shows and a message goes at once', async () => {
  const f = await setup({ protectedKeys: false });
  await f.protection.lockNow();
  assert.equal(lockIcon(f).classList.contains('hidden'), true);
  send(f);
  assert.deepEqual(f.sent, ['sent']);
  assert.equal(dialog(f), null);
});

test('sending a message while locked asks for the unlock first, and the same message goes after it', async () => {
  const f = await setup();
  await f.protection.lockNow();
  send(f);
  assert.deepEqual(f.sent, [], 'the message did not go yet');
  assert.ok(dialog(f), 'the unlock is asked for');
  assert.equal(f.document.getElementById('message-input').value, 'hello', 'what was typed is still there');

  f.document.getElementById('keyguard-unlock-password').value = 'a wrong password';
  f.document.querySelector('.keyguard-actions .is-primary').click();
  await flush();
  assert.ok(dialog(f), 'a wrong password keeps the dialog');
  assert.equal(f.document.querySelector('.keyguard-error').classList.contains('hidden'), false);
  assert.equal(isSyncVaultUnlocked(USERNAME), false);

  f.document.getElementById('keyguard-unlock-password').value = PASSWORD;
  f.document.querySelector('.keyguard-actions .is-primary').click();
  await flush();
  assert.equal(dialog(f), null);
  assert.equal(isSyncVaultUnlocked(USERNAME), true);
  assert.deepEqual(f.submitted, ['again'], 'the message is sent again');
  send(f);
  assert.deepEqual(f.sent, ['sent'], 'unlocked: it goes');
});

test('cancelling the unlock sends nothing, and the dialog closes with the Escape key', async () => {
  const f = await setup();
  await f.protection.lockNow();
  send(f);
  f.document.querySelector('.keyguard-actions .keyguard-btn:not(.is-primary)').click();
  await flush();
  assert.equal(dialog(f), null);
  assert.deepEqual([f.sent, f.submitted], [[], []]);

  send(f);
  assert.ok(dialog(f));
  f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(dialog(f), null);
});

test('touching a field for a key while locked asks for the unlock; one asking at a time', async () => {
  const f = await setup();
  await f.protection.lockNow();
  const field = f.document.getElementById('gemini-api-key-input');
  field.dispatchEvent(new f.window.FocusEvent('focusin', { bubbles: true }));
  field.dispatchEvent(new f.window.FocusEvent('focusin', { bubbles: true }));
  assert.equal(f.document.querySelectorAll('.keyguard-overlay').length, 1);
  f.window.dispatchEvent(new f.window.CustomEvent('noureon:local-keys-needed'));
  assert.equal(f.document.querySelectorAll('.keyguard-overlay').length, 1, 'a save while locked uses the same dialog');
});

test('the lock sits at the right end of the header of the chat when the page has one, and floats at the top right when it has not', async () => {
  const f = await setup();
  assert.ok(lockIcon(f).classList.contains('is-floating'), 'this page has no header');

  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<header><button id="menu-toggle-btn"></button><div id="title"></div></header><form id="chat-form"></form>';
  const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  const runtime = startLocalKeyRuntime({ window, storage, username: 'supabase:header-user', supabase: {}, getText: (_key, fallback) => fallback });
  open.push({ runtime, window });
  const header = window.document.querySelector('header');
  assert.equal(header.lastElementChild.classList.contains('keyguard-lock'), true);
  assert.equal(header.lastElementChild.classList.contains('is-floating'), false);
});
