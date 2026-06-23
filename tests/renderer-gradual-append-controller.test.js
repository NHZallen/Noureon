import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { appendRendererTextGradually } from '../src/app/legacy-runtime/features/renderer-gradual-append-controller.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createManualFrameScheduler = () => {
  const frames = [];

  return {
    scheduleFrame(callback) {
      frames.push(callback);
    },
    flushNext() {
      const next = frames.shift();
      if (next) next();
    },
    get pendingFrames() {
      return frames.length;
    }
  };
};

const settleMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test('gradually appends sliced text chunks in order across scheduler frames', async () => {
  const scheduler = createManualFrameScheduler();
  const appended = [];
  const renderer = {
    appendText(chunk) {
      appended.push(chunk);
    }
  };

  const appendPromise = appendRendererTextGradually(renderer, 'ABCDEFGHI', null, 3, scheduler.scheduleFrame);

  assert.deepEqual(appended, ['ABC']);
  assert.equal(scheduler.pendingFrames, 1);

  scheduler.flushNext();
  await settleMicrotasks();
  assert.deepEqual(appended, ['ABC', 'DEF']);

  scheduler.flushNext();
  await settleMicrotasks();
  assert.deepEqual(appended, ['ABC', 'DEF', 'GHI']);

  scheduler.flushNext();
  await appendPromise;

  assert.equal(scheduler.pendingFrames, 0);
});

test('short text still waits for the scheduled frame before completing', async () => {
  const scheduler = createManualFrameScheduler();
  const appended = [];
  let completed = false;
  const renderer = {
    appendText(chunk) {
      appended.push(chunk);
    }
  };

  const appendPromise = appendRendererTextGradually(renderer, 'Hi', null, 18, scheduler.scheduleFrame)
    .then(() => {
      completed = true;
    });

  assert.deepEqual(appended, ['Hi']);
  assert.equal(completed, false);
  assert.equal(scheduler.pendingFrames, 1);

  scheduler.flushNext();
  await appendPromise;

  assert.equal(completed, true);
});

test('aborted gradual append stops before the next chunk', async () => {
  const scheduler = createManualFrameScheduler();
  const signal = { aborted: false };
  const appended = [];
  const renderer = {
    appendText(chunk) {
      appended.push(chunk);
    }
  };

  const appendPromise = appendRendererTextGradually(renderer, 'ABCDEFGH', signal, 2, scheduler.scheduleFrame);

  assert.deepEqual(appended, ['AB']);
  signal.aborted = true;
  scheduler.flushNext();
  await appendPromise;

  assert.deepEqual(appended, ['AB']);
});

test('empty gradual append schedules no frames and appends nothing', async () => {
  const scheduler = createManualFrameScheduler();
  const appended = [];
  const renderer = {
    appendText(chunk) {
      appended.push(chunk);
    }
  };

  await appendRendererTextGradually(renderer, '', null, 18, scheduler.scheduleFrame);

  assert.deepEqual(appended, []);
  assert.equal(scheduler.pendingFrames, 0);
});

test('renderer gradual append helper source stays isolated from runtime systems', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/renderer-gradual-append-controller.js');

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
    'requestAnimationFrame',
    'setTimeout',
    'setInterval',
    'renderMarkdown',
    'renderMarkdownWithFormulas',
    'DOMPurify',
    'katex',
    'vite'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`, 'i'));
  }
});
