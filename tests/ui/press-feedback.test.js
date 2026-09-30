import assert from 'node:assert/strict';
import test from 'node:test';
import { pressScaleFor } from '../../src/app/ui/motion/press-feedback.js';
import { readUiSource } from '../helpers/source-guards.js';

test('small controls sink the most and big surfaces do not sink', () => {
  assert.equal(pressScaleFor(40, 40), 0.88); // icon button
  assert.equal(pressScaleFor(44, 44), 0.88);
  assert.equal(pressScaleFor(96, 36), 0.94); // pill
  assert.equal(pressScaleFor(320, 68), 0.985); // list row
  assert.equal(pressScaleFor(180, 150), 0.98); // card
  assert.equal(pressScaleFor(390, 700), 1); // a big surface
});

test('press feedback animates scale, not the transform that buttons are forced to none', () => {
  const source = readUiSource('src/app/ui/motion/press-feedback.js');

  assert.match(source, /\{ scale: '1' \}, \{ scale: String\(state\.scale\) \}/);
  assert.doesNotMatch(source, /\[\{ transform: /);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /getComputedStyle\(node\)\.cursor === 'pointer'/);
});

test('press feedback starts only after start-up, so it never touches loading', () => {
  const main = readUiSource('src/main.js');

  assert.ok(main.indexOf('dismissStartupSkeleton(document);') < main.indexOf('installPressFeedback(document);'));
});

test('pressing a switched-off control shakes it sideways instead of doing nothing', () => {
  const source = readUiSource('src/app/ui/motion/press-feedback.js');

  assert.match(source, /button:disabled, \[aria-disabled="true"\]/);
  assert.match(source, /\{ translate: '0' \}, \{ translate: '-3px' \}/);
});
