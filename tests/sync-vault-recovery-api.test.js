import assert from 'node:assert/strict';
import test from 'node:test';

import handler, { hasFreshEmailVerification } from '../api/sync-vault-recovery.js';
import {
  decryptSyncVaultRecovery,
  encryptSyncVaultRecovery,
  generateSyncVaultRecoveryCode,
  isSyncVaultRecoveryPayload
} from '../src/app/sync/sync-vault-recovery-code.js';

function createToken(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('vault recovery is encrypted by a user-held code and wrong codes cannot decrypt it', async () => {
  const recoveryCode = generateSyncVaultRecoveryCode();
  const source = {
    password: 'correct horse battery staple',
    record: { version: 1, salt: 'salt', check: 'check' }
  };
  const payload = await encryptSyncVaultRecovery({ ...source, recoveryCode });

  assert.equal(isSyncVaultRecoveryPayload(payload), true);
  assert.equal(payload.version, 2);
  assert.equal(JSON.stringify(payload).includes(source.password), false);
  assert.deepEqual(await decryptSyncVaultRecovery(payload, recoveryCode), source);
  await assert.rejects(
    decryptSyncVaultRecovery(payload, generateSyncVaultRecoveryCode()),
    /incorrect|damaged/i
  );
});

test('recovery payload rejects malformed codes and unsupported records', async () => {
  await assert.rejects(
    encryptSyncVaultRecovery({ password: 'long enough password', record: {}, recoveryCode: 'bad-code' }),
    /Invalid recovery code/
  );
  assert.equal(isSyncVaultRecoveryPayload({ version: 1 }), false);
});

test('recent verification uses the matching AMR timestamp instead of JWT issue time', () => {
  const now = Date.UTC(2026, 6, 12, 12, 0, 0);
  const fresh = Math.floor((now - 60_000) / 1000);
  const stale = Math.floor((now - 20 * 60_000) / 1000);

  assert.equal(hasFreshEmailVerification(createToken({
    iat: stale,
    amr: [{ method: 'otp', timestamp: fresh }]
  }), now), true);
  assert.equal(hasFreshEmailVerification(createToken({
    iat: fresh,
    amr: [{ method: 'otp', timestamp: stale }]
  }), now), false);
  assert.equal(hasFreshEmailVerification(createToken({
    iat: fresh,
    amr: [{ method: 'password', timestamp: fresh }]
  }), now), false);
  assert.equal(hasFreshEmailVerification(createToken({
    iat: fresh,
    amr: [{ method: 'magiclink' }]
  }), now), false);
});

test('recovery API contains no shared decryption key or server decrypt operation', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../api/sync-vault-recovery.js', import.meta.url),
    'utf8'
  ));

  assert.doesNotMatch(source, /SYNC_VAULT_RECOVERY_KEY|createDecipheriv|decryptRecoveryPayload/);
  assert.match(source, /bodyParser:\s*\{\s*sizeLimit:\s*'16kb'/);
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('recovery API stores and returns only the opaque client ciphertext', async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  const recoveryCode = generateSyncVaultRecoveryCode();
  const payload = await encryptSyncVaultRecovery({
    password: 'correct horse battery staple',
    record: { version: 1, salt: 'salt', check: 'check' },
    recoveryCode
  });
  let storedBody;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-123' }) };
    if (options.method === 'POST') {
      storedBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [{ recovery_payload: payload }] };
  };

  try {
    const token = createToken({
      amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }]
    });
    const storeResponse = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { action: 'store', payload }
    }, storeResponse);
    assert.equal(storeResponse.statusCode, 200);
    assert.deepEqual(storedBody, { user_id: 'user-123', recovery_payload: payload });
    assert.equal(JSON.stringify(storedBody).includes('correct horse battery staple'), false);

    const recoverResponse = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { action: 'recover' }
    }, recoverResponse);
    assert.equal(recoverResponse.statusCode, 200);
    assert.deepEqual(recoverResponse.body, { payload });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey == null) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test('recovery migration deletes shared-key rows and accepts only version 2 payloads', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../supabase/migrations/20260712000000_replace_server_decryptable_vault_recovery.sql', import.meta.url),
    'utf8'
  );
  assert.match(source, /delete from public\.user_vault_recovery/);
  assert.match(source, /recovery_payload ->> 'version' = '2'/);
  assert.match(source, /PBKDF2-SHA256\+A256GCM/);
});
