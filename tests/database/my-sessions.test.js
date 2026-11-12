import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { createDatabase } from '../helpers/database/supabase-database.js';

// The devices a person is signed in on (supabase/migrations/20261112110000_list_and_revoke_my_sessions.sql) with the real SQL: a person sees only their own, can sign out another
// device but not the one the request comes from, and with an authenticator app set up needs its code (aal2) for it.

let database;
let ada;
let bob;

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
}, { timeout: 120_000 });
after(() => database?.close());

const session = (userId, agent, ip, { refreshedAt = null, createdAt = '2026-11-01T00:00:00Z', notAfter = null } = {}) => database.db.query(
  'insert into auth.sessions (user_id, created_at, refreshed_at, not_after, user_agent, ip) values ($1, $2, $3, $4, $5, $6) returning id',
  [userId, createdAt, refreshedAt, notAfter, agent, ip]
).then((result) => result.rows[0].id);

const asAda = (sessionId, aal = 'aal1') => database.asUser(ada, { aal, session_id: sessionId });

test('a person sees their own devices, the newest activity first, with the browser text, the address and which one is this', async () => {
  const phone = await session(ada, 'iPhone Safari', '203.0.113.9', { refreshedAt: '2026-11-12T10:00:00' });
  const laptop = await session(ada, 'Mac Chrome', '198.51.100.4', { refreshedAt: '2026-11-10T08:00:00' });
  const old = await session(ada, 'Old', '192.0.2.1', { createdAt: '2026-10-01T00:00:00Z' });
  await session(bob, 'Bob phone', '203.0.113.50');
  const rows = await asAda(laptop).query('select * from public.list_my_sessions()');
  assert.deepEqual(rows.map((row) => row.id), [phone, laptop, old], 'only Ada\'s, the most recent first');
  assert.equal(rows.find((row) => row.id === laptop).is_current, true);
  assert.equal(rows.find((row) => row.id === phone).is_current, false);
  assert.equal(rows[0].ip, '203.0.113.9');
  assert.equal(rows[0].user_agent, 'iPhone Safari');
  assert.equal(new Date(rows[0].last_active_at).toISOString(), '2026-11-12T10:00:00.000Z');
  assert.equal((await database.asUser(bob, {}).query('select count(*)::int as n from public.list_my_sessions()'))[0].n, 1);
  assert.match((await database.anon.error('select * from public.list_my_sessions()'))?.message || 'it worked', /permission denied/);
  await database.db.query('delete from auth.sessions');
});

test('a device whose sign-in has ended is not listed', async () => {
  const now = await session(ada, 'Now', '203.0.113.1');
  await session(ada, 'Ended', '203.0.113.2', { notAfter: '2020-01-01T00:00:00Z' });
  assert.deepEqual((await asAda(now).query('select user_agent from public.list_my_sessions()')).map((row) => row.user_agent), ['Now']);
  await database.db.query('delete from auth.sessions');
});

test('another device can be signed out; this one cannot, nor can a device of someone else, nor a missing one', async () => {
  const here = await session(ada, 'Here', '203.0.113.1');
  const there = await session(ada, 'There', '203.0.113.2');
  const bobs = await session(bob, 'Bob', '203.0.113.3');
  assert.equal((await asAda(here).query('select public.revoke_my_session($1) as done', [here]))[0].done, false, 'this device is signed out with "sign out", not from the list');
  assert.equal((await asAda(here).query('select public.revoke_my_session($1) as done', [bobs]))[0].done, false, 'a device of someone else is not touched');
  assert.equal((await asAda(here).query('select public.revoke_my_session($1) as done', ['00000000-0000-0000-0000-000000000000']))[0].done, false);
  assert.equal((await database.db.query('select count(*)::int as n from auth.sessions')).rows[0].n, 3);
  assert.equal((await asAda(here).query('select public.revoke_my_session($1) as done', [there]))[0].done, true);
  assert.deepEqual((await database.db.query('select id from auth.sessions where user_id = $1', [ada])).rows.map((row) => row.id), [here]);
  assert.equal((await database.db.query('select count(*)::int as n from auth.sessions where id = $1', [bobs])).rows[0].n, 1);
  assert.match((await database.anon.error('select public.revoke_my_session($1)', [there]))?.message || 'it worked', /permission denied/);
  await database.db.query('delete from auth.sessions');
});

test('with an authenticator app set up, signing a device out needs its code (aal2)', async () => {
  const here = await session(ada, 'Here', '203.0.113.1');
  const there = await session(ada, 'There', '203.0.113.2');
  await database.db.query("insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')", [ada]);
  assert.match((await asAda(here, 'aal1').error('select public.revoke_my_session($1)', [there]))?.message || 'it worked', /mfa_required/);
  assert.equal((await database.db.query('select count(*)::int as n from auth.sessions')).rows[0].n, 2, 'nothing was signed out');
  assert.equal((await asAda(here, 'aal2').query('select public.revoke_my_session($1) as done', [there]))[0].done, true);
  await database.db.query('delete from auth.mfa_factors');
  await database.db.query('delete from auth.sessions');
});
