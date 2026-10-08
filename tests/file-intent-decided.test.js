import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldInjectFileGuidance } from '../src/app/ui/files/file-intent.js';

const fence = '`'.repeat(3);
const recentFile = [{ role: 'model', parts: [{ text: `Here it is.\n${fence}file name="a.csv"\nx,y\n1,2\n${fence}\n` }] }];

test('a judgement about the message beats the word list, and no judgement leaves the word list in charge', () => {
  assert.equal(shouldInjectFileGuidance({ currentText: 'hello there', decided: true }), true, 'judged to want a file: guidance although no word says so');
  assert.equal(shouldInjectFileGuidance({ currentText: 'make me a PowerPoint deck', decided: false }), false, 'judged not to: no guidance although a word says so');
  assert.equal(shouldInjectFileGuidance({ currentText: 'make me a PowerPoint deck', decided: null }), true, 'no judgement: the words decide as before');
  assert.equal(shouldInjectFileGuidance({ currentText: 'hello there' }), false);
});

test('a follow-up on a file just made still gets the guidance whatever the judgement says', () => {
  assert.equal(shouldInjectFileGuidance({ currentText: 'make the title bigger', history: recentFile, decided: false }), true);
  assert.equal(shouldInjectFileGuidance({ currentText: 'make the title bigger', history: recentFile, decided: null }), true);
  assert.equal(shouldInjectFileGuidance({ currentText: 'make the title bigger', history: [], decided: false }), false);
});
