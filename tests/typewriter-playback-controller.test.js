import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createTypewriterPlaybackController } from '../src/app/legacy-runtime/features/typewriter-playback-controller.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createManualScheduler = () => {
  const scheduled = [];

  return {
    schedule(callback, delay) {
      scheduled.push({ callback, delay });
    },
    flushNext() {
      const next = scheduled.shift();
      if (next) next.callback();
      return next;
    },
    flushAll() {
      while (scheduled.length) {
        this.flushNext();
      }
    },
    get pendingCount() {
      return scheduled.length;
    }
  };
};

test('reveals playback text in order with deterministic scheduler ticks', () => {
  const scheduler = createManualScheduler();
  const revealed = [];
  let finalText = null;
  const controller = createTypewriterPlaybackController({
    text: 'Astra',
    schedule: scheduler.schedule,
    onStep: ({ currentText }) => {
      revealed.push(currentText);
    },
    onFinish: ({ text }) => {
      finalText = text;
    }
  });

  controller.start();
  assert.deepEqual(revealed, ['A']);
  assert.equal(scheduler.pendingCount, 1);

  scheduler.flushAll();

  assert.deepEqual(revealed, ['A', 'As', 'Ast', 'Astr', 'Astra']);
  assert.equal(finalText, 'Astra');
  assert.equal(controller.getSnapshot().isComplete, true);
});

test('uses injected typing speed for scheduled ticks without real waits', () => {
  const scheduler = createManualScheduler();
  const controller = createTypewriterPlaybackController({
    text: 'Hi',
    typingSpeed: 15,
    schedule: scheduler.schedule,
    onStep: () => {}
  });

  controller.start();
  const scheduledTick = scheduler.flushNext();

  assert.equal(scheduledTick.delay, 15);
});

test('hands chunk slices to streaming render callbacks while preserving code-fence step logic', () => {
  const scheduler = createManualScheduler();
  const chunks = [];
  const controller = createTypewriterPlaybackController({
    text: '```abcdef',
    schedule: scheduler.schedule,
    getStep: ({ source, currentIndex }) => source.includes('```', Math.max(0, currentIndex - 3)) ? 5 : 1,
    onStep: ({ chunk }) => {
      chunks.push(chunk);
    }
  });

  controller.start();
  scheduler.flushAll();

  assert.deepEqual(chunks, ['```ab', 'c', 'd', 'e', 'f']);
});

test('finishes immediately for empty text', () => {
  let stepCalls = 0;
  let finalText = null;
  const controller = createTypewriterPlaybackController({
    text: '',
    onStep: () => {
      stepCalls += 1;
    },
    onFinish: ({ text }) => {
      finalText = text;
    }
  });

  controller.start();

  assert.equal(stepCalls, 0);
  assert.equal(finalText, '');
  assert.equal(controller.getSnapshot().isComplete, true);
});

test('aborted playback skips incremental steps and still completes', () => {
  let stepCalls = 0;
  let finishCalls = 0;
  const controller = createTypewriterPlaybackController({
    text: 'Astra',
    signal: { aborted: true },
    onStep: () => {
      stepCalls += 1;
    },
    onFinish: ({ aborted }) => {
      finishCalls += 1;
      assert.equal(aborted, true);
    }
  });

  controller.start();

  assert.equal(stepCalls, 0);
  assert.equal(finishCalls, 1);
});

test('typewriter playback controller source stays isolated from runtime systems', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/typewriter-playback-controller.js');

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
