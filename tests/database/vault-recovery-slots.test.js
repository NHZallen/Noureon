import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { createDatabase } from '../helpers/database/supabase-database.js';

// The recovery data of the sync password (supabase/migrations/20261112100000_vault_recovery_slots.sql) with the real SQL: slots next to the old payload, and the
// authenticator app (a verified TOTP factor) needed, once it is set up, to add, change or delete what is kept.

let database;
let ada;
let bob;
let A1; // Ada after the sign-in
let A2; // Ada with the code of the authenticator app confirmed
let B1;

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
  A1 = database.asUser(ada, { aal: 'aal1' });
  A2 = database.asUser(ada, { aal: 'aal2' });
  B1 = database.asUser(bob, { aal: 'aal1' });
}, { timeout: 120_000 });
after(() => database?.close());

const slot = (id) => ({ version: 1, type: 'passkey', id, credentialId: `c-${id}`, prfSalt: 'c2FsdA==', iv: 'aXY=', ciphertext: 'Y2lwaGVy' });
const insert = (client, userId, slots = [], payload = null) => client.query('insert into public.user_vault_recovery (user_id, recovery_payload, slots) values ($1, $2::jsonb, $3::jsonb) on conflict (user_id) do update set slots = excluded.slots returning slots', [userId, payload && JSON.stringify(payload), JSON.stringify(slots)]);
const denied = (error) => assert.match(error?.message || 'it worked', /row-level security/);

test('a person with passkey slots only has no payload of the server\'s, reads only their own row, and the shape of the slots is checked', async () => {
  const rows = await insert(A1, ada, [slot('a'), slot('b')]);
  assert.equal(rows[0].slots.length, 2);
  assert.equal((await A1.query('select recovery_payload from public.user_vault_recovery'))[0].recovery_payload, null);
  assert.equal((await B1.query('select count(*)::int as n from public.user_vault_recovery'))[0].n, 0, 'Bob reads none of Ada\'s');
  assert.match((await database.anon.error('select count(*) from public.user_vault_recovery'))?.message || 'it worked', /permission denied/);
  assert.match((await A1.error("update public.user_vault_recovery set slots = '{}'::jsonb"))?.message || 'it worked', /violates check constraint/, 'not a list');
  assert.match((await A1.error('update public.user_vault_recovery set slots = $1::jsonb', [JSON.stringify(Array.from({ length: 9 }, (_, index) => slot(`s${index}`)))]))?.message || 'it worked', /violates check constraint/, 'more than the limit');
  await A1.query('delete from public.user_vault_recovery');
});

test('the copy of a sync password sealed with a key of the server can no longer be stored (retired 2026-11-13)', async () => {
  assert.match((await A1.error('insert into public.user_vault_recovery (user_id, recovery_payload) values ($1, $2::jsonb)', [ada, JSON.stringify({ version: 1, ciphertext: 'x' })]))?.message || 'it worked', /user_vault_recovery_payload_retired/);
  const rows = await A1.query('insert into public.user_vault_recovery (user_id) values ($1) returning slots, recovery_payload', [ada]);
  assert.deepEqual(rows[0].slots, [], 'no slots by default');
  assert.equal(rows[0].recovery_payload, null);
  await A1.query('delete from public.user_vault_recovery');
});

test('without an authenticator app a person changes their recovery data after the sign-in alone', async () => {
  await insert(A1, ada, [slot('a')]);
  assert.equal((await A1.query("update public.user_vault_recovery set slots = '[]'::jsonb returning 1")).length, 1);
  assert.equal((await A1.query('delete from public.user_vault_recovery returning 1')).length, 1);
});

test('with a confirmed authenticator app the sign-in alone reads but does not add, change or delete; the confirmed code does', async () => {
  await insert(A1, ada, [slot('a')]);
  await database.db.query("insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')", [ada]);

  assert.equal((await A1.query('select count(*)::int as n from public.user_vault_recovery'))[0].n, 1, 'reading is not restricted');
  assert.equal((await A1.query('select public.user_has_verified_totp() as yes'))[0].yes, true);
  // (A rule that filters rows out of an update or a delete does not fail: it changes nothing. A new row is refused with an error.)
  assert.equal((await A1.query("update public.user_vault_recovery set slots = '[]'::jsonb returning 1")).length, 0, 'the update changed nothing');
  assert.equal((await A1.query('delete from public.user_vault_recovery returning 1')).length, 0, 'the delete removed nothing');
  assert.equal((await database.service.query('select jsonb_array_length(slots)::int as n from public.user_vault_recovery where user_id = $1', [ada]))[0].n, 1, 'the slot is still there');
  await database.service.query('delete from public.user_vault_recovery where user_id = $1', [ada]);
  denied(await A1.error('insert into public.user_vault_recovery (user_id, slots) values ($1, $2::jsonb)', [ada, JSON.stringify([slot('x')])]));

  await insert(A2, ada, [slot('b')]);
  assert.equal((await A2.query("update public.user_vault_recovery set slots = '[]'::jsonb returning 1")).length, 1);
  assert.equal((await A2.query('delete from public.user_vault_recovery returning 1')).length, 1);
});

test('a factor that was never confirmed, or another person\'s factor, asks nothing of a person', async () => {
  await database.db.query('delete from auth.mfa_factors');
  await database.db.query("insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'unverified')", [ada]);
  await database.db.query("insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')", [bob]);
  assert.equal((await A1.query('select public.user_has_verified_totp() as yes'))[0].yes, false);
  await insert(A1, ada, [slot('a')]);
  assert.equal((await A1.query('delete from public.user_vault_recovery returning 1')).length, 1);
  denied(await B1.error('insert into public.user_vault_recovery (user_id, slots) values ($1, $2::jsonb)', [bob, '[]']));
});

test('the question about the authenticator app is for people who are signed in, and a person cannot read the table of factors', async () => {
  assert.match((await database.anon.error('select public.user_has_verified_totp()'))?.message || 'it worked', /permission denied/);
  assert.match((await A1.error('select * from auth.mfa_factors'))?.message || 'it worked', /permission denied/);
});
