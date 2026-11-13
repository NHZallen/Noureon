import assert from 'node:assert/strict';
import test from 'node:test';

import { sendPasswordChangedNotice } from '../src/app/auth/password-reset-notice.js';

const sessionOf = (token) => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) } });

test('after a forgotten password is replaced, the server is asked to mail the owner, with the token of the session of the code', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return { ok: true }; };
  assert.equal(await sendPasswordChangedNotice({ supabase: sessionOf('tok'), fetchImpl, baseUrl: 'https://api.example.test' }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/v1/security-notice');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].options.body), { event: 'login-password-changed' });
});

test('the mail never holds the reset up: no session, a refusal, a broken network or a server that does not answer all end quietly', async () => {
  let called = 0;
  const count = async () => { called += 1; return { ok: true }; };
  assert.equal(await sendPasswordChangedNotice({ supabase: sessionOf(''), fetchImpl: count }), false);
  assert.equal(called, 0, 'no session, no call');
  assert.equal(await sendPasswordChangedNotice({ supabase: sessionOf('tok'), fetchImpl: async () => ({ ok: false }), baseUrl: 'https://x.test' }), false);
  assert.equal(await sendPasswordChangedNotice({ supabase: sessionOf('tok'), fetchImpl: async () => { throw new Error('offline'); }, baseUrl: 'https://x.test' }), false);
  assert.equal(await sendPasswordChangedNotice({ supabase: { auth: { getSession: async () => { throw new Error('boom'); } } }, fetchImpl: count }), false);
  const stuck = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await sendPasswordChangedNotice({ supabase: sessionOf('tok'), fetchImpl: stuck, baseUrl: 'https://x.test', timeoutMs: 20 }), false);
});
