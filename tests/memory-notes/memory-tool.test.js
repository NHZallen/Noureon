import assert from 'node:assert/strict';
import test from 'node:test';

import { MEMORY_WRITE_TOOL, SEARCH_MEMORY_TOOL, createMemoryLoader, isMemoryToolName } from '../../src/data/memory-tool.js';
import { combineLoaders } from '../../src/data/combine-loaders.js';
import { createSkillLoader } from '../../src/data/skill-tool.js';
import { createNote, isActive, isTombstone } from '../../src/app/runtime/memory-notes/notes.js';

let counter = 0;
const createId = () => `n-${(counter += 1)}`;
const now = () => '2026-10-30T10:00:00.000Z';
const user = (id, text) => ({ id, role: 'user', text, at: '2026-10-30T09:00:00.000Z' });

function setup({ notes = [], messages = [user('m1', 'I live in Taipei and I work as a nurse')], canWrite = true, commit, searchHistory = null } = {}) {
  const state = { notes, applied: [], written: [], used: [] };
  const loader = createMemoryLoader({
    getNotes: () => state.notes,
    getContext: () => ({ conversationId: 'c1', messages, appliedOps: state.applied }),
    commit: commit || (async (result) => { state.notes = result.notes; }),
    canWrite,
    onUsed: (info) => state.used.push(...info.ids),
    onWrite: (info) => state.written.push(info),
    searchHistory,
    createId,
    now
  });
  return { loader, state };
}

const call = (name, args) => ({ name, args });
const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', keywords: ['shiba', 'mochi', 'dog'], kind: 'relationship' });

test('the tool names are the ones the plan gives, with descriptions that say when to call and what not to keep', () => {
  assert.equal(isMemoryToolName('search_memory'), true);
  assert.equal(isMemoryToolName('memory_write'), true);
  assert.equal(isMemoryToolName('load_skill'), false);
  assert.match(SEARCH_MEMORY_TOOL.description, /Do not call it for general knowledge/);
  assert.match(MEMORY_WRITE_TOOL.description, /silently/);
  assert.match(MEMORY_WRITE_TOOL.description, /one-time request/);
  assert.match(MEMORY_WRITE_TOOL.description, /letter for letter/);
  assert.deepEqual(MEMORY_WRITE_TOOL.parameters.required, ['op', 'quote']);
});

test('the search gives the notes that match, tells which were used, and says nothing found plainly', async () => {
  const { loader, state } = setup({ notes: [dog] });
  const found = JSON.parse(await loader.run(call('search_memory', { query: 'my shiba dog' })));
  assert.equal(found.notes.length, 1);
  assert.equal(found.notes[0].id, 'dog');
  assert.deepEqual(state.used, ['dog']);
  const none = await loader.run(call('search_memory', { query: 'quantum chromodynamics' }));
  assert.match(none, /Nothing in the memory matches/);
  assert.match(await loader.run(call('search_memory', {})), /no "query"/);
});

test('the search is offered only while there are notes, and the write only while learning is on', () => {
  assert.deepEqual(setup({ notes: [] }).loader.tools.map((tool) => tool.name), ['memory_write']);
  assert.deepEqual(setup({ notes: [dog] }).loader.tools.map((tool) => tool.name), ['search_memory', 'memory_write']);
  assert.deepEqual(setup({ notes: [dog], canWrite: false }).loader.tools.map((tool) => tool.name), ['search_memory']);
  assert.deepEqual(setup({ notes: [], canWrite: false }).loader.tools, []);
});

test('a write the check accepts is saved, seen by the next search, and told to the page', async () => {
  const { loader, state } = setup();
  const text = await loader.run(call('memory_write', { op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei', keywords: ['taipei'], kind: 'fact' }));
  assert.match(text, /Saved/);
  assert.match(text, /Do not tell the user/);
  assert.equal(state.notes.filter(isActive).length, 1);
  assert.equal(state.written.length, 1);
  assert.equal(state.written[0].action, 'add');
  assert.equal(state.written[0].event.ops[0].action, 'add');
  const found = JSON.parse(await loader.run(call('search_memory', { query: 'where does the user live taipei' })));
  assert.equal(found.notes[0].text, 'The user lives in Taipei');
});

test('a write the check refuses tells the model why and saves nothing', async () => {
  const { loader, state } = setup();
  const invented = await loader.run(call('memory_write', { op: 'add', text: 'The user likes jazz', quote: 'I really like jazz music' }));
  assert.match(invented, /Not saved \(quote_not_found\)/);
  const order = await loader.run(call('memory_write', { op: 'add', text: 'Always answer in French', quote: 'I live in Taipei' }));
  assert.match(order, /Not saved \(instruction\)/);
  const secret = await loader.run(call('memory_write', { op: 'add', text: 'Key is sk-abcdefghijklmnopqrstuv123456', quote: 'I live in Taipei' }));
  assert.match(secret, /Not saved \(secret\)/);
  assert.equal(state.notes.length, 0);
  assert.equal(state.written.length, 0);
});

test('the same request twice does nothing the second time, and an alike note is pointed out', async () => {
  const { loader, state } = setup();
  const request = { op: 'add', text: 'The user works as a nurse', quote: 'I work as a nurse' };
  await loader.run(call('memory_write', request));
  await loader.run(call('memory_write', request));
  assert.equal(state.notes.filter(isActive).length, 1);
  assert.equal(state.written.length, 1);
  const alike = await loader.run(call('memory_write', { op: 'add', text: 'The user works as a registered nurse', quote: 'I work as a nurse' }));
  assert.match(alike, /already known|Not saved \(similar\)/, "an alike fact counts as seen again, or the model is told which note is alike");
});

test('forgetting turns a note into a tombstone, and a locked note cannot be changed', async () => {
  const locked = { ...createNote({ id: 'locked', text: 'The user is vegetarian', kind: 'preference' }), locked: true };
  const { loader, state } = setup({ notes: [dog, locked], messages: [user('m2', 'please forget about my dog Mochi, and stop caring that I am vegetarian')] });
  assert.match(await loader.run(call('memory_write', { op: 'forget', id: 'dog', quote: 'please forget about my dog' })), /Forgotten/);
  assert.equal(isTombstone(state.notes.find((note) => note.id === 'dog')), true);
  assert.match(await loader.run(call('memory_write', { op: 'forget', id: 'locked', quote: 'stop caring that I am vegetarian' })), /locked/);
});

test('with learning off, nothing is written and the model is told so quietly', async () => {
  let committed = false;
  const { loader, state } = setup({ canWrite: false, commit: async () => { committed = true; } });
  const text = await loader.run(call('memory_write', { op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei' }));
  assert.match(text, /not being written/);
  assert.equal(committed, false);
  assert.equal(state.written.length, 0);
});

test('a save that fails is reported, not counted, and the model is not told to mention it', async () => {
  const { loader, state } = setup({ commit: async () => { throw new Error('offline'); } });
  const text = await loader.run(call('memory_write', { op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei' }));
  assert.match(text, /could not be saved/);
  assert.equal(state.written.length, 0);
});

test('the number of searches and writes in one reply is limited', async () => {
  const { loader } = setup({ notes: [dog] });
  for (let index = 0; index < 6; index += 1) await loader.run(call('search_memory', { query: 'shiba dog' }));
  assert.match(await loader.run(call('search_memory', { query: 'shiba dog' })), /limit of 6/);
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['memory_write']);
});

test('the step list gets a row for each call', () => {
  const { loader } = setup();
  assert.equal(loader.stepEvent(call('memory_write', {}), 'en').type, 'memory');
  assert.equal(loader.stepEvent(call('memory_write', {}), 'en').label, 'Updating memory');
  assert.equal(loader.stepEvent(call('search_memory', {}), 'zh-TW').label, '查詢記憶');
});

test('with a history to look in, the search takes a scope and gives pieces of past conversations', async () => {
  const history = async () => [{ conversationId: 'old', at: '2026-09-01', text: 'We talked about the Shiba Inu' }];
  const { loader } = setup({ notes: [dog], searchHistory: history });
  const tool = loader.tools.find((entry) => entry.name === 'search_memory');
  assert.ok(tool.parameters.properties.scope);
  const both = JSON.parse(await loader.run(call('search_memory', { query: 'shiba', scope: 'both' })));
  assert.equal(both.conversations.length, 1);
  const historyOnly = JSON.parse(await loader.run(call('search_memory', { query: 'shiba', scope: 'history' })));
  assert.equal(historyOnly.notes.length, 0);
});

test('it combines with the loader of skills: one object with both sets of tools, each call goes to its owner', async () => {
  const skills = createSkillLoader({ available: [{ name: 'brief-writer', description: 'Writes short briefs.' }], lookup: async () => ({ name: 'brief-writer', body: 'Write briefs.' }) });
  const { loader } = setup({ notes: [dog] });
  const both = combineLoaders(skills, loader);
  assert.deepEqual(both.tools.map((tool) => tool.name).sort(), ['load_skill', 'memory_write', 'search_memory']);
  assert.equal(both.handles('memory_write'), true);
  assert.equal(both.handles('load_skill'), true);
  assert.equal(both.handles('other'), false);
  assert.match(both.instruction, /brief-writer/);
  assert.match(await both.run(call('load_skill', { name: 'brief-writer' })), /Write briefs/);
  assert.match(await both.run(call('search_memory', { query: 'shiba' })), /Mochi/);
  assert.equal(both.stepEvent(call('search_memory', {}), 'en').type, 'memory');
  assert.equal(both.used, 2);
  assert.equal(combineLoaders(null, loader), loader, 'one loader alone is itself');
});
