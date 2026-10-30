import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITS, createNote, isActive, isTombstone } from '../../src/app/runtime/memory-notes/notes.js';
import { addByUser, deleteByUser, describeEvent, editByUser, filterNotes, setNeverByUser, setStandingByUser, summarize, undoEvent } from '../../src/app/runtime/memory-notes/manage.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';
import { findTombstone } from '../../src/app/runtime/memory-notes/tombstone.js';

let counter = 0;
const createId = () => `id-${(counter += 1)}`;
const at = (minutes) => () => new Date(Date.UTC(2026, 9, 30, 0, minutes)).toISOString();
const make = (id, text, extra = {}) => createNote({ id, text, kind: 'fact', ...extra });

test('a note written by the person has their own words as its source and no duplicate is made', () => {
  const first = addByUser([], { text: '  I have a   Shiba Inu named Mochi ', kind: 'relationship', createId, now: at(1) });
  assert.equal(first.ok, true);
  assert.equal(first.note.text, 'I have a Shiba Inu named Mochi');
  assert.equal(first.note.kind, 'relationship');
  assert.equal(first.note.source.quote, 'I have a Shiba Inu named Mochi');
  assert.ok(first.note.keywords.length > 0);
  const again = addByUser(first.notes, { text: 'i have a shiba inu named mochi', createId, now: at(2) });
  assert.equal(again.code, 'duplicate');
  assert.equal(again.note.id, first.note.id);
  assert.equal(addByUser([], { text: '   ', createId }).code, 'empty');
  assert.equal(addByUser([], { text: 'x'.repeat(500), createId }).note.text.length, LIMITS.maxText);
});

test('there is no room for a note past the limit', () => {
  const full = Array.from({ length: LIMITS.maxActive }, (_, index) => make(`n${index}`, `note number ${index} about something`));
  assert.equal(addByUser(full, { text: 'one more', createId }).code, 'full');
});

test('editing changes the words, finds new keywords and locks the note', () => {
  const notes = [make('a', 'The user lives in Taipei', { keywords: ['taipei'] }), make('b', 'The user likes tea')];
  const edited = editByUser(notes, 'a', { text: 'The user lives in Hsinchu', now: at(3) });
  assert.equal(edited.ok, true);
  const note = edited.notes.find((entry) => entry.id === 'a');
  assert.equal(note.text, 'The user lives in Hsinchu');
  assert.equal(note.locked, true);
  assert.ok(note.keywords.includes('hsinchu'));
  assert.equal(editByUser(notes, 'a', { text: 'the user likes tea' }).code, 'duplicate');
  assert.equal(editByUser(notes, 'a', { text: ' ' }).code, 'empty');
  assert.equal(editByUser(notes, 'nope', { text: 'x' }).code, 'missing');
});

test('the first page takes only notes that can be there, and only so many', () => {
  const notes = [make('a', 'The user prefers short answers', { kind: 'preference' }), make('b', 'Works on the Noureon project', { kind: 'project' }), make('c', 'Allergic to peanuts', { surface: 'never' })];
  assert.equal(setStandingByUser(notes, 'a', true).notes.find((note) => note.id === 'a').standing, true);
  assert.equal(setStandingByUser(notes, 'b', true).code, 'cannot', 'a project is not for every answer');
  assert.equal(setStandingByUser(notes, 'c', true).code, 'cannot', 'a note that is not to be mentioned is not on the first page');
  const crowded = Array.from({ length: LIMITS.maxStanding }, (_, index) => make(`s${index}`, `standing note ${index} here`, { kind: 'preference', standing: true }));
  const withOne = [...crowded, make('x', 'one more preference', { kind: 'preference' })];
  assert.equal(setStandingByUser(withOne, 'x', true).code, 'full');
  assert.equal(setStandingByUser(withOne, 's0', false).notes.find((note) => note.id === 's0').standing, false);
});

test('"do not bring it up" takes the note off the first page and can be undone', () => {
  const notes = [make('a', 'Vegetarian', { kind: 'preference', standing: true })];
  const never = setNeverByUser(notes, 'a', true).notes[0];
  assert.equal(never.surface, 'never');
  assert.equal(never.standing, false);
  assert.equal(setNeverByUser([never], 'a', false).notes[0].surface, 'normal');
});

test('deleting leaves a tombstone without the text, and the same thing is not learned again', () => {
  const notes = [make('a', 'The user has a dog named Mochi', { keywords: ['dog', 'mochi'] })];
  const gone = deleteByUser(notes, 'a', { now: at(5) }).notes[0];
  assert.equal(isTombstone(gone), true);
  assert.equal(gone.text, '');
  assert.ok(findTombstone({ text: 'The user has a dog named Mochi', keywords: ['dog', 'mochi'], messageIds: [] }, [gone]));
  assert.equal(deleteByUser([gone], 'a').code, 'missing');
});

test('finding notes: by view, kind and words, the newest change first', () => {
  const notes = [
    { ...make('a', 'Likes jasmine tea', { kind: 'preference', standing: true }), updatedAt: at(1)() },
    { ...make('b', 'Works at a bakery', { kind: 'fact' }), updatedAt: at(9)() },
    { ...make('c', 'Old address'), updatedAt: at(5)(), status: 'archived' }
  ];
  assert.deepEqual(filterNotes(notes).map((note) => note.id), ['b', 'a']);
  assert.deepEqual(filterNotes(notes, { view: 'standing' }).map((note) => note.id), ['a']);
  assert.deepEqual(filterNotes(notes, { view: 'archived' }).map((note) => note.id), ['c']);
  assert.deepEqual(filterNotes(notes, { kind: 'preference' }).map((note) => note.id), ['a']);
  assert.deepEqual(filterNotes(notes, { query: 'BAKERY' }).map((note) => note.id), ['b']);
  assert.deepEqual(summarize(notes), { active: 2, standing: 1, archived: 1, updatedAt: at(9)() });
});

const writeContext = (messages, extra = {}) => ({ conversationId: 'c1', messages, who: 'tool', appliedOps: [], createId, now: at(10), ...extra });
const user = (id, text, minutes = 0) => ({ id, role: 'user', text, at: at(minutes)() });

test('undoing what the model wrote: an added note goes, a changed note gets its old words, a forgotten note comes back', () => {
  const added = applyWrite({ notes: [], request: { op: 'add', text: 'The user lives in Taipei', quote: 'I live in Taipei', keywords: ['taipei'] }, context: writeContext([user('m1', 'I live in Taipei')]) });
  assert.equal(added.ok, true);
  assert.deepEqual(describeEvent(added.event), { action: 'add', text: 'The user lives in Taipei', beforeText: '' });
  const undoneAdd = undoEvent(added.notes, added.event, { now: at(11) });
  assert.equal(undoneAdd.undone, 1);
  assert.equal(isActive(undoneAdd.notes[0]), false);

  const moved = applyWrite({ notes: added.notes, request: { op: 'update', id: added.note.id, text: 'The user lives in Hsinchu', quote: 'I moved to Hsinchu' }, context: writeContext([user('m2', 'I moved to Hsinchu', 30)], { now: at(40) }) });
  assert.equal(moved.ok, true);
  assert.equal(moved.notes.find((note) => note.id === added.note.id).text, 'The user lives in Hsinchu');
  const back = undoEvent(moved.notes, moved.event, { now: at(41) });
  assert.equal(back.notes.find((note) => note.id === added.note.id).text, 'The user lives in Taipei');

  const forgotten = applyWrite({ notes: added.notes, request: { op: 'forget', id: added.note.id, quote: 'forget where I live' }, context: writeContext([user('m3', 'please forget where I live', 50)], { now: at(60) }) });
  assert.equal(forgotten.ok, true);
  assert.equal(isTombstone(forgotten.notes.find((note) => note.id === added.note.id)), true);
  const returned = undoEvent(forgotten.notes, forgotten.event, { now: at(61) });
  const note = returned.notes.find((entry) => entry.id === added.note.id);
  assert.equal(isActive(note), true);
  assert.equal(note.text, 'The user lives in Taipei');
});

test('an event that only saw a note again has nothing to undo', () => {
  const event = { id: 'e', ops: [{ action: 'reinforce', noteId: 'a', before: { id: 'a', text: 'x' }, after: { id: 'a', text: 'x' } }] };
  assert.equal(describeEvent(event), null);
  assert.equal(undoEvent([make('a', 'x')], event).ok, false);
});
