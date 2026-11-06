import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSharedProjectReader, readSharedProject } from '../src/app/runtime/project-sharing/project-reader-client.js';
import { branchFromMirror, newSharedConversation } from '../src/app/runtime/project-sharing/branch-from-mirror.js';
import { startProjectSharing, SHARED_EVENT } from '../src/app/runtime/project-sharing/start-project-sharing.js';
import { announceUser } from '../src/app/runtime/features/user-ready.js';
import { provideService, SERVICES } from '../src/app/runtime/services.js';
import { drawSharedProjects, openSharedProjectPage } from '../src/app/ui/projects/shared-project-page.js';
import { openProjectConversation } from '../src/app/ui/projects/project-conversation-viewer.js';
import { memoryScopeOf, projectIdOf, projectInstructionTextFor } from '../src/app/runtime/projects/project-instructions.js';
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

test('the page of a shared project lists everyone’s conversations with the name of who made them; one’s own open in the chat, the others are read; a new chat can be made', async () => {
  const { document, root } = page();
  const opened = [];
  openSharedProjectPage({
    document, root, text, language: 'en', meId: ME,
    shared: { role: 'chat', project: { name: 'City plan' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'Traffic', '2026-11-02T00:00:00Z'), chat('c2', ME, 'My chat', '2026-11-03T00:00:00Z')] },
    onOpenChat: (entry) => opened.push(['read', entry.id]), onOpenOwn: (entry) => opened.push(['own', entry.id]), onNewChat: () => opened.push(['new'])
  });
  assert.match(root.textContent, /Project shared by Ada/);
  assert.deepEqual([...root.querySelectorAll('.psh-chat .pj-row-meta')].map((node) => node.textContent.split(' · ')[0]), ['Ada', 'You']);
  assert.equal(root.querySelector('.psh-chat img, .psh-chat .psh-avatar'), null);
  root.querySelector('[data-chat-id="c1"]').click();
  assert.deepEqual(opened, [['read', 'c1']]);
  const { document: second, root: other } = page();
  openSharedProjectPage({ document: second, root: other, text, meId: ME, shared: { project: { name: 'P' }, owner: { name: 'A' }, conversations: [chat('c2', ME, 'My chat', 'x')] }, onOpenChat: () => {}, onOpenOwn: (entry) => opened.push(['own', entry.id]), onNewChat: () => opened.push(['new']) });
  other.querySelector('[data-chat-id="c2"]').click();
  const { document: third, root: empty } = page();
  openSharedProjectPage({ document: third, root: empty, text, meId: ME, shared: { project: { name: 'P' }, owner: { name: 'A' }, conversations: [] }, onOpenChat: () => {}, onNewChat: () => opened.push(['new']) });
  assert.match(empty.textContent, /no conversations in the project yet/);
  empty.querySelector('[data-new-chat]').click();
  assert.deepEqual(opened, [['read', 'c1'], ['own', 'c2'], ['new']]);
});

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
  conversation: async (id) => (live.conversation ? live.conversation(id) : { ok: false, code: 'gone' })
});

const started = ({ read, conversations = [], items = [], live = {} } = {}) => {
  const { window, document, root } = page();
  announceUser(document, { supabaseUserId: ME, displayName: 'Me' });
  provideService(SERVICES.cloudSync, { getStatus: () => ({ enabled: true }) });
  const events = { notes: [], opened: [], saved: 0, left: [] };
  const api = startProjectSharing({
    document, window, configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) }, i18n: { en: texts }, dataStore: { getConversations: () => conversations, getFolders: () => [] },
    saveAppData: async () => { events.saved += 1; }, showNotification: (message, kind) => events.notes.push([message, kind]), renderSidebar: () => {}, openConversation: (id) => events.opened.push(id),
    client: { sharedWithMe: async () => ({ ok: true, data: items }), invite: async () => ({ ok: false }), leave: async (id) => { events.left.push(id); return { ok: true }; } }, storage: window.localStorage, createReader: () => readerOf(read, live), pollMs: 40, defaultsOf: async () => ({ model: 'm', provider: 'p', genConfig: {}, council: null }), renderMarkdown: (value) => `<p>${value}</p>`
  });
  return { api, document, root, events, conversations };
};

test('opening a shared project reads it and shows it; a branch and a new chat are put at the top of the reader’s conversations and opened', async () => {
  const read = async () => ({ ok: true, project: { role: 'chat', project: { name: 'City plan' }, owner: { id: 'o', name: 'Ada' }, conversations: [chat('c1', 'o', 'Traffic', 'x', MESSAGES)] } });
  const env = started({ read });
  await env.api.openShared({ project_id: PROJECT, root: env.root });
  assert.match(env.root.textContent, /City plan/);
  env.root.querySelector('[data-chat-id="c1"]').click();
  await tick();
  env.root.querySelector('[data-branch-last]').click();
  await tick(); await tick();
  assert.equal(env.conversations.length, 1);
  assert.deepEqual(env.conversations[0].sharedProject, { id: PROJECT, ownerId: 'o' });
  assert.equal(env.conversations[0].title, 'Traffic (branch)');
  assert.equal(env.conversations[0].messages.length, 4);
  assert.deepEqual(env.events.opened, [env.conversations[0].id]);
  assert.deepEqual(env.events.notes.at(-1), [texts.psBranched, 'success']);
  assert.equal(env.events.saved, 1);
  await env.api.openShared({ project_id: PROJECT, root: env.root });
  [...env.root.querySelectorAll('[data-new-chat]')].at(-1).click();
  await tick(); await tick();
  assert.equal(env.conversations.length, 2);
  assert.equal(env.conversations[0].messages.length, 0);
  assert.deepEqual(env.conversations[0].sharedProject, { id: PROJECT, ownerId: 'o' });
});

test('a project that cannot be read says so, and the list "Shared with you" is drawn into the box the page of the projects gives', async () => {
  const gone = started({ read: async () => ({ ok: false, code: 'gone' }) });
  assert.equal(await gone.api.openShared({ project_id: PROJECT, root: gone.root }), null);
  assert.deepEqual(gone.events.notes.at(-1), [texts.psSharedGone, 'error']);
  const failed = started({ read: async () => ({ ok: false, code: 'generic' }) });
  await failed.api.openShared({ project_id: PROJECT });
  assert.deepEqual(failed.events.notes.at(-1), [texts.psSharedLoadFailed, 'error']);
  const env = started({ read: async () => ({ ok: false }), items: [{ project_id: PROJECT, owner_id: 'o', name: 'City plan', icon: 'book', color: 'blue', owner_name: 'Ada', role: 'editor' }] });
  const box = env.document.createElement('div');
  env.document.body.appendChild(box);
  env.document.dispatchEvent(new env.document.defaultView.CustomEvent(SHARED_EVENT, { detail: { box } }));
  await tick(); await tick();
  assert.equal(box.querySelectorAll('.psh-shared-row').length, 1);
  assert.match(box.textContent, /City plan/);
  assert.match(box.textContent, /Ada · Editor/);
  const direct = page();
  drawSharedProjects({ document: direct.document, box: direct.root, text, items: [{ project_id: 'p', name: 'X', owner_name: 'O', role: 'chat' }], onOpen: () => {} });
  assert.match(direct.root.textContent, /O · Chat member/);
});

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

test('a member leaves a shared project after being asked; the page forgets the project', async () => {
  const left = [];
  const { document, root } = page();
  openSharedProjectPage({ document, root, text, meId: ME, shared: { project: { name: 'City plan' }, owner: { name: 'Ada' }, conversations: [] }, onOpenChat: () => {}, onNewChat: () => {}, onLeave: () => left.push('left') });
  root.querySelector('[data-leave-open]').click();
  await tick();
  assert.match(root.textContent, /Leave the project “City plan”\?/);
  root.querySelector('[data-leave-go]').click();
  assert.deepEqual(left, ['left']);
  const none = page();
  openSharedProjectPage({ document: none.document, root: none.root, text, meId: ME, shared: { project: { name: 'P' }, owner: { name: 'A' }, conversations: [] }, onOpenChat: () => {}, onNewChat: () => {} });
  assert.equal(none.root.querySelector('[data-leave-open]'), null);
});

test('leaving through the page tells the database and drops the shared project from the replies', async () => {
  const read = async () => ({ ok: true, project: { role: 'chat', project: { name: 'City plan', instructions: 'Be brief.' }, owner: { id: 'o', name: 'Ada' }, conversations: [] } });
  const env = started({ read });
  const inShared = { id: 'k9', sharedProject: { id: PROJECT, ownerId: 'o' } };
  await env.api.openShared({ project_id: PROJECT, root: env.root });
  assert.match(projectInstructionTextFor(inShared), /Be brief\./);
  env.root.querySelector('[data-leave-open]').click();
  await tick();
  env.root.querySelector('[data-leave-go]').click();
  await tick(); await tick();
  assert.deepEqual(env.events.left, [PROJECT]);
  assert.deepEqual(env.events.notes.at(-1), [text('psLeft', { name: 'City plan' }), 'success']);
  assert.equal(projectInstructionTextFor(inShared), '');
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

test('what others write shows while the page is open: the list and the conversation that is read are drawn again, and a branch is made of the conversation as it is now', async () => {
  const old = chat('c1', 'o', 'Traffic', '2026-11-01T00:00:00Z', MESSAGES);
  const newer = chat('c1', 'o', 'Traffic', '2026-11-05T00:00:00Z', [...MESSAGES, { id: 'e', role: 'user', parts: [{ text: 'a later question' }] }, { id: 'f', role: 'model', parts: [{ text: 'a later answer' }] }]);
  const added = chat('c9', 'bob', 'Fresh idea', '2026-11-06T00:00:00Z', MESSAGES.slice(0, 2));
  const live = {};
  const read = async () => ({ ok: true, project: { role: 'chat', project: { name: 'City plan' }, owner: { id: 'o', name: 'Ada' }, conversations: [old] } });
  const env = started({ read, live });
  await env.api.openShared({ project_id: PROJECT, root: env.root });
  env.root.querySelector('[data-chat-id="c1"]').click();
  await tick();
  assert.doesNotMatch(env.root.textContent, /a later answer/);
  live.refresh = async () => ({ ok: true, changed: true, project: { role: 'chat', project: { name: 'City plan', instructions: 'Now with rules.' }, owner: { id: 'o', name: 'Ada' }, conversations: [added, newer] } });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.match(env.root.textContent, /a later answer/);
  assert.match(env.root.textContent, /Fresh idea/);
  assert.match(projectInstructionTextFor({ id: 'k', sharedProject: { id: PROJECT, ownerId: 'o' } }), /Now with rules\./);
  // a branch from the first reply is made of the conversation as it is now (it is read again for that), and the reply is found by its id
  live.conversation = async () => ({ ok: true, chat: { ...newer, messages: [...newer.messages, { id: 'g', role: 'model', parts: [{ text: 'the very latest' }] }] } });
  live.refresh = null;
  env.root.querySelector('[data-branch-last]').click();
  await tick(); await tick();
  assert.equal(env.conversations.length, 1);
  assert.equal(env.conversations[0].messages.at(-1).parts[0].text, 'the very latest');
  assert.equal(env.conversations[0].messages.length, 7);
});

test('the page stops reading when it is closed', async () => {
  let refreshes = 0;
  const live = { refresh: async () => { refreshes += 1; return { ok: true, changed: false, project: {} }; } };
  const env = started({ read: async () => ({ ok: true, project: { role: 'chat', project: { name: 'P' }, owner: { id: 'o', name: 'A' }, conversations: [] } }), live });
  const page = await env.api.openShared({ project_id: PROJECT, root: env.root });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(refreshes >= 1);
  page.close();
  const after = refreshes;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(refreshes, after);
});
