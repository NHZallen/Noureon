import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import test from 'node:test';

import { createCredentialStore } from '../../server/cli-credentials.js';
import { createKeyVault } from '../../server/key-vault.js';

const MASTER = randomBytes(32);
const vaultOf = (version = 1, key = MASTER) => createKeyVault([{ version, key: key.toString('base64') }]);
const ADA = '123e4567-e89b-12d3-a456-426614174000';
const BOB = '223e4567-e89b-12d3-a456-426614174001';

// The form that was made before every person had a key of their own: sealed with the master key itself.
const legacyEnvelope = (secrets, { userId, messageId }, key = MASTER) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${userId}:${messageId}`, 'utf8'));
  const sealed = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return ['nk1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), sealed.toString('base64')].join('.');
};

test('what is sealed now is in the form with a key of the person, and opens only for that person and message', () => {
  const vault = vaultOf();
  const { envelope, keyVersion } = vault.seal({ gemini: 'AIza-secret' }, { userId: ADA, messageId: 'm1' });
  assert.match(envelope, /^nk2\./);
  assert.equal(vault.isCurrent(envelope, keyVersion), true);
  assert.deepEqual(vault.open(envelope, keyVersion, { userId: ADA, messageId: 'm1' }), { gemini: 'AIza-secret' });
  assert.throws(() => vault.open(envelope, keyVersion, { userId: BOB, messageId: 'm1' }), /cannot be opened/);
  assert.throws(() => vault.open(envelope, keyVersion, { userId: ADA, messageId: 'm2' }), /cannot be opened/);
  assert.doesNotMatch(envelope, /AIza-secret/);
});

test('every person has a different key: the same secrets sealed for two people share nothing that would open the other\'s', () => {
  const vault = vaultOf();
  const a = vault.seal({ k: 'same' }, { userId: ADA, messageId: 'm' }).envelope.split('.');
  const b = vault.seal({ k: 'same' }, { userId: BOB, messageId: 'm' }).envelope.split('.');
  assert.notEqual(a[3], b[3]);
  // A person's envelope moved under another person's name (the associated data changed to match) still does not open: their key is different.
  const moved = a.join('.');
  const forged = createKeyVault([{ version: 1, key: MASTER.toString('base64') }]);
  assert.throws(() => forged.open(moved, 1, { userId: BOB, messageId: 'm' }), /cannot be opened/);
});

test('the older form (the master key itself) still opens, is not current, and a changed byte or a wrong key does not open', () => {
  const vault = vaultOf();
  const old = legacyEnvelope({ v: 'kept' }, { userId: ADA, messageId: 'm1' });
  assert.deepEqual(vault.open(old, 1, { userId: ADA, messageId: 'm1' }), { v: 'kept' });
  assert.equal(vault.isCurrent(old, 1), false);
  assert.throws(() => vaultOf(1, randomBytes(32)).open(old, 1, { userId: ADA, messageId: 'm1' }), /cannot be opened/);
  const parts = vault.seal({ v: 'x' }, { userId: ADA, messageId: 'm1' }).envelope.split('.');
  parts[3] = Buffer.from(parts[3], 'base64').map((byte, index) => (index === 0 ? byte ^ 1 : byte)).toString('base64');
  assert.throws(() => vault.open(parts.join('.'), 1, { userId: ADA, messageId: 'm1' }), /cannot be opened/);
});

test('a master key that is replaced: the new one seals, the previous one still opens both forms it made, and an envelope of the old master is not current', () => {
  const previous = randomBytes(32);
  const oldVault = vaultOf(1, previous);
  const sealedThen = oldVault.seal({ v: 'then' }, { userId: ADA, messageId: 'm' });
  const next = randomBytes(32);
  const both = createKeyVault([{ version: 2, key: next.toString('base64') }, { version: 1, key: previous.toString('base64') }]);
  assert.deepEqual(both.open(sealedThen.envelope, 1, { userId: ADA, messageId: 'm' }), { v: 'then' });
  assert.equal(both.isCurrent(sealedThen.envelope, 1), false, 'sealed again under the new master when it is read');
  assert.deepEqual(both.open(legacyEnvelope({ v: 'old form' }, { userId: ADA, messageId: 'm' }, previous), 1, { userId: ADA, messageId: 'm' }), { v: 'old form' });
  assert.equal(both.seal({ v: 'now' }, { userId: ADA, messageId: 'm' }).keyVersion, 2);
});

test('a credential sealed in the older form is sealed again with the person\'s own key when it is read, and only if the row did not change meanwhile', async () => {
  const vault = vaultOf();
  const row = { user_id: ADA, name: 'GITHUB_TOKEN', envelope: legacyEnvelope({ value: 'ghp_old' }, { userId: ADA, messageId: 'credential:GITHUB_TOKEN' }), key_version: 1, updated_at: '2026-11-01T00:00:00.000Z' };
  const rows = [row];
  const matches = (filters) => (entry) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    const value = rest.join('.');
    return op === 'eq' ? String(entry[column]) === value : value.replace(/^\(|\)$/g, '').split(',').includes(String(entry[column]));
  });
  const updates = [];
  const db = {
    select: async (table, { filters } = {}) => rows.filter(matches(filters)).map((entry) => ({ ...entry })),
    update: async (table, filters, values) => { updates.push(filters); const hit = rows.filter(matches(filters)); hit.forEach((entry) => Object.assign(entry, values)); return hit; }
  };
  const store = createCredentialStore({ db, vault });

  assert.deepEqual(await store.values(ADA, ['GITHUB_TOKEN']), { GITHUB_TOKEN: 'ghp_old' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(rows[0].envelope, /^nk2\./);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].envelope.startsWith('eq.nk1.'), true, 'the write is guarded by the envelope that was read');
  assert.deepEqual(await store.values(ADA, ['GITHUB_TOKEN']), { GITHUB_TOKEN: 'ghp_old' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(updates.length, 1, 'once it is in the current form it is not written again');
});
