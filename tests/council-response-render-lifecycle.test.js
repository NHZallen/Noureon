import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import { runCouncilResponseRenderLifecycle } from '../src/app/legacy-runtime/features/council-response-render-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = ({
  outputMode = 'realtime',
  runModelCouncil,
  gradualAppend,
  renderProgressMarkup
} = {}) => {
  const calls = [];
  const renderers = [];
  const contentDiv = new Window().document.createElement('div');
  contentDiv.innerHTML = 'loading';
  let tickerCallback;
  const harness = {
    calls,
    contentDiv,
    renderers,
    async run(userParts = [{ text: 'Question' }]) {
      return runCouncilResponseRenderLifecycle({
        contentDiv,
        userParts,
        signal: new AbortController().signal,
        getOutputMode: () => outputMode,
        runModelCouncil: runModelCouncil || (async (parts, signal, onProgress, onFinalChunk) => {
          onProgress({ stage: 'firstRound', message: 'Working', startedAt: 100, elapsedMs: 0 });
          onFinalChunk('Hel');
          return { text: 'Hello', metadata: { models: ['a'] } };
        }),
        renderCouncilProgress: (progress) => {
          calls.push(['renderProgress', progress.stage, progress.elapsedMs]);
          return renderProgressMarkup?.(progress) || `progress:${progress.stage}:${progress.elapsedMs}`;
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

test('council disclosure state survives progress rerenders', async () => {
  const harness = createHarness({
    outputMode: 'buffered',
    renderProgressMarkup: (progress) => `
      <div class="council-status-group is-open" data-council-status-group="models">
        <button type="button" data-council-status-toggle="models" aria-expanded="true">Models</button>
        <div data-council-status-body="models" aria-hidden="false">${progress.stage}</div>
      </div>
    `
  });

  await harness.run();
  const toggle = harness.contentDiv.querySelector('[data-council-status-toggle="models"]');
  toggle.click();

  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(harness.contentDiv.querySelector('[data-council-status-body="models"]').getAttribute('aria-hidden'), 'true');

  harness.tick();

  assert.equal(
    harness.contentDiv.querySelector('[data-council-status-toggle="models"]').getAttribute('aria-expanded'),
    'false'
  );
  assert.equal(harness.contentDiv.querySelector('[data-council-status-group="models"]').classList.contains('is-open'), false);
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
