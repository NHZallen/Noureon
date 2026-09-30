import assert from 'node:assert/strict';
import test from 'node:test';

import { giveEndRoom, isReaderScrolling, setScrollTopQuietly, takeBackEndRoom, watchReader } from '../src/app/ui/motion/reader-scroll-guard.js';

const makeBox = (top = 0, height = 1000, client = 200) => {
  const listeners = {};
  const values = new Map();
  return {
    scrollTop: top,
    scrollHeight: height,
    clientHeight: client,
    listeners,
    // The room at the end is a CSS variable: what a test reads is that, and scrollTop, which must never change.
    style: {
      getPropertyValue: (name) => values.get(name) || '',
      setProperty: (name, value) => { values.set(name, value); },
      removeProperty: (name) => { values.delete(name); }
    },
    addEventListener: (type, handler) => { listeners[type] = handler; }
  };
};
const room = (box) => box.style.getPropertyValue('--end-room');

test('a finger on the box stops the app from moving it', () => {
  const box = makeBox(100);
  watchReader(box);
  assert.equal(setScrollTopQuietly(box, 800), true);
  box.listeners.touchstart();
  assert.equal(isReaderScrolling(box), true);
  assert.equal(box.scrollTop, 800, 'the touch does not move the box');
  assert.equal(setScrollTopQuietly(box, 100), false);
  assert.equal(box.scrollTop, 800);
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

test('a finger landing on a box resting on its end gives it more range there, and moves nothing', () => {
  const atBottom = makeBox(800);
  watchReader(atBottom);
  atBottom.listeners.touchstart();
  assert.equal(room(atBottom), '2px');
  assert.equal(atBottom.scrollTop, 800, 'not moved: that would stop the swipe, or show as a tick');

  const middle = makeBox(400);
  watchReader(middle);
  middle.listeners.touchstart();
  assert.equal(room(middle), '', 'a box off its end needs none');

  const chat = makeBox(800);
  watchReader(chat, { nudge: false });
  chat.listeners.touchstart();
  assert.equal(room(chat), '', 'the chat has its own listener for this');
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

test('a finger on any thinking, code or output box resting on its end gives it more range, whatever is under the finger', async () => {
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
  assert.equal(a.style.getPropertyValue('--end-room'), '2px');
  assert.equal(a.scrollTop, 800, 'nothing moved');
  const plain = document.getElementById('plain');
  setSize(plain, 800);
  plain.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  assert.equal(plain.style.getPropertyValue('--end-room'), '', 'other elements are left alone');
  stop();
  window.happyDOM.abort();
});

test('a box resting a fraction of a pixel from its end (a fractional height) counts as on it, and the room is capped', () => {
  const nearBottom = makeBox(799.4);
  watchReader(nearBottom);
  nearBottom.listeners.touchstart();
  assert.equal(room(nearBottom), '2px');
  assert.equal(nearBottom.scrollTop, 799.4);

  // Each time it comes to rest on the end it gets two more, up to six: a blank strip nobody can see.
  const box = makeBox(800);
  for (const expected of ['2px', '4px', '6px', '6px']) {
    giveEndRoom(box);
    assert.equal(room(box), expected);
    box.scrollHeight += 2;
    box.scrollTop = box.scrollHeight - box.clientHeight;
  }

  const bouncing = makeBox(830);
  assert.equal(giveEndRoom(bouncing), false, 'still bouncing past the end: left alone');
  const short = makeBox(2, 203);
  assert.equal(giveEndRoom(short), false, 'a box that barely scrolls');
});

test('the room is given back once the box is well away from its end, and not while it is still near it', () => {
  const box = makeBox(800);
  giveEndRoom(box);
  box.scrollHeight += 2;
  assert.equal(room(box), '2px');
  box.scrollTop = 796;
  assert.equal(takeBackEndRoom(box), false, 'two pixels from the content end: still near it');
  box.scrollTop = 500;
  assert.equal(takeBackEndRoom(box), true);
  assert.equal(room(box), '');
  assert.equal(box.scrollTop, 500, 'nothing moved');
  assert.equal(takeBackEndRoom(box), false, 'nothing to give back');
});

test('a box that comes to rest on its end gets more range once it is still, never while a finger is down', async () => {
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
  const roomOf = (node) => node.style.getPropertyValue('--end-room');
  const chat = document.getElementById('chat-container');

  // The reader's fling ends exactly at the bottom: once it is still, the chat has two more pixels of range there.
  size(chat, 800);
  scrolled(chat);
  assert.equal(roomOf(chat), '', 'not at once: the fling may still be coasting');
  scrolled(chat);
  assert.equal(timers.size, 1, 'each scroll event pushes the wait forward');
  runTimers();
  assert.equal(roomOf(chat), '2px');
  assert.equal(chat.scrollTop, 800, 'and it has not moved at all');

  // Far from the end again: given back.
  size(chat, 400, 1002);
  scrolled(chat);
  runTimers();
  assert.equal(roomOf(chat), '');
  assert.equal(chat.scrollTop, 400);

  // A fraction of a pixel from the end counts as on it; mid-way, bouncing past it, or no scroll box: left alone.
  size(chat, 799.4);
  scrolled(chat);
  runTimers();
  assert.equal(roomOf(chat), '2px');
  size(chat, 830);
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, 830, 'still bouncing');
  const plain = document.getElementById('plain');
  size(plain, 800);
  scrolled(plain);
  runTimers();
  assert.equal(roomOf(plain), '');

  // A finger on the screen, even held still, waits until it is let go.
  const thought = document.getElementById('thought');
  size(thought, 800);
  scrolled(thought);
  thought.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  runTimers();
  assert.equal(roomOf(thought), '', 'not while a finger is down');
  thought.dispatchEvent(new window.Event('touchend', { bubbles: true }));
  runTimers();
  assert.equal(roomOf(thought), '2px');
  assert.equal(thought.scrollTop, 800);

  stop();
  size(chat, 800);
  scrolled(chat);
  assert.equal(timers.size, 0, 'stopped');
  window.happyDOM.abort();
});
