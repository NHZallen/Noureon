import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { callWith, createDatabase } from '../helpers/database/supabase-database.js';

// The SQL of supabase/migrations/ run for real (PGlite, with the roles and the auth and storage parts of Supabase stood in for): who can read what, who
// can write, what the functions refuse, and what the server's own functions do. A person reads their own rows; writes go through functions that
// check the person; the server's functions are for the service role only.

let database;
let ada;
let bob;
let A;
let B;
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const conversationRow = (overrides = {}) => ({ id: id(), title: 'A chat', model: 'm', provider: 'p', created_at: now(), ...overrides });
const messageRow = (conversationId, overrides = {}) => ({ id: id(), conversation_id: conversationId, role: 'user', parts: [{ text: 'hi' }], sequence: 0, created_at: now(), ...overrides });
const count = async (client, table) => Number((await client.query(`select count(*)::int as n from public.${table}`))[0].n);

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
  A = database.asUser(ada);
  B = database.asUser(bob);
}, { timeout: 120_000 });
after(() => database?.close());

// ---------- what the tables and functions are, as a whole

test('every table of the public schema has row level security on', async () => {
  const rows = (await database.db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`)).rows;
  assert.deepEqual(rows.map((row) => row.relname), []);
});

test('no rule lets anyone in but the signed-in person, and every rule is tied to the person\'s own id', async () => {
  const policies = (await database.db.query(`select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public'`)).rows;
  assert.ok(policies.length > 10);
  for (const policy of policies) {
    assert.deepEqual([...policy.roles], ['authenticated'], `${policy.tablename}/${policy.policyname}`);
    assert.match(`${policy.qual || ''} ${policy.with_check || ''}`, /auth\.uid\(\)/, `${policy.tablename}/${policy.policyname} is tied to the person`);
  }
  const storage = (await database.db.query(`select policyname, roles, qual, with_check from pg_policies where schemaname = 'storage'`)).rows;
  for (const policy of storage) {
    assert.deepEqual([...policy.roles], ['authenticated'], policy.policyname);
    assert.match(`${policy.qual || ''} ${policy.with_check || ''}`, /auth\.uid\(\)/, policy.policyname);
  }
});

test('the functions the page may call are exactly the ones named here, and nothing that acts for the server can be called by a person', async () => {
  const rows = (await database.db.query(`select p.proname, p.prosecdef, p.proconfig, p.prorettype::regtype::text as returns, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('service_role', p.oid, 'execute') as service from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  const securityDefiners = rows.filter((row) => row.prosecdef);
  for (const row of securityDefiners) {
    assert.ok((row.proconfig || []).some((entry) => /^search_path=/.test(entry)), `${row.proname} fixes its search_path`);
    assert.equal(row.anon, false, `${row.proname} is not for anyone signed out`);
  }
  const forPeople = securityDefiners.filter((row) => row.authenticated).map((row) => row.proname).sort();
  assert.deepEqual(forPeople, ['fetch_workspace_delta', 'permanently_delete_workspace_conversations', 'permanently_delete_workspace_folder', 'upsert_workspace_conversations', 'upsert_workspace_folders', 'upsert_workspace_memory_summary_records', 'upsert_workspace_messages']);
  // (The functions of triggers cannot be called by hand, and workspace_safe_timestamptz is the helper of the functions above.)
  const forTheServer = securityDefiners.filter((row) => row.service && !row.authenticated && row.returns !== 'trigger').map((row) => row.proname).sort();
  assert.deepEqual(forTheServer, ['orphan_skill_bundles', 'orphan_user_assets', 'orphan_user_derived', 'server_claim_stale_runs', 'server_start_run', 'server_upsert_workspace_message', 'user_asset_usage', 'workspace_safe_timestamptz']);
});

// ---------- one person never sees or changes another's

test('a person reads their own workspace and nobody else\'s; signed out reads nothing', async () => {
  const folder = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: folder, name: 'Work', updated_at: now() }]);
  const conversation = conversationRow({ folder_id: folder });
  await callWith(A, 'upsert_workspace_conversations', [conversation]);
  await callWith(A, 'upsert_workspace_messages', [messageRow(conversation.id)]);

  for (const table of ['workspace_folders', 'workspace_conversations', 'workspace_messages']) {
    assert.equal(await count(A, table), 1, `Ada reads her ${table}`);
    assert.equal(await count(B, table), 0, `Bob reads none of Ada's ${table}`);
    assert.match((await database.anon.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `signed out reads no ${table}`);
  }
});

test('nobody writes the workspace tables directly: only the functions do', async () => {
  const conversation = conversationRow();
  await callWith(A, 'upsert_workspace_conversations', [conversation]);
  const cases = [
    `insert into public.workspace_conversations (id, user_id, title, model, provider, created_at) values (gen_random_uuid(), '${ada}', 'x', 'm', 'p', now())`,
    `update public.workspace_conversations set title = 'changed' where id = '${conversation.id}'`,
    `delete from public.workspace_conversations where id = '${conversation.id}'`,
    `insert into public.workspace_messages (id, user_id, conversation_id, role, sequence, created_at) values (gen_random_uuid(), '${ada}', '${conversation.id}', 'user', 0, now())`,
    `delete from public.workspace_tombstones`
  ];
  for (const client of [A, B, database.anon]) {
    for (const sql of cases) assert.match((await client.error(sql))?.message || 'it worked', /permission denied/, `${client.role}: ${sql.slice(0, 60)}`);
  }
  assert.equal((await A.query(`select title from public.workspace_conversations where id = '${conversation.id}'`))[0].title, 'A chat');
});

test('the functions work for the signed-in person only, and a person cannot reach into another\'s conversation or message', async () => {
  const conversation = conversationRow();
  const message = messageRow(conversation.id);
  await callWith(A, 'upsert_workspace_conversations', [conversation]);
  await callWith(A, 'upsert_workspace_messages', [message]);

  assert.match((await database.anon.error('select public.upsert_workspace_conversations($1::jsonb)', ['[]']))?.message || '', /permission denied/);
  assert.match((await database.anon.error('select public.fetch_workspace_delta(0, 10)'))?.message || '', /permission denied/);

  assert.match((await callWith(B, 'upsert_workspace_messages', [messageRow(conversation.id)]).catch((error) => error)).message, /conversation not found/i, 'a message into the conversation of someone else');
  assert.match((await callWith(B, 'upsert_workspace_messages', [{ ...message, conversation_id: conversationRow().id }]).catch((error) => error)).message, /not found|another user/i, 'a message with the id of someone else\'s');
  assert.match((await callWith(B, 'upsert_workspace_conversations', [{ ...conversation, title: 'taken over' }]).catch((error) => error)).message, /another user|belongs/i, 'a conversation with the id of someone else\'s');
  assert.equal((await A.query(`select title from public.workspace_conversations where id = '${conversation.id}'`))[0].title, conversation.title);
});

test('the changes since a mark are the person\'s own only, in order, and ask nothing of anyone signed out', async () => {
  const delta = await A.query('select public.fetch_workspace_delta(0, 1000) as delta');
  const text = JSON.stringify(delta[0].delta);
  assert.ok(text.includes('A chat'));
  const bobs = JSON.stringify((await B.query('select public.fetch_workspace_delta(0, 1000) as delta'))[0].delta);
  assert.equal(bobs.includes('A chat'), false);
  assert.equal(bobs.includes(ada), false);
});

test('deleting is the person\'s own: another person\'s id is ignored, a deleted conversation cannot be written to again, and a tombstone is left', async () => {
  const conversation = conversationRow();
  await callWith(A, 'upsert_workspace_conversations', [conversation]);
  assert.match((await B.error('select public.permanently_delete_workspace_conversations($1::uuid[])', [[conversation.id]]))?.message || 'it worked', /belongs to another user/);
  assert.equal(Number((await A.query(`select count(*)::int as n from public.workspace_conversations where id = '${conversation.id}'`))[0].n), 1, 'Bob could not delete it');
  assert.equal(await count(B, 'workspace_tombstones'), 0, 'and left no tombstone of his own either, for something that is not his');

  await A.query('select public.permanently_delete_workspace_conversations($1::uuid[])', [[conversation.id]]);
  assert.equal(Number((await A.query(`select count(*)::int as n from public.workspace_conversations where id = '${conversation.id}'`))[0].n), 0);
  assert.equal(Number((await A.query(`select count(*)::int as n from public.workspace_tombstones where entity_id = '${conversation.id}'`))[0].n), 1);
  assert.match((await callWith(A, 'upsert_workspace_messages', [messageRow(conversation.id)]).catch((error) => error)).message, /deleted/i);
  assert.match((await callWith(A, 'upsert_workspace_conversations', [conversation]).catch((error) => error)).message, /deleted/i, 'it cannot come back');
});

test('the tables only the server reads (credentials, connections, clients) answer nobody signed in, and a person cannot add to them', async () => {
  await database.db.exec(`insert into public.user_credentials (user_id, name, envelope, key_version) values ('${ada}', 'COOKIE', 'sealed', 1)`);
  for (const table of ['user_credentials', 'user_mcp_connections', 'mcp_oauth_clients']) {
    assert.equal(await count(A, table).catch(() => 0), 0, `${table} is not readable by a person`);
    assert.equal(await count(database.anon, table).catch(() => 0), 0);
  }
  assert.ok((await database.service.query('select count(*)::int as n from public.user_credentials'))[0].n >= 1, 'the server reads it');
  assert.match((await A.error(`insert into public.user_credentials (user_id, name, envelope, key_version) values ('${ada}', 'OTHER', 'y', 1)`))?.message || 'it worked', /permission denied|row-level security/);
});

test('a person reads their own server runs and not another\'s', async () => {
  const conversation = conversationRow();
  await callWith(A, 'upsert_workspace_conversations', [conversation]);
  const run = (await database.service.query('select public.server_start_run($1, $2, $3, $4::jsonb, $5, $6::smallint, $7, $8) as id', [ada, conversation.id, id(), '{}', 'sealed', 1, new Date(Date.now() + 3600_000).toISOString(), 5]))[0].id;
  assert.ok(run);
  assert.equal(await count(A, 'server_runs'), 1);
  assert.equal(await count(B, 'server_runs'), 0);
  assert.match((await A.error('select public.server_start_run($1, $2, $3, $4::jsonb, $5, $6::smallint, $7, $8)', [ada, conversation.id, id(), '{}', 'x', 1, now(), 5]))?.message || '', /permission denied/, 'starting a run is for the server');
});

test('the tables a person writes directly are theirs alone: they add and change their own rows and cannot see, change, remove or add for another person', async () => {
  const seeds = {
    user_workspaces: (user) => `insert into public.user_workspaces (user_id) values ('${user}')`,
    user_vault_recovery: (user) => `insert into public.user_vault_recovery (user_id, recovery_payload) values ('${user}', '{}')`,
    sync_profiles: (user) => `insert into public.sync_profiles (user_id) values ('${user}')`,
    workspace_memories: (user) => `insert into public.workspace_memories (id, user_id, content) values (gen_random_uuid(), '${user}', 'likes tea')`,
    user_skills: (user) => `insert into public.user_skills (user_id, name, description, body) values ('${user}', 'skill', 'd', 'b')`
  };
  for (const [table, seed] of Object.entries(seeds)) {
    assert.equal(await A.error(seed(ada)), null, `${table}: a person adds their own`);
    assert.match((await A.error(seed(bob)))?.message || 'it worked', /row-level security/, `${table}: not for another person`);
    assert.equal(await count(B, table), 0, `${table}: another person sees none of it`);
    const changed = await B.query(`with u as (update public.${table} set user_id = user_id where user_id = '${ada}' returning 1) select count(*)::int as n from u`);
    assert.equal(changed[0].n, 0, `${table}: another person changes none of it`);
    const removed = await B.query(`with d as (delete from public.${table} where user_id = '${ada}' returning 1) select count(*)::int as n from d`);
    assert.equal(removed[0].n, 0, `${table}: another person removes none of it`);
    assert.equal(await count(A, table), 1, `${table}: and it is all still there`);
    assert.match((await database.anon.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `${table}: signed out reads nothing`);
  }
  // A person cannot give a row they own to someone else.
  assert.match((await A.error(`update public.workspace_memories set user_id = '${bob}' where user_id = '${ada}'`))?.message || 'it worked', /row-level security/);
});

// ---------- the server's functions

test('starting a run: the conversation must be the person\'s and alive, and the number of runs a person has at once is held', async () => {
  const carol = await database.createUser();
  const C = database.asUser(carol);
  const conversation = conversationRow();
  await callWith(C, 'upsert_workspace_conversations', [conversation]);
  const start = (user, conversationId, max = 2) => database.service.query('select public.server_start_run($1, $2, $3, $4::jsonb, $5, $6::smallint, $7, $8) as id', [user, conversationId, id(), '{}', 'sealed', 1, new Date(Date.now() + 3600_000).toISOString(), max]);
  await assert.rejects(start(bob, conversation.id), /conversation_not_found/, 'not his conversation');
  await start(carol, conversation.id);
  await start(carol, conversation.id);
  await assert.rejects(start(carol, conversation.id), /too_many_runs/);
  await C.query('select public.permanently_delete_workspace_conversations($1::uuid[])', [[conversation.id]]);
  await assert.rejects(start(carol, conversation.id, 10), /conversation_not_found/, 'a deleted conversation');
});

test('the server writes a message: the next place counts only the messages that are still there, a message that was cut away is moved out of the way, and an answer that is done is not turned back into a draft', async () => {
  const dave = await database.createUser();
  const D = database.asUser(dave);
  const conversation = conversationRow();
  await callWith(D, 'upsert_workspace_conversations', [conversation]);
  const first = messageRow(conversation.id, { sequence: 0 });
  const second = messageRow(conversation.id, { sequence: 1, role: 'model' });
  await callWith(D, 'upsert_workspace_messages', [first, second]);
  // The person cuts the second away: it stays as a deleted row at its place.
  await callWith(D, 'upsert_workspace_messages', [{ ...second, deleted_at: now() }]);

  const serverMessage = id();
  await database.service.query('select public.server_upsert_workspace_message($1, $2::jsonb)', [dave, JSON.stringify({ id: serverMessage, conversation_id: conversation.id, role: 'model', parts: [{ text: 'check' }], status: 'streaming', created_at: now() })]);
  const placed = (await database.service.query('select sequence, status from public.workspace_messages where id = $1', [serverMessage]))[0];
  assert.equal(Number(placed.sequence), 1, 'the place of the first message that is still there + 1, not after the cut-away one');
  const places = (await database.service.query('select id, sequence, deleted_at is not null as deleted from public.workspace_messages where conversation_id = $1 order by deleted desc', [conversation.id]));
  const movedAway = places.find((row) => row.id === second.id);
  assert.ok(Number(movedAway.sequence) < 0, 'the cut-away message was moved out of the place');
  assert.equal(movedAway.deleted, true);

  await database.service.query('select public.server_upsert_workspace_message($1, $2::jsonb)', [dave, JSON.stringify({ id: serverMessage, conversation_id: conversation.id, role: 'model', parts: [{ text: 'done' }], status: 'complete' })]);
  await database.service.query('select public.server_upsert_workspace_message($1, $2::jsonb)', [dave, JSON.stringify({ id: serverMessage, conversation_id: conversation.id, role: 'model', parts: [{ text: 'late draft' }], status: 'streaming' })]);
  const final = (await database.service.query('select parts, status from public.workspace_messages where id = $1', [serverMessage]))[0];
  assert.equal(final.status, 'complete', 'a late draft does not undo the finished answer');
  assert.equal(final.parts[0].text, 'done');
});

test('the server never writes into another person\'s conversation, a deleted conversation, or a message of someone else\'s; and it is not for people to call', async () => {
  const erin = await database.createUser();
  const E = database.asUser(erin);
  const conversation = conversationRow();
  await callWith(E, 'upsert_workspace_conversations', [conversation]);
  const write = (user, row) => database.service.query('select public.server_upsert_workspace_message($1, $2::jsonb)', [user, JSON.stringify(row)]);
  const mine = { id: id(), conversation_id: conversation.id, role: 'model', parts: [], status: 'complete' };
  await assert.rejects(write(bob, mine), /conversation not found/i);
  await write(erin, mine);
  await assert.rejects(write(bob, { ...mine, conversation_id: id() }), /not found|another user/i);
  await assert.rejects(write(bob, { ...mine }), /conversation not found|another user/i);
  assert.match((await E.error('select public.server_upsert_workspace_message($1, $2::jsonb)', [erin, JSON.stringify(mine)]))?.message || '', /permission denied/);
  assert.match((await database.anon.error('select public.server_upsert_workspace_message($1, $2::jsonb)', [erin, JSON.stringify(mine)]))?.message || '', /permission denied/);
});

// ---------- the files of a person

test('a person\'s files are in a folder named by their id: they read, add and remove their own and nothing of another person\'s', async () => {
  await database.db.exec(`insert into storage.objects (bucket_id, name, owner) values ('user-assets', '${ada}/a.png', '${ada}'), ('user-assets', '${bob}/b.png', '${bob}'), ('user-skill-bundles', '${ada}/skill/bundle.zip', '${ada}')`);
  const names = async (client) => (await client.query(`select name from storage.objects order by name`)).map((row) => row.name);
  assert.deepEqual(await names(A), [`${ada}/a.png`, `${ada}/skill/bundle.zip`].sort());
  assert.deepEqual(await names(B), [`${bob}/b.png`]);
  assert.deepEqual(await names(database.anon), []);

  const insert = (client, bucket, name) => client.error(`insert into storage.objects (bucket_id, name, owner) values ('${bucket}', '${name}', null)`);
  assert.equal(await insert(A, 'user-assets', `${ada}/new.png`), null, 'her own folder');
  assert.match((await insert(A, 'user-assets', `${bob}/planted.png`))?.message || 'it worked', /row-level security/, 'not in his folder');
  assert.match((await insert(A, 'user-assets', `${ada}/../${bob}/planted.png`))?.message || 'it worked', /row-level security/, 'not by climbing out of hers');
  assert.match((await insert(A, 'user-assets', `${ada}//x.png`))?.message || 'it worked', /row-level security/, 'an empty part of a name');
  assert.match((await insert(A, 'some-other-bucket', `${ada}/x.png`))?.message || 'it worked', /row-level security/, 'only the buckets that are hers to use');
  const removed = await A.query(`with d as (delete from storage.objects where name = '${bob}/b.png' returning 1) select count(*)::int as n from d`);
  assert.equal(removed[0].n, 0, 'she cannot remove his');
});
