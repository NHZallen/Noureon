import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSettingsSyncVaultControls } from '../src/app/runtime/settings/settings-sync-vault-controls.js';
import { createAndUnlockSyncVault, readSyncVaultRecord, unlockSyncVault, lockSyncVault } from '../src/app/sync/sync-vault.js';
import { bytesToBase64, isSlotCurrent, openRecoverySlot } from '../src/app/sync/vault-recovery-slots.js';

const user = { username: 'supabase:user-123', email: 'person@example.com', authProvider: 'supabase' };
// The sync password is stretched with PBKDF2 (310000 rounds) each time it is checked or changed: a few hundred ms in a test.
const flush = () => new Promise((resolve) => setTimeout(resolve, 900));
const secretFor = (credentialId) => Uint8Array.from({ length: 32 }, (_, index) => (credentialId.charCodeAt(credentialId.length - 1) + index) % 256);

// A fake passkey: each one answers with a secret of its own (the way the PRF does), and the person may cancel.
const fakePasskeys = ({ availability = 'yes', cancel = false } = {}) => {
  const calls = { register: 0, readOne: 0, readAny: 0 };
  let counter = 0;
  const api = {
    calls,
    cancel,
    availability: async () => availability,
    register: async ({ excludeCredentialIds }) => {
      calls.register += 1;
      if (api.cancel) throw Object.assign(new Error('x'), { code: 'passkey-cancelled' });
      counter += 1;
      const credentialId = `cred-${counter}`;
      if (excludeCredentialIds.includes(credentialId)) throw Object.assign(new Error('x'), { code: 'passkey-exists' });
      return { credentialId, prfSalt: bytesToBase64(new Uint8Array(32).fill(counter)), secret: secretFor(credentialId) };
    },
    readOne: async ({ credentialId }) => {
      calls.readOne += 1;
      if (api.cancel) throw Object.assign(new Error('x'), { code: 'passkey-cancelled' });
      return secretFor(credentialId);
    },
    readAny: async ({ slots }) => {
      calls.readAny += 1;
      if (api.cancel) throw Object.assign(new Error('x'), { code: 'passkey-cancelled' });
      return { slot: slots[0], secret: secretFor(slots[0].credentialId) };
    }
  };
  return api;
};

// A fake `user_vault_recovery`: the one row of the person.
const fakeTable = (row = null, { blockWrites = false } = {}) => {
  const table = { row, writes: [] };
  table.from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table.row ? { slots: table.row.slots ?? [], recovery_payload: table.row.recovery_payload ?? null } : null, error: null }) }) }),
    upsert: (next) => ({
      select: async () => {
        table.writes.push(next);
        if (blockWrites) return { data: [], error: null };
        table.row = { recovery_payload: null, slots: [], ...table.row, ...next };
        return { data: [{ slots: table.row.slots }], error: null };
      }
    })
  });
  return table;
};

const setup = async ({ row = null, availability = 'yes', password = 'old-password-123', recovery = false, withVault = true, blockWrites = false } = {}) => {
  const window = new Window();
  window.document.body.innerHTML = '<div id="settings-modal"><ul id="settings-nav"><li class="settings-nav-item" data-section="personalization">P</li></ul><div id="personalization-section" class="settings-section"></div></div>';
  const values = new Map();
  const storage = { getItem: async (key) => values.get(key) || null, setItem: async (key, value) => values.set(key, value), removeItem: async (key) => values.delete(key) };
  const table = fakeTable(row, { blockWrites });
  const passkey = fakePasskeys({ availability });
  const notices = [];
  const requests = [];
  const supabase = {
    from: table.from,
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'token-1', user: { id: 'user-123' } } }, error: null }),
      getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
      getUser: async () => ({ data: { user: { email: user.email } }, error: null })
    }
  };
  window.confirm = () => true;
  window.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ stored: true, deleted: true }) }; };
  const controls = createSettingsSyncVaultControls({
    window, document: window.document, storage, getCurrentUser: () => user, getText: (_key, fallback) => fallback,
    showNotification: (message, type) => notices.push({ message, type }), loadStyles: async () => {}, getSupabase: () => supabase, passkeyApi: passkey
  });
  if (withVault) await createAndUnlockSyncVault({ storage, username: user.username, password });
  if (recovery) {
    await storage.setItem(`chatSyncVaultRecovery_v1_${user.username}`, 'state-1');
    window.happyDOM.setURL('https://noureon.test/?vault_recovery=state-1');
  }
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  await flush();
  const byId = (id) => window.document.getElementById(id);
  return { window, controls, storage, values, table, passkey, notices, requests, byId };
};

const addPasskey = async (fixture, password = 'old-password-123') => {
  fixture.byId('security-passkey-password').value = password;
  fixture.byId('security-passkey-add-btn').click();
  await flush();
};

test('passkey card: it shows for a cloud account that has a sync password, and not where passkeys cannot do it', async () => {
  const ok = await setup();
  assert.equal(ok.byId('security-passkey-card').classList.contains('hidden'), false);
  assert.equal(ok.byId('security-passkey-add').classList.contains('hidden'), false);
  assert.equal(ok.byId('security-passkey-unsupported').classList.contains('hidden'), true);

  const no = await setup({ availability: 'no' });
  assert.equal(no.byId('security-passkey-unsupported').classList.contains('hidden'), false);
  assert.equal(no.byId('security-passkey-add').classList.contains('hidden'), true);

  const empty = await setup({ withVault: false });
  assert.equal(empty.byId('security-passkey-no-vault').classList.contains('hidden'), false);
  assert.equal(empty.byId('security-passkey-add').classList.contains('hidden'), true);
});

test('passkey card: adding one seals the password and record in the browser, keeps only the sealed text, and drops what the server kept', async () => {
  const fixture = await setup({ row: { recovery_payload: { version: 1, ciphertext: 'server-sealed' }, slots: [] } });
  await addPasskey(fixture);
  const { table, byId, notices, storage, passkey } = fixture;

  assert.equal(passkey.calls.register, 1);
  assert.equal(table.row.slots.length, 1);
  assert.equal(table.row.recovery_payload, null, 'the old recovery of the server is dropped');
  assert.doesNotMatch(JSON.stringify(table.row.slots), /old-password-123/, 'the password is not in the clear');
  const opened = await openRecoverySlot(table.row.slots[0], secretFor('cred-1'));
  assert.equal(opened.password, 'old-password-123');
  assert.deepEqual(opened.record, await readSyncVaultRecord(storage, user.username));
  assert.equal(byId('security-passkey-list').children.length, 1);
  assert.equal(byId('security-passkey-password').value, '', 'the password is cleared from the box');
  assert.match(notices.at(-1).message, /通行金鑰已新增/);
});

test('passkey card: a wrong sync password saves nothing, and a passkey the person did not confirm saves nothing', async () => {
  const wrong = await setup();
  await addPasskey(wrong, 'not-the-password');
  assert.equal(wrong.table.row, null);
  assert.equal(wrong.notices.at(-1).type, 'error');
  assert.match(wrong.notices.at(-1).message, /不正確/);

  const cancelled = await setup();
  cancelled.passkey.cancel = true;
  await addPasskey(cancelled);
  assert.equal(cancelled.table.row, null);
  assert.match(cancelled.notices.at(-1).message, /沒有確認通行金鑰/);

  const empty = await setup();
  await addPasskey(empty, '');
  assert.equal(empty.passkey.calls.register, 0, 'with no password the passkey is not even asked');
});

test('passkey card: a write the table refuses (for example no authenticator code yet) is told, not taken for done', async () => {
  const fixture = await setup({ blockWrites: true });
  await addPasskey(fixture);
  assert.equal(fixture.notices.at(-1).type, 'error');
  assert.match(fixture.notices.at(-1).message, /沒有儲存/);
  assert.equal(fixture.byId('security-passkey-list').children.length, 0);
});

test('passkey card: removing the last passkey asks twice as hard, and removes only its recovery data', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  const asked = [];
  fixture.window.confirm = (message) => { asked.push(message); return true; };
  fixture.byId('security-passkey-list').querySelector('[data-action="remove"]').click();
  await flush();
  assert.match(asked[0], /最後一把/);
  assert.equal(fixture.table.row.slots.length, 0);
  assert.equal(fixture.byId('security-passkey-list').children.length, 0);
});

test('changing the sync password seals the passkeys again with the new one, and the server is not asked to keep a copy', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-next-password').value = 'brand-new-password-1';
  fixture.byId('sync-vault-next-confirmation').value = 'brand-new-password-1';
  fixture.byId('sync-vault-change-btn').click();
  await flush();

  assert.equal(fixture.requests.length, 0, 'no copy goes to the server');
  const record = await readSyncVaultRecord(fixture.storage, user.username);
  const [slot] = fixture.table.row.slots;
  assert.ok(isSlotCurrent(slot, record), 'the slot is of the new record');
  assert.equal((await openRecoverySlot(slot, secretFor('cred-1'))).password, 'brand-new-password-1');
});

test('changing the sync password when a passkey does not answer: it still changes, the slot shows "needs update", and updating makes it current', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  fixture.passkey.cancel = true;
  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-next-password').value = 'brand-new-password-1';
  fixture.byId('sync-vault-next-confirmation').value = 'brand-new-password-1';
  fixture.byId('sync-vault-change-btn').click();
  await flush();

  const record = await readSyncVaultRecord(fixture.storage, user.username);
  assert.equal(isSlotCurrent(fixture.table.row.slots[0], record), false, 'the slot is still of the old password');
  assert.ok(fixture.notices.some((notice) => /舊的/.test(notice.message)), 'the person is told to update it');
  assert.match(fixture.byId('security-passkey-list').textContent, /需要更新/);

  fixture.passkey.cancel = false;
  fixture.byId('security-passkey-password').value = 'brand-new-password-1';
  fixture.byId('security-passkey-list').querySelector('[data-action="update"]').click();
  await flush();
  assert.equal(isSlotCurrent(fixture.table.row.slots[0], record), true);
  assert.doesNotMatch(fixture.byId('security-passkey-list').textContent, /需要更新/);
});

test('forgot the sync password: the recovery panel offers the passkey only, and one tap opens the slot and sets the new password', async () => {
  // The slot is made for the vault the person has now; then the vault is locked and the person comes back through the Email sign-in.
  const seed = await setup();
  await addPasskey(seed);
  const { table, storage } = seed;
  lockSyncVault(user.username);
  const fixture = await setup({ row: table.row, recovery: true, withVault: false });
  await fixture.storage.setItem(`chatSyncVault_v1_${user.username}`, await storage.getItem(`chatSyncVault_v1_${user.username}`));
  await fixture.controls.refreshSyncVaultControls();
  await flush();

  assert.equal(fixture.byId('sync-vault-recovery-panel').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-recovery-passkey-btn').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-recovery-save-btn').classList.contains('hidden'), true, 'no recovery of the server is kept, so that button is not offered');

  fixture.byId('sync-vault-recovery-password').value = 'a-completely-new-password';
  fixture.byId('sync-vault-recovery-confirmation').value = 'a-completely-new-password';
  fixture.byId('sync-vault-recovery-passkey-btn').click();
  await flush();

  assert.equal(fixture.passkey.calls.readAny, 1);
  assert.equal(fixture.requests.length, 0, 'the server was not asked for anything');
  await unlockSyncVault({ storage: fixture.storage, username: user.username, password: 'a-completely-new-password' });
  const record = await readSyncVaultRecord(fixture.storage, user.username);
  assert.ok(isSlotCurrent(fixture.table.row.slots[0], record), 'the slot that opened was sealed again with the new password');
  assert.match(fixture.notices.at(-1).message, /已重設/);
});

test('forgot the sync password: a slot of an earlier password is told, and nothing is changed', async () => {
  const seed = await setup();
  await addPasskey(seed);
  // The sync password changed since (the vault record is another one now), with the slot left as it was.
  const staleRow = seed.table.row;
  const other = await setup({ row: staleRow, recovery: true, password: 'some-other-password-9' });
  assert.equal(other.byId('sync-vault-recovery-passkey-btn').classList.contains('hidden'), false);
  other.byId('sync-vault-recovery-password').value = 'a-completely-new-password';
  other.byId('sync-vault-recovery-confirmation').value = 'a-completely-new-password';
  const before = await readSyncVaultRecord(other.storage, user.username);
  other.byId('sync-vault-recovery-passkey-btn').click();
  await flush();
  assert.equal(other.notices.at(-1).type, 'error');
  assert.match(other.notices.at(-1).message, /已過期/);
  assert.deepEqual(await readSyncVaultRecord(other.storage, user.username), before);
});

test('an account that only has the old recovery of the server keeps working the old way, and sees no passkey button in the recovery panel', async () => {
  const fixture = await setup({ row: { recovery_payload: { version: 1, ciphertext: 'server-sealed' }, slots: [] }, recovery: true });
  assert.equal(fixture.byId('sync-vault-recovery-passkey-btn').classList.contains('hidden'), true);
  assert.equal(fixture.byId('sync-vault-recovery-save-btn').classList.contains('hidden'), false);
});
