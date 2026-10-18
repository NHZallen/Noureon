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

test('a session alone cannot replace or remove the recovery: it takes the sync password kept now, or an Email sign-in a moment ago', async () => {
  const { default: handler } = await import('../api/sync-vault-recovery.js');
  const key = Buffer.alloc(32, 7).toString('base64');
  const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  const plain = jwt({ iat: Math.floor(Date.now() / 1000), amr: [{ method: 'oauth' }] });
  const fresh = jwt({ iat: Math.floor(Date.now() / 1000), amr: [{ method: 'magiclink' }] });
  let stored = encryptRecoveryPayload({ password: 'the kept password', record: { v: 1 } }, key);
  const writes = [];
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example', SUPABASE_PUBLISHABLE_KEY: 'pk', SYNC_VAULT_RECOVERY_KEY: key });
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
    if (options.method === 'POST' || options.method === 'DELETE') {
      writes.push(options.method);
      return new Response('', { status: 201 });
    }
    return new Response(JSON.stringify(stored ? [{ recovery_payload: stored }] : []), { status: 200 });
  };
  const call = async (token, body) => {
    const res = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
    return res;
  };
  try {
    const store = { action: 'store', password: 'a new password!', record: { v: 2 } };
    assert.equal((await call(plain, store)).code, 403);
    assert.equal((await call(plain, { ...store, currentPassword: 'a wrong one' })).code, 403);
    assert.equal((await call(plain, { action: 'delete' })).code, 403);
    assert.deepEqual(writes, [], 'nothing was written');
    assert.equal((await call(plain, { ...store, currentPassword: 'the kept password' })).code, 200);
    assert.equal((await call(fresh, store)).code, 200, 'the recovery itself');
    assert.equal((await call(plain, { action: 'delete', currentPassword: 'the kept password' })).code, 200);
    stored = null;
    assert.equal((await call(plain, store)).code, 200, 'a first sync password needs nothing more');
    assert.deepEqual(writes, ['POST', 'POST', 'DELETE', 'POST']);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SYNC_VAULT_RECOVERY_KEY']) {
      if (saved.env[name] === undefined) delete process.env[name];
      else process.env[name] = saved.env[name];
    }
  }
});
