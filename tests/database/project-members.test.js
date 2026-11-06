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
  assert.match((await B.error('select public.remove_project_member($1, $2, false)', [projectId, cy]))?.message || 'it worked', /not_allowed/);
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

// ---------- S2: the conversations of a shared project (supabase/migrations/20261106020000_add_project_conversations.sql)

const conversationIn = async (client, { folderId = null, sharedProject = null, title = 'A chat', texts = ['hello', 'hi there'] } = {}) => {
  const conversationId = id();
  await callWith(client, 'upsert_workspace_conversations', [{ id: conversationId, title, model: 'm', provider: 'p', created_at: now(), folder_id: folderId, metadata: sharedProject ? { sharedProject } : {} }]);
  await callWith(client, 'upsert_workspace_messages', texts.map((text, index) => ({ id: id(), conversation_id: conversationId, role: index % 2 ? 'model' : 'user', parts: [{ text }], sequence: index, created_at: now() })));
  return conversationId;
};
const linkOf = async (conversationId) => (await database.service.query('select shared_project_id, shared_project_owner from public.workspace_conversations where id = $1', [conversationId]))[0];
const read = async (userId, projectId, since = null, limit = 50, conversationId = null) => (await database.service.query('select public.server_read_project_for_member($1, $2, $3, $4, $5) as r', [userId, projectId, since, limit, conversationId]))[0].r;

test('a member links a conversation to the project by its metadata; a person who is not a member cannot, and a conversation moved out is not linked', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const mine = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  assert.deepEqual(await linkOf(mine), { shared_project_id: projectId, shared_project_owner: ada });
  const outsider = await conversationIn(C, { sharedProject: { id: projectId, ownerId: ada } });
  assert.deepEqual(await linkOf(outsider), { shared_project_id: null, shared_project_owner: null });
  // the person who made it takes the project out of its metadata: it is a plain conversation again
  await callWith(B, 'upsert_workspace_conversations', [{ id: mine, title: 'A chat', model: 'm', provider: 'p', created_at: now(), metadata: {} }]);
  assert.deepEqual(await linkOf(mine), { shared_project_id: null, shared_project_owner: null });
  // garbage in the metadata is no link
  const odd = await conversationIn(B, { sharedProject: { id: 'not-a-uuid', ownerId: ada } });
  assert.deepEqual(await linkOf(odd), { shared_project_id: null, shared_project_owner: null });
});

test('a member who was taken out keeps the link of what they made; the project going for good empties it', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const mine = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  await rpc(A, 'remove_project_member', projectId, bob);
  // the page writes the conversation back with the same metadata: the link stands
  await callWith(B, 'upsert_workspace_conversations', [{ id: mine, title: 'Changed', model: 'm', provider: 'p', created_at: now(), metadata: { sharedProject: { id: projectId, ownerId: ada } } }]);
  assert.deepEqual(await linkOf(mine), { shared_project_id: projectId, shared_project_owner: ada });
  // but a new conversation cannot be linked any more
  const later = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  assert.deepEqual(await linkOf(later), { shared_project_id: null, shared_project_owner: null });
  await database.service.query('delete from public.workspace_folders where id = $1', [projectId]);
  assert.deepEqual(await linkOf(mine), { shared_project_id: null, shared_project_owner: null });
});

test('the server reads the project for a person who is in it: the conversations of the owner and of every member, with their messages; nobody else gets anything', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const ownerChat = await conversationIn(A, { folderId: projectId, title: 'Owner chat' });
  const memberChat = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada }, title: 'Member chat', texts: ['q', 'a', 'q2'] });
  const outside = await conversationIn(A, { title: 'Not in the project' });
  const result = await read(bob, projectId);
  assert.equal(result.role, 'chat');
  assert.equal(result.project.name, 'City plan');
  assert.equal(result.owner_name, 'Ada Lovelace');
  assert.deepEqual(result.conversations.map((chat) => [chat.title, chat.author_name]).sort(), [['Member chat', 'bob'], ['Owner chat', 'Ada Lovelace']]);
  assert.ok(!result.conversations.some((chat) => chat.id === outside));
  assert.equal(result.messages.filter((message) => message.conversation_id === memberChat).length, 3);
  assert.equal(result.messages.filter((message) => message.conversation_id === ownerChat).length, 2);
  assert.equal(await read(cy, projectId), null);
  assert.equal(await read(bob, id()), null);
  const unshared = await projectOf(A);
  assert.equal(await read(ada, unshared), null);
});

test('the read gives a page at a time, from a time on', async () => {
  const projectId = await sharedProject();
  const first = await conversationIn(A, { folderId: projectId, title: 'One' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await conversationIn(A, { folderId: projectId, title: 'Two' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await conversationIn(A, { folderId: projectId, title: 'Three' });
  const page = await read(ada, projectId, null, 2);
  assert.equal(page.conversations.length, 2);
  assert.equal(page.has_more, true);
  const rest = await read(ada, projectId, page.conversations.at(-1).updated_at, 2);
  assert.deepEqual(rest.conversations.map((chat) => chat.title), ['Three']);
  assert.equal(rest.has_more, false);
  assert.ok(first);
});

test('the server function is for the server only', async () => {
  assert.match((await A.error('select public.server_read_project_for_member($1, $2, null, 50, null)', [ada, id()]))?.message || 'it worked', /permission denied/);
  assert.match((await database.anon.error('select public.server_read_project_for_member($1, $2, null, 50, null)', [ada, id()]))?.message || 'it worked', /permission denied/);
});

test('a conversation whose messages changed shows up again from a time on, even when its own row did not change; one conversation can be asked for alone', async () => {
  const projectId = await sharedProject();
  const quiet = await conversationIn(A, { folderId: projectId, title: 'Quiet' });
  const busy = await conversationIn(A, { folderId: projectId, title: 'Busy' });
  const first = await read(ada, projectId);
  const mark = first.conversations.at(-1).updated_at;
  await new Promise((resolve) => setTimeout(resolve, 15));
  await callWith(A, 'upsert_workspace_messages', [{ id: id(), conversation_id: busy, role: 'user', parts: [{ text: 'a new line' }], sequence: 5, created_at: now() }]);
  const later = await read(ada, projectId, mark);
  assert.deepEqual(later.conversations.map((chat) => chat.id), [busy]);
  assert.ok(later.messages.some((message) => message.parts[0].text === 'a new line'));
  const alone = await read(ada, projectId, null, 50, quiet);
  assert.deepEqual(alone.conversations.map((chat) => chat.id), [quiet]);
  assert.equal((await read(ada, projectId, mark, 50, quiet)).conversations.length, 0);
});

// ---------- the content of a shared project (supabase/migrations/20261106015000_add_project_content.sql)

test('an editor and the owner change the instructions and the sources, a chat member does not, and a change made after the person read is refused', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'editor', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const chatLink = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(C, 'accept_project_invite', chatLink.code);
  const readAt = (await read(bob, projectId)).project.updated_at;
  const source = { id: 's1', kind: 'text', title: 'Rules', mime: 'text/plain', size: 5, text: 'Rules', addedAt: now() };
  const changed = await rpc(B, 'update_shared_project', projectId, 'Be brief.', JSON.stringify([source]), readAt);
  assert.ok(changed.updated_at);
  const after = (await read(cy, projectId)).project;
  assert.equal(after.instructions, 'Be brief.');
  assert.equal(after.sources[0].title, 'Rules');
  assert.match((await C.error("select public.update_shared_project($1, 'x', null, null)", [projectId]))?.message || 'it worked', /not_allowed/);
  // the owner wrote after bob read it: bob's change is refused until he reads again
  await new Promise((resolve) => setTimeout(resolve, 10));
  await rpc(A, 'update_shared_project', projectId, 'Owner wins.', null, null);
  assert.match((await B.error("select public.update_shared_project($1, 'late', null, $2)", [projectId, changed.updated_at]))?.message || 'it worked', /stale/);
  assert.equal((await read(cy, projectId)).project.instructions, 'Owner wins.');
  // the sources stay when only the instructions change
  assert.equal((await read(cy, projectId)).project.sources.length, 1);
});

const mail = async (userId, projectId, email, role) => (await database.service.query('select public.server_create_project_email_invite($1, $2, $3, $4, $5) as r', [userId, projectId, email, role, 'Ada']))[0].r;

test('an invitation by mail is for one address: the account with that address joins with it once; a newer one replaces an older; the owner and the editors list and take them back', async () => {
  const projectId = await sharedProject();
  const invite = await mail(ada, projectId, ' Bob@Example.test ', 'editor');
  assert.equal(invite.email, 'bob@example.test');
  assert.equal(invite.project_name, 'City plan');
  assert.deepEqual((await rpc(A, 'list_project_invites', projectId)).map((entry) => [entry.email, entry.role]), [['bob@example.test', 'editor']]);
  assert.match((await C.error('select public.accept_project_invite($1)', [invite.code]))?.message || 'it worked', /invite_email_mismatch/);
  const joined = await rpc(B, 'accept_project_invite', invite.code);
  assert.deepEqual([joined.role, joined.already], ['editor', false]);
  assert.deepEqual(await rpc(A, 'list_project_invites', projectId), []);
  assert.match((await database.service.query('select public.server_create_project_email_invite($1, $2, $3, $4, $5)', [cy, projectId, 'x@example.test', 'chat', '']).catch((error) => error))?.message || 'it worked', /not_allowed/);
  assert.match((await database.service.query('select public.server_create_project_email_invite($1, $2, $3, $4, $5)', [ada, projectId, 'not-an-address', 'chat', '']).catch((error) => error))?.message || 'it worked', /invalid_email/);
  assert.match((await A.error("select public.server_create_project_email_invite($1, $2, 'a@example.test', 'chat', '')", [ada, projectId]))?.message || 'it worked', /permission denied/);
  const first = await mail(ada, projectId, 'cy@example.test', 'chat');
  const second = await mail(ada, projectId, 'cy@example.test', 'chat');
  assert.match((await C.error('select public.accept_project_invite($1)', [first.code]))?.message || 'it worked', /invite_invalid/);
  assert.equal((await rpc(A, 'list_project_invites', projectId)).length, 1);
  await rpc(B, 'revoke_project_invite', projectId, second.id);
  assert.match((await C.error('select public.accept_project_invite($1)', [second.code]))?.message || 'it worked', /invite_invalid/);
  // a person who was taken out comes back by an invitation to their address (the owner wrote it), not by an old link
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(C, 'accept_project_invite', link.code);
  await rpc(A, 'remove_project_member', projectId, cy, false);
  assert.match((await C.error('select public.accept_project_invite($1)', [link.code]))?.message || 'it worked', /invite_removed/);
  const back = await mail(ada, projectId, 'cy@example.test', 'chat');
  assert.equal((await rpc(C, 'accept_project_invite', back.code)).already, false);
});

test('taking a person out can take what they made in the project with them (to their trash); by default it stays', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  await rpc(C, 'accept_project_invite', link.code);
  const bobs = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  const cys = await conversationIn(C, { sharedProject: { id: projectId, ownerId: ada } });
  await rpc(A, 'remove_project_member', projectId, bob, true);
  await rpc(A, 'remove_project_member', projectId, cy, false);
  const deleted = async (conversationId) => (await database.service.query('select deleted_at is not null as gone from public.workspace_conversations where id = $1', [conversationId]))[0].gone;
  assert.equal(await deleted(bobs), true);
  assert.equal(await deleted(cys), false);
});

test('two people who are in the same shared project can see each other’s picture; a stranger and oneself cannot', async () => {
  const projectId = await sharedProject();
  const inviteCode = (await rpc(A, 'create_project_link', projectId, 'chat', 'Ada')).code;
  await rpc(B, 'accept_project_invite', inviteCode);
  await rpc(C, 'accept_project_invite', inviteCode);
  assert.equal(await rpc(A, 'shares_project_with', bob), true);
  assert.equal(await rpc(B, 'shares_project_with', ada), true);
  assert.equal(await rpc(B, 'shares_project_with', cy), true);
  assert.equal(await rpc(A, 'shares_project_with', ada), false);
  const stranger = database.asUser(await database.createUser(`dan-${id()}@example.test`));
  assert.equal(await rpc(stranger, 'shares_project_with', ada), false);
  assert.equal(await rpc(A, 'shares_project_with', null), false);
});

const assetAllowed = async (userId, projectId, path) => (await database.service.query('select public.server_project_asset_allowed($1, $2, $3) as r', [userId, projectId, path]))[0].r;

test('a member may have a file that the project holds (in a conversation of the project or in its sources) and nothing else; only the server can ask', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const hash = (letter) => letter.repeat(64);
  const marker = (path) => ({ inlineData: { mimeType: 'image/png', data: { __astraCloudAsset: { path } } } });
  const mine = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  const bobFile = `${bob}/${hash('a')}`;
  const adaFile = `${ada}/${hash('b')}`;
  await callWith(B, 'upsert_workspace_messages', [{ id: id(), conversation_id: mine, role: 'user', parts: [marker(bobFile)], created_at: now(), sequence: 5 }]);
  assert.equal(await assetAllowed(ada, projectId, bobFile), true);
  assert.equal(await assetAllowed(bob, projectId, bobFile), true);
  assert.equal(await assetAllowed(cy, projectId, bobFile), false);
  assert.equal(await assetAllowed(bob, projectId, `${bob}/${hash('c')}`), false);
  assert.equal(await assetAllowed(bob, projectId, adaFile), false);
  assert.equal(await assetAllowed(bob, projectId, 'not-a-path'), false);
  await rpc(A, 'update_shared_project', projectId, null, [{ id: 's1', kind: 'file', name: 'x.png', fileHash: hash('b') , path: adaFile }], null);
  assert.equal(await assetAllowed(bob, projectId, adaFile), true);
  assert.match((await B.error('select public.server_project_asset_allowed($1, $2, $3)', [bob, projectId, bobFile]))?.message || 'it worked', /permission denied/);
});

test('the people of a shared project are pinged when something in it changes: new and finished messages always, a growing reply at most every 700 ms, nothing for a project that is not shared', async () => {
  await database.db.exec(`create schema if not exists realtime;
    create table if not exists public.live_log (topic text, event text, payload jsonb, is_private boolean);
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into public.live_log values (topic, event, payload, private) $$;`);
  const log = async (projectId) => (await database.db.query('select topic, event, payload, is_private from public.live_log where topic = $1', ['project:' + projectId])).rows;
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  const before = (await log(projectId)).length;
  await rpc(B, 'accept_project_invite', link.code);
  assert.equal((await log(projectId)).length, before + 1);
  assert.deepEqual((await log(projectId)).at(-1).payload, { c: null });
  const mine = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
  const rows = await log(projectId);
  assert.ok(rows.length > before + 1);
  assert.deepEqual(rows.at(-1), { topic: `project:${projectId}`, event: 'changed', payload: { c: mine }, is_private: true });
  // a reply that is still being written: the first write pings, the ones right after it do not, the finished one always does
  const messageId = id();
  const write = (text, status) => callWith(B, 'upsert_workspace_messages', [{ id: messageId, conversation_id: mine, role: 'model', parts: [{ text }], sequence: 9, status, created_at: now() }]);
  await write('a', 'streaming');
  const first = (await log(projectId)).length;
  await write('ab', 'streaming');
  await write('abc', 'streaming');
  await write('abcd', 'streaming');
  assert.equal((await log(projectId)).length, first + 1);
  await write('abcde', 'complete');
  assert.equal((await log(projectId)).length, first + 2);
  // a project that is not shared, and a conversation that is in no project, send nothing
  const plain = await projectOf(A);
  await conversationIn(A, { folderId: plain });
  await conversationIn(A);
  assert.equal((await log(plain)).length, 0);
  // the instructions of a shared project ping too
  const beforeEdit = (await log(projectId)).length;
  await rpc(A, 'update_shared_project', projectId, 'New rules.', null, null);
  assert.ok((await log(projectId)).length > beforeEdit);
  await database.db.query('drop function realtime.send(jsonb, text, text, boolean)');
  // and without Realtime nothing fails
  await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada } });
});

const noteRow = async (userId, key) => (await database.service.query('select payload, version, deleted_at from public.workspace_memory_records where user_id = $1 and record_key = $2', [userId, key]))[0];

test('the memory of a shared project is the project notes of its owner: everyone in it reads them, the owner and the editors write them, a chat member does not, and no other note is reached', async () => {
  const projectId = await sharedProject();
  const editor = await rpc(A, 'create_project_link', projectId, 'editor', 'Ada');
  await rpc(B, 'accept_project_invite', editor.code);
  const chat = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(C, 'accept_project_invite', chat.code);
  const noteId = `note:${id()}`;
  const privateId = `note:${id()}`;
  await database.service.query("insert into public.workspace_memory_records (user_id, record_key, payload) values ($1, $2, '{\"text\":\"private to Ada\"}'::jsonb), ($1, $3, jsonb_build_object('text', 'of the project', 'projectId', $4::text))", [ada, privateId, noteId, projectId]);
  const read = async (client) => (await rpc(client, 'read_project_memory', projectId));
  assert.deepEqual((await read(C)).map((row) => row.record_key), [noteId]);
  assert.deepEqual((await read(B)).map((row) => row.record_key), [noteId]);
  // an editor writes a new note (tagged with the project even when the page forgot) and changes the one that was there
  const fresh = `note:${id()}`;
  const wrote = await rpc(B, 'write_project_memory', projectId, [{ key: fresh, payload: { text: 'new' }, baseVersion: null }, { key: noteId, payload: { text: 'changed', projectId }, baseVersion: 1 }]);
  assert.deepEqual(wrote.map((entry) => entry.status), ['ok', 'ok']);
  assert.equal((await noteRow(ada, fresh)).payload.projectId, projectId);
  assert.equal((await noteRow(ada, noteId)).payload.text, 'changed');
  assert.equal((await noteRow(bob, fresh)), undefined);
  // a change that read an old version is told so, with the row as it is
  const late = await rpc(A, 'write_project_memory', projectId, [{ key: noteId, payload: { text: 'late' }, baseVersion: 1 }]);
  assert.equal(late[0].status, 'conflict');
  assert.equal(late[0].row.version, 2);
  // the other notes of the owner, other kinds of rows and bad keys are refused; nothing changes
  const refused = await rpc(B, 'write_project_memory', projectId, [{ key: privateId, payload: { text: 'taken' }, baseVersion: 1 }, { key: `cursor:${id()}`, payload: {}, baseVersion: null }, { key: 'note:x y', payload: {}, baseVersion: null }]);
  assert.deepEqual(refused.map((entry) => entry.status), ['refused', 'refused', 'refused']);
  assert.equal((await noteRow(ada, privateId)).payload.text, 'private to Ada');
  // deleting is a change too
  assert.equal((await rpc(A, 'write_project_memory', projectId, [{ key: fresh, payload: { text: 'new' }, baseVersion: 1, deleted: true }]))[0].status, 'ok');
  assert.ok((await noteRow(ada, fresh)).deleted_at);
  // a chat member and a stranger cannot write; a stranger cannot read
  assert.match((await C.error('select public.write_project_memory($1, $2::jsonb)', [projectId, '[]']))?.message || 'it worked', /not_allowed/);
  const stranger = database.asUser(await database.createUser(`eve-${id()}@example.test`));
  assert.match((await stranger.error('select public.read_project_memory($1)', [projectId]))?.message || 'it worked', /not_a_member/);
  assert.match((await stranger.error('select public.write_project_memory($1, $2::jsonb)', [projectId, '[]']))?.message || 'it worked', /not_a_member/);
  // a project that is not shared has no shared memory
  const plain = await projectOf(A);
  assert.match((await A.error('select public.read_project_memory($1)', [plain]))?.message || 'it worked', /not_shared/);
});

test('for the server: the owner and role of a person in a shared project, and the history of all the people of the project', async () => {
  const projectId = await sharedProject();
  const link = await rpc(A, 'create_project_link', projectId, 'chat', 'Ada');
  await rpc(B, 'accept_project_invite', link.code);
  const access = async (userId, project) => (await database.service.query('select public.server_project_memory_access($1, $2) as r', [userId, project]))[0].r;
  assert.deepEqual(await access(bob, projectId), { owner_id: ada, role: 'chat' });
  assert.deepEqual(await access(ada, projectId), { owner_id: ada, role: 'owner' });
  assert.equal(await access(cy, projectId), null);
  assert.equal(await access(ada, id()), null);
  const own = await conversationIn(A, { folderId: projectId, texts: ['the harbour plan', 'we looked at the harbour'] });
  const theirs = await conversationIn(B, { sharedProject: { id: projectId, ownerId: ada }, texts: ['the airport plan', 'we looked at the airport'] });
  const outside = await conversationIn(B, { texts: ['my private chat', 'secret'] });
  const history = async (userId) => (await database.service.query('select public.server_read_project_history($1, $2, 150, 6000) as r', [userId, projectId]))[0].r;
  const asBob = await history(bob);
  assert.deepEqual(asBob.conversations.map((entry) => entry.id).sort(), [own, theirs].sort());
  assert.ok(asBob.conversations.every((entry) => entry.folder_id === projectId));
  assert.deepEqual(asBob.project_folders, [projectId]);
  assert.ok(asBob.messages.some((entry) => entry.conversation_id === own && /harbour/.test(entry.parts[0].text)));
  assert.ok(!asBob.messages.some((entry) => entry.conversation_id === outside));
  assert.equal(await history(cy), null);
  assert.match((await B.error('select public.server_read_project_history($1, $2)', [bob, projectId]))?.message || 'it worked', /permission denied/);
});
