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
  assert.equal(box.scrollTop, 798, 'nudged off the end by the touch');
  assert.equal(setScrollTopQuietly(box, 100), false);
  assert.equal(box.scrollTop, 798);
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

test('a finger landing on a box resting on an end moves it off that end', () => {
  const atBottom = makeBox(800);
  watchReader(atBottom);
  atBottom.listeners.touchstart();
  assert.equal(atBottom.scrollTop, 798);

  const atTop = makeBox(0);
  watchReader(atTop);
  atTop.listeners.touchstart();
  assert.equal(atTop.scrollTop, 2);

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
  setScrollTopQuietly(box, 798);
  await new Promise((resolve) => setTimeout(resolve, 5));
  box.listeners.scroll();
  assert.equal(isReaderScrolling(box), false, 'following the end is not mistaken for the reader');
  assert.equal(setScrollTopQuietly(box, 899), true, 'so it keeps following');
});

test('a box sent to its end keeps following until the reader scrolls it', async () => {
  const { isFollowingEnd, pinToEnd } = await import('../src/app/ui/motion/reader-scroll-guard.js');
  const box = makeBox(100, 1000, 200);
  pinToEnd(box);
  assert.equal(box.scrollTop, 798);
  box.scrollHeight = 2000;
  assert.equal(isFollowingEnd(box), true, 'content grew, still following');
  box.listeners.touchstart();
  assert.equal(isFollowingEnd(box), false, 'the reader took over');
});

test('a finger on any thinking, code or output box resting on an end moves it off that end', async () => {
  const { Window } = await import('happy-dom');
  const { keepScrollBoxesOffTheirEdges } = await import('../src/app/ui/motion/reader-scroll-guard.js');
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = '<div class="ledger-thought" id="a"><span id="inner"></span></div><div id="plain"></div>';
  const stop = keepScrollBoxesOffTheirEdges(document);
  const setSize = (node, top) => {
    Object.defineProperty(node, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 200, configurable: true });
    node.scrollTop = top;
  };
  const a = document.getElementById('a');
  setSize(a, 800);
  document.getElementById('inner').dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  assert.equal(a.scrollTop, 798);
  const plain = document.getElementById('plain');
  setSize(plain, 800);
  plain.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  assert.equal(plain.scrollTop, 800, 'other elements are left alone');
  stop();
  window.happyDOM.abort();
});

test('a box resting a fraction of a pixel from an end (a fractional height) is also moved off it', () => {
  const nearBottom = makeBox(799.4);
  watchReader(nearBottom);
  nearBottom.listeners.touchstart();
  assert.equal(nearBottom.scrollTop, 798);

  const nearTop = makeBox(0.6);
  watchReader(nearTop);
  nearTop.listeners.touchstart();
  assert.equal(nearTop.scrollTop, 2);

  const middle = makeBox(400);
  watchReader(middle);
  middle.listeners.touchstart();
  assert.equal(middle.scrollTop, 400, 'a box in the middle is left where it is');
});
