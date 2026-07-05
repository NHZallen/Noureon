import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptRecoveryPayload,
  encryptRecoveryPayload
} from '../api/sync-vault-recovery.js';

test('vault recovery payload encrypts password and record with authenticated encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const source = {
    password: 'correct horse battery staple',
    record: { version: 1, salt: 'salt', check: 'check' }
  };
  const encrypted = encryptRecoveryPayload(source, key);

  assert.equal(encrypted.version, 1);
  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.equal(JSON.stringify(encrypted).includes(source.password), false);
  assert.deepEqual(decryptRecoveryPayload(encrypted, key), source);
  assert.throws(
    () => decryptRecoveryPayload(encrypted, Buffer.alloc(32, 8).toString('base64')),
    /authenticate data|Unsupported state/i
  );
});

test('vault recovery encryption rejects improperly sized server keys', () => {
  assert.throws(
    () => encryptRecoveryPayload({ password: 'long enough password' }, Buffer.alloc(8).toString('base64')),
    /32-byte key/
  );
});
