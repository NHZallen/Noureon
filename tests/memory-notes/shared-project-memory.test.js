import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createPageMemoryTools } from '../../src/app/runtime/memory-store/page-memory-loader.js';
import { setSharedMemoryFor } from '../../src/app/runtime/memory-store/memory-ref.js';
import { resetTrace } from '../../src/app/runtime/memory-store/memory-trace.js';
import { createSharedMemoryStore } from '../../src/app/runtime/project-sharing/shared-memory-store.js';
import { setProjectFoldersReader } from '../../src/app/runtime/projects/project-instructions.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

// The page holds the memory of a shared project as one store (project-sharing/shared-memory-store.js): the notes are the owner's project notes behind two database functions; the rest is the person's own.

const PROJECT = '323e4567-e89b-12d3-a456-426614174002';
afterEach(() => { setSharedMemoryFor(null); setProjectFoldersReader(() => []); });

const row = (key, payload, version = 1) => ({ record_key: key, payload, version, updated_at: '2026-11-06T00:00:00.000Z', deleted_at: null });
const red = { ...createNote({ id: 'red', text: 'The client likes red', keywords: ['client', 'red'] }), projectId: PROJECT };

/** A database that holds the project notes and answers the two functions as the real ones do (tagging, versions, conflicts, chat refused). */
function fakeDatabase({ role = 'editor', rows = [row('note:red', red)] } = {}) {
  const table = new Map(rows.map((entry) => [entry.record_key, entry]));
  const calls = [];
  return {
    table,
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'read_project_memory') return { data: [...table.values()], error: null };
      if (role === 'chat') return { data: null, error: { message: 'not_allowed' } };
      const results = args.p_changes.map((change) => {
        const current = table.get(change.key);
        if (current ? change.baseVersion !== current.version : change.baseVersion != null) return { key: change.key, status: 'conflict', row: current || null };
        const saved = row(change.key, { ...change.payload, projectId: args.p_project_id }, (current?.version || 0) + 1);
        table.set(change.key, saved);
        return { key: change.key, status: 'ok', row: saved };
      });
      return { data: results, error: null };
    }
  };
}

async function personalMemory() {
  const data = new Map();
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  return memory;
}

async function sharedStore({ role = 'editor', database = fakeDatabase({ role }) } = {}) {
  const memory = await personalMemory();
  const personal = await memory.ready();
  const store = createSharedMemoryStore({ personal, getSupabase: () => ({ rpc: database.rpc }), projectId: PROJECT, role, pollMs: 1e9, logger: { warn() {} } });
  await store.load();
  return { store, personal, database, memory };
}

test('the store reads the notes of the project and keeps the settings and the cursors in the person’s own store', async () => {
  const { store, personal } = await sharedStore();
  assert.equal(store.isLoaded(), true);
  assert.deepEqual(store.getNotes().map((note) => note.id), ['red']);
  assert.equal(store.getSettings().use, true);
  assert.deepEqual(personal.getNotes(), [], 'the personal store has none of the project notes');
  store.stop();
});

test('an editor’s note goes to the project (tagged), the event and the cursor stay with the person; a change that moved on is joined and saved again', async () => {
  const { store, personal, database } = await sharedStore();
  const fresh = createNote({ id: 'fresh', text: 'The deadline is Friday', keywords: ['deadline'] });
  await store.commitWrite({ notes: [...store.getNotes(), fresh], event: { id: 'e1', kind: 'add', noteIds: ['fresh'], at: '2026-11-06T09:00:00.000Z' }, opId: 'op1' }, { conversationId: 'c1' });
  assert.equal(database.table.get('note:fresh').payload.projectId, PROJECT);
  assert.deepEqual(store.getNotes().map((note) => note.id).sort(), ['fresh', 'red']);
  assert.equal(personal.getEvents().length, 1);
  assert.deepEqual(personal.getCursor('c1').appliedOps, ['op1']);
  assert.deepEqual(personal.getNotes(), []);
  // somebody else changed the same note meanwhile: the write meets a newer version, is joined with it and saved again
  database.table.set('note:red', row('note:red', { ...red, text: 'The client likes dark red' }, 2));
  await store.commitNotes(store.getNotes().map((note) => (note.id === 'red' ? { ...note, keywords: [...note.keywords, 'colour'] } : note)));
  const saved = database.table.get('note:red');
  assert.ok(saved.version >= 3);
  assert.ok(saved.payload.keywords.includes('colour'));
  store.stop();
});

test('a chat member reads the notes and cannot write them: nothing is sent, the person’s own rows still work', async () => {
  const { store, personal, database } = await sharedStore({ role: 'chat' });
  assert.equal(store.readOnly, true);
  const fresh = createNote({ id: 'fresh', text: 'The deadline is Friday', keywords: ['deadline'] });
  await store.commitWrite({ notes: [...store.getNotes(), fresh], event: { id: 'e2', kind: 'add', noteIds: ['fresh'], at: '2026-11-06T09:00:00.000Z' } }, { conversationId: 'c1' });
  assert.equal(database.calls.filter(([name]) => name === 'write_project_memory').length, 0);
  assert.deepEqual(store.getNotes().map((note) => note.id), ['red']);
  store.stop();
  assert.ok(personal);
});

test('the loader of a reply in a shared project uses the project store; the page tells the server the project, and a chat member gets no writes', async () => {
  const conversation = { id: 'conv-1', sharedProject: { id: PROJECT, ownerId: 'o' }, messages: [{ role: 'user', parts: [{ text: 'what does the client like?' }], createdAt: '2026-11-06T08:00:00.000Z' }] };
  const memory = await personalMemory();
  // the page lists the shared project as a folder that keeps its notes for itself (project-sharing/shared-folders.js)
  setProjectFoldersReader(() => [{ id: PROJECT, name: 'City plan', memoryScope: 'project', shared: true }]);
  for (const role of ['editor', 'chat']) {
    const { store } = await sharedStore({ role });
    setSharedMemoryFor(async (chat) => (chat.sharedProject?.id === PROJECT ? store : null));
    resetTrace('conv-1', { toolsOffered: true });
    const tools = await createPageMemoryTools({ getConfig: () => ({}), getMemory: () => memory, conversation });
    assert.ok(tools, role);
    assert.equal(tools.canWrite, role === 'editor');
    assert.equal(tools.snapshot().sharedProject, PROJECT);
    assert.equal(tools.snapshot().scope, PROJECT);
    const answer = await tools.make('en').run({ name: 'search_memory', args: { query: 'client red' } });
    assert.match(answer, /likes red/);
    store.stop();
  }
  // a chat that is not in a shared project is not changed
  setSharedMemoryFor(async () => null);
  const plain = await createPageMemoryTools({ getConfig: () => ({}), getMemory: () => memory, conversation: { id: 'p', messages: [] } });
  assert.equal(plain.snapshot().sharedProject, undefined);
});

test('the notes that others changed are read again before a reply', async () => {
  const { store, database } = await sharedStore();
  database.table.set('note:blue', row('note:blue', { ...createNote({ id: 'blue', text: 'The logo is blue', keywords: ['logo', 'blue'] }), projectId: PROJECT }, 1));
  assert.deepEqual(store.getNotes().map((note) => note.id), ['red']);
  await store.refresh();
  assert.deepEqual(store.getNotes().map((note) => note.id).sort(), ['blue', 'red']);
  store.stop();
});
