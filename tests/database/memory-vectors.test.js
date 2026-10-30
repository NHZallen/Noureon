import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { createDatabase } from '../helpers/database/supabase-database.js';

// The table of the vectors of the past conversations (supabase/migrations/20261031010000_add_workspace_memory_vectors.sql), with the real SQL except pgvector itself (PGlite does not carry
// it, see the helper): a person reads, adds, changes and deletes only their own rows, the server does all, a row has a vector or says it failed, and only the server may run the search.

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

const insert = (client, userId, pieceId, extra = '[0.1,0.2]') => client.query('insert into public.workspace_memory_vectors (user_id, piece_id, model, hash, embedding) values ($1, $2, $3, $4, $5)', [userId, pieceId, 'gemini-embedding-2:768:v1', 'h1', extra]);

test('a person reads, adds, changes and deletes their own vectors, and nobody else\'s; signed out reads nothing', async () => {
  await insert(A, ada, 'c1:0');
  assert.equal((await A.query('select count(*)::int as n from public.workspace_memory_vectors'))[0].n, 1);
  assert.equal((await B.query('select count(*)::int as n from public.workspace_memory_vectors'))[0].n, 0, 'Bob reads none of Ada\'s');
  assert.match((await database.anon.error('select count(*) from public.workspace_memory_vectors'))?.message || 'it worked', /permission denied/);
  assert.match((await B.error('insert into public.workspace_memory_vectors (user_id, piece_id, model, hash, embedding) values ($1, $2, $3, $4, $5)', [ada, 'stolen', 'm', 'h', '[1]']))?.message || 'it worked', /row-level security/);
  assert.equal((await B.query("update public.workspace_memory_vectors set hash = 'x' where user_id = $1 returning 1", [ada])).length, 0);
  assert.equal((await B.query('delete from public.workspace_memory_vectors where user_id = $1 returning 1', [ada])).length, 0, 'Bob deletes none of Ada\'s');
  assert.equal((await A.query("update public.workspace_memory_vectors set hash = 'h2' where piece_id = 'c1:0' returning 1")).length, 1);
  assert.equal((await A.query("delete from public.workspace_memory_vectors where piece_id = 'c1:0' returning 1")).length, 1, 'the person can take their vectors away');
});

test('a row has a vector or says that it failed; the server may do everything; the account being deleted takes its rows with it', async () => {
  assert.match((await A.query('insert into public.workspace_memory_vectors (user_id, piece_id, model, hash) values ($1, $2, $3, $4)', [ada, 'nothing', 'm', 'h']).then(() => null, (error) => error))?.message || 'it worked', /violates check constraint/);
  await A.query('insert into public.workspace_memory_vectors (user_id, piece_id, model, hash, failed) values ($1, $2, $3, $4, true)', [ada, 'too-long-video', 'm', 'h']);
  await insert(database.service, ada, 'from-server');
  assert.equal((await A.query("select count(*)::int as n from public.workspace_memory_vectors where piece_id = 'from-server'"))[0].n, 1);
  await database.service.query("delete from public.workspace_memory_vectors where piece_id = 'from-server'");
  assert.equal((await database.service.query('select count(*)::int as n from public.workspace_memory_vectors where user_id = $1', [ada]))[0].n >= 1, true);
  await database.db.query('delete from auth.users where id = $1', [ada]);
  assert.equal((await database.service.query('select count(*)::int as n from public.workspace_memory_vectors where user_id = $1', [ada]))[0].n, 0);
});

test('only the server may run the search over the vectors of a person', async () => {
  for (const client of [A, B, database.anon]) {
    assert.match((await client.error("select * from public.match_workspace_memory_vectors($1, 'm', '[1]', 5, 0.5)", [bob]))?.message || 'it worked', /permission denied/);
  }
});
