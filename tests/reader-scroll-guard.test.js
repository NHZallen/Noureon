import assert from 'node:assert/strict';
import test from 'node:test';

import { isReaderScrolling, setScrollTopQuietly, watchReader } from '../src/app/ui/motion/reader-scroll-guard.js';

const makeBox = (top = 0, height = 1000, client = 200) => {
  const listeners = {};
  return {
    scrollTop: top,
    scrollHeight: height,
    clientHeight: client,
    listeners,
    addEventListener: (type, handler) => { listeners[type] = handler; }
  };
};

test('a finger on the box stops the app from moving it', () => {
  const box = makeBox(100);
  watchReader(box);
  assert.equal(setScrollTopQuietly(box, 800), true);
  box.listeners.touchstart();
  assert.equal(isReaderScrolling(box), true);
  assert.equal(box.scrollTop, 799, 'nudged off the end by the touch');
  assert.equal(setScrollTopQuietly(box, 100), false);
  assert.equal(box.scrollTop, 799);
});

test('a flick that is still coasting counts as scrolling', async () => {
  const box = makeBox(100);
  watchReader(box);
  box.listeners.touchstart();
  box.listeners.touchend();
  box.listeners.scroll();
  assert.equal(isReaderScrolling(box), true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(isReaderScrolling(box), false);
});

test('a finger landing on a box resting on an end moves it one pixel off that end', () => {
  const atBottom = makeBox(800);
  watchReader(atBottom);
  atBottom.listeners.touchstart();
  assert.equal(atBottom.scrollTop, 799);

  const atTop = makeBox(0);
  watchReader(atTop);
  atTop.listeners.touchstart();
  assert.equal(atTop.scrollTop, 1);

  const chat = makeBox(800);
  watchReader(chat, { nudge: false });
  chat.listeners.touchstart();
  assert.equal(chat.scrollTop, 800, 'the chat has its own nudge');
});

test('the app\'s own scroll does not count as the reader scrolling', () => {
  const box = makeBox(100);
  watchReader(box);
  box.scrollTop = 0;
  const realSet = box;
  Object.defineProperty(realSet, 'scrollTop', {
    get() { return this._top ?? 0; },
    set(value) { this._top = value; if (this.listeners.scroll) this.listeners.scroll(); }
  });
  assert.equal(setScrollTopQuietly(box, 500), true);
  assert.equal(isReaderScrolling(box), false);
});

test('the app\'s own move is recognised when its scroll event arrives a frame later', async () => {
  const box = makeBox(0, 1000, 200);
  watchReader(box);
  setScrollTopQuietly(box, 799);
  await new Promise((resolve) => setTimeout(resolve, 5));
  box.listeners.scroll();
  assert.equal(isReaderScrolling(box), false, 'following the end is not mistaken for the reader');
  assert.equal(setScrollTopQuietly(box, 899), true, 'so it keeps following');
});
