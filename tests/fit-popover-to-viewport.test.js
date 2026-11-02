import assert from 'node:assert/strict';
import test from 'node:test';

import { fitPopoverToViewport, fitPopoverWhileOpen } from '../src/app/ui/dom/fit-popover-to-viewport.js';

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

test('a menu opened while the keyboard is sliding is fitted again when the screen is resized, and stops when it is closed', () => {
  const listeners = {};
  const timers = [];
  let rect = { top: 400, bottom: 900, height: 500 };
  const visible = new Set(['visible']);
  const popover = { style: { maxHeight: '' }, classList: { contains: (name) => visible.has(name) }, getBoundingClientRect: () => rect };
  const win = {
    innerHeight: 700,
    visualViewport: null,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { delete listeners[type]; },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout: () => {}
  };
  fitPopoverWhileOpen(popover, win);
  assert.equal(typeof listeners.resize, 'function');
  // the box moved while the keyboard came up: the first measure is stale
  popover.style.maxHeight = '100px';
  rect = { top: 100, bottom: 500, height: 400 };
  listeners.resize();
  assert.equal(popover.style.maxHeight, '');
  // closed: the next call stops watching
  visible.delete('visible');
  listeners.resize();
  assert.equal(listeners.resize, undefined);
});
