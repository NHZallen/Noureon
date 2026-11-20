import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';
import { startLocalKeyRuntime } from '../../src/app/runtime/security/local-key-runtime.js';
import { startLocalKeyNotice } from '../../src/app/runtime/security/local-key-notice.js';
import { createLocalKeyProtection } from '../../src/app/runtime/security/local-key-protection.js';
import { createAndUnlockSyncVault, lockSyncVault, setSyncVaultRememberPolicy } from '../../src/app/sync/sync-vault.js';

const USERNAME = 'supabase:runtime-user';
const PASSWORD = 'a long sync password';
const open = [];
afterEach(async () => {
  lockSyncVault(USERNAME);
  setSyncVaultRememberPolicy(null);
  for (const { runtime, window } of open.splice(0)) { runtime.destroy(); await window.happyDOM.close(); }
});

async function setup({ protectedKeys = true } = {}) {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<header><button id="menu-toggle-btn"></button></header><form id="chat-form"><textarea id="message-input">hello</textarea><button type="submit">send</button></form><input id="gemini-api-key-input">';
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
  await createAndUnlockSyncVault({ storage, username: USERNAME, password: PASSWORD, cryptoProvider: webcrypto });
  const protection = createLocalKeyProtection({ storage, getUsername: () => USERNAME, area: window.localStorage, target: window });
  if (protectedKeys) await protection.enable({ days: 7 });
  // The cloud has no passkey slots here.
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
  const runtime = startLocalKeyRuntime({ window, storage, username: USERNAME, supabase });
  const notices = [];
  startLocalKeyNotice({ window, getText: (key, fallback) => (key === 'keyguardNeedUnlock' ? `NEED:${fallback}` : fallback), showNotification: (text, kind) => notices.push([text, kind]) });
  const form = window.document.getElementById('chat-form');
  open.push({ runtime, window });
  const sent = [];
  form.addEventListener('submit', (event) => { event.preventDefault(); sent.push('sent'); });
  return { window, document: window.document, protection, runtime, form, sent, notices };
}

const send = (f) => f.form.dispatchEvent(new f.window.Event('submit', { cancelable: true, bubbles: true }));

test('there is no lock button and no unlock dialog anywhere, locked or not', async () => {
  const f = await setup();
  assert.equal(f.document.querySelector('.keyguard-lock'), null);
  await f.protection.lockNow();
  assert.equal(f.document.querySelector('.keyguard-lock'), null, 'locked: still no button');
  send(f);
  assert.equal(f.document.querySelector('.keyguard-overlay'), null, 'no dialog');
  assert.equal(f.document.querySelector('header').children.length, 1, 'the header got nothing added');
});

test('without the protection a message goes at once and nothing is told', async () => {
  const f = await setup({ protectedKeys: false });
  await f.protection.lockNow();
  send(f);
  assert.deepEqual(f.sent, ['sent']);
  assert.deepEqual(f.notices, []);
});

test('sending a message while locked sends nothing, keeps what was typed, and tells in a text where to unlock; unlocked it goes', async () => {
  const f = await setup();
  await f.protection.lockNow();
  send(f);
  assert.deepEqual(f.sent, [], 'the message did not go');
  assert.equal(f.document.getElementById('message-input').value, 'hello', 'what was typed is still there');
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0][0], /^NEED:/);
  assert.equal(f.notices[0][1], 'error');
  // The same need again at once is told only once.
  send(f);
  assert.equal(f.notices.length, 1);

  await f.protection.unlockWithPassword(PASSWORD);
  send(f);
  assert.deepEqual(f.sent, ['sent'], 'unlocked: it goes');
});

test('touching a field for a key, or saving a key, while locked is told in the same text', async () => {
  const f = await setup();
  await f.protection.lockNow();
  const field = f.document.getElementById('gemini-api-key-input');
  field.dispatchEvent(new f.window.FocusEvent('focusin', { bubbles: true }));
  assert.equal(f.notices.length, 1);
  assert.equal(f.document.querySelector('.keyguard-overlay'), null);
  assert.equal(await f.runtime.ensureUnlocked(), false);
  await f.protection.unlockWithPassword(PASSWORD);
  assert.equal(await f.runtime.ensureUnlocked(), true);
});
