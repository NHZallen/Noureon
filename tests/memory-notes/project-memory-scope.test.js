import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryBackend } from '../../src/app/runtime/memory-store/backends.js';
import { createNotesStore } from '../../src/app/runtime/memory-store/notes-store.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createPageMemoryTools } from '../../src/app/runtime/memory-store/page-memory-loader.js';
import { createPageHistory } from '../../src/app/runtime/memory-store/page-history.js';
import { createNote, normalizeNote } from '../../src/app/runtime/memory-notes/notes.js';
import { buildNotesExport } from '../../src/app/runtime/memory-notes/notes-transfer.js';
import { noteScopeOf, notesInScope, scopeOfConversation, scopeOfFolder, scopedView } from '../../src/app/runtime/memory-notes/scope.js';
import { conversationScopeReader, memoryProjectName, memoryScopeOf, setProjectFoldersReader } from '../../src/app/runtime/projects/project-instructions.js';

// Project memory (docs/superpowers/specs/2026-10-31-projects-design.md, §14): a project may keep its notes for itself. Its chats read and write those only; no other chat sees them.

const row = (note) => ({ record_key: `note:${note.id}`, payload: note, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });
const own = createNote({ id: 'own', text: 'The user prefers short answers', keywords: ['short', 'answers'], standing: true });
const inA = { ...createNote({ id: 'in-a', text: 'Project A uses the blue brand colour', keywords: ['blue', 'brand'], standing: true }), projectId: 'proj-a' };
const inB = { ...createNote({ id: 'in-b', text: 'Project B ships on Fridays', keywords: ['ships', 'fridays'], standing: true }), projectId: 'proj-b' };
const quiet = { logger: { warn() {} } };

const FOLDERS = [
  { id: 'proj-a', name: 'Brand A', memoryScope: 'project' },
  { id: 'proj-b', name: 'Shipping B', memoryScope: 'project' },
  { id: 'plain', name: 'Plain', memoryScope: 'default' },
  { id: 'gone', name: 'Gone', memoryScope: 'project', deletedAt: '2026-10-30T00:00:00.000Z' }
];

async function storeWith(notes = [own, inA, inB]) {
  const store = createNotesStore({ backend: createMemoryBackend({ rows: notes.map(row) }), ...quiet });
  await store.load();
  return store;
}

test('a note carries the project it belongs to, and none for the memory of the account', () => {
  assert.equal(normalizeNote(inA).projectId, 'proj-a');
  assert.equal('projectId' in normalizeNote(own), false, 'a note of the account has no extra field');
  assert.equal(noteScopeOf(inA), 'proj-a');
  assert.equal(noteScopeOf(own), '');
  assert.deepEqual(notesInScope([own, inA, inB], 'proj-a').map((note) => note.id), ['in-a']);
  assert.deepEqual(notesInScope([own, inA, inB], '').map((note) => note.id), ['own'], 'the memory of the account leaves the project notes out');
});

test('the scope of a chat is its project when that keeps its notes for itself', () => {
  assert.equal(scopeOfFolder(FOLDERS[0]), 'proj-a');
  assert.equal(scopeOfFolder(FOLDERS[2]), '');
  assert.equal(scopeOfFolder(FOLDERS[3]), '', 'a deleted project has none');
  assert.equal(scopeOfConversation({ folderId: 'proj-a' }, FOLDERS), 'proj-a');
  assert.equal(scopeOfConversation({ folderId: 'plain' }, FOLDERS), '');
  assert.equal(scopeOfConversation({}, FOLDERS), '');
  assert.equal(scopeOfConversation({ folderId: 'proj-a', retentionMode: 'ephemeral' }, FOLDERS), '', 'a temporary chat uses the memory of the account');
  assert.equal(scopeOfConversation({ folderId: 'proj-a', deletedAt: 'x' }, FOLDERS), '');
});

test('a view reads only its scope, tags what is new, and never touches the rest', async () => {
  const store = await storeWith();
  const view = scopedView(store, 'proj-a');
  assert.deepEqual(view.getNotes().map((note) => note.id), ['in-a']);
  const fresh = createNote({ id: 'fresh', text: 'Project A keeps drafts in the shared folder', keywords: ['drafts'] });
  await view.commitWrite({ notes: [...view.getNotes(), fresh], events: [] });
  assert.equal(store.getNotes().find((note) => note.id === 'fresh').projectId, 'proj-a', 'the new note belongs to the project');
  assert.equal(store.getNotes().find((note) => note.id === 'own').projectId, undefined);
  assert.equal(store.getNotes().find((note) => note.id === 'in-b').projectId, 'proj-b');
  const global = scopedView(store, '');
  assert.deepEqual(global.getNotes().map((note) => note.id), ['own'], 'the other chats do not see it');
  await global.commitNotes([...global.getNotes(), createNote({ id: 'plain-new', text: 'The user lives in Taipei', keywords: ['taipei'] })]);
  assert.equal('projectId' in store.getNotes().find((note) => note.id === 'plain-new'), false);
  assert.deepEqual(scopedView(store, 'proj-a').getNotes().map((note) => note.id).sort(), ['fresh', 'in-a']);
});

test('a note is edited inside its view without changing where it is kept', async () => {
  const store = await storeWith();
  const view = scopedView(store, 'proj-b');
  await view.commitNotes(view.getNotes().map((note) => ({ ...note, text: 'Project B ships on Thursdays', updatedAt: '2026-10-31T00:00:00.000Z' })));
  const saved = store.getNotes().find((note) => note.id === 'in-b');
  assert.equal(saved.text, 'Project B ships on Thursdays');
  assert.equal(saved.projectId, 'proj-b');
});

test('clearing one scope leaves the others; clearing the whole store takes everything', async () => {
  const store = await storeWith();
  await scopedView(store, 'proj-a').clearAll({ keepTombstones: false });
  assert.deepEqual(store.getNotes().map((note) => note.id).sort(), ['in-b', 'own']);
  await scopedView(store, '').clearAll({ keepTombstones: true });
  assert.deepEqual(store.getNotes().map((note) => note.id), ['in-b']);
  await store.clearAll({ keepTombstones: false });
  assert.deepEqual(store.getNotes(), []);
});

test('the first page and the slip of a chat hold the notes of its scope only', async () => {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [own, inA, inB].map(row) })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, ...quiet });
  await memory.attach({ username: 'tester' });
  const seen = [];
  memory.setHistorySearch((question, options) => { seen.push(options); return []; });
  const inProject = memory.contextFor({ question: 'brand colour', scopeId: 'proj-a' });
  assert.match(inProject.systemText, /blue brand colour/);
  assert.doesNotMatch(inProject.systemText, /short answers|Fridays/);
  const outside = memory.contextFor({ question: 'brand colour' });
  assert.match(outside.systemText, /short answers/);
  assert.doesNotMatch(outside.systemText, /blue brand|Fridays/);
  assert.equal(seen[0].scopeId, 'proj-a', 'and the search over past chats is told the scope');
});

test('a chat of a project that keeps its notes writes them into the project, and the memory tool shows only those', async () => {
  setProjectFoldersReader(() => FOLDERS);
  try {
    assert.equal(memoryScopeOf({ id: 'c', folderId: 'proj-a' }), 'proj-a');
    assert.equal(memoryProjectName('proj-a'), 'Brand A');
    assert.equal(memoryProjectName('plain'), '', 'a project that does not keep its notes has no notes to show');
    assert.equal(memoryProjectName('gone'), '');
    const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [own, inA, inB].map(row) })]]);
    const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, ...quiet });
    await memory.attach({ username: 'tester' });
    const conversation = { id: 'conv-p', folderId: 'proj-a', messages: [{ role: 'user', parts: [{ text: 'We always draft in the shared folder' }], createdAt: '2026-10-30T08:00:00.000Z' }] };
    const tools = await createPageMemoryTools({ getConfig: () => ({}), getMemory: () => memory, conversation });
    assert.equal(tools.snapshot().scope, 'proj-a', 'a reply made by the server is told the scope');
    const loader = tools.make('en');
    const found = await loader.run({ name: 'search_memory', args: { query: 'brand colour shipping fridays short answers' } });
    assert.match(found, /blue brand colour/);
    assert.doesNotMatch(found, /Fridays|short answers/);
    assert.match(await loader.run({ name: 'memory_write', args: { op: 'add', text: 'The team drafts in the shared folder', quote: 'We always draft in the shared folder', keywords: ['draft', 'shared'] } }), /Saved/);
    const written = memory.getStore().getNotes().find((note) => note.text === 'The team drafts in the shared folder');
    assert.equal(written.projectId, 'proj-a');
    const plain = await createPageMemoryTools({ getConfig: () => ({}), getMemory: () => memory, conversation: { id: 'conv-q', messages: [] } });
    assert.equal('scope' in plain.snapshot(), false);
    assert.doesNotMatch(await plain.make('en').run({ name: 'search_memory', args: { query: 'team drafts shared folder' } }), /shared folder/);
  } finally {
    setProjectFoldersReader(null);
  }
});

test('a search over past chats stays inside the scope of the chat that asks', () => {
  const conversations = [
    { id: 'c-plain', lastUpdatedAt: '2026-10-30T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'Our quarterly budget review is on Monday' }] }] },
    { id: 'c-a', lastUpdatedAt: '2026-10-30T00:00:00.000Z', folderId: 'proj-a', messages: [{ role: 'user', parts: [{ text: 'The quarterly budget for project A is secret' }] }] }
  ];
  const scopes = { 'c-plain': '', 'c-a': 'proj-a' };
  const history = createPageHistory({ getConversations: () => conversations, getProjectOf: (id) => scopes[id] || '' });
  const ids = (hits) => hits.map((hit) => hit.conversationId);
  assert.deepEqual(ids(history.lookup('quarterly budget', 5, { scopeId: 'proj-a' })), ['c-a']);
  assert.deepEqual(ids(history.lookup('quarterly budget', 5, {})), ['c-plain'], 'a chat outside any such project never reaches into one');
  assert.deepEqual(ids(history.search('quarterly budget review', { scopeId: 'proj-a' })).includes('c-plain'), false);
  // A project that shares the memory of the account (a chat in it has no scope of its own): it sees its own chats and the ones outside; a chat outside never sees the ones inside it.
  assert.deepEqual(ids(history.lookup('quarterly budget', 5, { projectId: 'proj-a' })).sort(), ['c-a', 'c-plain']);
  assert.deepEqual(ids(history.lookup('quarterly budget', 5, { projectId: 'proj-other' })), ['c-plain'], 'another project does not see the chats of proj-a');
  const reader = conversationScopeReader(() => conversations.map((entry) => ({ id: entry.id, folderId: entry.folderId })));
  setProjectFoldersReader(() => FOLDERS);
  try {
    assert.equal(reader('c-a'), 'proj-a');
    assert.equal(reader('c-plain'), '');
    assert.equal(reader('unknown'), '');
  } finally {
    setProjectFoldersReader(null);
  }
});

test('the export of the notes holds the memory of the account only', () => {
  const exported = buildNotesExport([own, inA, inB]);
  assert.deepEqual(exported.notes.map((note) => note.text), [own.text]);
});
