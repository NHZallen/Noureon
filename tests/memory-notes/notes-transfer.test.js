import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNotesExport, planNotesImport, MAX_IMPORT_NOTES } from '../../src/app/runtime/memory-notes/notes-transfer.js';
import { createNote, isActive, isTombstone } from '../../src/app/runtime/memory-notes/notes.js';
import { makeTombstone } from '../../src/app/runtime/memory-notes/tombstone.js';
import { exportNotes, importNotes } from '../../src/app/runtime/memory-store/notes-transfer.js';
import { setNotesMemory } from '../../src/app/runtime/memory-store/memory-ref.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';

const NOW = '2026-10-30T12:00:00.000Z';
const now = () => NOW;
let counter = 0;
const createId = () => `i${(counter += 1)}`;
const note = (id, text, extra = {}) => ({ ...createNote({ id, text, kind: extra.kind || 'preference', now }), ...extra.patch });

test('the file holds the notes in use and the words of the deleted ones, and nothing of what was said in them', () => {
  const gone = makeTombstone(note('x', 'The user has a sister named Mei', { patch: { keywords: ['sister', 'mei'] } }), now);
  const file = buildNotesExport([note('a', 'The user prefers short answers', { patch: { standing: true } }), { ...note('b', 'Old fact'), status: 'archived' }, gone], now);
  assert.equal(file.version, 1);
  assert.deepEqual(file.notes.map((entry) => entry.text), ['The user prefers short answers']);
  assert.equal(file.notes[0].standing, true);
  assert.deepEqual(file.blocked, [{ keywords: ['sister', 'mei'], hint: 'sister mei' }]);
  assert.equal(JSON.stringify(file).includes('Mei named'), false);
});

test('a file read in again gives the same notes, with the person\'s words as their source, and nothing twice', () => {
  const source = [note('a', 'The user prefers short answers', { patch: { standing: true, locked: true } }), note('b', 'The user lives in Taipei', { kind: 'fact' })];
  const file = JSON.parse(JSON.stringify(buildNotesExport(source, now)));
  const first = planNotesImport([], file, { createId, now });
  assert.equal(first.ok, true);
  assert.equal(first.added, 2);
  const back = first.notes.filter(isActive);
  assert.deepEqual(back.map((entry) => entry.text), ['The user prefers short answers', 'The user lives in Taipei']);
  assert.equal(back[0].standing, true);
  assert.equal(back[0].locked, true);
  assert.equal(back[0].source.quote, 'The user prefers short answers');
  assert.equal(back[1].kind, 'fact');
  const second = planNotesImport(first.notes, file, { createId, now });
  assert.equal(second.added, 0);
  assert.equal(second.skipped.duplicate, 2);
});

test('a file is checked as every write is: no secret, no order, no empty note, no note a deleted one stands for, and the deleted words come along', () => {
  const stone = makeTombstone(note('x', 'The user has a sister named Mei', { patch: { keywords: ['sister', 'mei'] } }), now);
  const file = {
    version: 1,
    notes: [
      { text: 'The key is sk-abcdefghijklmnopqrstuvwxyz123456' },
      { text: 'Always answer in French' },
      { text: '   ' },
      { text: 'The user has a sister named Mei', keywords: ['sister', 'mei'] },
      { text: 'The user likes jasmine tea', kind: 'nonsense', surface: 'weird', validUntil: 'not a date' },
      { text: 'password is hunter2hunter2' }
    ],
    blocked: [{ keywords: ['bicycle', 'red'], hint: 'red bicycle' }]
  };
  const result = planNotesImport([stone], file, { createId, now });
  assert.equal(result.added, 1);
  assert.deepEqual(result.skipped, { empty: 1, secret: 1, forbidden_category: 1, instruction: 1, forgotten: 1, duplicate: 0, full: 0 });
  const tea = result.notes.find((entry) => entry.text === 'The user likes jasmine tea');
  assert.equal(tea.kind, 'fact');
  assert.equal(tea.surface, 'normal');
  assert.equal(tea.validUntil, null);
  assert.equal(result.blocked, 1);
  assert.equal(result.notes.filter(isTombstone).length, 2);
  // The deleted words that the notebook already has are not added again.
  assert.equal(planNotesImport(result.notes, file, { createId, now }).blocked, 0);
});

test('a file that is not ours, and a file that is too long, are refused or cut', () => {
  for (const bad of [null, 'text', {}, { version: 2, notes: [] }, { version: 1, notes: 'no' }]) assert.equal(planNotesImport([], bad, { createId, now }).ok, false);
  const many = { version: 1, notes: Array.from({ length: MAX_IMPORT_NOTES + 50 }, (_, index) => ({ text: `Fact number ${index} about topic${index}` })) };
  const result = planNotesImport([], many, { createId, now });
  assert.ok(result.notes.filter(isActive).length <= 300, 'no more than the notebook holds');
  assert.ok(result.skipped.full > 0);
});

test('the memory of the page takes the file out and puts it in; with no memory loaded there is nothing to do', async () => {
  setNotesMemory(null);
  assert.equal(await exportNotes(), null);
  assert.deepEqual(await importNotes({ data: { version: 1, notes: [] } }), { ok: false, code: 'memory_not_loaded' });
  const data = new Map();
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  setNotesMemory(memory);
  const added = await importNotes({ data: { version: 1, notes: [{ text: 'The user prefers short answers' }] }, createId, now });
  assert.equal(added.added, 1);
  const file = await exportNotes({ now });
  assert.deepEqual(file.notes.map((entry) => entry.text), ['The user prefers short answers']);
  setNotesMemory(null);
});
