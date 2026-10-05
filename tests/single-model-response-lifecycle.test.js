import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSingleModelResponseLifecycle } from '../src/app/legacy-runtime/features/single-model-response-lifecycle.js';
import { liftSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';

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
  foundSources = null,
  reportWhileStreaming = null,
  supports = null,
  streamError,
  afterChunks = () => {},
  extraDependencies = {},
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
      calls.push(['translate', args[0], args[4]]);
      args[3]?.('translation', 'Preparing translated packet');
      if (foundSources) args[4]?.onSources?.(foundSources);
      return translatedParts ?? args[0];
    },
    streamApiCall: async (parts, onChunk, receivedSignal, forced, options) => {
      calls.push(['api', parts, receivedSignal, forced, options]);
      if (streamError) throw streamError;
      if (reportWhileStreaming) options?.onSources?.(reportWhileStreaming);
      if (supports) options?.onSupports?.(supports);
      onChunk('Hello');
      onChunk(' Astra');
      afterChunks();
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
    },
    ...extraDependencies
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
  const apiCall = calls.find((call) => call[0] === 'api');
  assert.equal(apiCall[1], translatedParts);
  assert.equal(apiCall[2], signal);
  assert.equal(apiCall[3], false);
  assert.deepEqual(apiCall[4].modelInfo, { id: 'model', name: 'Model' });
  assert.equal(apiCall[4].webSearchEnabled, false);
  assert.equal(typeof apiCall[4].onMemoryContextResolved, 'function');
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

test('stopping a buffered provider stream retains received text and renders it immediately', async () => {
  const controller = new AbortController();
  const { calls, lifecycle, signal, targetElement } = createHarness({
    outputMode: 'playback',
    signal: controller.signal,
    afterChunks: () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    }
  });

  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Hello' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    signal,
    uiLanguage: 'en'
  });
  assert.equal(result.fullResponse, 'Hello Astra');
  await lifecycle.completeView({ targetElement, ...result, signal });
  assert.equal(calls.some(([name]) => name === 'playback'), false);
  assert.ok(calls.some(([name, , text]) => name === 'render-final' && text === 'Hello Astra'));
});

test('request-scoped search reaches both translation and provider request options', async () => {
  const { calls, lifecycle, signal, targetElement } = createHarness({ outputMode: 'playback' });

  const conversation = { model: 'model', isWebSearchEnabled: false };
  await lifecycle.run({
    targetElement,
    userParts: [{ text: 'What is the weather today?' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation,
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });

  const { onSources, ...translateOptions } = calls.find((call) => call[0] === 'translate')[2];
  assert.deepEqual(translateOptions, { webSearchEnabled: true, readLinkedPages: true, conversation });
  assert.equal(typeof onSources, 'function', 'the pages the search finds are reported back for the reply');
  assert.equal(calls.find((call) => call[0] === 'api')[4].webSearchEnabled, true);
  assert.equal(calls.find((call) => call[0] === 'api')[4].conversation, conversation);
});

test('the pages a web search found are kept with the reply, ahead of its text', async () => {
  const sources = [{ title: 'MDN', url: 'https://developer.mozilla.org/x' }];
  const { lifecycle, signal, targetElement } = createHarness({ foundSources: sources });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'What is new?' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  const { run, text } = liftSandboxRunBlock(result.fullResponse);
  assert.deepEqual(run.sources, [{ title: 'MDN', url: 'https://developer.mozilla.org/x', n: 1 }], 'pages that came without a number are numbered, so an answer can cite them');
  assert.deepEqual(run.steps, []);
  assert.match(text, /Hello/);
});

test('pages the provider\'s own search reports while it answers are kept with the reply too', async () => {
  const { lifecycle, signal, targetElement } = createHarness({
    foundSources: [{ title: 'A', url: 'https://a.example/1' }],
    reportWhileStreaming: [{ title: 'B', url: 'https://vertexaisearch.cloud.google.com/x' }, { title: 'A', url: 'https://a.example/1' }]
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'News?' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  assert.deepEqual(liftSandboxRunBlock(result.fullResponse).run.sources.map((source) => source.title), ['A', 'B'], 'each page once');
});

test('a web address in the message has the request prepared even with no search and no file, and a message without one does not', async () => {
  const { calls, lifecycle, signal, targetElement } = createHarness();
  const run = (text) => lifecycle.run({
    targetElement,
    userParts: [{ text }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    webSearchEnabled: false,
    signal,
    uiLanguage: 'en'
  });

  await run('Summarise https://example.org/article please');
  assert.equal(calls.filter((call) => call[0] === 'translate').length, 1);

  calls.length = 0;
  await run('Nothing to read here');
  assert.equal(calls.filter((call) => call[0] === 'translate').length, 0, 'the request goes as it is');
});

const researchHarness = ({ rounds, canUse = true }) => {
  let round = 0;
  const requests = [];
  const searches = [];
  const opened = [];
  const harness = createHarness({
    extraDependencies: {
      supportsToolCalling: () => true,
      webResearch: {
        canUse: () => canUse,
        searchWeb: async ({ query }) => {
          searches.push(query);
          return { results: [{ title: 'Repo releases', url: 'https://github.com/a/b/releases', content: 'v2.0 is out' }] };
        },
        openPage: async (urls) => {
          opened.push(...urls);
          return { pages: [{ url: urls[0], title: 'Releases', text: 'v2.0 notes' }], failed: [] };
        }
      },
      streamApiCall: async (parts, onChunk, signal, forced, options) => {
        requests.push({ parts, options });
        const current = rounds[round++];
        if (current.error) throw current.error;
        onChunk(current.text);
        options.onResponseComplete?.({ text: current.text, toolCalls: current.calls || [] });
        return current.text;
      }
    }
  });
  return { ...harness, requests, searches, opened };
};

test('a model that calls tools searches and opens pages by itself, and the pages are kept with the reply', async () => {
  const { lifecycle, signal, targetElement, requests, searches, opened, calls } = researchHarness({
    rounds: [
      { text: '', calls: [{ id: '1', name: 'web_search', args: { query: 'a/b releases' } }] },
      { text: '', calls: [{ id: '2', name: 'open_page', args: { url: 'https://github.com/a/b/releases' } }] },
      { text: 'v2.0 is the latest.' }
    ]
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'what is the latest release of a/b' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: true },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  assert.deepEqual(searches, ['a/b releases']);
  assert.deepEqual(opened, ['https://github.com/a/b/releases']);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].options.tools.map((tool) => tool.name), ['web_search', 'open_page', 'find_in_page']);
  assert.equal(requests[2].options.toolTurns.length, 2);
  assert.equal(calls.some((entry) => entry[0] === 'translate' && entry[2]?.webSearchEnabled), false, 'no search packet is made before the model');
  const { run, text } = liftSandboxRunBlock(result.fullResponse);
  assert.match(text, /v2\.0 is the latest/);
  assert.deepEqual(run.sources.map((source) => [source.url, Boolean(source.read)]), [
    ['https://github.com/a/b/releases', false],
    ['https://github.com/a/b/releases', true]
  ], 'the page that was searched and then opened shows as found and as read');
});

test('a model without tools, or with no search key, gets the search packet as before', async () => {
  const { lifecycle, signal, targetElement, searches, calls } = researchHarness({ rounds: [{ text: 'plain' }], canUse: false });
  await lifecycle.run({
    targetElement,
    userParts: [{ text: 'news?' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: true },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  assert.deepEqual(searches, []);
  assert.equal(calls.find((entry) => entry[0] === 'translate')[2].webSearchEnabled, true);
});

test('a provider that refuses the tools answers with the search done first', async () => {
  const { lifecycle, signal, targetElement, requests, calls } = researchHarness({
    rounds: [{ error: new Error('tools not supported') }, { text: 'answer from the packet' }]
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'news?' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: true },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  assert.match(result.fullResponse, /answer from the packet/);
  assert.equal(requests.length, 2);
  assert.equal(calls.filter((entry) => entry[0] === 'translate').at(-1)[2].webSearchEnabled, true);
});

test('the pages that were read and the pages that were searched are both kept with the reply, once each', async () => {
  const { lifecycle, signal, targetElement } = createHarness({
    foundSources: [{ title: 'Linked', url: 'https://linked.example/a', read: true }, { title: 'Found', url: 'https://found.example/1' }]
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Summarise https://linked.example/a' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: false },
    signal,
    uiLanguage: 'en'
  });
  assert.deepEqual(liftSandboxRunBlock(result.fullResponse).run.sources, [
    { title: 'Linked', url: 'https://linked.example/a', n: 1, read: true },
    { title: 'Found', url: 'https://found.example/1', n: 2 }
  ]);
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

test('the model\'s thinking is a step under the "Working" line, which says it is thinking and then how long the work took', async () => {
  const window = new Window();
  const { document } = window;
  const host = document.createElement('div');
  const target = document.createElement('div');
  host.append(target);
  document.body.append(host);
  const seen = {};
  const { lifecycle, signal } = createHarness({
    extraDependencies: {
      getDocument: () => document,
      streamApiCall: async (parts, onChunk, receivedSignal, forced, options) => {
        options.onReasoning('Let me think. ', 'raw');
        const rows = [...host.querySelectorAll('.ledger-row')];
        seen.labels = rows.map((row) => row.querySelector('.ledger-label').textContent);
        seen.parent = rows[0].querySelector('.ledger-label').textContent;
        seen.thoughtInsideParent = rows[0].querySelector('.ledger-body .ledger-thought')?.textContent;
        seen.topLevelRows = [...host.querySelectorAll(':scope > .ledger')].length;
        onChunk('The answer.');
        seen.afterAnswer = host.querySelector('.ledger-row .ledger-label').textContent;
        return 'The answer.';
      }
    }
  });
  const result = await lifecycle.run({
    targetElement: target,
    userParts: [{ text: 'hello' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model' },
    signal,
    uiLanguage: 'en'
  });
  assert.equal(seen.parent, 'Working · Thinking…', 'the line says what the work is at');
  assert.equal(seen.topLevelRows, 1, 'one list in the message: the thinking is not a second one beside it');
  assert.equal(seen.thoughtInsideParent, 'Let me think. ', 'the thinking is a step inside the line');
  assert.match(seen.afterAnswer, /^Processed for \d/, 'once the answer starts, the line is the time the work took');
  assert.equal(host.querySelectorAll('.ledger').length, 0, 'it goes when the reply is finished: the saved reply shows it');
  assert.match(result.fullResponse, /The answer\./);
  window.happyDOM.abort();
});

test('where Gemini\'s answer cites its pages goes into the text as markers once the answer is whole, and the view is drawn again', async () => {
  const pages = [{ title: 'A', url: 'https://a.example/1' }, { title: 'B', url: 'https://b.example/2' }];
  const { lifecycle, signal, targetElement } = createHarness({
    reportWhileStreaming: pages,
    supports: [{ text: 'Hello Astra', urls: ['https://b.example/2', 'https://a.example/1'] }]
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Hi' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: true },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  const { run, text } = liftSandboxRunBlock(result.fullResponse);
  assert.equal(text, 'Hello Astra [1][2]');
  assert.deepEqual(run.sources.map((source) => [source.url, source.n]), [['https://a.example/1', 1], ['https://b.example/2', 2]]);
  assert.equal(targetElement.dataset.streamRendered, 'false', 'drawn again, so the markers show as labels');
});

test('an answer that cites nothing is left as it is', async () => {
  const { lifecycle, signal, targetElement } = createHarness({ reportWhileStreaming: [{ title: 'A', url: 'https://a.example/1' }] });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Hi' }],
    modelInfo: { id: 'model', name: 'Model' },
    conversation: { model: 'model', isWebSearchEnabled: true },
    webSearchEnabled: true,
    signal,
    uiLanguage: 'en'
  });
  assert.equal(liftSandboxRunBlock(result.fullResponse).text, 'Hello Astra');
});

const serverReplyDouble = ({ plan = { ok: true, webSearch: 'off' }, started, follow }) => {
  const record = { plans: [], starts: [], notices: [] };
  return {
    record,
    plan: (context) => { record.plans.push(context); return plan; },
    start: async (args) => { record.starts.push(args); return started ?? { ok: true, run: { follow } }; },
    notify: (kind, language) => record.notices.push([kind, language]),
    localizeError: (error) => error
  };
};

test('a reply the server makes is followed, not made here, and the answer is shown as the server writes it', async () => {
  const serverReply = serverReplyDouble({
    follow: async ({ onText }) => { onText('Hel'); onText('lo'); return { text: 'Hello', run: null, rewritten: false }; }
  });
  const { calls, lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply } });
  const conversation = { id: 'c1', model: 'model', isWebSearchEnabled: false, messages: [] };
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Hi' }],
    modelInfo: { id: 'model', name: 'Model', provider: 'openrouter' },
    conversation,
    signal,
    uiLanguage: 'en',
    assistantMessageId: 'm1',
    sequence: 4,
    getHistorySourceIds: () => ['h1']
  });
  assert.equal(result.fullResponse, 'Hello');
  assert.equal(result.responseRenderedInRealtime, true);
  assert.equal(calls.some((call) => call[0] === 'api'), false, 'nothing is asked of the provider from here');
  assert.deepEqual(calls.find((call) => call[0] === 'stream-render-finish')[1], ['Hel', 'lo']);
  const [start] = serverReply.record.starts;
  assert.equal(start.assistantMessageId, 'm1');
  assert.equal(start.sequence, 4);
  assert.equal(start.webSearch, 'off');
  assert.deepEqual(start.getHistorySourceIds(), ['h1']);
  assert.deepEqual(serverReply.record.plans[0].advanced, false);
});

test('the run record the server wrote (the pages it searched) is kept with the reply, and a text that was rewritten is drawn again', async () => {
  const sources = [{ url: 'https://a.example', title: 'A', n: 1 }];
  const serverReply = serverReplyDouble({
    follow: async ({ onText, onRun }) => { onRun({ sources }); onText('Fact [1]'); return { text: 'Fact [1]', run: { status: 'done', steps: [], elapsedMs: 5, sources }, rewritten: true }; }
  });
  const { lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply } });
  const result = await lifecycle.run({ targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2 });
  const lifted = liftSandboxRunBlock(result.fullResponse);
  assert.equal(lifted.text, 'Fact [1]');
  assert.equal(lifted.run.sources[0].url, 'https://a.example');
  assert.equal(targetElement.dataset.streamRendered, 'false');
});

test('a reply the server does not take is made here as usual, and the person is told only when it matters', async () => {
  const declined = serverReplyDouble({ started: { ok: false, reason: 'unreachable', notify: 'unreachable' } });
  const { calls, lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply: declined } });
  const result = await lifecycle.run({ targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal, uiLanguage: 'fr', assistantMessageId: 'm1', sequence: 2 });
  assert.equal(result.fullResponse, 'Hello Astra');
  assert.ok(calls.some((call) => call[0] === 'api'));
  assert.deepEqual(declined.record.notices, [['unreachable', 'fr']]);

  const quiet = serverReplyDouble({ plan: { ok: false, reason: 'advanced' } });
  const second = createHarness({ extraDependencies: { serverReply: quiet } });
  await second.lifecycle.run({ targetElement: second.targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal: second.signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2 });
  assert.equal(quiet.record.starts.length, 0);
  assert.deepEqual(quiet.record.notices, []);
  assert.ok(second.calls.some((call) => call[0] === 'api'));

  // Without an id for the message (an older caller) the server is not asked.
  const unnamed = serverReplyDouble({});
  const third = createHarness({ extraDependencies: { serverReply: unnamed } });
  await third.lifecycle.run({ targetElement: third.targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal: third.signal, uiLanguage: 'en' });
  assert.equal(unnamed.record.plans.length, 0);
});

test('an error the server reports is the error of the reply, and what the person stopped is returned as far as it got', async () => {
  const failing = serverReplyDouble({ follow: async () => { throw Object.assign(new Error('The provider said no'), { serverRun: true }); } });
  const { lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply: failing } });
  await assert.rejects(() => lifecycle.run({ targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2 }), (error) => error.message === 'The provider said no' && error.serverRun === true);
});

test('in the default Advanced mode an ordinary reply goes to the server, and one that needs Python stays here', async () => {
  const advancedWindow = { WebAssembly: {}, Worker: function Worker() {}, postMessage() {} };
  const asked = [];
  const make = () => {
    const serverReply = serverReplyDouble({ plan: { ok: false, reason: 'advanced' } });
    const originalPlan = serverReply.plan;
    serverReply.plan = (context) => { asked.push(context.advanced); return originalPlan(context); };
    return createHarness({ extraDependencies: { serverReply, supportsToolCalling: () => true, getWindow: () => advancedWindow } });
  };
  const run = async (text, conversationExtra = {}) => {
    const { lifecycle, signal, targetElement } = make();
    await lifecycle.run({ targetElement, userParts: [{ text }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [], ...conversationExtra }, signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2 });
  };
  await run('Write me a long short story about the sea');
  await run('Make me an Excel file of these numbers');
  await run('Thanks, one more thing', { messages: [{ role: 'user', parts: [{ inlineData: { mimeType: 'text/csv', data: 'YQ==' } }] }] });
  await run('Thanks, one more thing', { messages: [{ role: 'model', parts: [{ text: 'here' }, { sandboxFile: { name: 'a.xlsx' } }] }] });
  assert.deepEqual(asked, [false, true, true, true]);
});

test('a reply with Python the server makes: Python is asked for with the attachments and the Design menu\'s choices, the steps are drawn as they come, and the files are parts of the message', async () => {
  const window = new Window();
  const { document } = window;
  const host = document.createElement('div');
  const target = document.createElement('div');
  host.append(target);
  document.body.append(host);
  const shown = {};
  const file = { sandboxFile: { id: 'f1', name: 'chart.png', mimeType: 'image/png', size: 3, data: 'AQID' } };
  const serverReply = serverReplyDouble({
    plan: { ok: true, webSearch: 'off', advanced: true },
    follow: async ({ onEvent, onText }) => {
      onEvent({ type: 'round', label: 'Thinking', doneLabel: 'Thought' });
      onEvent({ type: 'step', n: 1, title: 'Plot it', code: 'plot()' });
      shown.rows = [...host.querySelectorAll('.ledger-row .ledger-label')].map((label) => label.textContent);
      onEvent({ type: 'step-end', n: 1, ok: true, files: [{ name: 'chart.png', size: 3 }], elapsedMs: 5 });
      onText('Here it is.');
      return { text: 'Here it is.', run: { status: 'done', steps: [{ title: 'Plot it', code: 'plot()', stdout: '', stderr: '', files: [{ name: 'chart.png', size: 3, id: 'f1' }], elapsedMs: 5 }] }, rewritten: false, extraParts: [file] };
    }
  });
  const { lifecycle, signal } = createHarness({ extraDependencies: { serverReply, getDocument: () => document, supportsToolCalling: () => true, getWindow: () => ({ WebAssembly: {}, Worker: function Worker() {}, postMessage() {} }) } });
  const attachment = { inlineData: { name: 'data.csv', mimeType: 'text/csv', data: 'YSxi' } };
  const result = await lifecycle.run({
    targetElement: target,
    userParts: [{ text: 'Plot my data' }, attachment],
    modelInfo: { id: 'model', name: 'Model', provider: 'openrouter' },
    conversation: { id: 'c1', model: 'model', messages: [], deckDesign: 'Slate' },
    signal,
    uiLanguage: 'en',
    assistantMessageId: 'm1',
    sequence: 2
  });
  const [start] = serverReply.record.starts;
  assert.equal(start.advanced, true);
  assert.deepEqual(start.designs, { deck: 'Slate', document: 'auto' });
  assert.deepEqual(start.inputs, [{ name: 'data.csv', mimeType: 'text/csv', data: 'YSxi' }]);
  assert.ok(shown.rows.some((label) => /Plot it/.test(label) || /Thinking/.test(label)), 'the steps were drawn while the reply went on');
  assert.deepEqual(result.extraParts, [file], 'the files the server made are parts of the reply');
  const { run, text } = liftSandboxRunBlock(result.fullResponse);
  assert.equal(text, 'Here it is.');
  assert.equal(run.steps[0].files[0].id, 'f1');
  window.happyDOM.abort();
});

test('the check of a presentation is asked of the server for a model that can see images, and what the server says about it is remembered for the reply', async () => {
  const notes = [];
  const serverReply = serverReplyDouble({
    started: { ok: true, run: { vision: true, follow: async () => ({ text: 'Here.', run: null, rewritten: false, visionRunId: 'run-check' }) } }
  });
  serverReply.noteVision = (id, value) => notes.push([id, value]);
  const make = (supportsVision, config = {}) => createHarness({ extraDependencies: { serverReply, supportsVision, getConfig: () => config } });
  const run = async (harness, modelInfo = { id: 'model', name: 'Model', provider: 'gemini' }) => harness.lifecycle.run({
    targetElement: harness.targetElement, userParts: [{ text: 'Hi' }], modelInfo, conversation: { id: 'c1', model: 'model', messages: [], deckDesign: 'Slate' },
    signal: harness.signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2
  });
  await run(make(() => true));
  assert.deepEqual(serverReply.record.starts.at(-1).visionCheck, { deckDesign: 'Slate', advanced: false });
  assert.deepEqual(notes, [['m1', { vision: true, visionRunId: 'run-check' }]]);
  await run(make(() => false));
  assert.equal(serverReply.record.starts.at(-1).visionCheck, null, 'a model that cannot see images');
  await run(make(() => true, { visionCheckEnabled: false }));
  assert.equal(serverReply.record.starts.at(-1).visionCheck, null, 'the setting is off');
  await run(make(() => true), { id: 'img', name: 'Img', provider: 'gemini', outputModality: 'image' });
  assert.equal(serverReply.record.starts.at(-1).visionCheck, null, 'an image model');
});

test('the server lost its Python before it had an answer: the reply is made here, with the page\'s own Python, and nothing of the failure is shown', async () => {
  const lost = Object.assign(new Error('The Python sandbox is not available.'), { code: 'sandbox_unavailable', serverRun: true });
  const serverReply = serverReplyDouble({ plan: { ok: true, webSearch: 'off', advanced: true }, follow: async () => { throw lost; } });
  const asked = [];
  const { lifecycle, signal, targetElement } = createHarness({
    extraDependencies: {
      serverReply,
      supportsToolCalling: () => true,
      getWindow: () => ({ WebAssembly: {}, Worker: function Worker() {}, postMessage() {} }),
      streamApiCall: async (parts, onChunk, receivedSignal, forced, options) => {
        asked.push(options.tools?.map((tool) => tool.name));
        onChunk('Made here.');
        return 'Made here.';
      }
    }
  });
  const result = await lifecycle.run({
    targetElement,
    userParts: [{ text: 'Make me an Excel file of these numbers' }],
    modelInfo: { id: 'model', name: 'Model', provider: 'openrouter' },
    conversation: { id: 'c1', model: 'model', messages: [] },
    signal,
    uiLanguage: 'en',
    assistantMessageId: 'm1',
    sequence: 2
  });
  assert.equal(serverReply.record.starts.length, 1, 'the server was asked first');
  assert.deepEqual(asked, [['run_python']], 'then the page made the reply, with Python');
  assert.equal(liftSandboxRunBlock(result.fullResponse).text, 'Made here.');
});

test('a reply the server is still making is followed without preparing or sending anything again', async () => {
  const serverReply = serverReplyDouble({ follow: async () => { throw new Error('not used'); } });
  const { calls, lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply } });
  const resumeRun = { assistantMessageId: 'm9', follow: async ({ onText }) => { onText('so far '); onText('and more'); return { text: 'so far and more', run: null, rewritten: false }; } };
  const result = await lifecycle.run({ targetElement, userParts: [], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal, uiLanguage: 'en', resumeRun });
  assert.equal(result.fullResponse, 'so far and more');
  assert.deepEqual(calls.find((call) => call[0] === 'stream-render-finish')[1], ['so far ', 'and more']);
  assert.equal(calls.some((call) => call[0] === 'api' || call[0] === 'translate'), false);
  assert.equal(serverReply.record.starts.length, 0, 'nothing is handed to the server again');
});

test('the seconds of a reply the server makes are the server\'s clock, and the saved record keeps the server\'s thinking time', async () => {
  let clock = 1_000_000;
  const ticks = [];
  const serverReply = serverReplyDouble({
    follow: async ({ onTiming, onThought, onThoughtEnd, onText }) => {
      onTiming(30_000);
      ticks.at(-1)();
      onThought('hmm', 'raw', 12_000);
      clock += 3000;
      onThoughtEnd(15_300);
      onText('Answer');
      return { text: 'Answer', run: { status: 'done', steps: [], elapsedMs: 33_000, thought: 'hmm', thoughtKind: 'raw', thoughtMs: 15_300 }, rewritten: false };
    }
  });
  const { calls, lifecycle, signal, targetElement } = createHarness({ extraDependencies: { serverReply, now: () => clock, startProgressTicker: (tick) => { ticks.push(tick); return { id: 1 }; } } });
  const result = await lifecycle.run({ targetElement, userParts: [{ text: 'Hi' }], modelInfo: { id: 'model', name: 'Model' }, conversation: { id: 'c1', model: 'model', messages: [] }, signal, uiLanguage: 'en', assistantMessageId: 'm1', sequence: 2 });
  assert.equal(lifecycle.getLatestProgress().elapsedMs, 30_000, 'the seconds shown start from the server\'s clock');
  const lifted = liftSandboxRunBlock(result.fullResponse);
  assert.equal(lifted.run.thoughtMs, 15_300, 'not what this page measured');
  assert.equal(lifted.run.elapsedMs, 33_000);
  assert.equal(lifted.text, 'Answer');
  assert.ok(calls.length > 0);
});

test('an address in a message that chose a CLI tool with "@" is not read first when the model searches and opens pages by itself; other messages keep the reading', async () => {
  const link = 'https://x.com/someone/status/1';
  const tool = { type: 'mode', indicatorId: 'cli-indicator-ffmpeg', label: 'FFmpeg' };
  const withTool = [{ text: `FFmpeg ${link}`, displaySegments: [tool, { type: 'text', text: link }] }];
  const plain = [{ text: `Summarize ${link}` }];
  const run = async (userParts, { canResearch = true, chosen = true } = {}) => {
    const { calls, lifecycle, signal, targetElement } = createHarness({
      extraDependencies: {
        webResearch: { canUse: () => canResearch, searchWeb: async () => ({}), openPage: async () => ({}) },
        supportsToolCalling: () => true,
        getConfig: () => ({ cliEnabledIds: chosen ? ['ffmpeg'] : [], cliModelUseIds: [], uiLanguage: 'en', outputMode: 'realtime' })
      }
    });
    await lifecycle.run({ targetElement, userParts, modelInfo: { id: 'model', name: 'Model' }, conversation: { model: 'model', isWebSearchEnabled: false }, webSearchEnabled: true, signal, uiLanguage: 'en' });
    return calls.filter((call) => call[0] === 'translate');
  };
  assert.equal((await run(withTool)).length, 0, 'the address is the tool\'s: nothing is read before the request goes');
  const plainRun = await run(plain);
  assert.equal(plainRun.length, 1, 'without a chosen tool the address is read as before');
  assert.equal(plainRun[0][2].readLinkedPages, true);
  assert.equal((await run(withTool, { chosen: false })).length, 1, 'a tool that is not added is not a chosen tool');
  const cannot = await run(withTool, { canResearch: false });
  assert.equal(cannot.length, 1, 'a model that cannot search by itself still has the page read for it');
  assert.equal(cannot[0][2].readLinkedPages, true);
});
