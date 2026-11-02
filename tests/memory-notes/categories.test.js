import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_CATEGORIES, addCategory, categoriesOf, categoryName, kindFor, normalizeCategories, removeCategory, renameCategory, resolveKind } from '../../src/app/runtime/memory-notes/categories.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';
import { addByUser, countByCategory, filterNotes, setKindByUser } from '../../src/app/runtime/memory-notes/manage.js';
import { buildSystemText } from '../../src/app/runtime/memory-notes/inject.js';
import { buildCuratorPrompt } from '../../src/data/memory-curator.js';
import { buildNotesExport, planNotesImport } from '../../src/app/runtime/memory-notes/notes-transfer.js';
import { canBeStanding } from '../../src/app/runtime/memory-notes/standing.js';
import { defaultSettings, normalizeSettings } from '../../src/app/runtime/memory-notes/records.js';

// The categories of the notes: five at the start, any of them may be renamed or removed, the person adds their own; a note whose category is gone is uncategorized.

const five = categoriesOf({});
const named = (id) => ({ preference: 'Preference', fact: 'Fact', project: 'Project', relationship: 'People', routine: 'Routine' }[id] || '');

test('a memory starts with the five categories, and the list of the settings is read carefully', () => {
  assert.deepEqual(five.map((category) => category.id), ['preference', 'fact', 'project', 'relationship', 'routine']);
  assert.equal(defaultSettings().categories, null);
  assert.equal(normalizeSettings({}).categories, null);
  const list = normalizeSettings({ categories: [{ id: 'fact', name: '' }, { id: 'c-pets', name: '  Pets  ' }, { id: 'c-pets', name: 'again' }, { id: 'none', name: 'x' }, { id: 'bad id!', name: 'x' }, { id: 'c-noname', name: '' }, 'junk'] }).categories;
  assert.deepEqual(list, [{ id: 'fact', name: '' }, { id: 'c-pets', name: 'Pets' }]);
  assert.deepEqual(normalizeCategories('nope'), null);
  assert.equal(normalizeCategories(Array.from({ length: 30 }, (_, index) => ({ id: `c-${index}`, name: `n${index}` }))).length, MAX_CATEGORIES);
  assert.equal(categoryName({ id: 'fact', name: '' }, named), 'Fact');
  assert.equal(categoryName({ id: 'fact', name: 'Facts of life' }, named), 'Facts of life');
});

test('a category is added, renamed and removed; a name is needed, it is not used twice, and there is a limit', () => {
  let list = five;
  assert.equal(addCategory(list, '   ').code, 'empty');
  assert.equal(addCategory(list, 'PREFERENCE', { nameOf: (category) => categoryName(category, named) }).code, 'duplicate', 'a name is compared with the names that are shown, not the ids');
  const added = addCategory(list, '  Pets  ', { createId: () => 'AB-12!' });
  assert.equal(added.ok, true);
  assert.equal(added.category.name, 'Pets');
  assert.match(added.category.id, /^c-ab12$/);
  list = added.categories;
  assert.equal(addCategory(list, 'pets').code, 'duplicate');
  assert.equal(renameCategory(list, 'c-ab12', 'Animals').categories.at(-1).name, 'Animals');
  assert.equal(renameCategory(list, 'nope', 'x').code, 'missing');
  assert.equal(renameCategory(list, 'c-ab12', '').code, 'empty');
  const full = Array.from({ length: MAX_CATEGORIES }, (_, index) => ({ id: `c-${index}`, name: `n${index}` }));
  assert.equal(addCategory(full, 'one more').code, 'full');
});

test('removing a category makes its notes uncategorized and keeps every note; the kind of a note is read against the list', () => {
  const notes = [createNote({ id: 'a', text: 'a note', kind: 'project' }), createNote({ id: 'b', text: 'b note', kind: 'fact' })];
  const result = removeCategory(five, 'project', notes, { now: () => '2026-11-02T00:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.categories.some((category) => category.id === 'project'), false);
  assert.deepEqual(result.notes.map((note) => note.kind), ['none', 'fact']);
  assert.equal(removeCategory(five, 'nope', notes).code, 'missing');
  assert.equal(kindFor({ kind: 'project' }, result.categories), 'none', 'a note of a category that is gone shows as uncategorized');
  assert.equal(resolveKind('c-x', result.categories), 'fact');
  assert.equal(resolveKind('c-x', [{ id: 'c-x', name: 'X' }]), 'c-x');
  assert.equal(resolveKind('nope', [{ id: 'c-x', name: 'X' }]), 'none', 'no "fact" to fall back to');
});

test('the check of a write takes the kind from the categories of the person, and a note about a person or a project is never standing', () => {
  const context = { messages: [{ id: 'm1', role: 'user', text: 'I always want short answers, and my cat is called Mimi', at: '2026-11-01T00:00:00Z' }], createId: () => 'n1', now: () => '2026-11-02T00:00:00.000Z' };
  const cats = [{ id: 'c-pets', name: 'Pets' }, { id: 'fact', name: '' }];
  const kept = applyWrite({ notes: [], request: { op: 'add', text: 'The user has a cat called Mimi', quote: 'my cat is called Mimi', kind: 'c-pets' }, context: { ...context, categories: cats } });
  assert.equal(kept.note.kind, 'c-pets');
  const other = applyWrite({ notes: [], request: { op: 'add', text: 'The user has a cat called Mimi', quote: 'my cat is called Mimi', kind: 'relationship' }, context: { ...context, categories: cats } });
  assert.equal(other.note.kind, 'fact', 'a category that is not in the list falls back to "fact"');
  const old = applyWrite({ notes: [], request: { op: 'add', text: 'The user has a cat called Mimi', quote: 'my cat is called Mimi', kind: 'relationship' }, context });
  assert.equal(old.note.kind, 'relationship', 'without the list the five of a memory are used');
  const standing = applyWrite({ notes: [], request: { op: 'add', text: 'The user wants short answers', quote: 'I always want short answers', kind: 'c-pets', standing: true }, context: { ...context, categories: cats } });
  assert.equal(standing.note.standing, true, 'a category of their own may hold a standing note');
  assert.equal(canBeStanding({ status: 'active', surface: 'normal', kind: 'relationship', notRelevant: 0 }), false);
  assert.equal(canBeStanding({ status: 'active', surface: 'normal', kind: 'none', notRelevant: 0 }), true);
});

test('what the person does by hand: a note is made in a category, moved to another or to none, counted and filtered by it', () => {
  const cats = [{ id: 'c-pets', name: 'Pets' }, { id: 'fact', name: '' }];
  const made = addByUser([], { text: 'The user has a dog', kind: 'c-pets', categories: cats, createId: () => 'a' });
  assert.equal(made.note.kind, 'c-pets');
  const next = addByUser(made.notes, { text: 'The user lives in Taipei', kind: 'zzz', categories: cats, createId: () => 'b' });
  assert.equal(next.note.kind, 'fact');
  const moved = setKindByUser(next.notes, 'a', 'none', { categories: cats });
  assert.equal(moved.notes.find((note) => note.id === 'a').kind, 'none');
  assert.equal(setKindByUser(next.notes, 'a', 'nope', { categories: cats }).code, 'missing');
  assert.deepEqual(countByCategory(moved.notes, cats), { none: 1, fact: 1 });
  assert.deepEqual(filterNotes(moved.notes, { kind: 'none', categories: cats }).map((note) => note.id), ['a']);
  assert.deepEqual(filterNotes([...moved.notes, createNote({ id: 'old', text: 'old kind', kind: 'gone' })], { kind: 'none', categories: cats }).map((note) => note.id).sort(), ['a', 'old']);
});

test('the model is told the categories of the person: the text of the memory, the prompt of the curator', () => {
  const cats = [{ id: 'c-pets', name: 'Pets' }, { id: 'fact', name: '' }];
  const notes = [createNote({ id: 'a', text: 'The user has a dog', kind: 'c-pets' }), createNote({ id: 'b', text: 'The user lives in Taipei', kind: 'fact' }), createNote({ id: 'c', text: 'An old one', kind: 'gone' })];
  const text = buildSystemText({ notes, canSearch: true, categories: cats });
  assert.match(text, /Pets \(1\), facts \(1\), other \(1\)/);
  assert.match(text, /c-pets = Pets/);
  assert.match(buildSystemText({ notes: [notes[1]], canSearch: true }), /facts \(1\)/, 'without the list: as before');
  const prompt = buildCuratorPrompt({ current: { text: 'hi there', at: '2026-11-02' }, categories: cats });
  assert.match(prompt, /"kind":"c-pets\|fact"/);
  assert.match(prompt, /c-pets = Pets/);
  assert.match(buildCuratorPrompt({ current: { text: 'hi there' } }), /"kind":"preference\|fact\|project\|relationship\|routine"/);
});

test('the file of the notes carries the categories, and an import adds the ones this memory does not have', () => {
  const cats = [{ id: 'c-pets', name: 'Pets' }, { id: 'fact', name: '' }];
  const notes = [createNote({ id: 'a', text: 'The user has a dog', kind: 'c-pets' })];
  const file = buildNotesExport(notes, () => '2026-11-02T00:00:00.000Z', cats);
  assert.deepEqual(file.categories, [{ id: 'c-pets', name: 'Pets' }, { id: 'fact', name: 'fact' }]);
  const plan = planNotesImport([], file, { createId: () => 'x', categories: five });
  assert.equal(plan.ok, true);
  assert.equal(plan.notes[0].kind, 'c-pets');
  assert.equal(plan.categories.at(-1).name, 'Pets', 'the category of the file is added');
  const unknown = planNotesImport([], { version: 1, notes: [{ text: 'A thing the user said', kind: 'mystery' }] }, { createId: () => 'y', categories: five });
  assert.equal(unknown.notes[0].kind, 'fact');
});
