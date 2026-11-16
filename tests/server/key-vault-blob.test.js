import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createKeyVault } from '../../server/key-vault.js';

const keyOf = () => randomBytes(32).toString('base64');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ctx = { userId: USER, purpose: 'browser-profile', objectId: 'profile' };

test('a sealed file opens again for the same person, purpose and name, and is not readable as it is', () => {
  const vault = createKeyVault([{ version: 1, key: keyOf() }]);
  const bytes = Buffer.from('cookie-jar-secret '.repeat(50));
  const { blob, keyVersion } = vault.sealBlob(bytes, ctx);
  assert.equal(keyVersion, 1);
  assert.ok(!blob.includes('cookie-jar-secret'), 'the plain text must not be inside');
  assert.deepEqual(vault.openBlob(blob, keyVersion, ctx), bytes);
});

test('another person, purpose or name cannot open it; a changed byte cannot be opened', () => {
  const vault = createKeyVault([{ version: 1, key: keyOf() }]);
  const { blob, keyVersion } = vault.sealBlob(Buffer.from('secret'), ctx);
  assert.throws(() => vault.openBlob(blob, keyVersion, { ...ctx, userId: OTHER }), /cannot be opened/);
  assert.throws(() => vault.openBlob(blob, keyVersion, { ...ctx, purpose: 'other-purpose' }), /cannot be opened/);
  assert.throws(() => vault.openBlob(blob, keyVersion, { ...ctx, objectId: 'another' }), /cannot be opened/);
  const flipped = Buffer.from(blob);
  flipped[flipped.length - 1] ^= 1;
  assert.throws(() => vault.openBlob(flipped, keyVersion, ctx), /cannot be opened/);
  assert.throws(() => vault.openBlob(Buffer.from('nb1short'), keyVersion, ctx), /cannot be opened/);
  assert.throws(() => vault.openBlob(blob, 9, ctx), /cannot be opened/);
});

test('a sealed file is not the sealed text of the other form, and the purpose has to be a plain word', () => {
  const vault = createKeyVault([{ version: 1, key: keyOf() }]);
  const text = vault.seal({ a: 1 }, { userId: USER, messageId: 'profile' });
  assert.throws(() => vault.openBlob(Buffer.from(text.envelope), 1, ctx), /cannot be opened/);
  for (const purpose of ['', 'Browser', '../x', 'a', 'x'.repeat(40)]) assert.throws(() => vault.sealBlob(Buffer.from('x'), { ...ctx, purpose }), /purpose/);
});

test('a file sealed under the previous master key still opens after the key is replaced', () => {
  const oldKey = keyOf();
  const before = createKeyVault([{ version: 1, key: oldKey }]).sealBlob(Buffer.from('kept'), ctx);
  const after = createKeyVault([{ version: 2, key: keyOf() }, { version: 1, key: oldKey }]);
  assert.equal(after.openBlob(before.blob, before.keyVersion, ctx).toString(), 'kept');
  assert.equal(after.sealBlob(Buffer.from('new'), ctx).keyVersion, 2);
});
