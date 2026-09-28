import assert from 'node:assert/strict';
import test from 'node:test';

import { modelSupportsToolCalling, MODELS, NON_TOOL_CALLING_MODEL_IDS, TOOL_CALLING_MODEL_IDS } from '../../src/app/runtime/legacy-core/model-registry.js';
import { describeFileModeState, isAdvancedModeReleased, resolveReplyMode } from '../../src/app/runtime/sandbox/file-mode.js';
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
    options.onResponseComplete({ text: round.text || '', toolCalls: round.calls || [], parts: [], reasoningDetails: [] });
    return round.text || '';
  };
  return { streamApiCall, requests };
}

const call = (id, code, title = '') => ({ id, name: 'run_python', arguments: JSON.stringify({ code, title }), args: { code, title } });

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

test('a reply uses Advanced mode only when chosen, released and possible, and says why not', () => {
  const supports = (model) => model?.id === 'ok';
  const base = { conversation: {}, config: {}, modelInfo: { id: 'ok' }, supportsToolCalling: supports, released: true };
  assert.deepEqual(resolveReplyMode(base), { advanced: true, reason: null }, 'Advanced is the default');
  assert.deepEqual(resolveReplyMode({ ...base, config: { fileModeDefault: 'standard' } }), { advanced: false, reason: null });
  assert.deepEqual(resolveReplyMode({ ...base, conversation: { fileMode: 'standard' } }), { advanced: false, reason: null });
  assert.deepEqual(resolveReplyMode({ ...base, released: false }), { advanced: false, reason: null });
  assert.equal(resolveReplyMode({ ...base, isCouncil: true }).reason, 'council');
  assert.equal(resolveReplyMode({ ...base, config: { isLearningMode: true } }).reason, 'learning');
  assert.equal(resolveReplyMode({ ...base, modelInfo: { id: 'no' } }).reason, 'model-unsupported');
  assert.equal(resolveReplyMode({ ...base, browserSupported: false }).reason, 'browser-unsupported');
  const state = describeFileModeState({ ...base, conversation: { fileMode: 'standard' }, modelInfo: { id: 'no' }, window: {} });
  assert.deepEqual(state, { released: true, value: 'standard', unavailableReason: 'model-unsupported', ready: false });
});

test('before B3 the preview is switched on per device, also from the address bar', () => {
  const store = new Map();
  const window = (search = '') => ({
    location: { search },
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) }
  });
  assert.equal(isAdvancedModeReleased({ window: window(), isDevelopment: false }), false);
  assert.equal(isAdvancedModeReleased({ window: window('?advanced-mode=on'), isDevelopment: false }), true);
  assert.equal(isAdvancedModeReleased({ window: window(), isDevelopment: false }), true, 'remembered');
  assert.equal(isAdvancedModeReleased({ window: window('?x=1&advanced-mode=off'), isDevelopment: false }), false);
  assert.equal(isAdvancedModeReleased({ window: window(), isDevelopment: true }), true);
});

test('interface texts exist in all five languages', () => {
  assert.deepEqual(SANDBOX_TEXT_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    for (const key of SANDBOX_TEXT_KEYS) {
      const value = sandboxText(language, key);
      assert.ok(value && value !== key, `${language} ${key}`);
    }
  }
  assert.equal(sandboxText('en', 'sandboxRunning', { n: 2, title: 'Charts' }), 'Running code (2): Charts');
});

test('the loop runs each requested call, returns the results and stops when the model answers', async () => {
  const model = scriptedModel([
    { text: '我來算一下。', calls: [call('c1', 'print(sum([3, 5, 7]))', '加總')] },
    { text: '總和是 15。' }
  ]);
  const { sandbox, runs } = fakeSandbox([{ stdout: { text: '15\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, files: [{ name: 'a.csv', size: 3, bytes: new Uint8Array(3) }], elapsedMs: 12 }]);
  const statuses = [];
  const chunks = [];
  const result = await runSandboxReply({
    streamApiCall: model.streamApiCall,
    requestParts: [{ text: '算總和' }],
    onChunk: (chunk) => chunks.push(chunk),
    getSandbox: () => sandbox,
    onStatus: (status) => statuses.push(status)
  });
  assert.deepEqual(runs, ['print(sum([3, 5, 7]))']);
  assert.equal(result.text, '我來算一下。\n\n總和是 15。');
  assert.equal(chunks.join(''), result.text);
  assert.equal(model.requests.length, 2);
  assert.equal(model.requests[0].tools[0].name, 'run_python');
  assert.match(model.requests[0].additionalSystemInstruction, /Advanced mode: Python in the browser/);
  const [turn] = model.requests[1].toolTurns;
  assert.equal(turn.results[0].id, 'c1');
  assert.deepEqual(JSON.parse(turn.results[0].content), { ok: true, stdout: '15\n', stderr: '', files: [{ path: '/output/a.csv', size: 3 }], elapsed_ms: 12 });
  assert.equal(result.run.status, 'done');
  assert.deepEqual(result.run.steps.map((step) => [step.title, step.stdout, step.files]), [['加總', '15\n', [{ name: 'a.csv', size: 3 }]]]);
  assert.ok(statuses.includes('正在執行程式（第 1 次）：加總'));
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
    assert.equal(element.querySelector('summary').textContent, '已執行程式 2 次 · 執行失敗');
    assert.equal(element.querySelectorAll('.sandbox-run-step').length, 2);
    assert.equal(element.querySelector('code.language-python').textContent, 'import pandas');
    assert.match(element.querySelector('.sandbox-run-files').textContent, /\/output\/報告\.xlsx（2 KB）/);
    assert.equal(element.querySelectorAll('.sandbox-run-step-title')[1].textContent, '第 2 次');
    const note = createSandboxRunElement(document, { status: 'done', steps: [], fallback: 'model-unsupported' }, { language: 'en' });
    assert.equal(note.textContent, 'Switched to Standard mode: the current model cannot run code');
    assert.equal(note.querySelector('details'), null);
  } finally {
    cleanup();
  }
});
