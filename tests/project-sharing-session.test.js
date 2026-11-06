import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { startProjectSharing } from '../src/app/runtime/project-sharing/start-project-sharing.js';
import { announceUser } from '../src/app/runtime/features/user-ready.js';
import { provideService, SERVICES } from '../src/app/runtime/services.js';
import { createProjectActions, setSharedProjectHook } from '../src/app/runtime/projects/project-actions.js';
import { PENDING_CHAT_KEY } from '../src/app/runtime/project-sharing/join-route.js';
import sharing from '../src/data/i18n/parts/project-sharing.js';

// A shared project is shown by the page of the projects, as a project of the person's own is (the page tells which project it shows, the sharing code reads it and keeps it live, and the actions of the
// page go through a hook for it): the chats of everyone, the sources the owner and the editors add and remove, the instructions an editor writes, being taken out, leaving, a link to a chat.

const texts = sharing.en;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const PROJECT = '223e4567-e89b-12d3-a456-426614174001';
const OTHER = '323e4567-e89b-12d3-a456-426614174002';
const ME = 'me-id';
const MESSAGES = [
  { id: 'a', role: 'user', parts: [{ text: 'question' }], createdAt: '2026-11-06T00:00:00Z' },
  { id: 'b', role: 'model', parts: [{ text: 'answer one' }], createdAt: '2026-11-06T00:00:01Z' }
];
const chat = (id, authorId, title, updatedAt, messages = MESSAGES) => ({ id, authorId, authorName: authorId === ME ? 'Me' : 'Ada', title, updatedAt, createdAt: updatedAt, deleted: false, messages });
const SOURCE_TEXT = { id: 's-text', kind: 'text', title: 'Brief', mime: 'text/plain', size: 20, text: 'The brief says blue.', addedAt: 'x' };
const SOURCE_FILE = { id: 's-file', kind: 'file', title: 'plan.pdf', mime: 'application/pdf', size: 3000, file: { name: 'plan.pdf', mimeType: 'application/pdf', size: 3000, hash: 'a'.repeat(64) }, addedAt: 'x' };

const fakeRealtime = () => {
  const calls = { channel: [], removed: 0 };
  const handlers = [];
  const channel = { on: (type, filter, callback) => { handlers.push(callback); return channel; }, subscribe: (callback) => { calls.status = callback; return channel; } };
  const client = { realtime: { setAuth: async () => {} }, channel: (name) => { calls.channel.push(name); return channel; }, removeChannel: () => { calls.removed += 1; } };
  return { client, calls, ping: (c = 'x') => handlers.forEach((handler) => handler({ payload: { c } })), status: (value) => calls.status?.(value) };
};

function infoOf({ role = 'editor', sources = [SOURCE_TEXT], conversations = [chat('c-ada', 'o', 'Traffic', '2026-11-05T00:00:00Z')], extra = {} } = {}) {
  return { role, project: { name: 'City plan', icon: 'book', color: 'blue', instructions: 'Be brief.', sources, updated_at: 't1', ...extra }, owner: { id: 'o', name: 'Ada' }, conversations };
}

function setup({ info = infoOf(), local = [], client = {}, readerOver = {}, items = [], stored = {}, retryMs = 3000 } = {}) {
  const window = new Window();
  const document = window.document;
  for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, value);
  document.body.innerHTML = '<div id="root"></div>';
  announceUser(document, { supabaseUserId: ME, displayName: 'Me' });
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }) });
  const state = { info, notes: [], opened: [], saved: 0, left: [], refreshes: [], puts: [], written: [], uploads: [], reads: 0, loads: 0, gone: false, conversations: local, folders: [] };
  const rt = fakeRealtime();
  const reader = {
    load: async () => { state.loads += 1; return state.gone ? { ok: false, code: 'gone' } : { ok: true, project: state.info }; },
    refresh: async () => { state.reads += 1; return state.gone ? { ok: false, code: 'gone' } : { ok: true, changed: state.changed === true, project: state.info, removed: state.refresh?.removed || [] }; },
    info: async () => (state.gone ? { ok: false, code: 'gone' } : { ok: true, project: { role: state.info.role, project: state.info.project, owner: state.info.owner } }),
    conversation: async (id) => { const found = state.info.conversations.find((entry) => entry.id === id); return found ? { ok: true, chat: found } : { ok: false, code: 'gone' }; },
    asset: async () => 'AAA=',
    uploadData: async (args) => { state.uploads.push(args); return state.upload || { ok: true, data: { hash: 'b'.repeat(64), mimeType: args.mimeType, size: 4, asset: { __astraCloudAsset: { path: `o/${'b'.repeat(64)}` } } } }; },
    ...readerOver
  };
  const dataStore = { getConversations: () => state.conversations, getFolders: () => state.folders, replaceFolders: (next) => { state.folders = next; } };
  const api = startProjectSharing({
    document, window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, i18n: { en: texts }, dataStore,
    saveAppData: async () => { state.saved += 1; }, showNotification: (message, kind) => state.notes.push([message, kind]), renderSidebar: () => {}, openConversation: (id) => state.opened.push(id), supabase: rt.client,
    client: { sharedWithMe: async () => ({ ok: true, data: items }), mine: async () => ({ ok: true, data: state.owned || [] }), exits: async () => ({ ok: true, data: state.exits || [] }), leave: async (id) => { state.left.push(id); return { ok: true }; },
      keepConversations: async (id, member) => { state.kept = [...(state.kept || []), [id, member]]; return state.keepFails ? { ok: false, code: 'failed' } : { ok: true, data: {} }; },
      moveOut: async (id, conversation) => { state.movedOut = [...(state.movedOut || []), [id, conversation]]; return { ok: true }; },
      updateProject: async (id, args) => { state.written.push(args); return state.write ? state.write(args) : { ok: true, data: { updated_at: `t${state.written.length + 1}` } }; }, ...client },
    storage: window.localStorage, createReader: () => reader, pollMs: 40, retryMs, defaultsOf: async () => ({ model: 'm', provider: 'p', genConfig: {}, council: null }), renderMarkdown: (value) => `<p>${value}</p>`
  });
  const root = document.getElementById('root');
  const view = (projectId) => document.dispatchEvent(new window.CustomEvent('noureon:project-view', { detail: { projectId, root, refresh: (options) => state.refreshes.push(options) } }));
  const actions = createProjectActions({ dataStore, saveAppData: async () => {}, startNewChat: async () => { const conversation = { id: `new-${state.conversations.length}`, messages: [] }; state.conversations.push(conversation); state.current = conversation.id; }, getCurrentConversationId: () => state.current });
  return { window, document, root, state, rt, api, view, actions };
}

test('a shared project that the page shows is read and its folder, chats and count answer for the page; the page is told to draw it', async () => {
  const env = setup({ local: [{ id: 'mine-local', title: 'My question', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES, lastUpdatedAt: '2026-11-06T00:00:00Z' }, { id: 'empty', title: '', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: [] }] });
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o', ownerName: 'Ada' });
  env.view(PROJECT);
  await tick();
  const folder = env.actions.folderOf(PROJECT);
  assert.deepEqual([folder.name, folder.shared, folder.role, folder.instructions, folder.sources.map((entry) => entry.id)], ['City plan', true, 'editor', 'Be brief.', ['s-text']]);
  assert.deepEqual(env.actions.sourcesOf(PROJECT).map((entry) => entry.title), ['Brief']);
  const chats = env.actions.chatsOf(PROJECT);
  assert.deepEqual(chats.map((entry) => [entry.id, entry.mine]), [['mine-local', true], ['c-ada', false]], 'the person’s own first (newest), then the others’; an empty chat is not listed');
  assert.equal(env.actions.countOf(PROJECT), 2);
  assert.ok(env.state.refreshes.some((options) => options?.full === true));
  assert.equal(env.actions.folderOf('not-shared'), null);
});

test('what others write is drawn as it comes: the chats of the page when a conversation changed, all of it when the sources or instructions changed; the channel is left when the page shows another project', async () => {
  const env = setup();
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  env.state.refreshes.length = 0;
  env.state.changed = true;
  env.state.info = infoOf({ conversations: [chat('c-ada', 'o', 'Traffic', '2026-11-06T00:00:00Z'), chat('c-new', 'o', 'Parks', '2026-11-06T01:00:00Z')] });
  env.rt.status('SUBSCRIBED');
  env.rt.ping();
  await tick();
  assert.deepEqual(env.state.refreshes.at(-1), { full: false });
  assert.equal(env.actions.countOf(PROJECT), 2);
  env.state.info = infoOf({ sources: [SOURCE_TEXT, SOURCE_FILE], conversations: env.state.info.conversations });
  env.rt.ping();
  await tick();
  assert.deepEqual(env.state.refreshes.at(-1), { full: true, what: ['sources'] }, 'it is told what changed');
  assert.deepEqual(env.actions.sourcesOf(PROJECT).map((entry) => entry.id), ['s-text', 's-file']);
  env.view(OTHER);
  assert.equal(env.rt.calls.removed, 1, 'the channel of the project is left');
  const reads = env.state.reads;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(env.state.reads, reads, 'nothing is read any more');
});

test('an editor adds a text and a file and removes a source: the project is written with the time it was read at, the file goes to the server first', async () => {
  const env = setup();
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  const added = await env.actions.addSource(PROJECT, { kind: 'text', title: 'Deadline', mime: 'text/plain', size: 19, text: 'Deadline is Friday.' });
  assert.equal(added.ok, true);
  assert.equal(env.state.written[0].expected, 't1');
  assert.deepEqual(env.state.written[0].sources.map((source) => source.title), ['Brief', 'Deadline']);
  const { createProjectFileStore, createMemoryFileBackend, setProjectFileDeps } = await import('../src/app/runtime/projects/project-source-files.js');
  const store = createProjectFileStore({ backend: createMemoryFileBackend() });
  setProjectFileDeps({ store });
  const kept = await store.save(new env.window.File(['%PDF'], 'plan.pdf', { type: 'application/pdf' }));
  const withFile = await env.actions.addSource(PROJECT, { kind: 'file', title: 'plan.pdf', mime: 'application/pdf', size: 4, file: kept });
  assert.equal(withFile.ok, true);
  assert.equal(env.state.uploads.length, 1);
  assert.equal(env.state.written[1].expected, 't2', 'the next write carries the time the last one gave');
  const saved = env.state.written[1].sources.at(-1);
  assert.equal(saved.file.hash, 'b'.repeat(64), 'the source names the file as the server kept it');
  assert.equal(saved.file.asset.__astraCloudAsset.path, `o/${'b'.repeat(64)}`);
  const removed = await env.actions.removeSource(PROJECT, 's-text');
  assert.equal(removed.ok, true);
  assert.deepEqual(env.state.written[2].sources.map((source) => source.id).includes('s-text'), false);
  assert.deepEqual(await env.actions.removeSource(PROJECT, 'nope'), { ok: false, code: 'gone' });
  env.state.upload = { ok: false, code: 'too_big' };
  assert.deepEqual(await env.actions.addSource(PROJECT, { kind: 'file', title: 'plan.pdf', mime: 'application/pdf', size: 4, file: kept }), { ok: false, code: 'too_big' });
  setProjectFileDeps({ store: null });
});

test('a write that met a newer project reads it again and says so; one that is not allowed says that; the instructions are written the same way', async () => {
  const env = setup();
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  assert.deepEqual(await env.actions.update(PROJECT, { instructions: 'Answer in English.' }), { ok: true });
  assert.equal(env.state.written[0].instructions, 'Answer in English.');
  assert.equal(env.state.written[0].expected, 't1');
  assert.deepEqual(env.state.notes.at(-1), [texts.psInstructionsSaved, 'success']);
  assert.equal(env.actions.folderOf(PROJECT).instructions, 'Answer in English.');
  const loads = env.state.loads;
  env.state.write = () => ({ ok: false, code: 'stale' });
  assert.deepEqual(await env.actions.update(PROJECT, { instructions: 'x' }), { ok: false, code: 'stale' });
  assert.deepEqual(env.state.notes.at(-1), [texts.psStale, 'error']);
  assert.equal(env.state.loads, loads + 1);
  env.state.write = () => ({ ok: false, code: 'not_allowed' });
  assert.deepEqual(await env.actions.removeSource(PROJECT, 's-text'), { ok: false, code: 'not_allowed' });
  assert.deepEqual(env.state.notes.at(-1), [texts.psNotAllowed, 'error']);
  // an editor changes the name and the look too; anything else is not theirs to write
  env.state.write = null;
  assert.deepEqual(await env.actions.update(PROJECT, { name: 'New name', icon: 'book', color: 'green' }), { ok: true });
  assert.deepEqual(env.state.written.at(-1), { name: 'New name', icon: 'book', color: 'green', textColor: undefined, expected: env.state.written.at(-1).expected });
  assert.deepEqual(await env.actions.update(PROJECT, { pinned: true }), { ok: false, code: 'gone' }, 'only the instructions and the look are the person’s to write');
});

test('a person who was taken out of the project is told on the next read; the project is forgotten and the page is told to leave it', async () => {
  const env = setup();
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  const gone = [];
  env.document.addEventListener('noureon:project-gone', (event) => gone.push(event.detail.projectId));
  env.state.gone = true;
  env.rt.status('SUBSCRIBED');
  env.rt.ping();
  await tick(); await tick();
  assert.deepEqual(env.state.notes.at(-1), [texts.psSharedGone, 'error']);
  assert.deepEqual(gone, [PROJECT]);
  assert.equal(env.actions.folderOf(PROJECT), null);
  assert.equal(env.api.sharedFolders.list().length, 0);
  assert.equal(env.rt.calls.removed, 1);
});

test('a chat of someone else is read as a page and branched; one of the person’s own opens in the chat', async () => {
  const env = setup({ info: infoOf({ conversations: [chat('c-ada', 'o', 'Traffic', '2026-11-05T00:00:00Z')] }) });
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  env.document.dispatchEvent(new env.window.CustomEvent('noureon:shared-chat', { detail: { projectId: PROJECT, chat: { id: 'c-ada' }, root: env.root } }));
  await tick(); await tick();
  assert.match(env.root.textContent, /answer one/);
  env.root.querySelector('[data-branch-last]').click();
  await tick(); await tick();
  assert.equal(env.state.conversations.length, 1);
  assert.deepEqual(env.state.conversations[0].sharedProject, { id: PROJECT, ownerId: 'o' });
  assert.equal(env.state.conversations[0].title, 'Traffic (branch)');
  assert.deepEqual(env.state.opened, [env.state.conversations[0].id]);
  assert.ok(env.state.saved >= 1);
});

test('a new chat made in a shared project is linked to it by its `sharedProject`, not by a folder, and is saved to the cloud when something is sent', async () => {
  const env = setup();
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  const made = await env.actions.prepareChat(PROJECT);
  assert.equal(made.ok, true);
  const conversation = env.state.conversations.find((entry) => entry.id === made.conversationId);
  assert.deepEqual(conversation.sharedProject, { id: PROJECT, ownerId: 'o' });
  assert.equal(conversation.folderId, null);
  assert.equal(env.actions.chatsOf(PROJECT).some((entry) => entry.id === made.conversationId), false, 'an empty chat is not listed');
  const saved = env.state.saved;
  env.actions.sentChat(made.conversationId);
  await tick();
  assert.equal(env.state.saved, saved + 1);
  // not used: given up, it is no longer linked
  const spare = await env.actions.prepareChat(PROJECT);
  assert.equal(env.actions.abandonChat(spare.conversationId), true);
  assert.equal(env.state.conversations.find((entry) => entry.id === spare.conversationId).sharedProject, undefined);
  // a chat of the person's own taken out of the project loses the link only
  conversation.messages = [{ id: 'm', role: 'user', parts: [{ text: 'hi' }] }];
  assert.deepEqual(await env.actions.removeChat(made.conversationId), { ok: true });
  assert.equal(conversation.sharedProject, undefined);
});

test('leaving asks first: the project keeps a copy of what the person made, they may move it into a project of their own, and what is left is a plain conversation again', async () => {
  const mine = { id: 'a1', title: 'Mine', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES, model: 'm', provider: 'p' };
  const stays = { id: 'a5', title: 'Stays', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES, model: 'm', provider: 'p' };
  const env = setup({ info: infoOf({ role: 'chat', conversations: [chat('a1', ME, 'Mine', '2026-11-05T00:00:00Z')] }), local: [mine, stays] });
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
  env.view(PROJECT);
  await tick();
  let left = 0;
  env.document.dispatchEvent(new env.window.CustomEvent('noureon:project-leave', { detail: { projectId: PROJECT, root: env.root, onLeft: () => { left += 1; } } }));
  await tick(); await tick();
  assert.match(env.root.textContent, /Make my own project/);
  assert.equal(env.root.querySelector('#psh-own-name').value, 'City plan (my copy)');
  assert.equal(env.root.querySelector('.psh-choice[data-keep="true"]').getAttribute('aria-pressed'), 'true');
  env.root.querySelector('[data-leave-go]').click();
  await tick(); await tick();
  assert.deepEqual(env.state.kept, [[PROJECT, '']], 'the project is asked to keep a copy first');
  assert.deepEqual(env.state.left, [PROJECT]);
  assert.equal(left, 1);
  assert.equal(env.state.folders.length, 1);
  assert.equal(env.state.folders[0].name, 'City plan (my copy)');
  // nothing was copied or deleted here: the same two conversations, now plain ones (the own project holds them, since the person chose that)
  assert.equal(env.state.conversations.length, 2);
  assert.ok(env.state.conversations.every((conversation) => !conversation.sharedProject));
  assert.deepEqual(env.state.conversations.map((conversation) => conversation.folderId), [env.state.folders[0].id, env.state.folders[0].id]);
  assert.equal(env.actions.folderOf(PROJECT), null);
  assert.deepEqual(env.state.notes.at(-1), [texts.psLeaveOwnDone.replace('{name}', 'City plan (my copy)'), 'success']);
});

test('leaving without a project of one’s own gives the conversations back as plain ones; the person may choose not to leave a copy, and when the copy cannot be made they are asked', async () => {
  const make = () => setup({ info: infoOf({ role: 'chat', conversations: [chat('a1', ME, 'Mine', '2026-11-05T00:00:00Z')] }), local: [{ id: 'a1', title: 'Mine', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES, model: 'm', provider: 'p' }] });
  const leave = async (env, choose) => {
    env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
    env.view(PROJECT);
    await tick();
    env.document.dispatchEvent(new env.window.CustomEvent('noureon:project-leave', { detail: { projectId: PROJECT, root: env.root, onLeft: () => {} } }));
    await tick(); await tick();
    choose(env.root);
    env.root.querySelector('[data-leave-go]').click();
    await tick(); await tick();
  };
  // not keeping a copy and no project of one’s own: nothing is asked of the server, the conversation is plain again
  const first = make();
  await leave(first, (root) => { root.querySelector('.psh-choice[data-keep="false"]').click(); root.querySelector('[data-leave-own]').click(); });
  assert.equal(first.state.kept, undefined);
  assert.deepEqual(first.state.left, [PROJECT]);
  assert.equal(first.state.folders.length, 0);
  assert.equal(first.state.conversations[0].sharedProject, undefined);
  assert.equal(first.state.conversations[0].folderId, undefined);
  assert.deepEqual(first.state.notes.at(-1), [texts.psLeft.replace('{name}', 'City plan'), 'success']);
  // the copy cannot be made: the person is asked; going without it leaves
  const second = make();
  second.state.keepFails = true;
  await leave(second, (root) => { root.querySelector('[data-leave-own]').click(); });
  assert.deepEqual(second.state.left, [], 'asked first, not left yet');
  second.root.querySelector('[data-keep-skip]').click();
  await tick(); await tick();
  assert.deepEqual(second.state.left, [PROJECT]);
  // stopping at the question keeps the person in
  const third = make();
  third.state.keepFails = true;
  await leave(third, (root) => { root.querySelector('[data-leave-own]').click(); });
  const heads = third.root.querySelectorAll('.pj-sheet-head .pj-round');
  heads[heads.length - 1].click();
  await tick(); await tick();
  assert.deepEqual(third.state.left, []);
  assert.equal(third.state.conversations[0].sharedProject.id, PROJECT);
});

test('the owner of a shared project reads it too: the chats of the others come with the page, the owner takes one out of the project (and cannot do more), and a member forgets the link of a chat that was taken out', async () => {
  const ADA = 'ada-owner';
  const rows = [chat('theirs', 'bob', 'By Bob', '2026-11-05T00:00:00Z'), chat('owners', ME, 'By me', '2026-11-05T00:00:00Z')];
  const env = setup({ info: infoOf({ role: 'owner', conversations: rows }), local: [] });
  env.state.owned = [{ project_id: PROJECT }];
  await env.api.refreshShared();
  assert.equal(env.api.sharedFolders.isOwned(PROJECT), true);
  env.view(PROJECT);
  await tick(); await tick();
  assert.equal(env.api.sharedFolders.has(PROJECT), false, 'the project stays the owner’s own folder');
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), ['theirs']);
  assert.equal(env.actions.canModerate(PROJECT), true);
  assert.equal(env.actions.canModerate('not-owned'), false);
  assert.deepEqual(await env.actions.moveChatOut('not-owned', 'theirs'), { ok: false, code: 'not_allowed' });
  assert.deepEqual(await env.actions.moveChatOut(PROJECT, 'theirs'), { ok: true });
  assert.deepEqual(env.state.movedOut, [[PROJECT, 'theirs']]);
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), []);
  void ADA;
});

test('a conversation of the person that the owner took out of the project is let go of by their page: when told so by the read, and when the page starts', async () => {
  const kept = { id: 'k1', title: 'Kept', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES };
  const goes = { id: 'g1', title: 'Goes', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES };
  const away = { id: 'g2', title: 'Went while away', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES };
  const env = setup({ info: infoOf({ role: 'chat', conversations: [chat('k1', ME, 'Kept', '2026-11-05T00:00:00Z'), chat('g1', ME, 'Goes', '2026-11-05T00:00:00Z')] }), local: [kept, goes, away] });
  env.state.exits = [{ project_id: PROJECT, conversation_id: 'g2' }];
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'chat', ownerId: 'o' });
  await env.api.refreshShared();
  assert.equal(away.sharedProject, undefined, 'told by the list of the exits when the page starts');
  assert.ok(kept.sharedProject && goes.sharedProject);
  env.view(PROJECT);
  await tick();
  env.state.changed = true;
  env.state.refresh = { removed: ['g1'] };
  env.state.info = infoOf({ role: 'chat', conversations: [chat('k1', ME, 'Kept', '2026-11-05T00:00:00Z')] });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(goes.sharedProject, undefined, 'told as gone by the read');
  assert.ok(kept.sharedProject);
});

test('opening a shared project asks the page of the projects to show it; a link to one chat opens it: someone else’s as a page, one’s own in the chat; a person who is not in the project is told', async () => {
  const env = setup({ info: infoOf({ role: 'chat', conversations: [chat('c-ada', 'o', 'Traffic', '2026-11-05T00:00:00Z'), chat('mine', ME, 'Mine', '2026-11-05T00:00:00Z')] }), local: [{ id: 'mine', title: 'Mine', messages: MESSAGES, sharedProject: { id: PROJECT, ownerId: 'o' } }] });
  const asked = [];
  env.document.addEventListener('noureon:open-project', (event) => asked.push(event.detail.id));
  const session = await env.api.openShared({ project_id: PROJECT, root: env.root, openChatId: 'c-ada' });
  assert.ok(session);
  assert.deepEqual(asked, [PROJECT]);
  assert.match(env.root.textContent, /answer one/);
  await env.api.openShared({ project_id: PROJECT, root: env.root, openChatId: 'mine' });
  assert.deepEqual(env.state.opened, ['mine']);
  await env.api.openShared({ project_id: PROJECT, root: env.root, openChatId: 'missing' });
  assert.deepEqual(env.state.notes.at(-1), [texts.psSharedGone, 'error']);
  const out = setup();
  out.state.gone = true;
  assert.equal(await out.api.openShared({ project_id: PROJECT, root: out.root, notMemberText: 'psChatLinkNotMember' }), null);
  assert.deepEqual(out.state.notes.at(-1), [texts.psChatLinkNotMember, 'error']);
});

test('the list "Shared with you" puts the projects where the page can show them, and a row opens the project in the page itself', async () => {
  const items = [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', icon: 'book', color: 'blue', owner_name: 'Ada', role: 'chat' }];
  const env = setup({ items });
  const box = env.document.createElement('div');
  env.root.appendChild(box);
  const opened = [];
  await env.api.drawSharedList({ box, root: env.root, go: (id) => opened.push(id) });
  assert.equal(box.querySelectorAll('[data-project-id]').length, 1);
  assert.equal(env.actions.folderOf(PROJECT).name, 'City plan');
  assert.equal(env.actions.folderOf(PROJECT).role, 'chat');
  box.querySelector('[data-project-id]').click();
  assert.deepEqual(opened, [PROJECT]);
});

test('the own project of a person that is shared hears its people: when something about it changes the cloud is asked for it and the page is drawn again', async () => {
  const env = setup();
  const retried = [];
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }), retry: async () => { retried.push(1); } });
  env.api.sharedFolders.setOwned(['own-project']);
  env.view('own-project');
  await tick();
  assert.deepEqual(env.rt.calls.channel, ['project:own-project']);
  env.state.refreshes.length = 0;
  env.rt.ping('some-conversation');
  await tick();
  assert.deepEqual(retried, [], 'a message of a conversation is not the owner’s to pull');
  env.rt.ping(null);
  await tick(); await tick();
  assert.deepEqual(retried, [1]);
  assert.deepEqual(env.state.refreshes.at(-1), { full: true });
  void setSharedProjectHook; void PENDING_CHAT_KEY;
});

test('a project that the page reads again when it starts keeps its owner, so a chat made at once is linked to it with the owner in the link', async () => {
  const env = setup({ items: [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'editor' }] });
  await env.api.refreshShared();
  assert.equal(env.api.sharedFolders.ownerOf(PROJECT), 'o');
  const made = await env.actions.prepareChat(PROJECT);
  assert.equal(made.ok, true);
  assert.deepEqual(env.state.conversations.find((conversation) => conversation.id === made.conversationId).sharedProject, { id: PROJECT, ownerId: 'o' });
});

test('an owner who opens the project before the page has learned that it is shared still gets the chats of the others once it knows', async () => {
  const env = setup({ info: infoOf({ role: 'owner', conversations: [chat('theirs', 'bob', 'By Bob', '2026-11-05T00:00:00Z')] }) });
  env.state.owned = [{ project_id: PROJECT }];
  env.view(PROJECT);
  await tick();
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), [], 'not known to be shared yet');
  await env.api.refreshShared();
  await tick(); await tick();
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), ['theirs']);
});

test('a project of the list "Shared with you" is counted from the list, and its chats are read in the background so that opening it does not wait', async () => {
  let open = () => {};
  const gate = new Promise((resolve) => { open = resolve; });
  const env = setup({ items: [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'chat', owner_name: 'Ada', chat_count: 4 }], readerOver: { load: async () => { await gate; return { ok: true, project: infoOf({ role: 'chat' }) }; } } });
  let told = 0;
  await env.api.drawSharedList({ box: null, done: () => { told += 1; } });
  assert.equal(told, 1);
  assert.equal(env.actions.countOf(PROJECT), 4, 'from the list');
  assert.equal(env.actions.chatsLoading(PROJECT), true, 'the chats are on their way');
  open();
  await tick(); await tick();
  assert.equal(env.actions.chatsLoading(PROJECT), false);
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), ['c-ada']);
  assert.equal(env.actions.countOf(PROJECT), 1, 'the real count once the chats are here');
  // asked again at once (a letter typed in the search): the server is not asked again, the page is only told
  await env.api.drawSharedList({ box: null, done: () => { told += 1; } });
  assert.equal(told, 2);
});

test('the real reader, the real list and the real actions together: an editor who has a chat of their own sees the chats of the owner and the right count, before and after the project is opened', async () => {
  const { createSharedProjectReader } = await import('../src/app/runtime/project-sharing/project-reader-client.js');
  const rows = [chat('o1', 'o', 'Owner one', '2026-11-04T06:46:51Z'), chat('o2', 'o', 'Owner two', '2026-11-04T06:46:51Z'), chat('o3', 'o', 'Owner three', '2026-11-04T06:46:51Z'), chat('mine', ME, 'Mine', '2026-11-06T17:56:19Z')];
  const payload = { role: 'editor', sharedAt: '2026-11-06T00:00:00Z', project: { id: PROJECT, name: 'City plan', icon: 'globe', color: 'blue', instructions: '', sources: [], updated_at: 't1' }, owner: { id: 'o', name: 'Ada' }, conversations: rows, hasMore: false, next: '2026-11-06T17:56:19Z' };
  const asked = [];
  const request = async (method, path, options) => { asked.push([path, options?.body]); return { ok: true, status: 200, data: path.endsWith('/read') ? payload : {} }; };
  const items = [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'editor', owner_name: 'Ada', chat_count: 4, icon: 'globe', color: 'blue' }];
  const env = setup({ items, local: [{ id: 'mine', title: 'Mine', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: MESSAGES, lastUpdatedAt: '2026-11-06T17:56:19Z' }] });
  const api = startProjectSharing({
    document: env.document, window: env.window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, i18n: { en: texts }, dataStore: { getConversations: () => env.state.conversations, getFolders: () => [], replaceFolders: () => {} },
    saveAppData: async () => {}, showNotification: () => {}, renderSidebar: () => {}, supabase: env.rt.client, client: { sharedWithMe: async () => ({ ok: true, data: items }), mine: async () => ({ ok: true, data: [] }), exits: async () => ({ ok: true, data: [] }) },
    storage: env.window.localStorage, createReader: ({ projectId }) => createSharedProjectReader({ projectId, request }), pollMs: 40
  });
  const actions = createProjectActions({ dataStore: { getConversations: () => env.state.conversations, getFolders: () => [], replaceFolders: () => {} }, saveAppData: async () => {}, startNewChat: async () => {}, getCurrentConversationId: () => '', renderSidebar: () => {}, randomUUID: () => 'x', deleteFolderFromCloud: async () => {}, deferConversationFolderSync: () => {}, getDefaultFolder: () => null });
  await api.drawSharedList({ box: null, done: () => {} });
  await tick(); await tick();
  assert.equal(actions.countOf(PROJECT), 4, 'in the list, after the chats were read in the background');
  assert.deepEqual(actions.chatsOf(PROJECT).map((row) => row.id).sort(), ['mine', 'o1', 'o2', 'o3']);
  env.document.dispatchEvent(new env.window.CustomEvent('noureon:project-view', { detail: { projectId: PROJECT, root: env.root, refresh: () => {} } }));
  await tick(); await tick();
  assert.equal(actions.countOf(PROJECT), 4, 'after the project is opened');
  assert.deepEqual(actions.chatsOf(PROJECT).map((row) => row.id).sort(), ['mine', 'o1', 'o2', 'o3']);
  env.document.dispatchEvent(new env.window.CustomEvent('noureon:project-view', { detail: { projectId: null } }));
  await tick();
  assert.equal(actions.countOf(PROJECT), 4, 'back in the list');
});

test('a person who opens a shared project before the cloud account is ready gets its chats as soon as it is, without leaving the project', async () => {
  const env = setup({ items: [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'editor', owner_name: 'Ada', chat_count: 1 }] });
  let ready = false;
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: ready }), retry: async () => {} });
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o', chatCount: 0 });
  env.view(PROJECT);
  await tick();
  assert.equal(env.actions.chatsLoading(PROJECT), true, 'nothing was read: the cloud is not ready');
  ready = true;
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal(env.actions.chatsLoading(PROJECT), false);
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), ['c-ada']);
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }) });
});

const kept = (env) => Object.fromEntries(['noureon:shared-project-folders', 'noureon:shared-project-snapshots'].map((key) => [key, env.window.localStorage.getItem(key)]).filter(([, value]) => value));

test('a shared project that was read before opens at once the next time, with its chats, its files and its count, while the server is asked again', async () => {
  const first = setup({ local: [], info: infoOf({ sources: [SOURCE_TEXT, SOURCE_FILE], conversations: [chat('c-ada', 'o', 'Traffic', '2026-11-05T00:00:00Z'), chat('c-two', 'o', 'Parks', '2026-11-04T00:00:00Z')] }) });
  first.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o', ownerName: 'Ada' });
  first.view(PROJECT);
  await tick();
  const stored = kept(first);
  assert.ok(stored['noureon:shared-project-snapshots'], 'what was read is kept');
  // (a new page: the server has not answered yet)
  const next = setup({ stored, readerOver: { load: () => new Promise(() => {}) } });
  next.view(PROJECT);
  await tick();
  assert.equal(next.actions.chatsLoading(PROJECT), false, 'nothing to wait for: the kept chats are drawn');
  assert.deepEqual(next.actions.chatsOf(PROJECT).map((row) => row.id), ['c-ada', 'c-two']);
  assert.equal(next.actions.countOf(PROJECT), 2);
  assert.deepEqual(next.actions.sourcesOf(PROJECT).map((source) => source.id), ['s-text', 's-file'], 'the files are listed');
  assert.ok(next.actions.chatsOf(PROJECT)[0].messages.length > 0, 'the line has its last words');
  // another person of the same browser gets none of it
  const other = setup({ stored });
  announceUser(other.document, { supabaseUserId: 'someone-else', displayName: 'X' });
  assert.deepEqual(other.actions.chatsOf(PROJECT).map((row) => row.id), [], 'the chats of the person before are not drawn');
  assert.deepEqual(other.actions.sourcesOf(PROJECT), [], 'nor their files');
  assert.equal(other.actions.chatsLoading(PROJECT), true);
});

test('a read that fails is asked again while the project is shown, and the person is not left with "loading"', async () => {
  let attempts = 0;
  const env = setup({ retryMs: 30, readerOver: { load: async () => { attempts += 1; return attempts < 3 ? { ok: false, code: 'generic' } : { ok: true, project: infoOf() }; } } });
  env.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o', chatCount: 4 });
  env.view(PROJECT);
  await tick();
  assert.equal(env.actions.chatsLoading(PROJECT), false, 'a failure shows what is known, not an endless wait');
  assert.equal(env.actions.countOf(PROJECT), 4, 'and the number from the list, not 0');
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(attempts >= 3);
  assert.deepEqual(env.actions.chatsOf(PROJECT).map((row) => row.id), ['c-ada']);
  assert.equal(env.state.notes.filter(([message]) => message === texts.psSharedLoadFailed).length, 1, 'the person is told once');
});

test('the shared projects are read when the cloud account and the person are both known, not given up when the person is not known yet', async () => {
  const env = setup({ retryMs: 20, items: [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'editor', owner_name: 'Ada', chat_count: 4 }] });
  announceUser(env.document, null);
  void env.api.refreshShared();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(env.api.sharedFolders.has(PROJECT), false, 'nobody is signed in yet');
  announceUser(env.document, { supabaseUserId: ME, displayName: 'Me' });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(env.api.sharedFolders.has(PROJECT), true);
  assert.equal(env.actions.countOf(PROJECT), 1, 'its chats were read at once and are counted as they are');
  assert.equal(env.actions.chatsLoading(PROJECT), false);
});

test('a chat that is only a line kept from the last time is read as it is now, and opened', async () => {
  const first = setup();
  first.api.sharedFolders.set({ id: PROJECT, name: 'City plan', role: 'editor', ownerId: 'o', ownerName: 'Ada' });
  first.view(PROJECT);
  await tick();
  const next = setup({ stored: kept(first), readerOver: { load: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, project: infoOf() }), 40)) } });
  next.view(PROJECT);
  await tick();
  const row = next.actions.chatsOf(PROJECT)[0];
  next.document.dispatchEvent(new next.window.CustomEvent('noureon:shared-chat', { detail: { projectId: PROJECT, chat: row, root: next.root } }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(next.root.querySelector('.psh-viewer'), 'the chat is open');
});

test('the button of the people in the head of a project is kept: a new head has it at once, an answer that says the same people draws nothing, and there is one live channel for the project', async () => {
  let calls = 0;
  const members = [{ user_id: 'o', name: 'Ada', avatar_version: 0 }, { user_id: ME, name: 'Me', avatar_version: 0 }];
  const env = setup({ client: { members: async () => { calls += 1; return { ok: true, data: { members } }; } } });
  const send = (slot) => env.document.dispatchEvent(new env.window.CustomEvent('noureon:project-members-slot', { detail: { projectId: PROJECT, slot, root: env.root } }));
  const slot = env.document.createElement('span');
  env.root.appendChild(slot);
  send(slot);
  await tick(); await tick();
  const button = slot.querySelector('.psh-stack');
  assert.ok(button, 'the button is drawn');
  // the same people asked again (the database pinged about the project): the same button stays
  env.rt.ping(null);
  await tick(); await tick();
  assert.ok(calls >= 2);
  assert.equal(slot.querySelector('.psh-stack'), button, 'nothing is drawn again for the same people');
  // the head is drawn again (a new box): the button is there before anything is asked
  const next = env.document.createElement('span');
  env.root.appendChild(next);
  send(next);
  assert.ok(next.querySelector('.psh-stack'), 'at once');
  assert.equal(env.rt.calls.removed, 1, 'the channel of the head before is left');
  // somebody joined: it is drawn again
  members.push({ user_id: 'x', name: 'Bo', avatar_version: 0 });
  env.rt.ping(null);
  await tick(); await tick();
  assert.equal(next.querySelector('.psh-stack-count').textContent, '3');
});
