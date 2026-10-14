import assert from 'node:assert/strict';
import test from 'node:test';

import { fitPopoverToViewport } from '../src/app/ui/dom/fit-popover-to-viewport.js';

const popoverAt = (rect) => ({ style: { maxHeight: 'stale' }, getBoundingClientRect: () => rect });

test('a popover that runs off the bottom of the screen is shortened to the room that is left', () => {
  const popover = popoverAt({ top: 400, bottom: 900, height: 500 });
  fitPopoverToViewport(popover, { innerHeight: 700 });
  assert.equal(popover.style.maxHeight, '288px');
});

test('a popover that runs off the top is shortened by what is cut', () => {
  const popover = popoverAt({ top: -40, bottom: 400, height: 440 });
  fitPopoverToViewport(popover, { innerHeight: 700 });
  assert.equal(popover.style.maxHeight, '388px');
});

test('a popover that fits is left to its own style', () => {
  const popover = popoverAt({ top: 100, bottom: 500, height: 400 });
  fitPopoverToViewport(popover, { innerHeight: 700 });
  assert.equal(popover.style.maxHeight, '');
});
