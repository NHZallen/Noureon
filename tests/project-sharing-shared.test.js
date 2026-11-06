import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSharedProjectReader, readSharedProject } from '../src/app/runtime/project-sharing/project-reader-client.js';
import { branchFromMirror, newSharedConversation } from '../src/app/runtime/project-sharing/branch-from-mirror.js';
import { startProjectSharing } from '../src/app/runtime/project-sharing/start-project-sharing.js';
import { announceUser } from '../src/app/runtime/features/user-ready.js';
import { provideService, SERVICES } from '../src/app/runtime/services.js';
import { openProjectConversation } from '../src/app/ui/projects/project-conversation-viewer.js';
import { memoryScopeOf, projectIdOf, projectInstructionTextFor } from '../src/app/runtime/projects/project-instructions.js';
import { PENDING_CHAT_KEY, chatLinkOf, chatLinkUrl, isChatLinkRoute, readPendingChatLink } from '../src/app/runtime/project-sharing/join-route.js';
import { createSharedFolders } from '../src/app/runtime/project-sharing/shared-folders.js';
import sharing from '../src/data/i18n/parts/project-sharing.js';

// A member reads a shared project: the pages of the server are put together, the conversations of the others are read as a page, a branch is a conversation of the reader in the project (the words only),
// a new conversation is made in it, and the list "Shared with you" is drawn into the page of the projects.

const texts = sharing.en;
const text = (key, values = {}) => String(texts[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const PROJECT = '223e4567-e89b-12d3-a456-426614174001';
const ME = 'me-id';

const chat = (id, authorId, title, updatedAt, messages = []) => ({ id, authorId, authorName: authorId === ME ? 'Me' : 'Ada', title, updatedAt, deleted: false, messages });
const MESSAGES = [
  { id: 'a', role: 'user', parts: [{ text: 'question' }, { inlineData: { mimeType: 'image/png', data: { __astraCloudAsset: { path: 'x/y' } } } }], createdAt: '2026-11-06T00:00:00Z' },
  { id: 'b', role: 'model', parts: [{ text: 'answer one' }], createdAt: '2026-11-06T00:00:01Z', metadata: { memoryUsed: ['n'] } },
  { id: 'c', role: 'user', parts: [{ text: 'more' }], createdAt: '2026-11-06T00:00:02Z' },
  { id: 'd', role: 'model', parts: [{ text: 'answer two' }], createdAt: '2026-11-06T00:00:03Z' }
];

test('the pages of the server are put together, the newest conversation first, a deleted one dropped', async () => {
  const pages = [
    { role: 'chat', sharedAt: 's', project: { name: 'P' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'One', '2026-11-01T00:00:00Z'), chat('c2', 'o', 'Two', '2026-11-02T00:00:00Z')], hasMore: true, next: '2026-11-02T00:00:00Z' },
    { conversations: [{ ...chat('c1', 'o', 'One', '2026-11-03T00:00:00Z'), deleted: true }, chat('c3', 'b', 'Three', '2026-11-04T00:00:00Z')], hasMore: false, next: '2026-11-04T00:00:00Z' }
  ];
  const sent = [];
  const result = await readSharedProject({ projectId: PROJECT, request: async (method, path, { body }) => { sent.push([method, path, JSON.parse(body)]); return { ok: true, status: 200, data: pages[sent.length - 1] }; } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.project.conversations.map((entry) => entry.id), ['c3', 'c2']);
  assert.equal(result.project.role, 'chat');
  assert.deepEqual(sent, [['POST', `/v1/projects/${PROJECT}/read`, {}], ['POST', `/v1/projects/${PROJECT}/read`, { since: '2026-11-02T00:00:00Z' }]]);
  assert.deepEqual(await readSharedProject({ projectId: PROJECT, request: async () => ({ ok: false, status: 404 }) }), { ok: false, code: 'gone' });
  assert.deepEqual(await readSharedProject({ projectId: PROJECT, request: async () => ({ ok: false, status: 401 }) }), { ok: false, code: 'sign_in' });
  assert.deepEqual(await readSharedProject({ projectId: PROJECT, request: async () => { throw new Error('down'); } }), { ok: false, code: 'generic' });
});

test('a branch of someone else’s conversation is the reader’s own, in the same project, with the words only', () => {
  const defaults = { model: 'm', provider: 'p', genConfig: { t: 1 }, council: null };
  const branch = branchFromMirror({ chat: chat('c1', 'o', 'Plan', 'x', MESSAGES), messageIndex: 1, shared: { id: PROJECT, ownerId: 'o' }, title: 'Plan (branch)', defaults });
  assert.equal(branch.title, 'Plan (branch)');
  assert.deepEqual(branch.messages.map((message) => message.parts.map((part) => part.text)), [['question'], ['answer one']]);
  assert.deepEqual(branch.sharedProject, { id: PROJECT, ownerId: 'o' });
  assert.equal(branch.folderId, null);
  assert.equal(branch.branchedFrom.conversationId, 'c1');
  assert.equal(branch.branchedFrom.by, 'Ada');
  assert.equal(branch.model, 'm');
  assert.equal(branchFromMirror({ chat: chat('c1', 'o', 'Plan', 'x', MESSAGES), messageIndex: 0, shared: { id: PROJECT, ownerId: 'o' }, title: 't', defaults }), null);
  const blank = newSharedConversation({ shared: { id: PROJECT, ownerId: 'o' }, defaults, uuid: () => 'new', now: () => 'now' });
  assert.deepEqual([blank.id, blank.messages.length, blank.sharedProject.id, blank.model], ['new', 0, PROJECT, 'm']);
});

const page = () => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<div id="root"></div>';
  return { window, document, root: document.getElementById('root') };
};


test('the conversation of someone else is read as a page; the button under a reply and the one at the foot branch it', async () => {
  const { window, document, root } = page();
  const asked = [];
  openProjectConversation({ document, root, text, texts: {}, language: 'en', chat: chat('c1', 'o', 'Traffic', 'x', MESSAGES), renderMarkdown: (value) => `<p>${value}</p>`, onBranch: (index) => asked.push(index) });
  assert.match(root.textContent, /This is Ada’s conversation/);
  assert.equal(root.querySelector('textarea, input[type="text"]'), null);
  assert.equal(root.querySelectorAll('.branch-message-btn').length, 2);
  root.querySelectorAll('.branch-message-btn')[0].click();
  assert.deepEqual(asked, [{ id: 'b', index: 1 }]);
  const again = page();
  openProjectConversation({ document: again.document, root: again.root, text, texts: {}, language: 'en', chat: chat('c1', 'o', 'Traffic', 'x', MESSAGES), renderMarkdown: (value) => `<p>${value}</p>`, onBranch: (index) => asked.push(index) });
  again.root.querySelector('[data-branch-last]').click();
  assert.deepEqual(asked, [{ id: 'b', index: 1 }, { last: true }]);
  const none = page();
  openProjectConversation({ document: none.document, root: none.root, text, texts: {}, language: 'en', chat: chat('c1', 'o', 'Traffic', 'x', MESSAGES), renderMarkdown: (value) => value, canBranch: false, onBranch: (index) => asked.push(index) });
  assert.equal(none.root.querySelector('.branch-message-btn'), null);
  assert.equal(none.root.querySelector('[data-branch-last]'), null);
  assert.ok(window);
});

// A reader that stands in for the server: `read` is what load() gives (or a function of the call); `live` is changed by a test to say what refresh() and conversation() give next.
const readerOf = (read, live = {}) => ({
  load: async () => (typeof read === 'function' ? read() : read),
  refresh: async () => (live.refresh ? live.refresh() : { ok: true, changed: false, project: (typeof read === 'function' ? await read() : read).project }),
  conversation: async (id) => (live.conversation ? live.conversation(id) : { ok: false, code: 'gone' }),
  info: async () => { const answer = typeof read === 'function' ? await read() : read; return answer.ok ? { ok: true, project: { role: answer.project.role, project: answer.project.project, owner: answer.project.owner } } : answer; }
});

const started = ({ read, conversations = [], items = [], live = {}, copyText = null } = {}) => {
  const { window, document, root } = page();
  announceUser(document, { supabaseUserId: ME, displayName: 'Me' });
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }) });
  const events = { notes: [], opened: [], saved: 0, left: [] };
  const api = startProjectSharing({
    document, window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, i18n: { en: texts }, dataStore: { getConversations: () => conversations, getFolders: () => [] },
    saveAppData: async () => { events.saved += 1; }, showNotification: (message, kind) => events.notes.push([message, kind]), renderSidebar: () => {}, openConversation: (id) => events.opened.push(id),
    client: { sharedWithMe: async () => ({ ok: true, data: items }), invite: async () => ({ ok: false }), leave: async (id) => { events.left.push(id); return { ok: true }; } }, storage: window.localStorage, createReader: () => readerOf(read, live), pollMs: 40, copyText, defaultsOf: async () => ({ model: 'm', provider: 'p', genConfig: {}, council: null }), renderMarkdown: (value) => `<p>${value}</p>`
  });
  return { api, document, root, events, conversations };
};



test('a conversation made in a shared project is answered with the instructions of the project and the memory of the project only', async () => {
  const read = async () => ({ ok: true, project: { role: 'chat', project: { name: 'City plan', instructions: 'Answer like a planner.' }, owner: { id: 'o', name: 'Ada' }, conversations: [] } });
  const env = started({ read });
  const inShared = { id: 'k1', sharedProject: { id: PROJECT, ownerId: 'o' }, folderId: null };
  assert.equal(projectInstructionTextFor(inShared), '');
  assert.equal(memoryScopeOf(inShared), '');
  await env.api.openShared({ project_id: PROJECT, root: env.root });
  assert.match(projectInstructionTextFor(inShared), /Answer like a planner\./);
  assert.match(projectInstructionTextFor(inShared), /City plan/);
  assert.equal(memoryScopeOf(inShared), PROJECT);
  assert.equal(projectIdOf(inShared), PROJECT);
  // a plain conversation and a temporary or deleted one of the shared project are not in it
  assert.equal(memoryScopeOf({ id: 'k2' }), '');
  assert.equal(memoryScopeOf({ ...inShared, retentionMode: 'ephemeral' }), '');
  assert.equal(memoryScopeOf({ ...inShared, deletedAt: 'x' }), '');
});

test('the shared projects are kept in the browser between visits', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const first = createSharedFolders({ storage });
  first.set({ id: 'p1', name: 'N'.repeat(200), instructions: 'x'.repeat(9000) });
  const again = createSharedFolders({ storage });
  assert.equal(again.list().length, 1);
  assert.equal(again.list()[0].name.length, 80);
  assert.equal(again.list()[0].instructions.length, 8000);
  assert.equal(again.list()[0].memoryScope, 'project');
  again.forget('p1');
  assert.equal(createSharedFolders({ storage }).list().length, 0);
  assert.equal(first.set({ name: 'no id' }).id, '');
  assert.equal(first.list().length, 1);
});



test('the reader reads all of a project, then only what changed; a conversation can be read alone', async () => {
  const sent = [];
  const answers = [
    { role: 'chat', sharedAt: 's', project: { name: 'P', instructions: 'one' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'One', '2026-11-01T00:00:00Z', MESSAGES)], hasMore: false, next: '2026-11-01T00:00:00Z' },
    { role: 'chat', sharedAt: 's', project: { name: 'P', instructions: 'one' }, owner: { id: 'o', name: 'Ada' }, conversations: [], hasMore: false, next: '2026-11-01T00:00:00Z' },
    { role: 'chat', sharedAt: 's', project: { name: 'P', instructions: 'two' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'One', '2026-11-02T00:00:00Z', [...MESSAGES, { id: 'e', role: 'user', parts: [{ text: 'newer' }] }])], hasMore: false, next: '2026-11-02T00:00:00Z' },
    { role: 'chat', sharedAt: 's', project: { name: 'P' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'One', '2026-11-02T00:00:00Z', MESSAGES)], hasMore: false, next: '2026-11-02T00:00:00Z' }
  ];
  const reader = createSharedProjectReader({ projectId: PROJECT, request: async (method, path, { body }) => { sent.push(JSON.parse(body)); return { ok: true, status: 200, data: answers[sent.length - 1] }; } });
  const loaded = await reader.load();
  assert.equal(loaded.project.conversations.length, 1);
  assert.deepEqual(sent[0], {});
  const quiet = await reader.refresh();
  assert.equal(quiet.changed, false);
  assert.deepEqual(sent[1], { since: '2026-11-01T00:00:00Z' });
  const busy = await reader.refresh();
  assert.equal(busy.changed, true);
  assert.equal(busy.project.conversations[0].messages.length, 5);
  assert.equal(busy.project.project.instructions, 'two');
  assert.deepEqual(sent[2], { since: '2026-11-01T00:00:00Z' });
  const alone = await reader.conversation('c1');
  assert.equal(alone.ok, true);
  assert.deepEqual(sent[3], { conversationId: 'c1' });
  assert.equal((await createSharedProjectReader({ projectId: PROJECT, request: async () => ({ ok: true, status: 200, data: { ...answers[1], conversations: [] } }) }).conversation('c1')).code, 'gone');
});



// ---------- the content of a shared project in the replies, editing, leaving into a project of one's own

import { ownProjectFrom } from '../src/app/runtime/project-sharing/own-project.js';

test('the instructions and the sources reach the replies of a conversation made in the project, and they are read again when the page starts', async () => {
  const items = [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', role: 'chat' }];
  const env = started({ read: async () => ({ ok: false }), items, live: {} });
  // the reader of the page gives the project only (no conversation) when it is asked for that
  const reader = { info: async () => ({ ok: true, project: { role: 'chat', project: { name: 'City plan', instructions: 'Rules.', sources: [{ id: 's1', kind: 'text', title: 'Brief', text: 'The brief says blue.', addedAt: 'x' }] }, owner: { id: 'o', name: 'Ada' } } }) };
  const again = startProjectSharing({
    document: env.document, window: env.document.defaultView, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, i18n: { en: texts }, dataStore: { getConversations: () => [], getFolders: () => [] },
    saveAppData: async () => {}, showNotification: () => {}, client: { sharedWithMe: async () => ({ ok: true, data: items }), mine: async () => ({ ok: true, data: [{ project_id: 'own1' }] }) },
    storage: env.document.defaultView.localStorage, createReader: () => reader, pollMs: 40
  });
  await again.refreshShared();
  const answer = projectInstructionTextFor({ id: 'k', sharedProject: { id: PROJECT, ownerId: 'o' } });
  assert.match(answer, /Rules\./);
  assert.match(answer, /The brief says blue\./);
});


test('leaving can make a project of one’s own from the conversations one made there: they move into a new folder, nothing is copied', async () => {
  const mine = { id: 'a1', title: 'Mine', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: [{ id: 'm1', role: 'user', parts: [{ text: 'q' }] }], model: 'm', provider: 'p' };
  const other = { id: 'a2', title: 'Elsewhere', messages: [], folderId: null };
  const trashed = { id: 'a3', title: 'Gone', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: [{ id: 'x', role: 'user', parts: [{ text: 'z' }] }], deletedAt: 'x' };
  const elsewhere = { id: 'a4', title: 'Other project', sharedProject: { id: 'another', ownerId: 'o' }, messages: [] };
  const made = ownProjectFrom({ conversations: [mine, other, trashed, elsewhere], sharedId: PROJECT, name: ' Mine now ', memoryScope: 'project', uuid: () => 'new-folder' });
  assert.equal(made.folder.name, 'Mine now');
  assert.equal(made.folder.memoryScope, 'project');
  assert.deepEqual(made.ids, ['a1']);
  assert.deepEqual(made.folder.conversationIds, ['a1']);
  assert.equal(mine.sharedProject.id, PROJECT, 'the function only says which; the caller moves them');
  assert.equal(ownProjectFrom({ conversations: [], sharedId: PROJECT, name: '' }).folder.name, 'Project');
});


const CHAT = '323e4567-e89b-12d3-a456-426614174002';

test('the address of a conversation of a shared project is told apart, kept for the app and read back', () => {
  const path = `/c/${PROJECT}/${CHAT}`;
  assert.equal(isChatLinkRoute(path), true);
  assert.equal(isChatLinkRoute('/join/abc'), false);
  assert.deepEqual(chatLinkOf(path), { projectId: PROJECT, conversationId: CHAT });
  assert.equal(chatLinkUrl('https://noureon.com/', PROJECT, CHAT), `https://noureon.com${path}`);
  const area = new Window().localStorage;
  area.setItem(PENDING_CHAT_KEY, JSON.stringify({ projectId: PROJECT, conversationId: CHAT, at: Date.now() }));
  assert.deepEqual(readPendingChatLink(area), { projectId: PROJECT, conversationId: CHAT });
  area.setItem(PENDING_CHAT_KEY, JSON.stringify({ projectId: PROJECT, conversationId: CHAT, at: 1 }));
  assert.equal(readPendingChatLink(area), null);
});


test('"Share conversation" in a shared project copies a link for members only and does not open the public sharing', async () => {
  const copied = [];
  const mine = { id: CHAT, title: 'Mine', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: [] };
  const env = started({ conversations: [mine], read: async () => ({ ok: true, project: { role: 'chat', project: { name: 'x' }, owner: { id: 'o', name: 'Ada' }, conversations: [] } }), copyText: async (value) => { copied.push(value); return true; } });
  const publicOpened = [];
  env.document.defaultView.addEventListener('astra:share-conversation', () => publicOpened.push(1));
  env.document.defaultView.dispatchEvent(new env.document.defaultView.CustomEvent('astra:share-conversation', { detail: { id: CHAT } }));
  await tick(); await tick();
  assert.deepEqual(copied, [`${env.document.defaultView.location.origin}/c/${PROJECT}/${CHAT}`]);
  assert.deepEqual(env.events.notes.at(-1), [texts.psChatLinkCopied, 'success']);
  assert.equal(publicOpened.length, 0);
  assert.ok(env.events.saved >= 1);
  const plain = { id: 'p', title: 'Plain', messages: [] };
  const other = started({ conversations: [plain], read: async () => ({ ok: false }) });
  other.document.defaultView.addEventListener('astra:share-conversation', () => publicOpened.push(2));
  other.document.defaultView.dispatchEvent(new other.document.defaultView.CustomEvent('astra:share-conversation', { detail: { id: 'p' } }));
  assert.deepEqual(publicOpened, [2]);
});

test('the pictures in a conversation of someone else are asked from the server and drawn as they come; one that cannot be read stays as it was', async () => {
  const PATH = `${ME}/${'a'.repeat(64)}`;
  const withPicture = [{ id: 'p1', role: 'user', parts: [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: { __astraCloudAsset: { path: PATH } } } }], createdAt: '2026-11-06T00:00:00Z' }, { id: 'p2', role: 'model', parts: [{ text: 'nice' }], createdAt: '2026-11-06T00:00:01Z' }];
  const asked = [];
  const { document, root } = page();
  const viewer = openProjectConversation({ document, root, text, texts: {}, language: 'en', chat: chat('c1', 'o', 'Pictures', 'x', withPicture), renderMarkdown: (value) => `<p>${value}</p>`, loadAsset: async (path) => { asked.push(path); return 'iVBORw0KGgo='; } });
  await tick(); await tick();
  assert.deepEqual(asked, [PATH]);
  assert.ok(document.body.innerHTML.includes('iVBORw0KGgo=') || root.innerHTML.includes('iVBORw0KGgo='));
  assert.ok(viewer);
  const { reader } = (() => { const requests = []; const request = async (method, path, options) => { requests.push([method, path, options.body]); return { ok: true, data: { data: 'AAA=' } }; }; return { reader: createSharedProjectReader({ projectId: PROJECT, request }), requests }; })();
  assert.equal(await reader.asset(PATH), 'AAA=');
  const failing = createSharedProjectReader({ projectId: PROJECT, request: async () => ({ ok: false, status: 404 }) });
  assert.equal(await failing.asset(PATH), '');
});

import { subscribeProjectLive } from '../src/app/runtime/project-sharing/project-live.js';

const fakeRealtime = () => {
  const calls = { channel: [], removed: 0, auth: 0 };
  let handler = null;
  let onStatus = null;
  const channel = { on: (type, filter, callback) => { calls.on = [type, filter]; handler = callback; return channel; }, subscribe: (callback) => { onStatus = callback; return channel; } };
  const client = { realtime: { setAuth: async () => { calls.auth += 1; } }, channel: (name, config) => { calls.channel.push([name, config]); return channel; }, removeChannel: () => { calls.removed += 1; } };
  return { client, calls, ping: () => handler?.({ payload: { c: 'x' } }), status: (value) => onStatus?.(value) };
};

test('the page joins the private channel of the project, hears the pings and says when it is joined or lost; stopping leaves the channel', async () => {
  const rt = fakeRealtime();
  const pings = [];
  const states = [];
  const live = subscribeProjectLive({ getSupabase: () => rt.client, projectId: PROJECT, onPing: (ping) => pings.push(ping.c), onState: (joined) => states.push(joined) });
  await tick();
  assert.deepEqual(rt.calls.channel, [[`project:${PROJECT}`, { config: { private: true } }]]);
  assert.deepEqual(rt.calls.on, ['broadcast', { event: 'changed' }]);
  assert.equal(rt.calls.auth, 1);
  rt.status('SUBSCRIBED'); rt.ping(); rt.ping(); rt.status('CHANNEL_ERROR');
  assert.deepEqual(pings, ['x', 'x']);
  assert.deepEqual(states, [true, false]);
  live.stop();
  assert.equal(rt.calls.removed, 1);
  rt.ping();
  assert.equal(pings.length, 2);
  const none = [];
  subscribeProjectLive({ getSupabase: () => null, projectId: PROJECT, onState: (joined) => none.push(joined) });
  await tick();
  assert.deepEqual(none, [false]);
});






