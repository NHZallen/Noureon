import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareReply } from '../../src/app/runtime/reply/single-model-reply-prepare.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { setNotesMemory } from '../../src/app/runtime/memory-store/memory-ref.js';
import { toolsOffered } from '../../src/app/runtime/memory-store/memory-trace.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

const row = (key, payload) => ({ record_key: key, payload, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });

async function withMemory({ notes = [], settings } = {}) {
  const rows = [...notes.map((note) => row(`note:${note.id}`, note)), ...(settings ? [row('meta:settings', settings)] : [])];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  setNotesMemory(memory);
  return memory;
}

const prepare = ({ memorySystem = 'notes', canCallTools = true, webSearchEnabled = false } = {}) => prepareReply(
  { getConfig: () => ({ memorySystem, uiLanguage: 'en', aiDefaultLanguage: 'en' }), supportsToolCalling: () => canCallTools, webResearch: null, serverReply: null, getWindow: () => ({}) },
  { userParts: [{ text: 'I live in Taipei' }], modelInfo: { id: 'm', provider: 'openrouter' }, conversation: { id: 'conv-prep', messages: [{ role: 'user', parts: [{ text: 'I live in Taipei' }], createdAt: '2026-10-30T00:00:00.000Z' }] }, webSearchEnabled }
);

const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', keywords: ['shiba'], kind: 'relationship' });

test('with the notes chosen, a model that calls tools gets the memory tools in the loader of the reply', async () => {
  await withMemory({ notes: [dog] });
  const prep = await prepare();
  assert.deepEqual(prep.makeSkillLoader().tools.map((tool) => tool.name).sort(), ['memory_write', 'search_memory']);
  assert.equal(toolsOffered('conv-prep'), true, 'the first page may say that notes can be looked up');
});

test('with the old memory, no loader is made for the memory', async () => {
  await withMemory({ notes: [dog] });
  const prep = await prepare({ memorySystem: 'classic' });
  assert.equal(prep.makeSkillLoader(), null);
  assert.equal(toolsOffered('conv-prep'), false);
});

test('a model that cannot call tools, or a reply with the provider\'s own search, has no memory tools (the curator learns after it)', async () => {
  await withMemory({ notes: [dog] });
  assert.equal((await prepare({ canCallTools: false })).makeSkillLoader(), null);
  assert.equal((await prepare({ webSearchEnabled: true })).makeSkillLoader(), null);
  assert.equal(toolsOffered('conv-prep'), false);
});

test('with learning off, only the search is given; with use off, nothing', async () => {
  await withMemory({ notes: [dog], settings: { learn: false } });
  assert.deepEqual((await prepare()).makeSkillLoader().tools.map((tool) => tool.name), ['search_memory']);
  await withMemory({ notes: [dog], settings: { use: false } });
  assert.equal((await prepare()).makeSkillLoader(), null);
});
