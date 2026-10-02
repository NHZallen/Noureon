import assert from 'node:assert/strict';
import test from 'node:test';

import { modelSupportsToolCalling, MODELS, NON_TOOL_CALLING_MODEL_IDS, TOOL_CALLING_MODEL_IDS } from '../../src/app/runtime/legacy-core/model-registry.js';
import { describeFileModeState, resolveReplyMode } from '../../src/app/runtime/sandbox/file-mode.js';
import { MAX_RUNS_PER_REPLY } from '../../src/app/runtime/sandbox/sandbox-guidance.js';
import { runSandboxReply, toolResultFor, trimForModel } from '../../src/app/runtime/sandbox/sandbox-reply.js';
import { SANDBOX_TEXT_KEYS, SANDBOX_TEXT_LANGUAGES, sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import {
  compactSandboxRunsForApi,
  formatSandboxRunBlock,
  liftSandboxRunBlock,
  summarizeSandboxRunText
} from '../../src/app/ui/sandbox/sandbox-run-block.js';
import { createSandboxRunElement } from '../../src/app/ui/sandbox/sandbox-run-view.js';
import { summarizeFileBlocks } from '../../src/app/ui/files/file-history-compaction.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

// A model that asks for the given calls round by round, then answers.
function scriptedModel(rounds) {
  const requests = [];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    requests.push(options);
    const round = rounds[requests.length - 1] || { text: 'Done.' };
    if (round.error) throw round.error;
    for (const chunk of round.chunks || [round.text || '']) onChunk(chunk);
    for (const raw of round.argumentChunks || []) options.onToolArguments?.({ name: round.argumentName || 'run_python', arguments: raw });
    options.onResponseComplete({ text: round.text || '', toolCalls: round.calls || [], parts: [], reasoningDetails: [] });
    return round.text || '';
  };
  return { streamApiCall, requests };
}

const call = (id, code, title = '', note = '') => ({ id, name: 'run_python', arguments: JSON.stringify({ ...(note ? { note } : {}), code, title }), args: { ...(note ? { note } : {}), code, title } });

function fakeSandbox(results) {
  const runs = [];
  const mounts = [];
  const sandbox = {
    prepare: async () => ({}),
    clear: async () => ({ cleared: true }),
    mount: async (files) => {
      mounts.push(files.map((file) => file.name));
      return { mounted: files };
    },
    run: async (code) => {
      runs.push(code);
      return typeof results === 'function' ? results(code) : results.shift();
    }
  };
  return { sandbox, runs, mounts };
}

test('text models are all marked with or without tool calling', () => {
  const textModels = MODELS.filter((model) => model.outputModality !== 'image').map((model) => model.id);
  for (const id of textModels) {
    assert.ok(TOOL_CALLING_MODEL_IDS.includes(id) !== NON_TOOL_CALLING_MODEL_IDS.includes(id), `${id} is listed exactly once`);
  }
  assert.ok(TOOL_CALLING_MODEL_IDS.every((id) => textModels.includes(id)), 'no stale ids');
  assert.equal(modelSupportsToolCalling(MODELS.find((model) => model.id === 'gemini-3.8-flash')), true);
  assert.equal(modelSupportsToolCalling(MODELS.find((model) => model.id === 'nvidia/z-ai/glm-5.3')), false);
  assert.equal(modelSupportsToolCalling(MODELS.find((model) => model.outputModality === 'image')), false);
});

test('a reply uses Advanced mode only when chosen and possible, and says why not', () => {
  const supports = (model) => model?.id === 'ok';
  const base = { conversation: {}, config: {}, modelInfo: { id: 'ok' }, supportsToolCalling: supports };
  assert.deepEqual(resolveReplyMode(base), { advanced: true, reason: null }, 'Advanced is the default');
  assert.deepEqual(resolveReplyMode({ ...base, config: { fileModeDefault: 'standard' } }), { advanced: false, reason: null });
  assert.deepEqual(resolveReplyMode({ ...base, conversation: { fileMode: 'standard' } }), { advanced: false, reason: null });
  assert.equal(resolveReplyMode({ ...base, isCouncil: true }).reason, 'council');
  assert.equal(resolveReplyMode({ ...base, config: { isLearningMode: true } }).reason, 'learning');
  assert.equal(resolveReplyMode({ ...base, modelInfo: { id: 'no' } }).reason, 'model-unsupported');
  assert.equal(resolveReplyMode({ ...base, browserSupported: false }).reason, 'browser-unsupported');
  const state = describeFileModeState({ ...base, conversation: { fileMode: 'standard' }, modelInfo: { id: 'no' }, window: {} });
  assert.deepEqual(state, { value: 'standard', unavailableReason: 'model-unsupported', ready: false });
});

test('interface texts exist in all five languages', () => {
  assert.deepEqual(SANDBOX_TEXT_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    for (const key of SANDBOX_TEXT_KEYS) {
      const value = sandboxText(language, key);
      assert.ok(value && value !== key, `${language} ${key}`);
    }
  }
  assert.equal(sandboxText('en', 'sandboxRunning', { n: 2, title: 'Charts' }), 'Running code: Charts');
});

test('the loop runs each requested call, returns the results and stops when the model answers', async () => {
  const model = scriptedModel([
    { calls: [call('c1', 'print(sum([3, 5, 7]))', '加總', '我來算一下。')] },
    { text: '總和是 15。' }
  ]);
  const { sandbox, runs } = fakeSandbox([{ stdout: { text: '15\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, files: [{ name: 'a.csv', size: 3, bytes: new Uint8Array(3) }], elapsedMs: 12 }]);
  const statuses = [];
  const chunks = [];
  const events = [];
  const result = await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [{ text: '算總和' }],
    onChunk: (chunk) => chunks.push(chunk),
    getSandbox: () => sandbox,
    onStatus: (status) => statuses.push(status),
    onEvent: (event) => events.push(event)
  });
  assert.deepEqual(runs, ['print(sum([3, 5, 7]))']);
  // What the model says about the run is the call's note: it goes with the run; the answer is only the answer, live and kept.
  assert.equal(result.text, '總和是 15。');
  assert.equal(result.run.steps[0].narration, '我來算一下。');
  assert.equal(chunks.join(''), '總和是 15。', 'the note is not streamed into the answer');
  const kinds = events.map((event) => event.type);
  assert.equal(kinds.indexOf('narration') < kinds.indexOf('step'), true, 'shown between the steps before the run starts');
  assert.equal(events.find((event) => event.type === 'narration').text, '我來算一下。');
  assert.equal(kinds.filter((kind) => kind === 'narration').length, 1);
  assert.equal(model.requests.length, 2);
  assert.equal(model.requests[0].tools[0].name, 'run_python');
  assert.match(model.requests[0].additionalSystemInstruction, /Advanced mode: Python in the browser/);
  const [turn] = model.requests[1].toolTurns;
  assert.equal(turn.results[0].id, 'c1');
  assert.deepEqual(JSON.parse(turn.results[0].content), { ok: true, stdout: '15\n', stderr: '', files: [{ path: '/output/a.csv', size: 3 }], elapsed_ms: 12 });
  assert.equal(result.run.status, 'done');
  assert.equal(result.run.elapsedMs >= 0, true, 'how long the whole reply took is recorded');
  assert.deepEqual(result.run.steps.map((step) => [step.title, step.stdout, step.files]), [['加總', '15\n', [{ name: 'a.csv', size: 3 }]]]);
  assert.ok(statuses.includes('正在執行程式：加總'));
});

test('with web research, the model searches and opens pages next to Python, and the words before them are not the answer', async () => {
  const model = scriptedModel([
    { calls: [{ id: 's1', name: 'web_search', arguments: '{}', args: { note: '先查一下。', query: 'noureon version' } }] },
    { text: '', calls: [{ id: 'o1', name: 'open_page', arguments: '{}', args: { url: 'https://example.com/v' } }, call('c1', 'print(1)', '算')] },
    { text: '版本是 17.3.0。' }
  ]);
  const { sandbox, runs } = fakeSandbox([{ stdout: { text: '1\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, files: [], elapsedMs: 1 }]);
  const searched = [];
  const opened = [];
  const found = [];
  const events = [];
  const chunks = [];
  const result = await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [{ text: 'q' }],
    onChunk: (chunk) => chunks.push(chunk),
    getSandbox: () => sandbox,
    language: 'en',
    research: {
      searchWeb: async ({ query }) => { searched.push(query); return { results: [{ title: 'V', url: 'https://example.com/v', content: '17.3.0' }] }; },
      openPage: async (urls) => { opened.push(...urls); return { pages: [{ url: urls[0], text: 'version 17.3.0' }], failed: [] }; },
      onSources: (sources) => found.push(...sources)
    },
    onEvent: (event) => events.push(event)
  });
  assert.deepEqual(model.requests[0].tools.map((tool) => tool.name), ['run_python', 'web_search', 'open_page', 'find_in_page']);
  assert.match(model.requests[0].additionalSystemInstruction, /web_search/);
  assert.deepEqual(searched, ['noureon version']);
  assert.deepEqual(opened, ['https://example.com/v']);
  assert.deepEqual(runs, ['print(1)']);
  assert.equal(found.length, 2);
  assert.equal(result.text, '版本是 17.3.0。');
  assert.equal(chunks.join(''), '版本是 17.3.0。');
  assert.equal(events.find((event) => event.type === 'narration').text, '先查一下。');
  assert.deepEqual(model.requests[2].toolTurns.map((turn) => turn.results.map((entry) => entry.name)), [['web_search'], ['open_page', 'run_python']]);
  assert.equal(result.run.steps.length, 1, 'only Python is a step');
});

test('text is the answer and shows as it comes, a short one as much as a long one', async () => {
  const long = '長'.repeat(500);
  const model = scriptedModel([{ chunks: [long.slice(0, 100), long.slice(100)], text: long }]);
  const chunks = [];
  const result = await runSandboxReply({ streamApiCall: model.streamApiCall, requestParts: [{ text: 'q' }], onChunk: (chunk) => chunks.push(chunk), getSandbox: () => fakeSandbox([]).sandbox });
  assert.equal(result.text, long);
  assert.deepEqual(chunks, [long.slice(0, 100), long.slice(100)], 'streamed in the pieces it came in');
  const short = scriptedModel([{ chunks: ['短的', '答案。'], text: '短的答案。' }]);
  const shortChunks = [];
  const shortResult = await runSandboxReply({ streamApiCall: short.streamApiCall, requestParts: [{ text: 'q' }], onChunk: (chunk) => shortChunks.push(chunk), getSandbox: () => fakeSandbox([]).sandbox });
  assert.equal(shortResult.text, '短的答案。');
  assert.deepEqual(shortChunks, ['短的', '答案。'], 'nothing is held back to find out whether it was an announcement');
});

test('a note is shown between the rows as soon as it is written, once, and the text a model writes before a call stays in the answer', async () => {
  const events = [];
  const chunks = [];
  const model = scriptedModel([
    {
      // The code is still being written when the note is complete.
      argumentChunks: ['{"note":"先看一下檔', '{"note":"先看一下檔案。","code":"pri', '{"note":"先看一下檔案。","code":"print(1)","title":"看"}'],
      calls: [call('c1', 'print(1)', '看', '先看一下檔案。')]
    },
    { chunks: ['好，', '結果是 1。'], text: '好，結果是 1。' }
  ]);
  const { sandbox } = fakeSandbox([{ stdout: { text: '1\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, files: [], elapsedMs: 1 }]);
  const seen = [];
  const original = model.streamApiCall;
  const result = await runSandboxReply({
    streamApiCall: (parts, onChunk, signal, forced, options) => original(parts, onChunk, signal, forced, { ...options, onToolArguments: (value) => { options.onToolArguments(value); seen.push(events.filter((event) => event.type === 'narration').length); } }),
    requestParts: [{ text: 'q' }], onChunk: (chunk) => chunks.push(chunk), getSandbox: () => sandbox, onEvent: (event) => events.push(event)
  });
  assert.deepEqual(seen, [0, 1, 1], 'told when its closing quote arrives, not before and not again');
  assert.equal(events.filter((event) => event.type === 'narration').length, 1, 'and not told a second time when the round is over');
  assert.equal(result.run.steps[0].narration, '先看一下檔案。');

  // A model that writes text before its call anyway: it is shown at once as the answer and kept, not held back or lost.
  const lateEvents = [];
  const lateChunks = [];
  const late = scriptedModel([{ chunks: ['我先算一下。'], text: '我先算一下。', calls: [call('c1', 'print(2)')] }, { text: '答案是 2。' }]);
  const lateResult = await runSandboxReply({
    streamApiCall: late.streamApiCall, requestParts: [{ text: 'q' }], onChunk: (chunk) => lateChunks.push(chunk),
    getSandbox: () => fakeSandbox([{ stdout: { text: '2\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, files: [], elapsedMs: 1 }]).sandbox,
    onEvent: (event) => lateEvents.push(event)
  });
  assert.equal(lateChunks[0], '我先算一下。', 'shown at once');
  assert.equal(lateResult.text, '我先算一下。\n\n答案是 2。');
  assert.equal(lateEvents.some((event) => event.type === 'narration'), false, 'it is not made into a note');
});

test('after the run limit the model gets no tool and must answer', async () => {
  const rounds = Array.from({ length: MAX_RUNS_PER_REPLY }, (_, index) => ({ calls: [call(`c${index}`, 'x = 1')] }));
  rounds.push({ text: 'Final.' });
  const model = scriptedModel(rounds);
  const { sandbox } = fakeSandbox(() => ({ stdout: '', stderr: '', error: null, files: [], elapsedMs: 1 }));
  const result = await runSandboxReply({ streamApiCall: model.streamApiCall, requestParts: [], getSandbox: () => sandbox });
  assert.equal(result.run.steps.length, MAX_RUNS_PER_REPLY);
  assert.deepEqual(model.requests.at(-1).tools, [], 'the last request has no tool');
  assert.equal(result.text, 'Final.');
});

test('Python failing to load turns into Standard mode with a note to the model', async () => {
  const model = scriptedModel([{ calls: [call('c1', 'print(1)')] }, { text: 'Here is the file as a block.' }]);
  const result = await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [],
    getSandbox: () => ({ prepare: async () => { throw new Error('offline'); }, clear: async () => {}, run: async () => ({}) })
  });
  assert.equal(result.run.fallback, 'sandbox-load-failed');
  assert.deepEqual(model.requests[1].tools, []);
  assert.match(JSON.parse(model.requests[1].toolTurns[0].results[0].content).note, /Do not call run_python again/);
});

test('stopping keeps the steps so far and marks the run stopped', async () => {
  const controller = new AbortController();
  const model = scriptedModel([{ calls: [call('c1', 'while True: pass')] }]);
  const { sandbox } = fakeSandbox(() => {
    controller.abort();
    return { stopped: true };
  });
  const result = await runSandboxReply({ streamApiCall: model.streamApiCall, requestParts: [], signal: controller.signal, getSandbox: () => sandbox });
  assert.equal(result.run.status, 'stopped');
  assert.equal(result.run.steps[0].stopped, true);
  assert.equal(model.requests.length, 1);
});

test('Gemini refusing search together with the tool falls back to answering without Python', async () => {
  const refusal = Object.assign(new Error('Tool use with search is unsupported'), { status: 400 });
  const model = scriptedModel([{ error: refusal }, { text: 'Searched answer.' }]);
  const result = await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [],
    requestOptions: { webSearchEnabled: true },
    provider: 'gemini',
    getSandbox: () => fakeSandbox([]).sandbox
  });
  assert.equal(result.text, 'Searched answer.');
  assert.equal(result.run.fallback, 'search-conflict');
  assert.deepEqual(model.requests[1].tools, []);
});

test('long output reaches the model as its start and end', () => {
  const text = `${'a'.repeat(9000)}${'b'.repeat(9000)}`;
  const trimmed = trimForModel(text, 1000);
  assert.ok(trimmed.startsWith('a'.repeat(700)) && trimmed.endsWith('b'.repeat(300)));
  assert.match(trimmed, /17000 characters omitted/);
  assert.deepEqual(JSON.parse(toolResultFor({ error: 'KeyError', restarted: true, stdout: '', stderr: '' })), {
    ok: false, stdout: '', stderr: '', error: 'KeyError', files: [], restarted: true,
    note: 'The Python environment was restarted; variables from earlier calls are gone.', elapsed_ms: 0
  });
});

test('the run record is stored above the answer and only a summary reaches the model', () => {
  const run = { status: 'done', steps: [{ title: 'T', code: 'print("```")\nx = 1', stdout: 'out', stderr: '', files: [{ name: 'r.xlsx', size: 10 }], elapsedMs: 5, outputs: [{ bytes: new Uint8Array(1) }] }] };
  const text = `${formatSandboxRunBlock(run)}The answer.`;
  const lifted = liftSandboxRunBlock(text);
  assert.equal(lifted.text, 'The answer.');
  assert.equal(lifted.run.steps[0].code, 'print("```")\nx = 1', 'code with fences survives');
  assert.equal('outputs' in lifted.run.steps[0], false, 'file bytes are not stored in the text');
  assert.equal(summarizeSandboxRunText(text), '[Earlier in this reply Python ran 1 time in the sandbox; it created /output/r.xlsx. That environment is gone.]\nThe answer.');
  assert.equal(summarizeFileBlocks(text).startsWith('[Earlier in this reply'), true, 'memory and titles see the summary');
  const history = compactSandboxRunsForApi([{ role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text }] }]);
  assert.equal(history[0].parts[0].text, text, 'user text is left alone');
  assert.doesNotMatch(history[1].parts[0].text, /noureon-run|print/);
  assert.deepEqual(liftSandboxRunBlock('```noureon-run\nnot json\n```\n\nx'), { run: null, text: 'x' });
  assert.deepEqual(liftSandboxRunBlock('Plain.'), { run: null, text: 'Plain.' });
});

test('the run row opens to each step, and a switch to Standard is one grey line', () => {
  const { document, cleanup } = createDom('<div id="root"></div>');
  try {
    const run = liftSandboxRunBlock(`${formatSandboxRunBlock({
      status: 'done',
      steps: [
        { title: '讀取資料', code: 'import pandas', stdout: 'ok', files: [{ name: '報告.xlsx', size: 2048 }], elapsedMs: 1500 },
        { title: '', code: 'boom', error: 'NameError: boom', elapsedMs: 10 }
      ]
    })}x`).run;
    const element = createSandboxRunElement(document, run, { language: 'zh-TW' });
    // Saved before the total was kept: the steps add up to it.
    assert.equal(element.querySelector('summary').textContent, '處理時間為 2s · 執行失敗');
    const rows = [...element.querySelectorAll('.sandbox-run-row')];
    assert.equal(rows.length, 2, 'one line per step');
    assert.deepEqual(rows.map((row) => row.dataset.kind), ['code', 'code']);
    assert.equal(rows[0].querySelector('.ledger-label').textContent, '已執行程式：讀取資料');
    assert.equal(rows[1].querySelector('.ledger-label').textContent, '已執行程式');
    assert.equal(rows[1].classList.contains('is-failed'), true);
    assert.equal(rows[0].open, false, 'every step is folded on its own');
    assert.equal(rows[0].querySelector('code.language-python').textContent, 'import pandas');
    assert.match(rows[0].querySelector('.sandbox-run-files').textContent, /\/output\/報告\.xlsx（2 KB）/);
    assert.equal(rows[1].querySelector('.ledger-output.is-error').textContent, 'NameError: boom');
    const note = createSandboxRunElement(document, { status: 'done', steps: [], fallback: 'model-unsupported' }, { language: 'en' });
    assert.equal(note.textContent, 'Switched to Standard mode: the current model cannot run code');
    assert.equal(note.querySelector('details'), null);
  } finally {
    cleanup();
  }
});

test('the run line says how long the whole reply took, and the rows follow the order things happened in', () => {
  const { document, cleanup } = createDom('<div id="root"></div>');
  try {
    const run = liftSandboxRunBlock(`${formatSandboxRunBlock({
      status: 'done',
      elapsedMs: 628_000,
      thought: 'Now write the answer',
      steps: [{ title: 'Sum', code: 'print(1)', stdout: '1', thought: 'First look', elapsedMs: 4200 }]
    })}x`).run;
    assert.equal(run.elapsedMs, 628_000, 'the total is kept with the reply');
    const view = createSandboxRunElement(document, run, { language: 'en' });
    assert.equal(view.querySelector(':scope > details > summary').textContent, 'Processed for 10m 28s');
    const rows = [...view.querySelectorAll('.sandbox-run-row')];
    assert.deepEqual(rows.map((row) => row.dataset.kind), ['thought', 'code', 'thought'], 'thinking, the run, thinking before the answer');
    assert.equal(rows[0].querySelector('.sandbox-run-thought-text').textContent, 'First look');
    assert.equal(rows[1].querySelector('.ledger-time').textContent, '4s');
    assert.equal(rows[2].querySelector('.sandbox-run-thought-text').textContent, 'Now write the answer');
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
      assert.match(sandboxText(language, 'processedIn', { t: '1m 5s' }), /1m 5s/, language);
    }
  } finally {
    cleanup();
  }
});

test('the pages a search found and what the model said before a run are kept, shown, and safe', async () => {
  const { document, cleanup } = createDom('<div id="root"></div>');
  try {
    const block = formatSandboxRunBlock({
      status: 'done',
      sources: [
        { title: 'MDN', url: 'https://developer.mozilla.org/docs' },
        { title: 'dup', url: 'https://developer.mozilla.org/docs' },
        { title: 'bad', url: 'javascript:alert(1)' },
        { title: 'plain', url: 'http://example.com/a b' }
      ],
      steps: [{ title: 'Sum', code: 'print(1)', stdout: '1', narration: 'First **check** the tools.', elapsedMs: 10 }]
    });
    const run = liftSandboxRunBlock(`${block}x`).run;
    assert.deepEqual(run.sources, [{ title: 'MDN', url: 'https://developer.mozilla.org/docs' }], 'web addresses only, once each');
    const view = createSandboxRunElement(document, run, { language: 'en' });
    const rows = [...view.querySelectorAll('.sandbox-run-row')];
    assert.equal(rows[0].dataset.kind, 'search');
    assert.equal(rows[0].querySelector('.ledger-label').textContent, 'Searched 1 sites');
    assert.equal(rows[0].querySelector('.ledger-mark .run-mark-site img').getAttribute('src'), '/api/site-icon?host=developer.mozilla.org', 'the saved row shows the first site\'s icon too');
    const chip = rows[0].querySelector('button.run-source-chip');
    assert.equal(chip.dataset.url, 'https://developer.mozilla.org/docs');
    assert.equal(chip.querySelector('.run-source-host').textContent, 'developer.mozilla.org');
    assert.equal(chip.getAttribute('href'), null, 'a chip is no link: the page asks first');
    const narration = view.querySelector('.sandbox-run-narration');
    assert.equal(narration.textContent, 'First check the tools.');
    assert.equal(narration.querySelector('strong').textContent, 'check');
    assert.equal(narration.compareDocumentPosition(view.querySelectorAll('.sandbox-run-row')[1]) & 4, 4, 'said before its run');
    // A reply that only searched (Standard mode) is the search row alone.
    const only = createSandboxRunElement(document, { status: 'done', steps: [], sources: run.sources }, { language: 'en' });
    assert.equal(only.querySelectorAll('.sandbox-run-row').length, 1);
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
      for (const key of ['sourcesSearched', 'citeSources', 'sourcesTab', 'timelineTab', 'sourcesPanelCount', 'closePanel', 'noSourcesInReply']) assert.notEqual(sandboxText(language, key), key, `${language} ${key}`);
    }
  } finally {
    cleanup();
  }
});

test('a tap on a source opens the page in a new tab at once, and only web addresses', async () => {
  const { openSourceUrl } = await import('../../src/app/ui/sandbox/run-sources.js');
  const opened = [];
  const open = (...args) => opened.push(args);
  assert.equal(openSourceUrl('https://a.example/x', open), true);
  assert.deepEqual(opened, [['https://a.example/x', '_blank', 'noopener,noreferrer']]);
  assert.equal(openSourceUrl('javascript:alert(1)', open), false);
  assert.equal(openSourceUrl('', open), false);
  assert.equal(openSourceUrl(undefined, open), false);
  assert.equal(opened.length, 1);
  const sources = await import('../../src/app/ui/sandbox/run-sources.js');
  assert.equal('openSourceChip' in sources, false, 'nothing asks first any more');
  assert.equal('createSourceTrust' in sources, false);
});

test('the wait says what is happening and what comes next', async () => {
  const model = scriptedModel([
    { calls: [call('c1', 'boom()')] },
    { calls: [call('c2', 'ok()')] },
    { text: 'Done.' }
  ]);
  const results = [
    { stdout: '', stderr: '', error: 'NameError', files: [], elapsedMs: 1 },
    { stdout: '', stderr: '', error: null, files: [{ name: 'a.csv', size: 3 }], elapsedMs: 1 }
  ];
  const { sandbox } = fakeSandbox(results);
  const statuses = [];
  await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [],
    requestOptions: { modelInfo: { name: 'Gemini' } },
    getSandbox: () => sandbox,
    language: 'en',
    onStatus: (status) => statuses.push(status)
  });
  assert.equal(statuses[0], 'Thinking…', 'shown at once, before the first answer');
  assert.ok(statuses.includes('The code failed; fixing it…'));
  assert.ok(statuses.includes('1 file(s) made; continuing…'));
  assert.equal(statuses.at(-1), 'Preparing the files…');
});

test('the reply reports each stretch of work as an event for the step list', async () => {
  const model = scriptedModel([{ calls: [call('c1', 'print(1)', 'One')] }, { text: 'Done.' }]);
  const { sandbox } = fakeSandbox([{ stdout: '1\n', stderr: '', error: null, files: [{ name: 'a.csv', size: 3 }], elapsedMs: 12 }]);
  const events = [];
  await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [],
    requestOptions: { modelInfo: { name: 'Gemini' } },
    getSandbox: () => sandbox,
    language: 'en',
    onEvent: (event) => events.push(event)
  });
  assert.deepEqual(events.map((event) => event.type), ['round', 'step', 'prepare', 'step-end', 'round', 'answering', 'finishing']);
  assert.equal(events[0].label, 'Thinking…');
  assert.equal(events[0].doneLabel, 'Finished thinking');
  assert.deepEqual([events[1].n, events[1].title, events[1].code], [1, 'One', 'print(1)']);
  assert.deepEqual([events[3].ok, events[3].files.length, events[3].elapsedMs], [true, 1, 12]);
  assert.equal(events[4].label, '1 file(s) made; continuing…');
});

test('the model\'s thinking is kept with the run it led to, and the last round\'s with the run', async () => {
  let turn = 0;
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    turn += 1;
    options.onReasoning('思考');
    options.onReasoning(turn === 1 ? '第一輪' : '最後一輪');
    if (turn === 1) {
      options.onResponseComplete({ text: '', toolCalls: [call('c1', 'print(1)', 'One')], parts: [], reasoningDetails: [] });
      return '';
    }
    onChunk('完成');
    options.onResponseComplete({ text: '完成', toolCalls: [], parts: [], reasoningDetails: [] });
    return '完成';
  };
  const { sandbox } = fakeSandbox([{ stdout: '1\n', stderr: '', error: null, files: [], elapsedMs: 1 }]);
  const events = [];
  const result = await runSandboxReply({ streamApiCall, requestParts: [], getSandbox: () => sandbox, onEvent: (event) => events.push(event) });
  assert.equal(result.run.steps[0].thought, '思考第一輪', 'the thinking before the run belongs to the run');
  assert.equal(result.run.thought, '思考最後一輪', 'the thinking before the answer belongs to the reply');
  assert.deepEqual(events.filter((event) => event.type === 'thinking').map((event) => event.text), ['思考', '第一輪', '思考', '最後一輪']);
  assert.equal(events.filter((event) => event.type === 'answering').length, 1, 'told once, when the answer begins');
  assert.ok(events.findIndex((event) => event.type === 'answering') > events.findLastIndex((event) => event.type === 'thinking'), 'after the thinking');
  assert.ok(result.run.thoughtMs >= 1, 'how long it thought is kept, so the saved line can say it');
  const kept = formatSandboxRunBlock(result.run);
  const lifted = liftSandboxRunBlock(kept + '完成').run;
  assert.equal(lifted.steps[0].thought, '思考第一輪', 'saved with the message');
  assert.equal(lifted.thought, '思考最後一輪');
  const { window, cleanup } = createDom('');
  try {
    const view = createSandboxRunElement(window.document, lifted, { language: 'zh-TW' });
    const thoughts = [...view.querySelectorAll('.sandbox-run-thought-text')].map((node) => node.textContent);
    assert.deepEqual(thoughts, ['思考第一輪', '思考最後一輪'], 'and shown after a reload');
  } finally {
    cleanup();
  }
  assert.doesNotMatch(summarizeSandboxRunText(kept + '完成'), /思考/, 'the model never reads it back');
});

test('stopping while the model thinks keeps what it had thought, marked as interrupted', async () => {
  const controller = new AbortController();
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    options.onReasoning('想到一半', 'raw');
    controller.abort();
    options.onResponseComplete({ text: '', toolCalls: [], parts: [], reasoningDetails: [] });
    return '';
  };
  const result = await runSandboxReply({ streamApiCall, requestParts: [], signal: controller.signal, getSandbox: () => fakeSandbox([]).sandbox });
  assert.equal(result.run.thought, '想到一半');
  assert.equal(result.run.thoughtInterrupted, true);
  assert.equal(result.run.status, 'stopped');
  assert.equal(liftSandboxRunBlock(formatSandboxRunBlock(result.run)).run.thoughtInterrupted, true, 'saved with the message');
});

test('stopping while the model thinks keeps the thought also when the stream ends with an abort error', async () => {
  const controller = new AbortController();
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    options.onReasoning('想到一半', 'raw');
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  };
  const result = await runSandboxReply({ streamApiCall, requestParts: [], signal: controller.signal, getSandbox: () => fakeSandbox([]).sandbox });
  assert.equal(result.run.thought, '想到一半');
  assert.equal(result.run.thoughtInterrupted, true);
});

test('the pages that were read and the pages that were searched for are one row in the saved reply', async () => {
  const { document, cleanup } = createDom('<div id="root"></div>');
  try {
    const run = liftSandboxRunBlock(`${formatSandboxRunBlock({
      status: 'done',
      sources: [
        { title: 'Linked', url: 'https://linked.example/a', read: true },
        { title: 'Found', url: 'https://found.example/1' },
        { title: 'bad', url: 'javascript:alert(1)', read: true }
      ],
      steps: []
    })}x`).run;
    assert.deepEqual(run.sources, [
      { title: 'Linked', url: 'https://linked.example/a', read: true },
      { title: 'Found', url: 'https://found.example/1' }
    ]);
    const view = createSandboxRunElement(document, run, { language: 'en' });
    assert.deepEqual([...view.querySelectorAll('.ledger-label')].map((node) => node.textContent), ['Searched 2 sites']);
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
      assert.match(sandboxText(language, 'sourcesRead', { n: 3 }), /3/, language);
    }
  } finally {
    cleanup();
  }
});


test('when the model goes quiet after thinking, the line says it is writing the code, and goes back if the thinking goes on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events = [];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    options.onReasoning('Let me think. ', 'raw');
    t.mock.timers.tick(2900);
    assert.equal(events.some((event) => event.type === 'writing'), false, 'a short pause is not worth saying');
    t.mock.timers.tick(200);
    assert.equal(events.filter((event) => event.type === 'writing').at(-1)?.label, 'Writing the code…');
    options.onReasoning('Still thinking. ', 'raw');
    assert.equal(events.filter((event) => event.type === 'writing').at(-1)?.label, 'Thinking…', 'it was only a pause in the thinking');
    t.mock.timers.tick(3100);
    assert.equal(events.filter((event) => event.type === 'writing').at(-1)?.label, 'Writing the code…');
    options.onResponseComplete({ text: 'Done.', toolCalls: [], parts: [], reasoningDetails: [] });
    return 'Done.';
  };
  await runSandboxReply({ streamApiCall, requestParts: [], getSandbox: () => fakeSandbox([]).sandbox, language: 'en', onEvent: (event) => events.push(event) });
  const before = events.length;
  t.mock.timers.tick(10_000);
  assert.equal(events.length, before, 'nothing is said after the round is over');
});

test('code that starts to arrive says the line is writing it at once, in every language', async () => {
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    const events = [];
    const streamApiCall = async (parts, onChunk, signal, forced, options) => {
      options.onToolArguments({ name: 'run_python', arguments: '{"code":"pri' });
      options.onToolArguments({ name: 'run_python', arguments: '{"code":"print(1)' });
      options.onResponseComplete({ text: 'Done.', toolCalls: [], parts: [], reasoningDetails: [] });
      return 'Done.';
    };
    await runSandboxReply({ streamApiCall, requestParts: [], getSandbox: () => fakeSandbox([]).sandbox, language, onEvent: (event) => events.push(event) });
    const writing = events.filter((event) => event.type === 'writing');
    assert.equal(writing.length, 1, 'said once');
    assert.equal(writing[0].label, sandboxText(language, 'sandboxWriting'));
    assert.ok(sandboxText(language, 'sandboxNextStep'));
  }
});

test('a reply that searched the web but ran no Python has the one line with how long it took, opening to the pages and the thinking', () => {
  const { document, cleanup } = createDom('<div id="root"></div>');
  try {
    const base = { v: 1, status: 'done', steps: [], sources: [{ title: 'A', url: 'https://a.example/' }], thought: 'Let me think.', thoughtKind: 'raw', thoughtMs: 4000 };
    const timed = createSandboxRunElement(document, { ...base, elapsedMs: 83_000 }, { language: 'en' });
    assert.equal(timed.querySelector('summary.sandbox-run-summary').textContent, sandboxText('en', 'processedIn', { t: '1m 23s' }));
    assert.equal(timed.querySelectorAll('.sandbox-run-steps .ledger-row').length, 2, 'the pages and the thinking are inside it');
    assert.match(timed.querySelector('.sandbox-run-steps').textContent, /Let me think\./);

    // A reply saved before the time was kept looks as it did.
    const old = createSandboxRunElement(document, base, { language: 'en' });
    assert.equal(old.querySelector('summary.sandbox-run-summary')?.textContent.includes('Processed'), false);
    assert.ok(old.querySelector('.ledger-row'), 'the pages row is there, loose');

    // Thinking alone keeps its own line.
    const thinkingOnly = createSandboxRunElement(document, { ...base, sources: [], elapsedMs: 5000 }, { language: 'en' });
    assert.match(thinkingOnly.querySelector('summary').textContent, /4/);
  } finally {
    cleanup();
  }
});
