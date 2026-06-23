import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './helpers/create-dom.js';

const setupTypewriterPlaybackFixture = (target) => {
  const ownerDocument = target.ownerDocument;
  const scheduledTicks = [];
  const schedule = (callback) => {
    scheduledTicks.push(callback);
  };
  const appendToken = (token) => {
    target.append(ownerDocument.createTextNode(token));
  };

  return {
    enqueue(tokens) {
      tokens.forEach((token) => schedule(() => appendToken(token)));
    },
    flushNext() {
      const nextTick = scheduledTicks.shift();
      if (nextTick) nextTick();
    },
    flushAll() {
      while (scheduledTicks.length) {
        this.flushNext();
      }
    },
    get pendingTicks() {
      return scheduledTicks.length;
    }
  };
};

test('typewriter playback appends buffered text in order in a minimal DOM fixture', () => {
  // V3 Phase 5 harness-level behaviour proof:
  // this establishes the timer / DOM test pattern for typewriter playback.
  // It is not a production runtime typewriter test. The production typewriter
  // still lives in the legacy runtime closure, and future Phase 5 slices need
  // broader production behaviour coverage before any Phase 6 migration.
  const { document, cleanup } = createDom('<div id="message-target"></div>');

  try {
    const target = document.getElementById('message-target');

    assert.equal(target.textContent, '');

    const playback = setupTypewriterPlaybackFixture(target);
    playback.enqueue(['Hello', ' ', 'Astra']);
    playback.flushNext();
    assert.equal(target.textContent, 'Hello');

    playback.flushNext();
    assert.equal(target.textContent, 'Hello ');

    playback.flushNext();

    assert.equal(target.textContent, 'Hello Astra');
    assert.equal(playback.pendingTicks, 0);
  } finally {
    cleanup();
  }
});

test('typewriter playback preserves order across multiple token batches', () => {
  const { document, cleanup } = createDom('<div id="message-target"></div>');

  try {
    const target = document.getElementById('message-target');
    const playback = setupTypewriterPlaybackFixture(target);

    playback.enqueue(['Astra', 'Chat']);
    playback.enqueue([' ', 'ready', '.']);
    playback.flushAll();

    assert.equal(target.textContent, 'AstraChat ready.');
  } finally {
    cleanup();
  }
});

test('typewriter playback DOM fixture cleanup restores global document state', () => {
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { cleanup } = createDom('<div id="message-target"></div>');

  cleanup();

  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), previousWindowDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'document'), previousDocumentDescriptor);
});
