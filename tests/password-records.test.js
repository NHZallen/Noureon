import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { constantTimeEqual, createPasswordRecord, hashString, upgradeLegacyPasswordRecord, verifyPasswordRecord } from '../src/app/runtime/security/password-records.js';

test('a new record is PBKDF2 with its own salt, and only the right password matches it', async () => {
  const record = await createPasswordRecord('alice', 'correct horse');
  assert.equal(record.username, 'alice');
  assert.equal(record.passwordKdf, 'PBKDF2-SHA-256');
  assert.equal(record.passwordIterations, 210000);
  assert.match(record.passwordSalt, /^[0-9a-f]{32}$/);
  assert.match(record.passwordHash, /^[0-9a-f]{64}$/);
  assert.notEqual((await createPasswordRecord('alice', 'correct horse')).passwordSalt, record.passwordSalt);
  assert.equal(await verifyPasswordRecord('correct horse', record), true);
  assert.equal(await verifyPasswordRecord('wrong', record), false);
});

test('an old SHA-256 record is accepted and made again with PBKDF2 once', async () => {
  const legacy = { username: 'bob', passwordHash: createHash('sha256').update('pw').digest('hex') };
  assert.equal(await hashString('pw'), legacy.passwordHash);
  assert.equal(await verifyPasswordRecord('pw', legacy), true);
  assert.equal(await verifyPasswordRecord('nope', legacy), false);
  const writes = [];
  const upgraded = await upgradeLegacyPasswordRecord('pw', 'chatUser_bob', legacy, async (key, value) => writes.push([key, JSON.parse(value)]));
  assert.equal(upgraded.passwordKdf, 'PBKDF2-SHA-256');
  assert.deepEqual(writes, [['chatUser_bob', upgraded]]);
  assert.equal(await verifyPasswordRecord('pw', upgraded), true);
  assert.equal(await upgradeLegacyPasswordRecord('pw', 'chatUser_bob', upgraded, async () => assert.fail('no write')), upgraded);
});

test('constant time comparison', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});
