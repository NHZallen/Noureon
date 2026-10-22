import assert from 'node:assert/strict';
import test from 'node:test';

import { pictureOffsets, placePictures } from '../src/data/picture-interleave.js';
import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';

const pic = (id) => ({ generatedImage: { id } });
const record = formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: 4000 });

test('the words before the first picture keep the run record; words between and after are parts of their own', () => {
  const answer = 'I will draw it.Here it is.Done!';
  const parts = placePictures(`${record}${answer}`, [pic('a'), pic('b')], [15, 26]);
  assert.deepEqual(parts.map((part) => part.generatedImage?.id || part.text.replace(record, '[record]')), ['[record]I will draw it.', 'a', 'Here it is.', 'b', 'Done!']);
  assert.equal(parts[0].text.startsWith(record), true);
});

test('with no words around, the pictures stand alone; the first text part is never lost (it holds the record)', () => {
  assert.deepEqual(placePictures('', [pic('a')], [0]).map((part) => part.generatedImage?.id || part.text), ['', 'a']);
  assert.deepEqual(placePictures(`${record}`, [pic('a')], [0]).map((part) => part.generatedImage?.id || part.text.length > 0), [true, 'a']);
  assert.deepEqual(placePictures('Hello', []), [{ text: 'Hello' }]);
});

test('an offset past the end, or out of order, is put right', () => {
  const parts = placePictures('abc', [pic('a'), pic('b')], [99, 1]);
  assert.deepEqual(parts.map((part) => part.generatedImage?.id || part.text), ['abc', 'a', 'b']);
});

test('the page reads the places back: the same offsets, relative to the answer, whatever record stands above', () => {
  const answer = 'I will draw it.Here it is.';
  const parts = placePictures(`${record}${answer}`, [pic('a')], [15]);
  const { text, pictures, offsets } = pictureOffsets(parts);
  assert.equal(text, `${record}${answer}`);
  assert.deepEqual(pictures.map((part) => part.generatedImage.id), ['a']);
  assert.deepEqual(offsets, [15]);
  // Placed again in a text with another record above it (the page writes its own), the pictures stand in the same place of the answer.
  const other = formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: 9000, madeHere: true });
  const again = placePictures(`${other}${answer}`, pictures, offsets);
  assert.deepEqual(again.map((part) => part.generatedImage?.id || part.text.replace(other, '[record]')), ['[record]I will draw it.', 'a', 'Here it is.']);
});
