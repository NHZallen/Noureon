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

// ---------- reports (supabase/migrations/20261031050000_add_share_report_review.sql)

const reportFrom = (address, shareCode, reason = '') => database.anonFrom(address).query('select public.report_shared_conversation($1, $2) as ok', [shareCode, reason]);
const statusOf = async (shareId) => (await database.service.query('select status from public.conversation_shares where id = $1', [shareId]))[0]?.status;

test('a share with reports from three different readers is paused at once; one reader cannot do it alone', async () => {
  const conversationId = await conversationOf(A);
  const { shareId, shareCode } = await share(ada, conversationId);
  for (let index = 0; index < 5; index += 1) await reportFrom('203.0.113.7', shareCode, 'spam');
  assert.equal(await statusOf(shareId), 'active', 'five reports of one reader count once');
  assert.ok(await publicRead(database.anon, shareCode));
  await reportFrom('203.0.113.8', shareCode);
  assert.equal(await statusOf(shareId), 'active');
  await reportFrom('203.0.113.9', shareCode, 'illegal');
  assert.equal(await statusOf(shareId), 'suspended');
  assert.deepEqual(await publicRead(database.anon, shareCode), { status: 'suspended' }, 'the link stops working and says only that it is under review');
  assert.equal((await reportFrom('198.51.100.1', shareCode))[0].ok, false, 'a paused share takes no more reports');
  const mine = await A.query('select status from public.list_my_conversation_shares() where id = $1', [shareId]);
  assert.equal(mine[0].status, 'suspended', 'the owner still sees it, paused');
});

test('a paused share keeps its snapshot, goes with its conversation, and the owner can still take it away', async () => {
  const conversationId = await conversationOf(A);
  const { shareId, shareCode } = await share(ada, conversationId);
  for (const address of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) await reportFrom(address, shareCode);
  assert.ok((await database.service.query('select snapshot_bytes from public.conversation_shares where id = $1', [shareId]))[0].snapshot_bytes >= 0);
  assert.notDeepEqual((await database.service.query('select snapshot from public.conversation_shares where id = $1', [shareId]))[0].snapshot, {});
  await database.service.query("update public.workspace_conversations set deleted_at = now() where id = $1", [conversationId]);
  assert.equal(await statusOf(shareId), 'conversation_deleted');
  const other = await share(ada, await conversationOf(A));
  for (const address of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) await reportFrom(address, other.shareCode);
  assert.equal((await A.query('select public.revoke_conversation_share($1) as ok', [other.shareId]))[0].ok, true);
});

test('the server takes each report once for the mail, with how many readers and what they said', async () => {
  await database.service.query('delete from public.share_reports');
  const { shareId, shareCode } = await share(ada, await conversationOf(A));
  await reportFrom('9.9.9.9', shareCode, 'it is rude');
  await reportFrom('9.9.9.10', shareCode, '');
  const taken = await database.service.query('select * from public.server_take_share_reports_to_mail(50)');
  assert.equal(taken.length, 1);
  assert.equal(taken[0].share_id, shareId);
  assert.equal(taken[0].new_reports, 2);
  assert.equal(taken[0].readers, 2);
  assert.deepEqual(taken[0].reasons, ['it is rude']);
  assert.equal(taken[0].code, shareCode);
  assert.equal((await database.service.query('select * from public.server_take_share_reports_to_mail(50)')).length, 0, 'taken once');
  assert.match((await A.error('select * from public.server_take_share_reports_to_mail(50)'))?.message || 'it worked', /permission denied/);
});

test('only an account the owner of the service named may review: list, pause, restore, dismiss, delete and read a paused share', async () => {
  const boss = await database.createUser('boss@example.test');
  const BOSS = database.asUser(boss);
  const { shareId, shareCode } = await share(ada, await conversationOf(A));
  for (const address of ['5.5.5.1', '5.5.5.2', '5.5.5.3']) await reportFrom(address, shareCode, 'bad');
  for (const client of [A, B, database.anon]) {
    assert.ok(await client.error('select * from public.admin_list_share_reports()'), 'a person or a visitor is turned away');
  }
  assert.equal((await A.query('select public.is_service_admin() as yes'))[0].yes, false);
  assert.match((await A.error('select public.admin_delete_share($1)', [shareId]))?.message || 'it worked', /Not allowed/);
  await database.service.query('insert into public.service_admins (user_id) values ($1)', [boss]);
  assert.equal((await BOSS.query('select public.is_service_admin() as yes'))[0].yes, true);
  const listed = await BOSS.query('select * from public.admin_list_share_reports() where share_id = $1', [shareId]);
  assert.equal(listed[0].status, 'suspended');
  assert.equal(listed[0].readers, 3);
  assert.equal(listed[0].owner_email, 'ada@example.test');
  assert.deepEqual(listed[0].reasons, ['bad', 'bad', 'bad']);
  assert.equal((await BOSS.query('select public.admin_get_shared_conversation($1) as s', [shareCode]))[0].s.snapshot.v, 1);
  assert.equal((await BOSS.query("select public.admin_set_share_status($1, 'active') as ok", [shareId]))[0].ok, true);
  assert.equal(await statusOf(shareId), 'active');
  assert.ok(await publicRead(database.anon, shareCode), 'works again');
  assert.equal((await database.service.query('select count(*)::int as n from public.share_reports where share_id = $1', [shareId]))[0].n, 0, 'a restored share starts with no reports');
  await reportFrom('6.6.6.1', shareCode, 'x');
  assert.equal((await BOSS.query('select public.admin_dismiss_share_reports($1) as n', [shareId]))[0].n, 1);
  assert.equal((await BOSS.query("select public.admin_set_share_status($1, 'banana') as ok", [shareId]).catch((error) => ({ error })))?.error?.message, 'Unknown status');
  assert.equal((await BOSS.query('select public.admin_delete_share($1) as ok', [shareId]))[0].ok, true);
  assert.equal(await statusOf(shareId), undefined);
});

test('a share the owner of the service takes down says so to whoever opens it, keeps its record for its owner, and loses its snapshot', async () => {
  const boss = await database.createUser('boss2@example.test');
  await database.service.query('insert into public.service_admins (user_id) values ($1)', [boss]);
  const BOSS = database.asUser(boss);
  const { shareId, shareCode } = await share(ada, await conversationOf(A));
  assert.match((await A.error('select public.admin_remove_share($1)', [shareId]))?.message || 'it worked', /Not allowed/);
  assert.equal((await BOSS.query('select public.admin_remove_share($1) as ok', [shareId]))[0].ok, true);
  assert.equal(await statusOf(shareId), 'removed');
  assert.deepEqual(await publicRead(database.anon, shareCode), { status: 'removed' });
  assert.deepEqual((await database.service.query('select snapshot, snapshot_bytes from public.conversation_shares where id = $1', [shareId]))[0], { snapshot: {}, snapshot_bytes: 0 });
  assert.equal((await A.query('select status from public.list_my_conversation_shares() where id = $1', [shareId]))[0].status, 'removed');
  assert.equal((await BOSS.query('select count(*)::int as n from public.admin_list_share_reports() where share_id = $1', [shareId]))[0].n, 1, 'the owner of the service still sees it');
  assert.equal((await BOSS.query('select public.admin_remove_share($1) as ok', [shareId]))[0].ok, false, 'once');
  assert.equal((await reportFrom('7.7.7.7', shareCode))[0].ok, false, 'no more reports');
  assert.equal((await A.query('select public.revoke_conversation_share($1) as ok', [shareId]))[0].ok, true, 'the owner can remove the record');
});

test('a conversation whose share was taken down cannot be shared again, even when the owner removes the record; the removal is taken once for the mail', async () => {
  const boss = await database.createUser('boss3@example.test');
  await database.service.query('insert into public.service_admins (user_id) values ($1)', [boss]);
  const BOSS = database.asUser(boss);
  const conversationId = await conversationOf(A);
  const { shareId } = await share(ada, conversationId);
  await BOSS.query('select public.admin_remove_share($1)', [shareId]);
  const taken = await database.service.query('select * from public.server_take_removed_shares_to_mail(20) where share_id = $1', [shareId]);
  assert.equal(taken.length, 1);
  assert.equal(taken[0].owner_email, 'ada@example.test');
  assert.equal((await database.service.query('select * from public.server_take_removed_shares_to_mail(20) where share_id = $1', [shareId])).length, 0, 'taken once');
  await database.service.query('select public.server_requeue_removed_shares($1::uuid[])', [[shareId]]);
  assert.equal((await database.service.query('select * from public.server_take_removed_shares_to_mail(20) where share_id = $1', [shareId])).length, 1, 'a mail that failed goes back');
  const again = await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id(), ada, conversationId, code(), 'view', false, 'Ada', 'x', 30]).catch((error) => error);
  assert.match(String(again?.message || 'it worked'), /share_removed/);
  await A.query('select public.revoke_conversation_share($1)', [shareId]);
  const stillBlocked = await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id(), ada, conversationId, code(), 'view', false, 'Ada', 'x', 30]).catch((error) => error);
  assert.match(String(stillBlocked?.message || 'it worked'), /share_removed/, 'removing the record does not lift it');
  const other = await conversationOf(A);
  await share(ada, other);
});
