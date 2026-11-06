import assert from 'node:assert/strict';
import test from 'node:test';

import { recordFiles, recordUsed, resetTrace, takeTrace } from '../../src/app/runtime/memory-store/memory-trace.js';

// The files of the project that the model looked into during a reply are kept for the conversation like the notes are, until the reply is saved.

test('the files looked into are kept by name, once each, at most twenty, and taken with the rest when the reply is saved', () => {
  resetTrace('c1');
  recordFiles('c1', ['plan.pdf', 'plan.pdf', '', 'notes.md']);
  recordUsed('c1', ['n1']);
  assert.deepEqual(takeTrace('c1'), { used: ['n1'], events: [], history: [], files: ['plan.pdf', 'notes.md'] });
  assert.deepEqual(takeTrace('c1').files, [], 'taken once');
  recordFiles('c2', Array.from({ length: 30 }, (_, index) => `f${index}`));
  assert.equal(takeTrace('c2').files.length, 20);
  recordFiles('c3', ['a.pdf']);
  resetTrace('c3');
  assert.deepEqual(takeTrace('c3').files, [], 'a new reply starts with none');
});
