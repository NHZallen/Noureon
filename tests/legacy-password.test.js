import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { verifyLegacyPassword } from '../src/app/auth/legacy-password.js';

const hex = (bytes) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');

// The records the runtime writes (createPasswordRecord of legacy-core.js): PBKDF2-SHA-256, 16 bytes of salt, 210000 rounds by default.
async function pbkdf2Record(password, iterations = 1000) {
  const salt = new Uint8Array(16).map((_, index) => index + 3);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { username: 'old', passwordHash: hex(new Uint8Array(bits)), passwordSalt: hex(salt), passwordIterations: iterations, passwordKdf: 'PBKDF2-SHA-256' };
}

test('the password of an old local account is checked against its record', async () => {
  const record = await pbkdf2Record('correct horse');
  assert.equal(await verifyLegacyPassword('correct horse', record), true);
  assert.equal(await verifyLegacyPassword('wrong horse', record), false);
  assert.equal(await verifyLegacyPassword('correct horse ', record), false, 'not a prefix or a trimmed form');
});

test('the oldest accounts hold the SHA-256 of the password, and are checked too', async () => {
  const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('legacy-pass'))));
  assert.equal(await verifyLegacyPassword('legacy-pass', { username: 'old', passwordHash: digest }), true);
  assert.equal(await verifyLegacyPassword('legacy-pasS', { username: 'old', passwordHash: digest }), false);
});

test('nothing that cannot be checked is accepted: no password, no record, no hash, a broken record, no crypto', async () => {
  const record = await pbkdf2Record('pw');
  assert.equal(await verifyLegacyPassword('', record), false);
  assert.equal(await verifyLegacyPassword(undefined, record), false);
  assert.equal(await verifyLegacyPassword('pw', null), false);
  assert.equal(await verifyLegacyPassword('pw', {}), false);
  assert.equal(await verifyLegacyPassword('pw', { username: 'old', passwordHash: '' }), false, 'an account without a password hash is not opened by any password');
  assert.equal(await verifyLegacyPassword('pw', { ...record, passwordSalt: 'zz' }), false);
  assert.equal(await verifyLegacyPassword('pw', record, {}), false);
});

test('the import of an old local account asks for its name and password before its workspace is replaced', () => {
  const source = readFileSync(new URL('../src/app/auth/supabase-auth-bridge.js', import.meta.url), 'utf8');
  const submit = source.slice(source.indexOf("const importTarget = elements.form.dataset.importTargetUser;"));
  const checked = submit.indexOf('verifyLegacyPassword(');
  const replaced = submit.indexOf('reconcileStoredWorkspaceOwner(');
  const moved = submit.indexOf('migrateSyncVaultRecord(');
  assert.ok(checked > 0 && replaced > 0 && moved > 0);
  assert.ok(checked < moved && checked < replaced, 'the password is checked before the sync vault is moved and the old records are removed');
  assert.match(submit, /typedName === previousUsername/, 'the name typed must be the account that owns the workspace');
  assert.match(submit, /localImportPasswordMismatch/);
  assert.match(submit.slice(0, replaced), /return;/, 'a wrong password stops the handler');
});
