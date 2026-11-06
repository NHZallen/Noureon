import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { callWith, createDatabase } from '../helpers/database/supabase-database.js';

// Sharing a project (supabase/migrations/20261106010000_add_project_members.sql) with the real SQL: nobody touches the tables, only the owner shares, sharing forces the project memory and ends the
// public links of the conversations, a page that writes the folder back cannot undo it, the links have a role and a generation, a person who was removed does not come back with an old link,
// and a project has at most 100 members.

let database;
let ada;
let bob;
let cy;
let A;
let B;
let C;
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const rpc = (client, name, ...args) => client.query(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(', ')}) as r`, args).then((rows) => rows[0].r);

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  bob = await database.createUser('bob@example.test');
  cy = await database.createUser('cy@example.test');
  await database.db.query("update auth.users set raw_user_meta_data = '{\"full_name\":\"Ada Lovelace\"}'::jsonb where id = $1", [ada]);
  A = database.asUser(ada);
  B = database.asUser(bob);
  C = database.asUser(cy);
}, { timeout: 120_000 });
after(() => database?.close());

async function projectOf(client, { memoryScope = 'default' } = {}) {
  const folderId = id();
  await callWith(client, 'upsert_workspace_folders', [{ id: folderId, name: 'City plan', memory_scope: memoryScope }]);
  return folderId;
}
const sharedProject = async () => { const projectId = await projectOf(A); await rpc(A, 'share_project', projectId); return projectId; };
const folder = async (projectId) => (await database.service.query('select shared_at, memory_scope, invite_link_generation from public.workspace_folders where id = $1', [projectId]))[0];

test('nobody reads or writes the tables directly, not even the owner; only the service role does', async () => {
  for (const table of ['project_members', 'project_invites', 'project_removed_members']) {
    assert.match((await A.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `${table}: a signed-in person`);
    assert.match((await database.anon.error(`select count(*) from public.${table}`))?.message || 'it worked', /permission denied/, `${table}: signed out`);
  }
});

test('only the owner shares a project; sharing forces the memory of the project and cannot be undone by a page that writes the folder back', async () => {
  const projectId = await projectOf(A, { memoryScope: 'default' });
  assert.match((await B.error('select public.share_project($1)', [projectId]))?.message || 'it worked', /project_not_found/);
  assert.match((await database.anon.error('select public.share_project($1)', [projectId]))?.message || 'it worked', /permission denied/);
  const first = await rpc(A, 'share_project', projectId);
  assert.equal(first.memory_scope, 'project');
  const before = await folder(projectId);
  assert.ok(before.shared_at);
  assert.equal(before.memory_scope, 'project');
  // the sync of the owner writes the folder back as it was before (default memory, no sharing time)
  await callWith(A, 'upsert_workspace_folders', [{ id: projectId, name: 'City plan', memory_scope: 'default', shared_at: null, invite_link_generation: 9 }]);
  assert.deepEqual(await folder(projectId), before);
  // sharing again changes nothing
  const again = await rpc(A, 'share_project', projectId);
  assert.equal(String(again.shared_at), String(first.shared_at));
});

test('the preview counts the conversations and the ones with a public link; sharing ends those links', async () => {
  const projectId = await projectOf(A);
  const withLink = id();
  const plain = id();
  await callWith(A, 'upsert_workspace_conversations', [
    { id: withLink, title: 'Linked', model: 'm', provider: 'p', created_at: now(), folder_id: projectId },
    { id: plain, title: 'Plain', model: 'm', provider: 'p', created_at: now(), folder_id: projectId }
  ]);
  const shareId = id();
  await database.service.query('select public.server_create_conversation_share($1, $2, $3, $4, $5, $6, $7, $8, $9)', [shareId, ada, withLink, 'c'.repeat(32), 'view', false, 'Ada', 'Linked', 30]);
  await database.service.query('select public.server_finish_conversation_share($1, $2, $3, $4::jsonb, $5)', [shareId, ada, 'Linked', JSON.stringify({ v: 1, messages: [] }), 10]);
  const preview = await rpc(A, 'project_share_preview', projectId);
  assert.deepEqual({ conversations: preview.conversations, linked: preview.linked, already: preview.already_shared }, { conversations: 2, linked: 1, already: false });
  const result = await rpc(A, 'share_project', projectId);
  assert.equal(result.revoked, 1);
  assert.equal((await database.service.query('select count(*)::int as n from public.conversation_shares where id = $1', [shareId]))[0].n, 0);
  assert.equal((await rpc(A, 'project_share_preview', projectId)).already_shared, true);
});

test('a link needs a shared project and a role; the editors and the owner make it, a chat member does not; the same link comes back while it is active', async () => {
  const unshared = await projectOf(A);
  assert.match((await A.error("select public.create_project_link($1, 'chat', 'Ada')", [unshared]))?.message || 'it worked', /not_shared/);
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  assert.match(link.code, /^[0-9A-Za-z]{24,64}$/);
  assert.equal(link.generation, 1);
  assert.equal((await rpc(A, 'create_project_link', projectId, 'chat', 'Ada')).code, link.code);
  assert.notEqual((await rpc(A, 'create_project_link', projectId, 'editor', 'Ada')).code, link.code);
  assert.match((await B.error("select public.create_project_link($1, 'chat', 'Bob')", [projectId]))?.message || 'it worked', /not_allowed/);
  await rpc(B, 'accept_project_invite', link.code);
  assert.match((await B.error("select public.create_project_link($1, 'chat', 'Bob')", [projectId]))?.message || 'it worked', /not_allowed/);
  assert.match((await B.error('select public.get_project_links($1)', [projectId]))?.message || 'it worked', /not_allowed/);
  assert.equal((await rpc(A, 'get_project_links', projectId)).length, 2);
});

test('whoever has the code sees what it is for, and only while it works', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'editor', 'Ada');
  const seen = await rpc(database.anon, 'get_project_invite', link.code);
  assert.deepEqual({ name: seen.project_name, role: seen.role, by: seen.inviter_name }, { name: 'City plan', role: 'editor', by: 'Ada' });
  assert.equal(await rpc(database.anon, 'get_project_invite', 'nothing'.repeat(5)), null);
  await rpc(A, 'close_project_link', projectId, 'editor');
  assert.equal(await rpc(database.anon, 'get_project_invite', link.code), null);
  assert.match((await B.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_invalid/);
});

test('a person joins with the role of the link; twice is the same; the owner and a signed-out person cannot', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  assert.match((await database.anon.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /permission denied/);
  assert.match((await A.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_owner/);
  const joined = await rpc(B, 'accept_project_invite', link.code);
  assert.deepEqual({ role: joined.role, already: joined.already, name: joined.name }, { role: 'chat', already: false, name: 'City plan' });
  assert.equal((await rpc(B, 'accept_project_invite', link.code)).already, true);
  const list = await rpc(B, 'list_project_members', projectId);
  assert.equal(list.role, 'chat');
  assert.deepEqual(list.members.map((member) => [member.role, member.name]), [['owner', 'Ada Lovelace'], ['chat', 'bob']]);
  assert.match((await C.error('select public.list_project_members($1)', [projectId]))?.message || 'it worked', /not_a_member/);
  const mine = await rpc(B, 'list_shared_with_me');
  assert.deepEqual(mine.filter((item) => item.project_id === projectId).map((item) => [item.role, item.owner_name]), [['chat', 'Ada Lovelace']]);
  assert.deepEqual((await rpc(C, 'list_shared_with_me')).filter((item) => item.project_id === projectId), []);
});

test('only the owner changes a role or removes someone; a person who was removed does not come back with the old link, only with a new one', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  await rpc(C, 'accept_project_invite', link.code);
  assert.match((await B.error("select public.set_project_member_role($1, $2, 'editor')", [projectId, cy]))?.message || 'it worked', /not_allowed/);
  await rpc(A, 'set_project_member_role', projectId, bob, 'editor');
  assert.equal((await rpc(B, 'list_project_members', projectId)).role, 'editor');
  assert.match((await B.error('select public.remove_project_member($1, $2)', [projectId, cy]))?.message || 'it worked', /not_allowed/);
  await rpc(A, 'remove_project_member', projectId, cy);
  assert.match((await C.error('select public.list_project_members($1)', [projectId]))?.message || 'it worked', /not_a_member/);
  assert.match((await C.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_removed/);
  // the owner makes a new link (the old one ends, the generation goes up) and gives it to the person
  const fresh = await rpc(A, 'refresh_project_link', projectId, 'chat', 'Ada');
  assert.equal(fresh.generation, 2);
  assert.equal((await folder(projectId)).invite_link_generation, 2);
  assert.notEqual(fresh.code, link.code);
  assert.match((await C.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_invalid/);
  assert.equal((await rpc(C, 'accept_project_invite', fresh.code)).already, false);
  assert.match((await B.error("select public.refresh_project_link($1, 'chat', 'Bob')", [projectId]))?.message || 'it worked', /not_allowed/);
});

test('a member who leaves can join again with the same link (nobody took them out)', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  await rpc(B, 'leave_project', projectId);
  assert.deepEqual((await rpc(B, 'list_shared_with_me')).filter((item) => item.project_id === projectId), []);
  assert.equal((await rpc(B, 'accept_project_invite', link.code)).already, false);
});

test('a project has at most 100 members', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  const owner = (await database.service.query('select user_id from public.workspace_folders where id = $1', [projectId]))[0].user_id;
  const ids = [];
  for (let index = 0; index < 100; index += 1) ids.push((await database.db.query('insert into auth.users (email) values ($1) returning id', [`m${index}@example.test`])).rows[0].id);
  for (const memberId of ids) await database.service.query("insert into public.project_members (project_id, owner_id, member_id, role) values ($1, $2, $3, 'chat')", [projectId, owner, memberId]);
  assert.match((await B.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_full/);
});

test('a project in the trash is closed to its members and its links', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  await database.service.query('update public.workspace_folders set deleted_at = now() where id = $1', [projectId]);
  assert.match((await B.error('select public.list_project_members($1)', [projectId]))?.message || 'it worked', /not_a_member/);
  assert.equal(await rpc(database.anon, 'get_project_invite', link.code), null);
  assert.deepEqual((await rpc(B, 'list_shared_with_me')).filter((item) => item.project_id === projectId), []);
});
