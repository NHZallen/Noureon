import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { createDatabase } from '../helpers/database/supabase-database.js';

// The table of the memory of a person (supabase/migrations/20261030010000_add_workspace_memory_records.sql), as it is with the real SQL: a person reads, adds and
// changes only their own rows, never deletes; the server does all; the version and the time are the database's; the key and the size of a row are checked.

let database;
let ada;
let bob;
let A;
let B;

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
  A = database.asUser(ada);
  B = database.asUser(bob);
}, { timeout: 120_000 });
after(() => database?.close());

const insert = (client, userId, key, payload = { text: 'x' }) => client.query('insert into public.workspace_memory_records (user_id, record_key, payload) values ($1, $2, $3::jsonb) returning version, updated_at', [userId, key, JSON.stringify(payload)]);

test('a person reads, adds and changes their own rows, and nobody else\'s; signed out reads nothing', async () => {
  const [{ version }] = await insert(A, ada, 'note:n1', { text: '使用者住在台中' });
  assert.equal(Number(version), 1);
  assert.equal((await A.query('select count(*)::int as n from public.workspace_memory_records'))[0].n, 1);
  assert.equal((await B.query('select count(*)::int as n from public.workspace_memory_records'))[0].n, 0, 'Bob reads none of Ada\'s');
  assert.match((await database.anon.error('select count(*) from public.workspace_memory_records'))?.message || 'it worked', /permission denied/);
  assert.match((await B.error('insert into public.workspace_memory_records (user_id, record_key) values ($1, $2)', [ada, 'note:stolen']))?.message || 'it worked', /row-level security/, 'Bob cannot add a row for Ada');
  assert.equal((await B.query('update public.workspace_memory_records set payload = $1::jsonb where user_id = $2 returning 1', [JSON.stringify({ text: 'x' }), ada])).length, 0, 'Bob changes none of Ada\'s');
});

test('every change is a new version, and the time is the database\'s whatever the device says', async () => {
  await insert(A, ada, 'note:n2', { text: 'a' });
  const first = (await A.query("select version, updated_at from public.workspace_memory_records where record_key = 'note:n2'"))[0];
  const changed = await A.query("update public.workspace_memory_records set payload = $1::jsonb, version = 99, updated_at = '2000-01-01' where record_key = 'note:n2' returning version, updated_at", [JSON.stringify({ text: 'b' })]);
  assert.equal(Number(changed[0].version), Number(first.version) + 1, 'a device cannot choose the version');
  assert.ok(new Date(changed[0].updated_at).getFullYear() >= 2026, 'nor the time');
  // The device says which version it read: when the row moved on, the update finds nothing.
  const stale = await A.query("update public.workspace_memory_records set payload = $1::jsonb where record_key = 'note:n2' and version = $2 returning 1", [JSON.stringify({ text: 'c' }), Number(first.version)]);
  assert.equal(stale.length, 0);
});

test('a person never deletes a row (it is marked), the server may do everything, and the keys and the size are checked', async () => {
  await insert(A, ada, 'note:n3');
  assert.match((await A.error("delete from public.workspace_memory_records where record_key = 'note:n3'"))?.message || 'it worked', /permission denied/);
  const marked = await A.query("update public.workspace_memory_records set deleted_at = now() where record_key = 'note:n3' returning deleted_at");
  assert.ok(marked[0].deleted_at);
  await insert(database.service, ada, 'note:from-server', { text: 'saved for a reply' });
  assert.equal((await A.query("select count(*)::int as n from public.workspace_memory_records where record_key = 'note:from-server'"))[0].n, 1, 'what the server saved is read by the person');
  await database.service.query("delete from public.workspace_memory_records where record_key = 'note:from-server'");
  for (const key of ['n1', 'note:', 'note:a b', 'other:x', `note:${'x'.repeat(300)}`]) {
    assert.match((await insert(A, ada, key).then(() => null, (error) => error))?.message || 'it worked', /violates check constraint/, key);
  }
  for (const key of ['cursor:conv-1', 'event:e1', 'meta:settings']) await insert(A, ada, key);
  assert.match((await insert(A, ada, 'note:big', { text: 'x'.repeat(21000) }).then(() => null, (error) => error))?.message || 'it worked', /violates check constraint/);
  assert.match((await A.error("insert into public.workspace_memory_records (user_id, record_key, payload) values ($1, 'note:array', '[]')", [ada]))?.message || 'it worked', /violates check constraint/);
});

test('the account being deleted takes its rows with it, and the table is in the realtime publication', async () => {
  const carol = await database.createUser('carol@example.test');
  await insert(database.service, carol, 'note:c1');
  await database.db.query('delete from auth.users where id = $1', [carol]);
  assert.equal((await database.service.query('select count(*)::int as n from public.workspace_memory_records where user_id = $1', [carol]))[0].n, 0);
  const published = await database.db.query("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workspace_memory_records'");
  assert.equal(published.rows.length, 1);
});
