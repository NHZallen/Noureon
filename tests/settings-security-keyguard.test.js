import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test, { afterEach } from 'node:test';

import { Window } from 'happy-dom';
import { createKeyguardControls } from '../src/app/runtime/settings/settings-security-keyguard.js';
import { createAndUnlockSyncVault, isSyncVaultUnlocked, lockSyncVault, setSyncVaultRememberPolicy } from '../src/app/sync/sync-vault.js';

const USER = { username: 'supabase:keyguard-user', authProvider: 'supabase' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
afterEach(() => { lockSyncVault(USER.username); setSyncVaultRememberPolicy(null); });

const CARD = `
  <section id="security-keyguard-card" class="hidden">
    <input id="security-keyguard-switch" type="checkbox">
    <div id="security-keyguard-options" class="hidden"><select id="security-keyguard-days">
      <option value="0"></option><option value="1"></option><option value="3"></option><option value="7"></option><option value="14"></option><option value="30"></option>
    </select></div>
    <p id="security-keyguard-note" class="hidden"></p>
    <div id="security-keyguard-foot" class="hidden"><span id="security-keyguard-state"></span><button id="security-keyguard-lock-btn" type="button"></button></div>
  </section>`;

async function setup({ withVault = true, hasPasskey = true, availability = 'yes', user = USER } = {}) {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = CARD;
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
  if (withVault) await createAndUnlockSyncVault({ storage, username: user.username, password: 'a long sync password', cryptoProvider: webcrypto });
  setSyncVaultRememberPolicy(() => true);
  const notices = [];
  const errors = [];
  let confirmed = true;
  const byId = (id) => window.document.getElementById(id);
  const controls = createKeyguardControls({
    window, storage, getCurrentUser: () => user, getElements: () => ({
      keyguardCard: byId('security-keyguard-card'), keyguardSwitch: byId('security-keyguard-switch'), keyguardOptions: byId('security-keyguard-options'), keyguardDays: byId('security-keyguard-days'),
      keyguardNote: byId('security-keyguard-note'), keyguardFoot: byId('security-keyguard-foot'), keyguardState: byId('security-keyguard-state'), keyguardLock: byId('security-keyguard-lock-btn')
    }),
    text: (_key, fallback) => fallback, showNotification: (message) => notices.push(message), notifyError: (error) => errors.push(error),
    confirmIdentity: async () => confirmed, passkeys: { hasSlots: async () => hasPasskey, availability: () => availability }
  });
  controls.bind();
  await controls.refresh();
  return { window, byId, storage, values, controls, notices, errors, setConfirmed: (value) => { confirmed = value; } };
}

test('the card is for a cloud account only, and says why the switch is off: no sync password, no passkey, no browser support, a locked vault', async () => {
  const local = await setup({ user: { username: 'local-user', authProvider: 'local' } });
  assert.equal(local.byId('security-keyguard-card').classList.contains('hidden'), true);

  const noVault = await setup({ withVault: false });
  assert.equal(noVault.byId('security-keyguard-card').classList.contains('hidden'), false);
  assert.equal(noVault.byId('security-keyguard-switch').disabled, true);
  assert.match(noVault.byId('security-keyguard-note').textContent, /同步密碼/);

  const noPasskey = await setup({ hasPasskey: false });
  assert.equal(noPasskey.byId('security-keyguard-switch').disabled, true);
  assert.match(noPasskey.byId('security-keyguard-note').textContent, /通行金鑰/);

  const noBrowser = await setup({ availability: 'no' });
  assert.equal(noBrowser.byId('security-keyguard-switch').disabled, true);
  assert.match(noBrowser.byId('security-keyguard-note').textContent, /瀏覽器/);

  const locked = await setup();
  lockSyncVault(USER.username);
  await locked.controls.refresh();
  assert.equal(locked.byId('security-keyguard-switch').disabled, true);
  assert.match(locked.byId('security-keyguard-note').textContent, /解鎖/);

  const ok = await setup();
  assert.equal(ok.byId('security-keyguard-switch').disabled, false);
  assert.equal(ok.byId('security-keyguard-note').classList.contains('hidden'), true);
  assert.equal(ok.byId('security-keyguard-options').classList.contains('hidden'), true);
});

test('turning it on asks the person to confirm, shows the days (7 by default) and the state; the days can change; lock now locks', async () => {
  const f = await setup();
  f.byId('security-keyguard-switch').checked = true;
  f.byId('security-keyguard-switch').dispatchEvent(new f.window.Event('change'));
  await flush();
  assert.equal(f.errors.length, 0);
  assert.equal(f.controls.isProtected(), true);
  assert.equal(JSON.parse(f.window.localStorage.getItem(`noureonLocalKeyProtection_v1_${USER.username}`)).days, 7);
  assert.equal(f.byId('security-keyguard-options').classList.contains('hidden'), false);
  assert.equal(f.byId('security-keyguard-days').value, '7');
  assert.equal(f.byId('security-keyguard-foot').classList.contains('hidden'), false);
  assert.equal(f.byId('security-keyguard-state').textContent, '已解鎖');
  assert.match(f.notices.at(-1), /已開啟/);

  f.byId('security-keyguard-days').value = '30';
  f.byId('security-keyguard-days').dispatchEvent(new f.window.Event('change'));
  await flush();
  assert.equal(JSON.parse(f.window.localStorage.getItem(`noureonLocalKeyProtection_v1_${USER.username}`)).days, 30);

  f.byId('security-keyguard-lock-btn').click();
  await flush();
  assert.equal(isSyncVaultUnlocked(USER.username), false);
  assert.equal(f.byId('security-keyguard-state').textContent, '已鎖定');
  assert.equal(f.byId('security-keyguard-lock-btn').disabled, true, 'locked already');
  assert.match(f.notices.at(-1), /已鎖定/);
});

test('a confirmation that is not given changes nothing, and turning it off needs the vault unlocked', async () => {
  const f = await setup();
  f.setConfirmed(false);
  f.byId('security-keyguard-switch').checked = true;
  f.byId('security-keyguard-switch').dispatchEvent(new f.window.Event('change'));
  await flush();
  assert.equal(f.controls.isProtected(), false);
  assert.equal(f.byId('security-keyguard-switch').checked, false, 'the switch goes back');

  f.setConfirmed(true);
  f.byId('security-keyguard-switch').checked = true;
  f.byId('security-keyguard-switch').dispatchEvent(new f.window.Event('change'));
  await flush();
  assert.equal(f.controls.isProtected(), true);
  lockSyncVault(USER.username);
  await f.controls.refresh();
  assert.equal(f.byId('security-keyguard-switch').disabled, true, 'locked: it cannot be turned off before the unlock');
});
