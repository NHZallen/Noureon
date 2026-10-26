import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_ROOM, roomFor, sendAnchor } from '../src/app/runtime/features/send-anchor.js';

const fakeStyle = () => {
  const values = new Map();
  return { values, setProperty: (name, value) => values.set(name, value), removeProperty: (name) => values.delete(name), getPropertyValue: (name) => values.get(name) || '' };
};

function setup({ viewport = 800, anchorTop = 600, listBottom = 700, chatTop = 100, scrollTop = 500 } = {}) {
  const state = { anchorTop, listBottom };
  const scrolls = [];
  const observers = [];
  const anchor = { isConnected: true, getBoundingClientRect: () => ({ top: state.anchorTop, bottom: state.anchorTop + 60 }) };
  const last = { getBoundingClientRect: () => ({ bottom: state.listBottom }) };
  const messageList = { children: [anchor, last], style: fakeStyle() };
  const chatContainer = { clientHeight: viewport, scrollTop, getBoundingClientRect: () => ({ top: chatTop }), scrollTo: (options) => scrolls.push(options) };
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.watched = []; observers.push(this); }
    observe(element) { this.watched.push(element); }
    disconnect() { this.disconnected = true; }
  }
  const frames = [];
  sendAnchor.configure({ elements: { messageList, chatContainer }, ResizeObserver: FakeObserver, requestFrame: (callback) => frames.push(callback) });
  return { state, scrolls, observers, anchor, messageList, chatContainer, frames };
}

test('the room is what the chat shows, less the space above the bubble and what the bubble and the reply already take', () => {
  assert.equal(roomFor({ viewport: 800, topPad: 20, span: 300 }), 480 + MIN_ROOM);
  assert.equal(roomFor({ viewport: 800, topPad: 20, span: 900 }), MIN_ROOM, 'a reply taller than the chat keeps a little, so that it does not rest at the end that the streaming follows');
  assert.equal(roomFor({ viewport: 800 }), 800 + MIN_ROOM);
});

test('a message just sent goes to the top of the chat, with room kept below it that the reply fills', () => {
  const { state, scrolls, observers, anchor, messageList, frames } = setup();
  sendAnchor.anchorTo(anchor);
  // The bubble and what is after it take 100 px: the rest of the 800 px is kept empty (and a little more).
  assert.equal(messageList.style.values.get('--send-room'), `${700 + MIN_ROOM}px`);
  assert.equal(sendAnchor.room(), 700 + MIN_ROOM);
  frames.shift()();
  assert.deepEqual(scrolls, [{ top: 1000, behavior: 'smooth' }], 'the bubble is at the top of what the chat shows (its place in the chat, 500 px down, plus where the chat is scrolled to)');
  // The reply grows: the room shrinks to what is left.
  state.listBottom = 1100;
  observers.at(-1).callback();
  assert.equal(messageList.style.values.get('--send-room'), `${300 + MIN_ROOM}px`);
  // Longer than the chat: only the little that keeps the chat off its end.
  state.listBottom = 1700;
  observers.at(-1).callback();
  assert.equal(messageList.style.values.get('--send-room'), `${MIN_ROOM}px`);
  assert.equal(sendAnchor.room(), MIN_ROOM);
});

test('the room goes when the conversation is drawn again (the message is not on the page any more), and when it is let go', () => {
  const { anchor, messageList, observers } = setup();
  sendAnchor.anchorTo(anchor);
  assert.equal(messageList.style.values.has('--send-room'), true);
  anchor.isConnected = false;
  observers.at(-1).callback();
  assert.equal(messageList.style.values.has('--send-room'), false);
  assert.equal(observers.at(-1).disconnected, true);
  const again = setup();
  sendAnchor.anchorTo(again.anchor);
  sendAnchor.release();
  assert.equal(again.messageList.style.values.has('--send-room'), false);
});

test('a message that takes over from one the chat is held at is anchored without the chat moving', () => {
  const { anchor, scrolls, frames, messageList } = setup();
  sendAnchor.anchorTo(anchor, { scroll: false });
  assert.equal(messageList.style.values.has('--send-room'), true, 'the room is kept');
  assert.equal(frames.length, 0);
  assert.deepEqual(scrolls, [], 'and nothing is scrolled');
});
