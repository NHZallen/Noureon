import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStreamingTextFrameQueue } from '../src/app/legacy-runtime/features/streaming-text-frame-queue.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createManualFrameScheduler = () => {
  const frames = [];

  return {
    scheduleFrame(callback) {
      frames.push(callback);
    },
    flushNext() {
      const nextFrame = frames.shift();
      if (nextFrame) nextFrame();
    },
    get pendingFrames() {
      return frames.length;
    }
  };
};

test('queues chunks and drains them in frame order', () => {
  const scheduler = createManualFrameScheduler();
  const drained = [];
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => drained.push(text)
  });

  queue.enqueue('Hello');
  scheduler.flushNext();
  queue.enqueue(' Astra');
  scheduler.flushNext();

  assert.deepEqual(drained, ['Hello', ' Astra']);
  assert.equal(queue.getSnapshot().queuedText, '');
});

test('coalesces multiple chunks before the next frame and schedules only one frame', () => {
  const scheduler = createManualFrameScheduler();
  const drained = [];
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => drained.push(text)
  });

  const first = queue.enqueue('A');
  const second = queue.enqueue('B');
  const third = queue.enqueue('C');

  assert.equal(first.scheduledFrame, true);
  assert.equal(second.scheduledFrame, false);
  assert.equal(third.scheduledFrame, false);
  assert.equal(scheduler.pendingFrames, 1);

  scheduler.flushNext();

  assert.deepEqual(drained, ['ABC']);
  assert.equal(scheduler.pendingFrames, 0);
});

test('calls onFirstChunk once for the first non-empty chunk', () => {
  const scheduler = createManualFrameScheduler();
  let firstChunkCalls = 0;
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: () => {},
    onFirstChunk: () => {
      firstChunkCalls += 1;
    }
  });

  assert.equal(queue.enqueue('').ignored, true);
  queue.enqueue('A');
  queue.enqueue('B');

  assert.equal(firstChunkCalls, 1);
});

test('flushUntilIdle schedules and waits for pending queued work', async () => {
  const scheduler = createManualFrameScheduler();
  const drained = [];
  let waits = 0;
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => drained.push(text),
    waitForFrame: async () => {
      waits += 1;
      scheduler.flushNext();
    }
  });

  queue.enqueue('A');
  queue.enqueue('B');
  await queue.flushUntilIdle();

  assert.deepEqual(drained, ['AB']);
  assert.equal(waits, 1);
  assert.equal(queue.getSnapshot().isFrameRequested, false);
  assert.equal(queue.getSnapshot().queuedText, '');
});

test('flushUntilIdle schedules a frame when queued work has no pending frame', async () => {
  const scheduler = createManualFrameScheduler();
  const drained = [];
  let waits = 0;
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => drained.push(text),
    waitForFrame: async () => {
      waits += 1;
      scheduler.flushNext();
    }
  });

  queue.enqueue('A');
  scheduler.flushNext();
  queue.enqueue('B');
  scheduler.flushNext();
  queue.enqueue('C');
  await queue.flushUntilIdle();

  assert.deepEqual(drained, ['A', 'B', 'C']);
  assert.equal(waits, 1);
});

test('ignores empty chunks without scheduling frames', () => {
  const scheduler = createManualFrameScheduler();
  const drained = [];
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => drained.push(text)
  });

  assert.equal(queue.enqueue(null).ignored, true);
  assert.equal(queue.enqueue('').ignored, true);

  assert.equal(scheduler.pendingFrames, 0);
  assert.deepEqual(drained, []);
});

test('supports typewriter-style accumulated render sequence without changing chunk order', async () => {
  const scheduler = createManualFrameScheduler();
  const renderedSnapshots = [];
  let renderedText = '';
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => {
      renderedText += text;
      renderedSnapshots.push(renderedText);
    },
    waitForFrame: async () => {
      scheduler.flushNext();
    }
  });

  queue.enqueue('Hel');
  queue.enqueue('lo');
  assert.equal(scheduler.pendingFrames, 1);

  await queue.flushUntilIdle();
  queue.enqueue(' Astra');
  await queue.flushUntilIdle();

  assert.deepEqual(renderedSnapshots, ['Hello', 'Hello Astra']);
  assert.equal(renderedText, 'Hello Astra');
});

test('flushUntilIdle drains pending typewriter text before completion', async () => {
  const scheduler = createManualFrameScheduler();
  let renderedText = '';
  const queue = createStreamingTextFrameQueue({
    scheduleFrame: scheduler.scheduleFrame,
    drainText: (text) => {
      renderedText += text;
    },
    waitForFrame: async () => {
      scheduler.flushNext();
    }
  });

  queue.enqueue('A');
  queue.enqueue('stra');

  assert.equal(renderedText, '');
  await queue.flushUntilIdle();

  assert.equal(renderedText, 'Astra');
  assert.equal(queue.getSnapshot().queuedText, '');
  assert.equal(queue.getSnapshot().isFrameRequested, false);
});

test('streaming text frame queue helper stays isolated from runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-text-frame-queue.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'streamApiCall',
    'provider',
    'openai',
    'gemini',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList',
    'renderMarkdown',
    'renderMarkdownWithFormulas',
    'DOMPurify',
    'katex',
    'vite'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`, 'i'));
  }
});
