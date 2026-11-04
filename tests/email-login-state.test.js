import assert from 'node:assert/strict';
import test from 'node:test';

import { EMAIL_PASSWORD_MARK, isRepeatedSignUp, readEmailLogin } from '../src/app/auth/email-login-state.js';

test('the pretended answer of a sign-up for an Email that is registered is known by its empty identities and no session', () => {
  assert.equal(isRepeatedSignUp({ data: { user: { identities: [] }, session: null } }), true);
  assert.equal(isRepeatedSignUp({ data: { user: { identities: [{ provider: 'email' }] }, session: null } }), false, 'a new account');
  assert.equal(isRepeatedSignUp({ data: { user: { identities: [] }, session: { access_token: 'x' } } }), false, 'a session means a sign-in');
  assert.equal(isRepeatedSignUp({ data: { user: { id: 'u' }, session: null } }), false, 'no identities field: unknown, not pretended');
  assert.equal(isRepeatedSignUp({ data: {}, error: { message: 'x' } }), false);
  assert.equal(isRepeatedSignUp(null), false);
});

const client = ({ identities = [], rpc, user = {} }) => ({
  auth: {
    getUserIdentities: async () => ({ data: { identities: identities.map((provider) => ({ provider })) }, error: null }),
    getUser: async () => ({ data: { user }, error: null })
  },
  rpc
});

test('an Email identity is an Email login; otherwise the function that knows of the password answers', async () => {
  assert.deepEqual(await readEmailLogin(client({ identities: ['email', 'google'] })), { providers: ['email', 'google'], emailLogin: true });
  assert.equal((await readEmailLogin(client({ identities: ['google'], rpc: async () => ({ data: true, error: null }) }))).emailLogin, true);
  assert.equal((await readEmailLogin(client({ identities: ['google'], rpc: async () => ({ data: false, error: null }) }))).emailLogin, false);
});

test('without the function the mark in the metadata stands in, and the function wins over a stale mark', async () => {
  const marked = { user_metadata: { [EMAIL_PASSWORD_MARK]: true } };
  assert.equal((await readEmailLogin(client({ identities: ['google'], user: marked, rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }))).emailLogin, true);
  assert.equal((await readEmailLogin(client({ identities: ['google'], user: marked, rpc: async () => { throw new Error('offline'); } }))).emailLogin, true);
  assert.equal((await readEmailLogin(client({ identities: ['google'], user: marked }))).emailLogin, true, 'no rpc at all');
  assert.equal((await readEmailLogin(client({ identities: ['google'], user: {} }))).emailLogin, false);
  assert.equal((await readEmailLogin(client({ identities: ['google'], user: marked, rpc: async () => ({ data: false, error: null }) }))).emailLogin, false);
});

test('when the identities cannot be read nothing is claimed', async () => {
  const broken = { auth: { getUserIdentities: async () => ({ data: null, error: { message: 'offline' } }), getUser: async () => ({ data: { user: {} } }) } };
  assert.deepEqual(await readEmailLogin(broken), { providers: [], emailLogin: false });
});
