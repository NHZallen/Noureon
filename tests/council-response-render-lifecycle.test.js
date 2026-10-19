import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runCouncilResponseRenderLifecycle } from '../src/app/legacy-runtime/features/council-response-render-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = ({
  outputMode = 'realtime',
  runModelCouncil,
  gradualAppend,
  continueWithReply,
  signal = new AbortController().signal
} = {}) => {
  const calls = [];
  const renderers = [];
  const contentDiv = {
    dataset: {},
    innerHTML: 'loading'
  };
  let tickerCallback;
  const harness = {
    calls,
    contentDiv,
    renderers,
    async run(userParts = [{ text: 'Question' }]) {
      return runCouncilResponseRenderLifecycle({
        contentDiv,
        userParts,
        signal,
        getOutputMode: () => outputMode,
        runModelCouncil: runModelCouncil || (async (parts, signal, onProgress, onFinalChunk) => {
          onProgress({ stage: 'firstRound', message: 'Working', startedAt: 100, elapsedMs: 0 });
          onFinalChunk('Hel');
          return { text: 'Hello', metadata: { models: ['a'] } };
        }),
        renderCouncilProgress: (progress) => {
          calls.push(['renderProgress', progress.stage, progress.elapsedMs]);
          return `progress:${progress.stage}:${progress.elapsedMs}`;
        },
        createStreamingMarkdownRenderer: (target, options) => {
          const renderer = {
            target,
            options,
            appended: [],
            finished: [],
            appendText(chunk) {
              this.appended.push(chunk);
              calls.push(['appendText', chunk]);
            },
            getText() {
              return this.appended.join('');
            },
            finish(finishOptions) {
              this.finished.push(finishOptions);
              calls.push(['finish', finishOptions]);
              target.dataset.streamRendered = 'true';
            }
          };
          renderers.push(renderer);
          calls.push(['createRenderer', options]);
          return renderer;
        },
        appendRendererTextGradually: gradualAppend || (async (renderer, text) => {
          calls.push(['gradualAppend', text]);
          renderer.appendText(text);
        }),
        startProgressTicker: (tick) => {
          calls.push(['startTicker']);
          tickerCallback = tick;
          return 'ticker';
        },
        stopProgressTicker: (ticker) => {
          calls.push(['stopTicker', ticker]);
        },
        setCouncilRunning: (value) => calls.push(['setCouncilRunning', value]),
        renderCouncilControls: () => calls.push(['renderCouncilControls']),
        renderInputIndicators: () => calls.push(['renderInputIndicators']),
        requestFrame: (callback) => callback(),
        ...(continueWithReply ? { continueWithReply } : {}),
        now: () => 350
      });
    },
    tick() {
      tickerCallback?.();
    }
  };
  return harness;
};

test('realtime council lifecycle streams chunks, appends remaining text, and returns metadata', async () => {
  const harness = createHarness();

  const result = await harness.run();

  assert.deepEqual(result, {
    fullResponse: 'Hello',
    metadata: { models: ['a'] },
    responseRenderedInRealtime: true
  });
  assert.deepEqual(harness.renderers[0].appended, ['Hel', 'lo']);
  assert.deepEqual(harness.renderers[0].finished, [{ renderFormulas: true }]);
  assert.equal(harness.contentDiv.dataset.streamRendered, 'true');
  assert.deepEqual(harness.calls.slice(0, 4), [
    ['setCouncilRunning', true],
    ['renderCouncilControls'],
    ['renderInputIndicators'],
    ['startTicker']
  ]);
});

test('buffered council lifecycle renders progress and does not create realtime renderer', async () => {
  const harness = createHarness({ outputMode: 'buffered' });

  const result = await harness.run();
  harness.tick();

  assert.equal(result.fullResponse, 'Hello');
  assert.equal(result.responseRenderedInRealtime, false);
  assert.equal(harness.renderers.length, 0);
  assert.match(harness.contentDiv.innerHTML, /progress:firstRound/);
  assert.equal(harness.calls.some(([name]) => name === 'gradualAppend'), false);
});

test('stopping realtime council synthesis retains the visible partial response', async () => {
  const controller = new AbortController();
  const harness = createHarness({
    signal: controller.signal,
    runModelCouncil: async (parts, signal, onProgress, onFinalChunk) => {
      onFinalChunk('Visible council answer');
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    }
  });

  const result = await harness.run();
  assert.deepEqual(result, {
    fullResponse: 'Visible council answer',
    metadata: null,
    responseRenderedInRealtime: true
  });
  assert.deepEqual(harness.renderers[0].appended, ['Visible council answer']);
  assert.equal(harness.contentDiv.dataset.streamRendered, 'true');
});

test('council lifecycle stops progress ticker and propagates errors', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  const harness = createHarness({
    outputMode: 'buffered',
    runModelCouncil: async (parts, signal, onProgress) => {
      onProgress({ stage: 'firstRound', message: 'Working', startedAt: 100, elapsedMs: 0 });
      throw abortError;
    }
  });

  await assert.rejects(
    () => harness.run(),
    (error) => error === abortError
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === 'stopTicker'),
    [['stopTicker', 'ticker']]
  );
});

test('council response render lifecycle source avoids provider parser, storage, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/council-response-render-lifecycle.js');

  for (const forbidden of [
    'fetch',
    'TextDecoder',
    'response.body',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'saveAppData',
    'streamApiCall',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});

test('the pages the members met go at the head of the message as its sources, and the view is drawn again with them', async () => {
  const sources = [{ n: 1, url: 'https://a.example/', title: 'A' }];
  const harness = createHarness({
    runModelCouncil: async (parts, signal, onProgress, onFinalChunk) => {
      onProgress({ stage: 'firstRound', message: 'Working', startedAt: Date.now(), elapsedMs: 0 });
      onFinalChunk('Answer [1]');
      return { text: 'Answer [1]', sources, metadata: {} };
    }
  });
  const result = await harness.run();
  assert.match(result.fullResponse, /^```noureon-run\n\{[^\n]*"sources":\[\{"title":"A","url":"https:\/\/a\.example\/","n":1\}\][^\n]*\}\n```\n\nAnswer \[1\]$/);
  assert.equal(harness.contentDiv.dataset.streamRendered, 'false', 'drawn again, so the [1] links to its page');

  const without = createHarness();
  const plain = await without.run();
  assert.equal(plain.fullResponse, 'Hello');
  assert.equal(without.contentDiv.dataset.streamRendered, 'true');
});

test('the synthesis is handed to a reply drawn in the message: the council\'s panel stops, and what the reply made (its record, its files) is the message', async () => {
  const replies = [];
  const harness = createHarness({
    continueWithReply: async (options) => {
      replies.push(options);
      return { fullResponse: '```noureon-run\n{"v":1}\n```\n\nMade', extraParts: [{ sandboxFile: { name: 'deck.pptx' } }], responseRenderedInRealtime: true };
    },
    runModelCouncil: async (parts, signal, onProgress, onFinalChunk, handOver) => {
      onProgress({ stage: 'firstRound', message: 'Working', startedAt: 100, elapsedMs: 0 });
      const made = await handOver.synthesize({ parts: [{ text: 'synthesis request' }], instruction: 'Synthesize.', sources: [{ n: 1, url: 'https://a.example/' }], synthesizer: { id: 'synth' }, conversation: { id: 'c' }, onMemoryContextResolved: () => {} });
      onProgress({ stage: 'completed', message: 'Done', startedAt: 100, elapsedMs: 9 });
      return { text: `${made.text}\n\n<details>record</details>`, synthesis: made, sources: [{ n: 1, url: 'https://a.example/' }], metadata: { mode: 'consensus' } };
    }
  });
  const result = await harness.run([{ text: 'Question' }]);
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].userParts, [{ text: 'synthesis request' }]);
  assert.deepEqual(replies[0].synthesis, { instruction: 'Synthesize.', sources: [{ n: 1, url: 'https://a.example/' }] });
  assert.equal(replies[0].modelInfo.id, 'synth');
  assert.equal(replies[0].targetElement, harness.contentDiv);
  assert.equal(harness.contentDiv.innerHTML, '', 'the panel was not drawn again over the reply');
  assert.deepEqual(result, {
    fullResponse: '```noureon-run\n{"v":1}\n```\n\nMade\n\n<details>record</details>',
    metadata: { mode: 'consensus' },
    extraParts: [{ sandboxFile: { name: 'deck.pptx' } }],
    responseRenderedInRealtime: true
  });
  assert.equal(harness.contentDiv.dataset.streamRendered, 'false');

  const followed = [];
  const server = createHarness({
    continueWithReply: async (options) => { followed.push(options); return { fullResponse: 'From the server', extraParts: [] }; },
    runModelCouncil: async (parts, signal, onProgress, onFinalChunk, handOver) => {
      const made = await handOver.followSynthesis({ runId: 'run-1' });
      return { text: made.text, synthesis: made, sources: [], metadata: {} };
    }
  });
  const fromServer = await server.run([{ text: 'Question' }]);
  assert.deepEqual(followed[0].resumeRun, { runId: 'run-1' });
  assert.deepEqual(followed[0].userParts, [{ text: 'Question' }]);
  assert.equal(fromServer.fullResponse, 'From the server');
});
