import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { callWith, createDatabase } from '../helpers/database/supabase-database.js';

// Sharing a conversation (supabase/migrations/20261031040000_add_conversation_shares.sql) with the real SQL: nobody touches the tables, whoever has the code reads an active share
// and only that, the person lists and takes away only their own, a conversation that goes away empties its shares, and the limit and the codes are checked.

let database;
let ada;
let bob;
let A;
let B;
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const code = () => Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
  A = database.asUser(ada);
  B = database.asUser(bob);
}, { timeout: 120_000 });
after(() => database?.close());

async function conversationOf(client, { texts = ['hello', 'hi there'] } = {}) {
  const conversationId = id();
  await callWith(client, 'upsert_workspace_conversations', [{ id: conversationId, title: 'Strawberry cake', model: 'm', provider: 'p', created_at: now() }]);
  await callWith(client, 'upsert_workspace_messages', texts.map((text, index) => ({ id: id(), conversation_id: conversationId, role: index % 2 ? 'model' : 'user', parts: [{ text }], sequence: index, created_at: now() })));
  return conversationId;
}

async function share(userId, conversationId, { mode = 'view', showName = false, snapshot = { v: 1, messages: [{ role: 'user', parts: [{ text: 'hello' }] }] }, limit = 30, activate = true } = {}) {
  const shareId = id();
  const shareCode = code();
  await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [shareId, userId, conversationId, shareCode, mode, showName, 'Ada', 'Strawberry cake', limit]);
  if (activate) await database.service.query('select public.server_finish_conversation_share($1, $2, $3, $4::jsonb, $5)', [shareId, userId, 'Strawberry cake', JSON.stringify(snapshot), JSON.stringify(snapshot).length]);
  return { shareId, shareCode };
}

const publicRead = async (client, shareCode) => (await client.query('select public.get_shared_conversation($1) as shared', [shareCode]))[0].shared;

test('nobody reads or writes the tables directly, not even the owner; only the service role does', async () => {
  for (const table of ['conversation_shares', 'share_reports']) {
    assert.match((await A.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `${table}: a signed-in person`);
    assert.match((await database.anon.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `${table}: signed out`);
  }
  const conversationId = await conversationOf(A);
  const { shareCode } = await share(ada, conversationId);
  assert.match((await A.error("update public.conversation_shares set mode = 'continue'"))?.message || 'it worked', /permission denied/);
  assert.equal((await database.service.query('select count(*)::int as n from public.conversation_shares where code = $1', [shareCode]))[0].n, 1);
});

test('the server reads a conversation and its finished messages for the person it is asked for, and says how many shares the person has', async () => {
  const conversationId = await conversationOf(A, { texts: ['one', 'two', 'three'] });
  const read = (await database.service.query('select public.server_read_conversation_for_share($1, $2) as r', [ada, conversationId]))[0].r;
  assert.equal(read.conversation.title, 'Strawberry cake');
  assert.deepEqual(read.messages.map((message) => message.parts[0].text), ['one', 'two', 'three']);
  assert.equal(typeof read.active_shares, 'number');
  assert.equal((await database.service.query('select public.server_read_conversation_for_share($1, $2) as r', [bob, conversationId]))[0].r, null, 'a conversation of someone else is not given');
  assert.match((await A.error('select public.server_read_conversation_for_share($1, $2)', [ada, conversationId]))?.message || 'it worked', /permission denied/, 'a person cannot ask for it');
});

test('a share is read by whoever has the code only once it is active, and the name only when the owner chose to show it', async () => {
  const conversationId = await conversationOf(A);
  const building = await share(ada, conversationId, { activate: false });
  assert.equal(await publicRead(database.anon, building.shareCode), null, 'being built, it shows nothing');
  const hidden = await share(ada, conversationId, { showName: false });
  const named = await share(ada, conversationId, { showName: true, mode: 'continue' });
  const readHidden = await publicRead(database.anon, hidden.shareCode);
  assert.equal(readHidden.title, 'Strawberry cake');
  assert.equal(readHidden.mode, 'view');
  assert.equal(readHidden.ownerName, null);
  assert.equal(readHidden.snapshot.messages[0].parts[0].text, 'hello');
  const readNamed = await publicRead(database.anon, named.shareCode);
  assert.deepEqual([readNamed.mode, readNamed.ownerName], ['continue', 'Ada']);
  assert.equal(await publicRead(database.anon, 'not-a-code'), null);
  assert.equal(await publicRead(B, hidden.shareCode) !== null, true, 'a signed-in person reads it too');
});

test('the person has at most the limit of shares, a code must be long and plain, and a share that never finished is dropped after a while', async () => {
  const conversationId = await conversationOf(A);
  await share(bob, await conversationOf(B), { limit: 2 });
  await share(bob, await conversationOf(B), { limit: 2 });
  const third = await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id(), bob, conversationId, code(), 'view', false, '', 't', 2]).then(() => null, (error) => error);
  assert.match(third?.message || 'it worked', /share_limit/);
  for (const bad of ['short', `${code()}-${code()}`, `${code()}${code()}${code()}`]) {
    const refused = await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id(), ada, conversationId, bad, 'view', false, '', 't', 30]).then(() => null, (error) => error);
    assert.match(refused?.message || 'it worked', /violates check constraint/, bad);
  }
  const stale = await share(ada, conversationId, { activate: false });
  await database.service.query("update public.conversation_shares set created_at = now() - interval '2 hours' where id = $1", [stale.shareId]);
  assert.ok(Number((await database.service.query('select public.server_drop_stale_building_shares() as n'))[0].n) >= 1);
  assert.equal((await database.service.query('select count(*)::int as n from public.conversation_shares where id = $1', [stale.shareId]))[0].n, 0);
});

test('the server reads one share of a person and drops one it could not finish', async () => {
  const conversationId = await conversationOf(A);
  const { shareId } = await share(ada, conversationId, { activate: false });
  const row = (await database.service.query('select public.server_get_conversation_share($1, $2) as s', [ada, shareId]))[0].s;
  assert.deepEqual([row.status, row.mode, row.conversation_id], ['building', 'view', conversationId]);
  assert.equal((await database.service.query('select public.server_get_conversation_share($1, $2) as s', [bob, shareId]))[0].s, null, 'only the owner\'s');
  assert.equal((await database.service.query('select public.server_drop_conversation_share($1, $2) as ok', [bob, shareId]))[0].ok, false);
  assert.equal((await database.service.query('select public.server_drop_conversation_share($1, $2) as ok', [ada, shareId]))[0].ok, true);
});

test('a person lists only their own shares (without the snapshot) and takes away only their own', async () => {
  const conversationId = await conversationOf(A);
  const mine = await share(ada, conversationId);
  const list = await A.query('select * from public.list_my_conversation_shares()');
  assert.ok(list.some((row) => row.code === mine.shareCode && row.status === 'active' && row.mode === 'view'));
  assert.ok(list.every((row) => !('snapshot' in row)), 'the snapshot is not in the list');
  assert.equal((await B.query('select * from public.list_my_conversation_shares()')).filter((row) => row.code === mine.shareCode).length, 0, 'Bob does not see Ada\'s');
  assert.equal((await B.query('select public.revoke_conversation_share($1) as ok', [mine.shareId]))[0].ok, false, 'Bob cannot take Ada\'s away');
  assert.notEqual(await publicRead(database.anon, mine.shareCode), null);
  assert.equal((await A.query('select public.revoke_conversation_share($1) as ok', [mine.shareId]))[0].ok, true);
  assert.equal(await publicRead(database.anon, mine.shareCode), null, 'the link shows nothing at once');
  assert.match((await database.anon.error('select public.revoke_conversation_share($1)', [mine.shareId]))?.message || 'it worked', /permission denied/);
});

test('a conversation put in the trash or deleted for good empties its shares at once, and the record stays to be removed', async () => {
  const trashed = await conversationOf(A);
  const kept = await conversationOf(A);
  const a = await share(ada, trashed);
  const b = await share(ada, trashed, { mode: 'continue' });
  const c = await share(ada, kept);
  await callWith(A, 'upsert_workspace_conversations', [{ id: trashed, title: 'Strawberry cake', model: 'm', provider: 'p', created_at: now(), deleted_at: now() }]);
  for (const one of [a, b]) assert.equal(await publicRead(database.anon, one.shareCode), null, 'a link of a deleted conversation shows nothing');
  assert.notEqual(await publicRead(database.anon, c.shareCode), null, 'the share of another conversation is not touched');
  const rows = await A.query('select * from public.list_my_conversation_shares()');
  const gone = rows.filter((row) => row.status === 'conversation_deleted');
  assert.ok(gone.length >= 2 && gone.every((row) => row.title === 'Strawberry cake'), 'the record is there, with the name it had');
  assert.equal((await database.service.query('select snapshot_bytes from public.conversation_shares where id = $1', [a.shareId]))[0].snapshot_bytes, 0);
  assert.equal((await A.query('select public.revoke_conversation_share($1) as ok', [a.shareId]))[0].ok, true, 'the record is removed by the same function');
  await database.service.query('delete from public.workspace_conversations where id = $1', [kept]);
  assert.equal(await publicRead(database.anon, c.shareCode), null, 'deleted for good too');
});

test('a reader reports a share that is active, once the reason is short enough, and only the service role reads the reports', async () => {
  const { shareCode } = await share(ada, await conversationOf(A));
  assert.equal((await database.anon.query('select public.report_shared_conversation($1, $2) as ok', [shareCode, 'x'.repeat(900)]))[0].ok, true);
  assert.equal((await database.anon.query('select public.report_shared_conversation($1, $2) as ok', ['no-such-code', 'x']))[0].ok, false);
  const reports = await database.service.query('select reason from public.share_reports where code = $1', [shareCode]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reason.length, 500);
});

test('the files of the public bucket that no share points to are the orphans', async () => {
  const { shareId } = await share(ada, await conversationOf(A));
  const hash = 'a'.repeat(64);
  const add = (name) => database.service.query("insert into storage.objects (bucket_id, name, metadata) values ('shared-assets', $1, '{\"size\": 10}'::jsonb)", [name]);
  await add(`${shareId}/${hash}`);
  const strangerFolder = id();
  await add(`${strangerFolder}/${hash}`);
  const orphans = (await database.service.query('select * from public.orphan_shared_assets(100)')).map((row) => row.name);
  assert.ok(orphans.includes(`${strangerFolder}/${hash}`));
  assert.equal(orphans.includes(`${shareId}/${hash}`), false);
  assert.match((await A.error('select * from public.orphan_shared_assets(10)'))?.message || 'it worked', /permission denied/);
  await database.service.query('select public.server_finish_conversation_share($1, $2, $3, $4::jsonb, 0)', [shareId, ada, 't', '{}']);
  await A.query('select public.revoke_conversation_share($1)', [shareId]);
  assert.ok((await database.service.query('select * from public.orphan_shared_assets(100)')).some((row) => row.name === `${shareId}/${hash}`), 'a share taken away leaves its files as orphans');
});
