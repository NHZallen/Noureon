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

  // Each time it comes to rest on the end it gets two more, up to twelve: a blank strip nobody can see.
  const box = makeBox(800);
  for (const expected of ['2px', '4px', '6px', '8px', '10px', '12px', '12px']) {
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

test('a box that arrives at its end gets more range there at once, and the rest is settled once it is still', async () => {
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
  const roomOf = (node) => node.style.getPropertyValue('--end-room');
  // A box whose scrollable height includes its end room, as the real one does.
  const size = (node, top, base = 1000) => {
    Object.defineProperty(node, 'scrollHeight', { get: () => base + (Number.parseFloat(roomOf(node)) || 0), configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 200, configurable: true });
    node.scrollTop = top;
  };
  const scrolled = (node) => node.dispatchEvent(new window.Event('scroll'));
  const chat = document.getElementById('chat-container');

  // A fling arrives exactly at the bottom: at once, not after it has stopped (a swipe may follow within milliseconds).
  size(chat, 800);
  scrolled(chat);
  assert.equal(roomOf(chat), '6px');
  assert.equal(chat.scrollTop, 800, 'and it has not moved at all');
  assert.equal(chat.scrollHeight - chat.clientHeight, 806);
  // The scroll events that follow (it is now off the end) change nothing, and once it is still nothing is added.
  scrolled(chat);
  assert.equal(timers.size, 1, 'each scroll event pushes the wait forward');
  runTimers();
  assert.equal(roomOf(chat), '6px');

  // A momentum that carries it on to the new end gets more, up to a cap; after that it is left.
  for (const expected of ['12px', '12px']) {
    chat.scrollTop = chat.scrollHeight - chat.clientHeight;
    scrolled(chat);
    assert.equal(roomOf(chat), expected);
  }

  // The fling used all of the arrival room and came to rest exactly on the new end, the one place a swipe cannot start from:
  // once it is still it is given more, past the cap, so it rests off the end.
  assert.equal(chat.scrollTop, chat.scrollHeight - chat.clientHeight);
  runTimers();
  assert.equal(roomOf(chat), '14px');
  assert.equal(chat.scrollTop < chat.scrollHeight - chat.clientHeight, true, 'two pixels off the end, and nothing moved');

  // Far from the end again: given back.
  chat.scrollTop = 400;
  scrolled(chat);
  runTimers();
  assert.equal(roomOf(chat), '');
  assert.equal(chat.scrollTop, 400);

  // A fraction of a pixel from the end counts as on it; mid-way, bouncing past it, or no scroll box: left alone.
  chat.scrollTop = chat.scrollHeight - chat.clientHeight - 0.6;
  scrolled(chat);
  assert.equal(roomOf(chat), '6px');
  chat.scrollTop = chat.scrollHeight - chat.clientHeight + 30;
  scrolled(chat);
  runTimers();
  assert.equal(chat.scrollTop, chat.scrollHeight - chat.clientHeight + 30, 'still bouncing: nothing added, nothing moved');
  const plain = document.getElementById('plain');
  size(plain, 800);
  scrolled(plain);
  runTimers();
  assert.equal(roomOf(plain), '');

  // A finger on the screen at rest on the end: the room waits for it to be let go, and is given then.
  const thought = document.getElementById('thought');
  size(thought, 800);
  thought.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  scrolled(thought);
  runTimers();
  thought.dispatchEvent(new window.Event('touchend', { bubbles: true }));
  runTimers();
  assert.notEqual(roomOf(thought), '');
  assert.equal(thought.scrollTop, 800, 'nothing moved');

  stop();
  size(chat, 800);
  chat.style.removeProperty('--end-room');
  scrolled(chat);
  assert.equal(timers.size, 0, 'stopped');
  window.happyDOM.abort();
});

test('a touch that never reports its end does not hold the box for ever', () => {
  const box = makeBox(100);
  watchReader(box);
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    box.listeners.touchstart({ touches: [{}] });
    // The element under the finger was removed: no touchend ever reaches the box.
    assert.equal(isReaderScrolling(box), true, 'held while the finger is believed down');
    now += 1000;
    box.listeners.touchmove();
    now += 1000;
    assert.equal(isReaderScrolling(box), true, 'a finger that keeps moving keeps the hold');
    now += 1600;
    assert.equal(isReaderScrolling(box), false, 'no touch event for a while: the finger is gone');
    assert.equal(setScrollTopQuietly(box, 500), true, 'the app can follow again');
    // A touchstart that reports no fingers on the screen clears a hold at once.
    box.listeners.touchstart({ touches: [{}] });
    box.listeners.touchstart({ touches: [] });
    now += 300;
    assert.equal(isReaderScrolling(box), false);
    // One finger lifted while another is still down.
    box.listeners.touchstart({ touches: [{}, {}] });
    box.listeners.touchend({ touches: [{}] });
    now += 300;
    assert.equal(isReaderScrolling(box), true);
  } finally {
    Date.now = realNow;
  }
});

test('a finger whose touchend never arrived does not stop the room being given at the end of the chat', async () => {
  const { Window } = await import('happy-dom');
  const { settleScrollBoxesOffTheirEdges } = await import('../src/app/ui/motion/reader-scroll-guard.js');
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = '<div id="chat-container"></div>';
  const timers = new Map();
  let next = 1;
  const view = {
    setTimeout: (callback) => { timers.set(next, callback); return next++; },
    clearTimeout: (id) => { timers.delete(id); }
  };
  const runTimers = () => { const due = [...timers]; timers.clear(); due.forEach(([, callback]) => callback()); };
  const stop = settleScrollBoxesOffTheirEdges(document, { view });
  const chat = document.getElementById('chat-container');
  const touch = (type, touches) => {
    const event = new window.Event(type, { bubbles: true });
    event.touches = touches;
    document.dispatchEvent(event);
  };
  const realNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  try {
    // Two touches started and their ends were lost with the elements they began on.
    touch('touchstart', [{}]);
    touch('touchstart', [{}]);
    now += 3000;
    // The chat comes to rest on its end some time later: the room must still be given.
    Object.defineProperty(chat, 'scrollHeight', { get: () => 1000 + (Number.parseFloat(chat.style.getPropertyValue('--end-room')) || 0), configurable: true });
    Object.defineProperty(chat, 'clientHeight', { value: 200, configurable: true });
    chat.scrollTop = 800;
    chat.dispatchEvent(new window.Event('scroll'));
    chat.style.removeProperty('--end-room');
    runTimers();
    assert.notEqual(chat.style.getPropertyValue('--end-room'), '', 'the lost touches are not held against it');
    // A touchend that reports no fingers left puts everything back at once.
    touch('touchstart', [{}]);
    touch('touchend', []);
    chat.style.removeProperty('--end-room');
    chat.scrollTop = chat.scrollHeight - chat.clientHeight;
    chat.dispatchEvent(new window.Event('scroll'));
    runTimers();
    assert.notEqual(chat.style.getPropertyValue('--end-room'), '');
  } finally {
    Date.now = realNow;
    stop();
    window.happyDOM.abort();
  }
});
