import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createPageMemoryTools, userMessagesOf } from '../../src/app/runtime/memory-store/page-memory-loader.js';
import { recordEvent, recordUsed, resetTrace, takeTrace, toolsOffered } from '../../src/app/runtime/memory-store/memory-trace.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

const row = (key, payload) => ({ record_key: key, payload, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });
const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', keywords: ['shiba', 'mochi'], kind: 'relationship' });

async function memoryWith({ settings, notes = [dog] } = {}) {
  const rows = [...notes.map((note) => row(`note:${note.id}`, note)), ...(settings ? [row('meta:settings', settings)] : [])];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  return memory;
}

const conversation = (extra = {}) => ({
  id: 'conv-1',
  messages: [
    { role: 'user', parts: [{ text: 'I work as a nurse in Taipei' }], createdAt: '2026-10-30T08:00:00.000Z' },
    { role: 'model', parts: [{ text: 'Nice to meet you.' }] },
    { role: 'user', parts: [{ text: 'My favourite tea is jasmine' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }], createdAt: '2026-10-30T09:00:00.000Z' }
  ],
  ...extra
});
const config = () => () => ({});

test('the messages of the person are read for the check of a write: their text only, with a stable id', () => {
  const messages = userMessagesOf(conversation());
  assert.deepEqual(messages.map((message) => message.text), ['I work as a nurse in Taipei', 'My favourite tea is jasmine']);
  assert.equal(messages[0].id, 't:2026-10-30T08:00:00.000Z');
  assert.equal(messages.every((message) => message.role === 'user'), true);
});

test('no tools when the memory is not loaded, use is off, or the chat may not use memory', async () => {
  const memory = await memoryWith();
  assert.equal(await createPageMemoryTools({ getConfig: config(), getMemory: () => null, conversation: conversation() }), null);
  const broken = createNotesMemory({ storage: { getItem() { throw new Error('blocked'); }, setItem() {} }, logger: { warn() {} } });
  await broken.attach({ username: 'tester' });
  assert.equal(await createPageMemoryTools({ getConfig: config(), getMemory: () => broken, conversation: conversation() }), null);
  const off = await memoryWith({ settings: { use: false } });
  assert.equal(await createPageMemoryTools({ getConfig: config(), getMemory: () => off, conversation: conversation() }), null);
  assert.equal(await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, conversation: conversation({ retentionMode: 'ephemeral', memoryAccessEnabled: false }) }), null);
});

test('a write the model makes is saved in the store and noted for the message under the reply', async () => {
  const memory = await memoryWith();
  resetTrace('conv-1', { toolsOffered: true });
  const tools = await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, conversation: conversation() });
  const loader = tools.make('en');
  const answer = await loader.run({ name: 'memory_write', args: { op: 'add', text: 'The user works as a nurse in Taipei', quote: 'I work as a nurse in Taipei', keywords: ['nurse', 'taipei'] } });
  assert.match(answer, /Saved/);
  assert.equal(memory.getStore().getNotes().filter((note) => note.status === 'active').length, 2);
  assert.equal(memory.getStore().getEvents().length, 1);
  assert.equal(memory.getStore().getCursor('conv-1').appliedOps.length, 1, 'the operation is done for this conversation');
  await loader.run({ name: 'search_memory', args: { query: 'shiba dog mochi' } });
  const trace = takeTrace('conv-1');
  assert.deepEqual(trace.used, ['dog']);
  assert.equal(trace.events.length, 1);
  assert.deepEqual(takeTrace('conv-1'), { used: [], events: [], history: [] }, 'taken once');
});

test('with learning off nothing is written, and the model has no write tool', async () => {
  for (const settings of [{ learn: false }, { paused: true }]) {
    const memory = await memoryWith({ settings });
    const tools = await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, conversation: conversation() });
    assert.equal(tools.canWrite, false);
    const loader = tools.make('en');
    assert.deepEqual(loader.tools.map((tool) => tool.name), ['search_memory']);
    const answer = await loader.run({ name: 'memory_write', args: { op: 'add', text: 'The user works as a nurse in Taipei', quote: 'I work as a nurse in Taipei' } });
    assert.match(answer, /not being written/);
    assert.equal(memory.getStore().getNotes().length, 1);
    assert.equal(memory.getStore().getEvents().length, 0);
  }
});

test('a temporary chat reads the memory but never writes to it', async () => {
  const memory = await memoryWith();
  const tools = await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, conversation: conversation({ retentionMode: 'ephemeral', memoryAccessEnabled: true }) });
  assert.equal(tools.canWrite, false);
});

test('the trace starts afresh with each reply, and says whether the model has the memory tools', () => {
  recordUsed('c9', ['a', 'b', 'a']);
  recordEvent('c9', 'e1');
  recordEvent('c9', 'e1');
  resetTrace('c9', { toolsOffered: true });
  assert.equal(toolsOffered('c9'), true);
  assert.deepEqual(takeTrace('c9'), { used: [], events: [], history: [] });
  recordUsed('c9', ['a', 'b', 'a']);
  recordEvent('c9', 'e1');
  recordEvent('c9', 'e1');
  assert.deepEqual(takeTrace('c9'), { used: ['a', 'b'], events: ['e1'], history: [] });
  resetTrace('c9');
  assert.equal(toolsOffered('c9'), false);
});

test('a reply made by the server is told it may look back through the past conversations only on a cloud account, and by meaning only with the vectors synced and a key', async () => {
  const memory = await memoryWith();
  const make = (vectors) => createPageMemoryTools({ getConfig: config(), getMemory: () => memory, getVectors: () => vectors, conversation: conversation() });
  const local = (await make({ canSync: () => false, embeddingAccess: () => null })).snapshot();
  assert.equal('history' in local, false, 'a local account has no conversations in the cloud');
  assert.equal('vector' in local, false);
  const cloud = (await make({ canSync: () => true, embeddingAccess: () => null })).snapshot();
  assert.equal(cloud.history, true);
  assert.equal('vector' in cloud, false, 'no meaning search without synced vectors');
  const meaning = (await make({ canSync: () => true, embeddingAccess: () => ({ provider: 'gemini', key: 'g-key' }) })).snapshot();
  assert.deepEqual(meaning.vector, { provider: 'gemini' });
  assert.equal(meaning.embeddingKey, 'g-key', 'the key goes to the part of the request that holds secrets, which server-reply.js splits off');
  assert.equal('history' in (await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, conversation: conversation() })).snapshot(), false);
});

test('the conversations the model looked into are kept with the reply by name and day, never by their words, at most five', async () => {
  const { setHistoryTitle } = await import('../../src/app/runtime/memory-store/memory-trace.js');
  setHistoryTitle((id) => ({ c1: 'Scooter commute' }[id] || ''));
  const memory = await memoryWith();
  resetTrace('conv-1');
  const hits = Array.from({ length: 7 }, (_, index) => ({ conversationId: `c${index + 1}`, at: '2026-10-21T00:00:00.000Z', role: 'user', text: 'a private sentence' }));
  const tools = await createPageMemoryTools({ getConfig: config(), getMemory: () => memory, getHistory: () => ({ lookup: () => hits }), conversation: conversation() });
  const loader = tools.make('en');
  const answer = await loader.run({ name: 'search_memory', args: { query: 'scooter', scope: 'history' } });
  assert.match(answer, /private sentence/, 'the model is given the words');
  const taken = takeTrace('conv-1');
  assert.equal(taken.history.length, 5);
  assert.deepEqual(taken.history[0], { id: 'c1', title: 'Scooter commute', at: '2026-10-21T00:00:00.000Z' });
  assert.equal(JSON.stringify(taken).includes('private sentence'), false, 'but none of the words is kept');
  setHistoryTitle(null);
});
