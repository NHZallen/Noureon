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

test('a box that comes to rest on an end goes off it once it is still, never while a finger is down', async () => {
  const { Window } = await import('happy-dom');
  const { settleScrollBoxesOffTheirEdges } = await import('../src/app/ui/motion/reader-scroll-guard.js');
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = '<div id="chat-container"><p id="text">x</p></div><div class="ledger-thought" id="thought"></div><div id="plain"></div>';
  const timers = new Map();
  let next = 1;
  const view = {
    setTimeout: (callback) => { timers.set(next, callback); return next++; },
    clearTimeout: (id) => { timers.delete(id); }
  };
  const runTimers = () => { const due = [...timers]; timers.clear(); due.forEach(([, callback]) => callback()); };
  const stop = settleScrollBoxesOffTheirEdges(document, { view });
  const size = (node, top, height = 1000) => {
    Object.defineProperty(node, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 200, configurable: true });
    node.scrollTop = top;
  };
  const scrolled = (node) => node.dispatchEvent(new window.Event('scroll'));
  const chat = document.getElementById('chat-container');

  // The reader's fling ends exactly at the bottom: once it is still, the chat goes two pixels off the end.
  size(chat, 800);
  scrolled(chat);
  assert.equal(chat.scrollTop, 800, 'not at once: the fling may still be coasting');
  scrolled(chat);
  assert.equal(timers.size, 1, 'each scroll event pushes the wait forward');
  runTimers();
  assert.equal(chat.scrollTop, 798);

  // Its own scroll event (the move it just made) does not move it again.
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 798);

  // A fraction of a pixel from the end counts as on it; the top likewise.
  size(chat, 799.4);
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 798);
  size(chat, 0.4);
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 2);

  // Mid-way, bouncing past an end, or not a scroll box at all: left alone.
  size(chat, 400);
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 400);
  size(chat, 830);
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 830, 'still bouncing');
  const plain = document.getElementById('plain');
  size(plain, 800);
  scrolled(plain);
  runTimers();
  assert.equal(plain.scrollTop, 800);

  // A finger on the screen, even held still, waits; it is let go and the box is moved.
  size(chat, 800);
  scrolled(chat);
  chat.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  runTimers();
  assert.equal(chat.scrollTop, 800, 'not while a finger is down');
  chat.dispatchEvent(new window.Event('touchend', { bubbles: true }));
  runTimers();
  assert.equal(chat.scrollTop, 798);

  // The thinking boxes too.
  const thought = document.getElementById('thought');
  size(thought, 800);
  scrolled(thought);
  runTimers();
  assert.equal(thought.scrollTop, 798);

  stop();
  scrolled(chat);
  size(chat, 800);
  scrolled(chat);
  assert.equal(timers.size, 0, 'stopped');
  window.happyDOM.abort();
});
