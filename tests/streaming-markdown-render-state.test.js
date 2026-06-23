import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStreamingMarkdownRenderState } from '../src/app/legacy-runtime/features/streaming-markdown-render-state.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('ignores empty chunks without changing render state', () => {
  const state = createStreamingMarkdownRenderState();

  assert.equal(state.appendText('').ignored, true);
  assert.deepEqual(state.getSnapshot(), {
    currentLineText: '',
    finalizedText: '',
    fullText: '',
    isFinalized: false,
    pendingText: ''
  });
});

test('append without newline updates full and pending text without finalizing', () => {
  const state = createStreamingMarkdownRenderState();

  const appendResult = state.appendText('Hello');
  const flushResult = state.flushPending();
  const currentLinePatch = state.syncCurrentLine();

  assert.equal(appendResult.ignored, false);
  assert.equal(flushResult.didFlush, false);
  assert.equal(state.getText(), 'Hello');
  assert.equal(state.getFinalizedText(), '');
  assert.equal(state.getPendingText(), 'Hello');
  assert.deepEqual(currentLinePatch, {
    appendText: 'Hello',
    currentLineText: 'Hello',
    reset: false
  });
});

test('append with newline flushes through the last newline', () => {
  const state = createStreamingMarkdownRenderState();

  state.appendText('Hello\n');
  const flushResult = state.flushPending();
  const currentLinePatch = state.syncCurrentLine();

  assert.equal(flushResult.didFlush, true);
  assert.equal(flushResult.flushedText, 'Hello\n');
  assert.equal(state.getFinalizedText(), 'Hello\n');
  assert.equal(state.getPendingText(), '');
  assert.equal(currentLinePatch.reset, false);
  assert.equal(currentLinePatch.appendText, '');
});

test('multiple newline chunks flush through the last newline and keep trailing text pending', () => {
  const state = createStreamingMarkdownRenderState();

  state.appendText('A\nB\nTail');
  const flushResult = state.flushPending();
  const currentLinePatch = state.syncCurrentLine();

  assert.equal(flushResult.didFlush, true);
  assert.equal(flushResult.flushedText, 'A\nB\n');
  assert.equal(state.getFinalizedText(), 'A\nB\n');
  assert.equal(state.getPendingText(), 'Tail');
  assert.deepEqual(currentLinePatch, {
    appendText: 'Tail',
    currentLineText: 'Tail',
    reset: false
  });
  assert.equal(state.getText(), 'A\nB\nTail');
});

test('current line sync resets when pending text no longer extends the rendered line', () => {
  const state = createStreamingMarkdownRenderState();

  state.appendText('Pending');
  state.syncCurrentLine();
  state.appendText('\nNext');
  state.flushPending();
  const currentLinePatch = state.syncCurrentLine();

  assert.deepEqual(currentLinePatch, {
    appendText: 'Next',
    currentLineText: 'Next',
    reset: true
  });
});

test('force finish flushes remaining pending text and finalizes the state', () => {
  const state = createStreamingMarkdownRenderState();

  state.appendText('Final tail');
  const flushResult = state.flushPending({ force: true });
  state.syncCurrentLine();
  const finishResult = state.finalize();

  assert.equal(flushResult.didFlush, true);
  assert.equal(flushResult.flushedText, 'Final tail');
  assert.equal(state.getFinalizedText(), 'Final tail');
  assert.equal(state.getPendingText(), '');
  assert.equal(finishResult.isFinalized, true);
  assert.equal(state.getText(), 'Final tail');
});

test('append after finalize is ignored and keeps accumulated text stable', () => {
  const state = createStreamingMarkdownRenderState();

  state.appendText('Done');
  state.flushPending({ force: true });
  state.finalize();
  const appendResult = state.appendText(' ignored');

  assert.equal(appendResult.ignored, true);
  assert.equal(state.getText(), 'Done');
  assert.equal(state.getFinalizedText(), 'Done');
});

test('streaming markdown render state helper remains isolated from runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-markdown-render-state.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
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
    'KaTeX'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});
