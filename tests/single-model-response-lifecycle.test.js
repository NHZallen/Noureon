import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSingleModelResponseLifecycle } from '../src/app/legacy-runtime/features/single-model-response-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createTarget = () => ({
  classList: {
    add() {},
    remove() {}
  },
  dataset: {},
  innerHTML: ''
});

const createHarness = ({
  outputMode = 'realtime',
  translatedParts,
  streamResult = 'Hello Astra',
  streamError,
  signal = new AbortController().signal
} = {}) => {
  const calls = [];
  let tickerId = 0;
  const targetElement = createTarget();
  const lifecycle = createSingleModelResponseLifecycle({
    now: (() => {
      let value = 1000;
      return () => {
        value += 800;
        return value;
      };
    })(),
    getOutputMode: () => outputMode,
    renderSingleModelProgress: (progress) => {
      calls.push(['render-progress', progress.stage, progress.receivedChars]);
      return `<progress>${progress.stage}</progress>`;
    },
    startProgressTicker: (tick) => {
      calls.push(['start-ticker']);
      tick();
      tickerId += 1;
      return { id: tickerId };
    },
    stopProgressTicker: (ticker) => {
      calls.push(['stop-ticker', ticker?.id ?? null]);
    },
    buildSingleModelTranslatedRequestParts: async (...args) => {
      calls.push(['translate', args[0]]);
      args[3]?.('translation', 'Preparing translated packet');
      return translatedParts ?? args[0];
    },
    streamApiCall: async (parts, onChunk, receivedSignal, forced, options) => {
      calls.push(['api', parts, receivedSignal, forced, options]);
      if (streamError) throw streamError;
      onChunk('Hello');
      onChunk(' Astra');
      return streamResult;
    },
    streamMarkdownResponse: async (target, streamCall, receivedSignal, options) => {
      calls.push(['stream-render-start', target, receivedSignal, options.placeholderHTML]);
      options.onFirstChunk?.();
      const chunks = [];
      const result = await streamCall((chunk) => chunks.push(chunk));
      calls.push(['stream-render-finish', chunks]);
      target.dataset.streamRendered = 'true';
      return result;
    },
    playbackStreamingMarkdownResponse: async (...args) => {
      calls.push(['playback', ...args]);
    },
    renderIncrementalResponse: (...args) => {
      calls.push(['render-final', ...args]);
    },
    getOpenCouncilDetailKeys: () => new Set(['Consensus']),
    restoreOpenCouncilDetails: (...args) => {
      calls.push(['restore-details', ...args]);
    }
  });

  return { calls, lifecycle, signal, targetElement };
};

test('realtime lifecycle prepares translations, streams chunks, and returns final text', async () => {
  const translatedParts = [{ text: 'translated request' }];
  const { calls, lifecycle, signal, targetElement } = createHarness({ translatedParts });

  const result = await lifecycle.run({
    targetElement,
    userParts: [{ inlineData: { mimeType: 'application/pdf', data: 'TWFu' } }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    signal,
    uiLanguage: 'en'
  });

  assert.equal(result.fullResponse, 'Hello Astra');
  assert.equal(result.responseRenderedInRealtime, true);
  assert.deepEqual(calls.find((call) => call[0] === 'api').slice(1), [
    translatedParts,
    signal,
    false,
    { modelInfo: { id: 'model', name: 'Model' } }
  ]);
  assert.deepEqual(calls.find((call) => call[0] === 'stream-render-finish')[1], [
    'Hello',
    ' Astra'
  ]);
  assert.equal(calls.some((call) => call[0] === 'playback'), false);
  assert.equal(lifecycle.getLatestProgress().stage, 'streaming');
});

test('buffered lifecycle accumulates provider text without invoking realtime renderer', async () => {
  const { calls, lifecycle, signal, targetElement } = createHarness({ outputMode: 'playback' });

  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Hello' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    signal,
    uiLanguage: 'zh-TW'
  });

  assert.equal(result.fullResponse, 'Hello Astra');
  assert.equal(result.responseRenderedInRealtime, false);
  assert.equal(calls.some((call) => call[0] === 'stream-render-start'), false);
  assert.ok(calls.some((call) => call[0] === 'render-progress' && call[1] === 'streaming'));
  assert.ok(calls.some((call) => call[0] === 'stop-ticker'));
});

test('empty provider responses preserve the current localized failure boundary', async () => {
  const { lifecycle, signal, targetElement } = createHarness({ streamResult: '' });

  await assert.rejects(
    () => lifecycle.run({
      targetElement,
      userParts: [{ text: 'Hello' }],
      modelInfo: { id: 'model', name: 'Model' },
      conversation: { model: 'model', isWebSearchEnabled: false },
      signal,
      uiLanguage: 'en'
    }),
    /ended without any response text/
  );
});

test('abort and non-abort errors propagate while progress cleanup remains available', async () => {
  for (const streamError of [
    new DOMException('Aborted', 'AbortError'),
    new Error('provider failed')
  ]) {
    const { calls, lifecycle, signal, targetElement } = createHarness({ streamError });

    await assert.rejects(
      () => lifecycle.run({
        targetElement,
        userParts: [{ text: 'Hello' }],
        modelInfo: { id: 'model', name: 'Model' },
        conversation: { model: 'model', isWebSearchEnabled: false },
        signal,
        uiLanguage: 'en'
      }),
      (error) => error === streamError
    );
    lifecycle.stop();
    assert.ok(calls.some((call) => call[0] === 'stop-ticker'));
    assert.equal(lifecycle.getLatestProgress().modelName, 'Model');
  }
});

test('completion handoff preserves realtime rendered, realtime fallback, and playback paths', async () => {
  const rendered = createHarness();
  rendered.targetElement.dataset.streamRendered = 'true';
  await rendered.lifecycle.completeView({
    targetElement: rendered.targetElement,
    fullResponse: 'Rendered',
    signal: rendered.signal,
    responseRenderedInRealtime: true
  });
  assert.ok(rendered.calls.some((call) => call[0] === 'restore-details'));
  assert.equal(rendered.calls.some((call) => call[0] === 'render-final'), false);

  const fallback = createHarness();
  await fallback.lifecycle.completeView({
    targetElement: fallback.targetElement,
    fullResponse: 'Fallback',
    signal: fallback.signal,
    responseRenderedInRealtime: true
  });
  assert.deepEqual(fallback.calls.find((call) => call[0] === 'render-final').slice(1), [
    fallback.targetElement,
    'Fallback',
    { final: true, preserveCouncilDetails: false }
  ]);

  const playback = createHarness({ outputMode: 'playback' });
  await playback.lifecycle.completeView({
    targetElement: playback.targetElement,
    fullResponse: 'Playback',
    signal: playback.signal,
    responseRenderedInRealtime: false
  });
  assert.deepEqual(playback.calls.find((call) => call[0] === 'playback').slice(1), [
    playback.targetElement,
    'Playback',
    playback.signal,
    false
  ]);
});

test('single-model lifecycle source avoids provider parsing, storage, and runtime plugin coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/single-model-response-lifecycle.js');

  for (const forbidden of [
    'fetch(',
    'TextDecoder',
    'getReader(',
    'openrouter',
    'gemini',
    'stepfun',
    'nvidia',
    'saveAppData',
    'indexedDB',
    'localStorage',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
