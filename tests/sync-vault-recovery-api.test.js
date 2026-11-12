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

test('an account with an authenticator app set up needs its code confirmed (aal2) for every action of the recovery; one without it, or with an unconfirmed one, does not', async () => {
  const { default: handler } = await import('../api/sync-vault-recovery.js');
  const key = Buffer.alloc(32, 7).toString('base64');
  const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  const now = Math.floor(Date.now() / 1000);
  const aal1 = jwt({ iat: now, aal: 'aal1', amr: [{ method: 'magiclink' }] });
  const aal2 = jwt({ iat: now, aal: 'aal2', amr: [{ method: 'totp' }, { method: 'magiclink' }] });
  const stored = encryptRecoveryPayload({ password: 'the kept password', record: { v: 1 } }, key);
  let factors = [{ factor_type: 'totp', status: 'verified' }];
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example', SUPABASE_PUBLISHABLE_KEY: 'pk', SYNC_VAULT_RECOVERY_KEY: key });
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1', factors }), { status: 200 });
    if (options.method === 'POST' || options.method === 'DELETE') return new Response('', { status: 201 });
    return new Response(JSON.stringify([{ recovery_payload: stored }]), { status: 200 });
  };
  const call = async (token, body) => {
    const res = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
    return res;
  };
  try {
    for (const action of ['store', 'recover', 'delete']) {
      const body = { action, password: 'a new password!', record: { v: 2 } };
      const refused = await call(aal1, body);
      assert.equal(refused.code, 403, `${action} after the sign-in alone`);
      assert.equal(refused.body.code, 'mfa_required');
      assert.equal((await call(aal2, body)).code, 200, `${action} with the code confirmed`);
    }
    factors = [{ factor_type: 'totp', status: 'unverified' }];
    assert.equal((await call(aal1, { action: 'recover' })).code, 200, 'a factor that was never confirmed asks nothing');
    factors = [];
    assert.equal((await call(aal1, { action: 'recover' })).code, 200, 'no factor: as before');
  } finally {
    globalThis.fetch = saved.fetch;
    for (const name of Object.keys(process.env)) if (!(name in saved.env)) delete process.env[name];
    Object.assign(process.env, saved.env);
  }
});
