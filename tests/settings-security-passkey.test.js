import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSettingsSyncVaultControls } from '../src/app/runtime/settings/settings-sync-vault-controls.js';
import { createAndUnlockSyncVault, getUnlockedSyncVaultKey, isSyncVaultUnlocked, lockSyncVault, openSyncVaultRecordKeyBytes, readSyncVaultRecord, unlockSyncVault } from '../src/app/sync/sync-vault.js';
import { deviceName } from '../src/app/runtime/security/device-name.js';
import { bytesToBase64, openRecoverySlot } from '../src/app/sync/vault-recovery-slots.js';

const user = { username: 'supabase:user-123', email: 'person@example.com', authProvider: 'supabase' };
// The sync password is stretched with PBKDF2 (310000 rounds) each time it is checked or changed: a few hundred ms in a test.
const flush = () => new Promise((resolve) => setTimeout(resolve, 900));
const secretFor = (credentialId) => Uint8Array.from({ length: 32 }, (_, index) => (credentialId.charCodeAt(credentialId.length - 1) + index) % 256);

// A fake passkey: each one answers with a secret of its own (the way the PRF does), and the person may cancel.
const fakePasskeys = ({ availability = 'yes', cancel = false } = {}) => {
  const calls = { register: 0, readAny: 0 };
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
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table.row ? { slots: table.row.slots ?? [] } : null, error: null }) }) }),
    delete: () => ({ eq: async () => { table.row = null; return { error: null }; } }),
    upsert: (next) => ({
      select: async () => {
        table.writes.push(next);
        if (blockWrites) return { data: [], error: null };
        table.row = { slots: [], ...table.row, ...next };
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
  const events = [];
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
    showNotification: (message, type) => notices.push({ message, type }), loadStyles: async () => {}, getSupabase: () => supabase, passkeyApi: passkey, notifySecurity: (event) => events.push(event)
  });
  if (withVault) await createAndUnlockSyncVault({ storage, username: user.username, password });
  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();
  await flush();
  const byId = (id) => window.document.getElementById(id);
  // The password is forgotten: the vault is locked and the person pressed "forgot the sync password", which opens the recovery panel.
  if (recovery) {
    lockSyncVault(user.username);
    await controls.refreshSyncVaultControls();
    byId('sync-vault-forgot-btn').click();
    await flush();
  }
  return { window, controls, storage, values, table, passkey, notices, requests, events, byId };
};

const addPasskey = async (fixture, password = 'old-password-123') => {
  fixture.byId('security-passkey-password').value = password;
  fixture.byId('security-passkey-add-btn').click();
  await flush();
};

// A row's ⋯ button opens a menu; its items are in the order rename, remove.
function chooseRowAction(fixture, action) {
  fixture.byId('security-passkey-list').querySelector('.us-more').click();
  const items = fixture.window.document.body.querySelectorAll('.pj-menu .pj-menu-item');
  items[action === 'rename' ? 0 : 1].click();
}

test('passkey card: it shows for a cloud account that has a sync password, and not where passkeys cannot do it', async () => {
  const ok = await setup();
  assert.equal(ok.byId('security-passkey-card').classList.contains('hidden'), false);
  assert.equal(ok.byId('security-passkey-open-btn').classList.contains('hidden'), false);
  assert.equal(ok.byId('security-passkey-add').classList.contains('hidden'), true, 'the form is folded away until asked for');
  ok.byId('security-passkey-open-btn').click();
  assert.equal(ok.byId('security-passkey-add').classList.contains('hidden'), false);
  assert.equal(ok.byId('security-passkey-open-btn').getAttribute('aria-expanded'), 'true');
  assert.equal(ok.byId('security-passkey-unsupported').classList.contains('hidden'), true);
  assert.equal(ok.byId('security-passkey-legacy').classList.contains('hidden'), false, 'a sync password with no passkey is told the Email recovery has ended');

  const no = await setup({ availability: 'no' });
  assert.equal(no.byId('security-passkey-unsupported').classList.contains('hidden'), false);
  assert.equal(no.byId('security-passkey-add').classList.contains('hidden'), true);
  assert.equal(no.byId('security-passkey-open-btn').classList.contains('hidden'), true);

  const empty = await setup({ withVault: false });
  assert.equal(empty.byId('security-passkey-no-vault').classList.contains('hidden'), false);
  assert.equal(empty.byId('security-passkey-legacy').classList.contains('hidden'), true);
  assert.equal(empty.byId('security-passkey-add').classList.contains('hidden'), true);
});

test('passkey card: adding one seals the data key of the vault in the browser and keeps only the sealed text', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  const { table, byId, notices, storage, passkey } = fixture;
  assert.equal(byId('security-passkey-legacy').classList.contains('hidden'), true, 'with a passkey the reminder goes away');

  assert.equal(passkey.calls.register, 1);
  assert.equal(table.row.slots.length, 1);
  assert.doesNotMatch(JSON.stringify(table.row.slots), /old-password-123/, 'the password is not in the stored text');
  const { keyBytes } = await openRecoverySlot(table.row.slots[0], secretFor('cred-1'));
  assert.deepEqual([...keyBytes], [...await openSyncVaultRecordKeyBytes('old-password-123', await readSyncVaultRecord(storage, user.username))], 'it is the data key of this vault');
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

test('changing the sync password leaves the passkeys alone: no prompt, no update, nothing sent to the server, and the slot still opens the vault', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  const slotBefore = JSON.stringify(fixture.table.row.slots);
  const taps = fixture.passkey.calls.readAny;
  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-next-password').value = 'brand-new-password-1';
  fixture.byId('sync-vault-next-confirmation').value = 'brand-new-password-1';
  fixture.byId('sync-vault-change-btn').click();
  await flush();

  assert.equal(fixture.requests.length, 0, 'no copy goes to the server');
  assert.equal(fixture.passkey.calls.readAny, taps, 'no passkey was asked');
  assert.equal(JSON.stringify(fixture.table.row.slots), slotBefore, 'the slot is exactly as it was');
  assert.doesNotMatch(fixture.byId('security-passkey-list').textContent, /更新/);
  const record = await readSyncVaultRecord(fixture.storage, user.username);
  const { keyBytes } = await openRecoverySlot(fixture.table.row.slots[0], secretFor('cred-1'));
  assert.deepEqual([...keyBytes], [...await openSyncVaultRecordKeyBytes('brand-new-password-1', record)], 'the same key, now wrapped by the new password');
});

test('unlocking with a passkey: one tap opens the vault with no password, and a passkey of another vault is refused', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  lockSyncVault(user.username);
  await fixture.controls.refreshSyncVaultControls();
  await flush();
  assert.equal(fixture.byId('sync-vault-unlock-panel').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-unlock-passkey-btn').classList.contains('hidden'), false);

  fixture.byId('sync-vault-unlock-passkey-btn').click();
  await flush();
  assert.equal(isSyncVaultUnlocked(user.username), true);
  assert.ok(getUnlockedSyncVaultKey(user.username));
  assert.match(fixture.notices.at(-1).message, /已解鎖/);

  // The sync password was cleared and made again somewhere else: the slot is of the old vault.
  lockSyncVault(user.username);
  await fixture.storage.removeItem(`chatSyncVault_v1_${user.username}`);
  await createAndUnlockSyncVault({ storage: fixture.storage, username: user.username, password: 'a-different-vault-1' });
  lockSyncVault(user.username);
  await fixture.controls.refreshSyncVaultControls();
  await flush();
  fixture.byId('sync-vault-unlock-passkey-btn').click();
  await flush();
  assert.equal(isSyncVaultUnlocked(user.username), false);
  assert.match(fixture.notices.at(-1).message, /另一個金鑰庫/);
});

test('a person with no passkey sees no passkey button in the unlock panel', async () => {
  const fixture = await setup();
  lockSyncVault(user.username);
  await fixture.controls.refreshSyncVaultControls();
  await flush();
  assert.equal(fixture.byId('sync-vault-unlock-passkey-btn').classList.contains('hidden'), true);
});

// Forgot the sync password: the person pressed "forgot" (nothing is sent by Email), the passkey opens the slot.
const forgotten = async () => {
  const seed = await setup();
  await addPasskey(seed);
  const stored = await seed.storage.getItem(`chatSyncVault_v1_${user.username}`);
  lockSyncVault(user.username);
  const fixture = await setup({ row: seed.table.row, recovery: true, withVault: false });
  await fixture.storage.setItem(`chatSyncVault_v1_${user.username}`, stored);
  await fixture.controls.refreshSyncVaultControls();
  await flush();
  return fixture;
};

test('forgot the sync password: the recovery panel offers the passkey only, and one tap opens the slot and sets the new password', async () => {
  const fixture = await forgotten();
  assert.equal(fixture.byId('sync-vault-recovery-panel').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-recovery-passkey-btn').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-recovery-no-passkey').classList.contains('hidden'), true);

  fixture.byId('sync-vault-recovery-password').value = 'a-completely-new-password';
  fixture.byId('sync-vault-recovery-confirmation').value = 'a-completely-new-password';
  fixture.byId('sync-vault-recovery-passkey-btn').click();
  await flush();

  assert.equal(fixture.requests.length, 0, 'the server was not asked for anything');
  lockSyncVault(user.username);
  await assert.rejects(unlockSyncVault({ storage: fixture.storage, username: user.username, password: 'old-password-123' }), /Incorrect/);
  await unlockSyncVault({ storage: fixture.storage, username: user.username, password: 'a-completely-new-password' });
  const { keyBytes } = await openRecoverySlot(fixture.table.row.slots[0], secretFor('cred-1'));
  assert.deepEqual([...keyBytes], [...await openSyncVaultRecordKeyBytes('a-completely-new-password', await readSyncVaultRecord(fixture.storage, user.username))], 'the slot was not touched and still opens the vault');
  assert.match(fixture.notices.at(-1).message, /已重設/);
});

test('forgot the sync password: a passkey that is not the one of this vault changes nothing', async () => {
  const seed = await setup();
  await addPasskey(seed);
  const other = await setup({ row: seed.table.row, recovery: true, password: 'some-other-password-9' }); // a different vault than the slot's
  other.byId('sync-vault-recovery-password').value = 'a-completely-new-password';
  other.byId('sync-vault-recovery-confirmation').value = 'a-completely-new-password';
  const before = await readSyncVaultRecord(other.storage, user.username);
  other.byId('sync-vault-recovery-passkey-btn').click();
  await flush();
  assert.equal(other.notices.at(-1).type, 'error');
  assert.match(other.notices.at(-1).message, /另一個金鑰庫/);
  assert.deepEqual(await readSyncVaultRecord(other.storage, user.username), before);
});

test('forgot the sync password with no passkey: the panel says it cannot be recovered and offers starting over only', async () => {
  const fixture = await setup({ recovery: true });
  assert.equal(fixture.byId('sync-vault-recovery-panel').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-recovery-passkey-btn').classList.contains('hidden'), true);
  assert.equal(fixture.byId('sync-vault-recovery-fields').classList.contains('hidden'), true);
  assert.equal(fixture.byId('sync-vault-recovery-no-passkey').classList.contains('hidden'), false);
  assert.equal(fixture.byId('sync-vault-start-over-btn').classList.contains('hidden'), false);
  assert.equal(fixture.requests.length, 0, 'nothing was sent anywhere: no Email, no request to the server');
});

test('forgot the sync password: cancelling goes back to the unlock panel', async () => {
  const fixture = await setup({ recovery: true });
  fixture.byId('sync-vault-recovery-cancel-btn').click();
  await flush();
  assert.equal(fixture.byId('sync-vault-recovery-panel').classList.contains('hidden'), true);
  assert.equal(fixture.byId('sync-vault-unlock-panel').classList.contains('hidden'), false);
});

test('changing the password and making a new vault send nothing to the server: no copy of a sync password is kept anywhere', async () => {
  const changed = await setup();
  changed.byId('sync-vault-manage-toggle').click();
  changed.byId('sync-vault-current-password').value = 'old-password-123';
  changed.byId('sync-vault-next-password').value = 'brand-new-password-1';
  changed.byId('sync-vault-next-confirmation').value = 'brand-new-password-1';
  changed.byId('sync-vault-change-btn').click();
  await flush();
  assert.equal(changed.requests.length, 0);
  assert.deepEqual(changed.events, ['sync-password-changed']);

  const fresh = await setup({ withVault: false });
  fresh.byId('sync-vault-create-password').value = 'a-first-sync-password';
  fresh.byId('sync-vault-create-confirmation').value = 'a-first-sync-password';
  fresh.byId('sync-vault-create-btn').click();
  await flush();
  assert.equal(isSyncVaultUnlocked(user.username), true);
  assert.equal(fresh.requests.length, 0);
});

test('dangerous actions ask for a passkey tap once (no authenticator set up), and not again within ten minutes; adding a passkey asks for none', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  assert.equal(fixture.passkey.calls.readAny, 0, 'adding needs only the sync password');

  chooseRowAction(fixture, 'remove');
  await flush();
  assert.equal(fixture.passkey.calls.readAny, 1, 'removing a passkey asks the person to confirm');
  assert.equal(fixture.table.row.slots.length, 0);

  await addPasskey(fixture);
  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-reset-btn').click();
  await flush();
  assert.equal(fixture.passkey.calls.readAny, 1, 'the confirmation holds for a while: clearing the sync password asks nothing more');
  assert.equal(fixture.table.row, null, 'what is kept in the cloud for the recovery is removed');
  assert.equal(await readSyncVaultRecord(fixture.storage, user.username), null, 'and the vault of this device');
});

test('dangerous actions stop when the passkey is not confirmed', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  fixture.passkey.cancel = true;
  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-reset-btn').click();
  await flush();
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.table.row.slots.length, 1);
  assert.match(fixture.notices.at(-1).message, /沒有確認通行金鑰/);
});

test('passkey card: inside an app\'s own browser it says to open Safari or Chrome, and offers no button that cannot work', async () => {
  const fixture = await setup({ availability: 'in-app' });
  assert.equal(fixture.byId('security-passkey-in-app').classList.contains('hidden'), false);
  assert.match(fixture.byId('security-passkey-in-app').textContent, /Safari/);
  assert.equal(fixture.byId('security-passkey-add').classList.contains('hidden'), true);
  assert.equal(fixture.byId('security-passkey-open-btn').classList.contains('hidden'), true);
  assert.equal(fixture.byId('security-passkey-unsupported').classList.contains('hidden'), true);
});

test('each change that protects the account tells the server, so the owner gets a mail: a passkey added or removed, the sync password changed, cleared, reset', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  assert.deepEqual(fixture.events, ['passkey-added']);

  fixture.byId('sync-vault-manage-toggle').click();
  fixture.byId('sync-vault-current-password').value = 'old-password-123';
  fixture.byId('sync-vault-next-password').value = 'brand-new-password-1';
  fixture.byId('sync-vault-next-confirmation').value = 'brand-new-password-1';
  fixture.byId('sync-vault-change-btn').click();
  await flush();
  assert.deepEqual(fixture.events, ['passkey-added', 'sync-password-changed']);

  chooseRowAction(fixture, 'remove');
  await flush();
  fixture.byId('sync-vault-current-password').value = 'brand-new-password-1';
  fixture.byId('sync-vault-reset-btn').click();
  await flush();
  assert.deepEqual(fixture.events, ['passkey-added', 'sync-password-changed', 'passkey-removed', 'sync-password-cleared']);

  const recovered = await forgotten();
  recovered.byId('sync-vault-recovery-password').value = 'a-completely-new-password';
  recovered.byId('sync-vault-recovery-confirmation').value = 'a-completely-new-password';
  recovered.byId('sync-vault-recovery-passkey-btn').click();
  await flush();
  assert.deepEqual(recovered.events, ['sync-password-reset']);
});

test('a change that did not happen tells nobody: a passkey that was not confirmed, a wrong password', async () => {
  const cancelled = await setup();
  cancelled.passkey.cancel = true;
  await addPasskey(cancelled);
  const wrong = await setup();
  await addPasskey(wrong, 'not-the-password');
  assert.deepEqual([...cancelled.events, ...wrong.events], []);
});

test('a passkey is named after the device and the browser it was made on, and a second of the same kind gets a number', async () => {
  const fixture = await setup();
  const base = deviceName(fixture.window.navigator.userAgent);
  await addPasskey(fixture);
  assert.equal(fixture.table.row.slots[0].label, base);
  assert.match(fixture.byId('security-passkey-list').textContent, new RegExp(base));
  await addPasskey(fixture);
  assert.equal(fixture.table.row.slots[1].label, `${base} 2`);
});

test('a passkey can be renamed later; only the label changes, nothing secret is touched, and the form closes after one is added', async () => {
  const fixture = await setup();
  fixture.byId('security-passkey-open-btn').click();
  await addPasskey(fixture);
  assert.equal(fixture.byId('security-passkey-add').classList.contains('hidden'), true, 'the form folds away again');

  const sealedBefore = fixture.table.row.slots[0].ciphertext;
  fixture.window.prompt = () => 'Work laptop';
  chooseRowAction(fixture, 'rename');
  await flush();
  assert.equal(fixture.table.row.slots[0].label, 'Work laptop');
  assert.equal(fixture.table.row.slots[0].ciphertext, sealedBefore, 'the sealed text is as it was');
  assert.equal(fixture.passkey.calls.readAny, 0, 'no passkey was asked');
  assert.match(fixture.byId('security-passkey-list').textContent, /Work laptop/);

  fixture.window.prompt = () => '   ';
  chooseRowAction(fixture, 'rename');
  await flush();
  assert.equal(fixture.table.row.slots[0].label, 'Work laptop', 'an empty name changes nothing');
});

test('with the protection of the keys on, the last passkey cannot be removed (it is the way to unlock them), and another one can', async () => {
  const fixture = await setup();
  await addPasskey(fixture);
  fixture.window.localStorage.setItem(`noureonLocalKeyProtection_v1_${user.username}`, JSON.stringify({ enabled: true, days: 7 }));
  chooseRowAction(fixture, 'remove');
  await flush();
  assert.equal(fixture.table.row.slots.length, 1, 'the last one stays');
  assert.match(fixture.notices.at(-1).message, /不能移除最後一把/);

  fixture.window.localStorage.removeItem(`noureonLocalKeyProtection_v1_${user.username}`);
  chooseRowAction(fixture, 'remove');
  await flush();
  assert.equal(fixture.table.row.slots.length, 0, 'with the protection off it goes');
});
