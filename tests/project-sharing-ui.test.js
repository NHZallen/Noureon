import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { codeOfError, createProjectShareClient } from '../src/app/runtime/project-sharing/project-share-client.js';
import { PENDING_JOIN_KEY, clearPendingJoin, isJoinRoute, joinCodeOf, joinUrl, readPendingJoin, rememberJoinCode } from '../src/app/runtime/project-sharing/join-route.js';
import { openJoinDialog, joinFailureKey } from '../src/app/ui/projects/project-join-dialog.js';
import { openMembersPanel, openShareConfirm } from '../src/app/ui/projects/project-members-panel.js';
import sharing from '../src/data/i18n/parts/project-sharing.js';

// Sharing a project on the page: the words of the database in an error, the address of an invitation and the code kept for the app, the page of the members (the question before sharing, the
// links of a role, the members and their menu) and the invitation a person opens, all over a client that stands in for the database.

const texts = sharing.en;
const text = (key, values = {}) => String(texts[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
const CODE = 'A'.repeat(32);

const page = () => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<div id="root"></div>';
  return { window, document, root: document.getElementById('root') };
};

test('the words of the database are found in an error, and anything else is a failure', () => {
  assert.equal(codeOfError({ message: 'invite_removed' }), 'invite_removed');
  assert.equal(codeOfError(new Error('P0001: not_allowed')), 'not_allowed');
  assert.equal(codeOfError({ message: 'something odd' }), 'failed');
  assert.equal(codeOfError(null), 'failed');
});

test('the client gives { ok, data } or { ok: false, code } and says when there is no cloud', async () => {
  const calls = [];
  const supabase = { rpc: async (name, args) => { calls.push([name, args]); return name === 'bad' ? { data: null, error: { message: 'invite_full' } } : { data: { fine: true }, error: null }; } };
  const client = createProjectShareClient({ getSupabase: () => supabase });
  assert.deepEqual(await client.share('p1'), { ok: true, data: { fine: true } });
  await client.makeLink('p1', 'chat', 'Ada');
  await client.remove('p1', 'u2');
  assert.deepEqual(calls.map(([name]) => name), ['share_project', 'create_project_link', 'remove_project_member']);
  assert.deepEqual(calls[1][1], { p_project_id: 'p1', p_role: 'chat', p_inviter_name: 'Ada' });
  assert.deepEqual(await createProjectShareClient({ getSupabase: () => null }).members('p1'), { ok: false, code: 'no_cloud' });
  const failing = createProjectShareClient({ getSupabase: () => ({ rpc: async () => ({ data: null, error: { message: 'invite_full' } }) }) });
  assert.deepEqual(await failing.accept(CODE), { ok: false, code: 'invite_full' });
});

test('the address of an invitation holds a code of a good shape; the start of the page keeps it for the app and shows the plain address', () => {
  assert.equal(isJoinRoute(`/join/${CODE}`), true);
  assert.equal(isJoinRoute('/s/abc'), false);
  assert.equal(joinCodeOf(`/join/${CODE}/`), CODE);
  assert.equal(joinCodeOf('/join/short'), '');
  assert.equal(joinUrl('https://noureon.com/', CODE), `https://noureon.com/join/${CODE}`);
  const { window } = page();
  window.history.pushState(null, '', `/join/${CODE}`);
  assert.equal(rememberJoinCode(window, 1000), CODE);
  assert.equal(window.location.pathname, '/');
  assert.equal(readPendingJoin(window.localStorage, 2000), CODE);
  assert.equal(readPendingJoin(window.localStorage, 1000 + 25 * 60 * 60 * 1000), '');
  clearPendingJoin(window.localStorage);
  assert.equal(window.localStorage.getItem(PENDING_JOIN_KEY), null);
});

test('the question before sharing says what will happen, and the line about public links only when there are some', async () => {
  const { document, root } = page();
  const answer = openShareConfirm({ document, root, text, preview: { conversations: 12, linked: 2 } });
  await tick();
  const shown = root.textContent;
  assert.match(shown, /12 conversations/);
  assert.match(shown, /project memory only/);
  assert.match(shown, /2 of these conversations had a public link/);
  root.querySelector('[data-share-start]').click();
  assert.equal(await answer, true);
  const second = openShareConfirm({ document, root, text, preview: { conversations: 1, linked: 0 } });
  await tick();
  assert.doesNotMatch(root.textContent, /public link/);
  root.querySelector('.pj-sheet-head button').click();
  assert.equal(await second, false);
});

const fakeClient = (state) => ({
  preview: async () => ({ ok: true, data: { conversations: 3, linked: 0 } }),
  share: async () => { state.shared = true; state.calls.push('share'); return { ok: true, data: { memory_scope: 'project' } }; },
  members: async () => ({ ok: true, data: { role: state.role, shared_at: state.shared ? '2026-11-06' : null, generation: 1, members: [
    { user_id: 'o', role: 'owner', name: 'Ada' }, { user_id: 'u2', role: 'chat', name: 'Bob' }, { user_id: 'u3', role: 'editor', name: 'Cy' }] } }),
  links: async () => ({ ok: true, data: state.links }),
  makeLink: async (_p, role) => { state.calls.push(`make:${role}`); state.links = [...state.links, { code: `${role}`.padEnd(30, 'x'), role, generation: 1 }]; return { ok: true, data: {} }; },
  refreshLink: async (_p, role) => { state.calls.push(`refresh:${role}`); state.links = [{ code: 'fresh'.padEnd(30, 'y'), role, generation: 2 }]; return { ok: true, data: {} }; },
  closeLink: async (_p, role) => { state.calls.push(`close:${role}`); state.links = state.links.filter((link) => link.role !== role); return { ok: true, data: null }; },
  setRole: async (_p, member, role) => { state.calls.push(`role:${member}:${role}`); return { ok: true, data: null }; },
  remove: async (_p, member) => { state.calls.push(`remove:${member}`); return { ok: true, data: null }; },
  keepConversations: async (_p, member) => { state.calls.push(`keep:${member}`); return state.keepFails ? { ok: false, code: 'failed' } : { ok: true, data: { conversations: 1, files: { copied: 0, skipped: 0 } } }; },
  invites: async () => ({ ok: true, data: state.pending || [] }),
  revokeInvite: async (_p, inviteId) => { state.calls.push(`revoke:${inviteId}`); state.pending = (state.pending || []).filter((entry) => entry.id !== inviteId); return { ok: true, data: null }; },
  inviteQuota: async () => ({ ok: true, data: { remaining: state.left ?? 17, limit: 20 } }),
  inviteByMail: async (_p, { email, role }) => { state.calls.push(`mail:${email}:${role}`); if (state.mailError) return { ok: false, code: state.mailError }; state.left = (state.left ?? 17) - 1; state.pending = [...(state.pending || []), { id: 'i1', email, role }]; return { ok: true, data: { remaining: state.left, limit: 20 } }; }
});

test('a project that is not shared offers to be shared, and sharing tells the page and shows the members', async () => {
  const { document, root } = page();
  const state = { role: 'owner', shared: false, links: [], calls: [] };
  const told = [];
  await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: () => {}, onShared: (id) => told.push(id) });
  assert.match(root.textContent, /Share this project with others/);
  root.querySelector('[data-share-open]').click();
  await tick();
  root.querySelector('[data-share-start]').click();
  await tick(); await tick();
  assert.deepEqual(state.calls, ['share']);
  assert.deepEqual(told, ['p1']);
  assert.equal(root.querySelector('[data-share-open]'), null);
  assert.equal(root.querySelectorAll('.psh-member').length, 3);
});

test('the owner makes, refreshes and closes the link of a role, switches the role, and sees the members with their roles', async () => {
  const { document, root } = page();
  const state = { role: 'owner', shared: true, links: [], calls: [] };
  const notes = [];
  await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: (message) => notes.push(message) });
  assert.deepEqual([...root.querySelectorAll('.psh-member-name')].map((node) => node.textContent), ['Ada', 'Bob', 'Cy']);
  assert.match(root.textContent, /Owner/);
  root.querySelector('[data-link-make]').click();
  await tick(); await tick();
  assert.match(root.querySelector('[data-link]').dataset.link, /^https:\/\/noureon\.test\/join\/chat/);
  root.querySelector('[data-role="editor"]').click();
  assert.ok(root.querySelector('[data-link-make]'));
  root.querySelector('[data-link-make]').click();
  await tick(); await tick();
  root.querySelector('[data-link-refresh]').click();
  await tick(); await tick();
  assert.match(root.querySelector('[data-link]').dataset.link, /join\/fresh/);
  root.querySelector('[data-link-close]').click();
  await tick(); await tick();
  assert.deepEqual(state.calls, ['make:chat', 'make:editor', 'refresh:editor', 'close:editor']);
  assert.ok(notes.includes(text('psRefreshed')) && notes.includes(text('psLinkClosed')));
});

test('an editor makes links but cannot refresh them or take anyone out; a chat member sees the members only', async () => {
  for (const role of ['editor', 'chat']) {
    const { document, root } = page();
    const state = { role, shared: true, links: [{ code: 'z'.repeat(30), role: 'chat', generation: 1 }], calls: [] };
    await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: () => {} });
    assert.equal(root.querySelector('[data-link-refresh]'), null, `${role}: no refresh`);
    assert.equal(root.querySelector('.psh-member .pj-round'), null, `${role}: no menu on a member`);
    assert.equal(Boolean(root.querySelector('[data-link]')), role === 'editor', `${role}: the link is for the editor`);
    assert.equal(root.querySelectorAll('.psh-member').length, 3);
  }
});

test('the owner changes a role and removes a member after being asked', async () => {
  const { document, root } = page();
  const state = { role: 'owner', shared: true, links: [], calls: [] };
  await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: () => {} });
  const bob = root.querySelector('[data-user-id="u2"] .pj-round');
  bob.click();
  await tick();
  const items = [...document.querySelectorAll('.pj-menu button, [role="menuitem"]')];
  const byText = (label) => items.find((node) => node.textContent.includes(label));
  assert.ok(byText('Make editor'));
  byText('Make editor').click();
  await tick(); await tick();
  root.querySelector('[data-user-id="u2"] .pj-round').click();
  await tick();
  [...document.querySelectorAll('.pj-menu button, [role="menuitem"]')].find((node) => node.textContent.includes('Remove member')).click();
  await tick();
  assert.match(root.textContent, /Remove Bob\?/);
  root.querySelector('[data-remove-go]').click();
  await tick(); await tick();
  assert.deepEqual(state.calls, ['role:u2:editor', 'keep:u2', 'remove:u2']);
});

test('the invitation shows the project, the role and what it can do, and joining tells the page; a bad invitation says why', async () => {
  const { document, root } = page();
  const accepted = [];
  const notes = [];
  const client = { accept: async (code) => { accepted.push(code); return { ok: true, data: { project_id: 'p1', name: 'City plan', role: 'chat' } }; } };
  const invite = { project_name: 'City plan', role: 'chat', inviter_name: 'Ada', kind: 'link' };
  const done = openJoinDialog({ document, root, text, client, code: CODE, invite, notify: (message) => notes.push(message), onJoined: (data) => accepted.push(data.project_id) });
  await tick();
  assert.match(root.textContent, /Ada invited you to a project/);
  assert.match(root.textContent, /City plan/);
  assert.match(root.textContent, /Chat member/);
  assert.equal(root.querySelectorAll('.psh-line.is-yes').length, 3);
  assert.equal(root.querySelectorAll('.psh-line.is-no').length, 1);
  root.querySelector('[data-join-go]').click();
  assert.equal(await done, 'joined');
  assert.deepEqual(accepted, [CODE, 'p1']);
  assert.deepEqual(notes, ['You joined “City plan”.']);

  const failing = { accept: async () => ({ ok: false, code: 'invite_removed' }) };
  const second = openJoinDialog({ document, root, text, client: failing, code: CODE, invite: { ...invite, role: 'editor' }, notify: (message) => notes.push(message) });
  await tick();
  assert.equal(root.querySelectorAll('.psh-line.is-yes').length, 4);
  root.querySelector('[data-join-go]').click();
  assert.equal(await second, 'cancelled');
  assert.match(notes.at(-1), /ask the owner of the project to make a new link for you/);
  assert.equal(joinFailureKey('invite_full'), 'psJoinFull');
  assert.equal(joinFailureKey('whatever'), 'psJoinInvalid');
});

test('the owner and the editors invite by mail and see how many are left this hour and who is waiting; a chat member does not see this part', async () => {
  const { document, root } = page();
  const state = { role: 'owner', shared: true, links: [], calls: [], left: 17 };
  const notes = [];
  await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: (message, kind) => notes.push([message, kind]) });
  assert.match(root.textContent, /You can send 17 more this hour \(limit 20\)/);
  const input = root.querySelector('#psh-email');
  input.value = 'bob@example.test';
  root.querySelector('[data-email-send]').click();
  await tick(); await tick();
  assert.deepEqual(state.calls, ['mail:bob@example.test:chat']);
  assert.match(root.textContent, /You can send 16 more/);
  assert.match(root.textContent, /bob@example\.test/);
  assert.match(root.textContent, /Waiting to join/);
  assert.deepEqual(notes.at(-1), [text('psEmailSent'), 'success']);
  root.querySelector('[data-invite-id="i1"] .pj-chip').click();
  await tick(); await tick();
  assert.equal(state.calls.at(-1), 'revoke:i1');
  assert.equal(root.querySelector('[data-invite-id]'), null);
  state.mailError = 'rate_limited';
  root.querySelector('#psh-email').value = 'cy@example.test';
  root.querySelector('[data-email-send]').click();
  await tick(); await tick();
  assert.deepEqual(notes.at(-1), [text('psEmailLimit'), 'error']);
  state.mailError = 'invalid_email';
  root.querySelector('#psh-email').value = 'nope';
  root.querySelector('[data-email-send]').click();
  await tick(); await tick();
  assert.deepEqual(notes.at(-1), [text('psEmailInvalid'), 'error']);
  const chat = page();
  await openMembersPanel({ document: chat.document, root: chat.root, text, client: fakeClient({ role: 'chat', shared: true, links: [], calls: [] }), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: () => {} });
  assert.equal(chat.root.querySelector('#psh-email'), null);
});

test('taking a person out asks whether the project keeps a copy of their conversations (by default it does); when the copy cannot be made the owner chooses', async () => {
  const open = async (state) => {
    const { document, root } = page();
    await openMembersPanel({ document, root, text, client: fakeClient(state), project: { id: 'p1', name: 'City' }, origin: 'https://noureon.test', copy: async () => true, notify: () => {} });
    root.querySelector('[data-user-id="u2"] .pj-round').click();
    await tick();
    [...document.querySelectorAll('.pj-menu button, [role="menuitem"]')].find((node) => node.textContent.includes('Remove member')).click();
    await tick();
    return { document, root };
  };
  // kept by default: the copy is asked for first, then the person is taken out
  const first = { role: 'owner', shared: true, links: [], calls: [] };
  const { root } = await open(first);
  assert.equal(root.querySelector('.psh-choice[data-keep="true"]').getAttribute('aria-pressed'), 'true');
  root.querySelector('.psh-choice[data-keep="false"]').click();
  assert.equal(root.querySelector('.psh-choice[data-keep="false"]').getAttribute('aria-pressed'), 'true');
  root.querySelector('.psh-choice[data-keep="true"]').click();
  root.querySelector('[data-remove-go]').click();
  await tick(); await tick();
  assert.deepEqual(first.calls, ['keep:u2', 'remove:u2']);
  // not kept: nothing is copied
  const second = { role: 'owner', shared: true, links: [], calls: [] };
  const other = await open(second);
  other.root.querySelector('.psh-choice[data-keep="false"]').click();
  other.root.querySelector('[data-remove-go]').click();
  await tick(); await tick();
  assert.deepEqual(second.calls, ['remove:u2']);
  // the copy fails: the owner is asked; trying again asks again, going without takes the person out, stopping leaves them in
  const third = { role: 'owner', shared: true, links: [], calls: [], keepFails: true };
  const failing = await open(third);
  failing.root.querySelector('[data-remove-go]').click();
  await tick(); await tick();
  assert.deepEqual(third.calls, ['keep:u2']);
  failing.root.querySelector('[data-keep-retry]').click();
  await tick(); await tick();
  assert.deepEqual(third.calls, ['keep:u2', 'keep:u2']);
  failing.root.querySelector('[data-keep-skip]').click();
  await tick(); await tick();
  assert.deepEqual(third.calls, ['keep:u2', 'keep:u2', 'remove:u2']);
  const fourth = { role: 'owner', shared: true, links: [], calls: [], keepFails: true };
  const stopped = await open(fourth);
  stopped.root.querySelector('[data-remove-go]').click();
  await tick(); await tick();
  const heads = stopped.root.querySelectorAll('.pj-sheet-head .pj-round');
  heads[heads.length - 1].click();
  await tick(); await tick();
  assert.equal(stopped.root.querySelector('[data-keep-retry]'), null, 'the question is closed');
  assert.deepEqual(fourth.calls, ['keep:u2'], 'stopped: the person is still in');
});

test('the head of a shared project shows a few pictures and the number of people; a project with nobody else shows nothing; a picture that is still coming shows the letter first', async () => {
  const { drawMemberButton } = await import('../src/app/ui/projects/project-head-members.js');
  const window = new Window();
  const document = window.document;
  const text = (key, values = {}) => String(sharing.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
  const slot = document.createElement('span');
  assert.equal(drawMemberButton({ document, slot, text, members: [{ user_id: 'a', name: 'Ada' }] }), null);
  assert.equal(slot.children.length, 0);
  const opened = [];
  const members = [{ user_id: 'a', name: 'Ada', avatar_version: 1 }, { user_id: 'b', name: 'Bob', avatar_version: 0 }, { user_id: 'c', name: 'Cy' }, { user_id: 'd', name: 'Dan' }];
  const button = drawMemberButton({ document, slot, text, members, avatarOf: (id, version) => (version ? Promise.resolve('data:image/webp;base64,AAAA') : ''), onOpen: () => opened.push(1) });
  assert.equal(button.querySelectorAll('.psh-avatar').length, 3);
  assert.equal(button.querySelector('.psh-avatar').textContent, 'A');
  assert.equal(button.querySelector('.psh-stack-count').textContent, '4');
  assert.equal(button.getAttribute('aria-label'), 'Project members (4)');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(button.querySelector('.psh-avatar img'));
  button.click();
  assert.deepEqual(opened, [1]);
});
