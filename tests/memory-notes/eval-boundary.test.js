import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkServerSource } from '../../scripts/check-server-boundaries.mjs';
import { loadCases, runDeterministic } from '../../scripts/memory-eval.mjs';
import { LIMITS, NOTE_STATUS, createNote, normalizeKeywords, normalizeNote } from '../../src/app/runtime/memory-notes/notes.js';

const DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'app', 'runtime', 'memory-notes');
const FILES = readdirSync(DIRECTORY).filter((name) => name.endsWith('.js'));

test('the modules of memory-notes are shared by the page and the server: no browser global, and they import only each other', () => {
  assert.ok(FILES.length >= 10);
  const allowed = FILES.map((name) => `src/app/runtime/memory-notes/${name}`);
  for (const name of FILES) {
    const path = join(DIRECTORY, name);
    assert.deepEqual(checkServerSource(path, readFileSync(path, 'utf8'), allowed), [], name);
  }
});

test('the offline cases: no slip for a question about nothing, the slip for a question about a note, and the check of writes says what it should', () => {
  const result = runDeterministic(loadCases());
  assert.deepEqual(result.failures, []);
  assert.equal(result.overReference, 0);
  assert.equal(result.hitRate, 1);
  assert.ok(result.neutral >= 30 && result.recall >= 10);
});

test('a note is read as a note: a text and an id are needed, the limits hold, a tombstone has no text, and the keywords are short and few', () => {
  assert.equal(normalizeNote(null), null);
  assert.equal(normalizeNote({ id: '', text: 'x' }), null);
  assert.equal(normalizeNote({ id: 'a', text: '   ' }), null);
  const note = normalizeNote({ id: 'a', text: `  ${'x '.repeat(200)} `, keywords: Array.from({ length: 20 }, (_, index) => `k${index}`), kind: 'nope', evidenceCount: -4, validUntil: 'not a date' });
  assert.equal(note.text.length <= LIMITS.maxText, true);
  assert.equal(note.keywords.length, LIMITS.maxKeywords);
  assert.equal(note.kind, 'fact');
  assert.equal(note.evidenceCount, 1);
  assert.equal(note.validUntil, null);
  assert.equal(note.status, NOTE_STATUS.active);
  const tombstone = normalizeNote({ id: 'b', status: 'deleted', text: 'should not be kept', keywords: ['台中'], hint: '台中' });
  assert.equal(tombstone.text, '');
  assert.deepEqual(normalizeKeywords(['台中', '台中', ' Taichung ', '', 'x'.repeat(50)]).map((word) => word.length), [2, 8, 30]);
  const made = createNote({ id: 'c', text: '使用者下個月要去日本旅遊', now: () => '2026-10-30T00:00:00.000Z' });
  assert.ok(made.keywords.includes('日本'), 'a note with no keywords gets its strongest words');
  assert.equal(made.createdAt, '2026-10-30T00:00:00.000Z');
});
