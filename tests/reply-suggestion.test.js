import assert from 'node:assert/strict';
import test from 'node:test';

import { createReplySuggestion } from '../src/app/runtime/features/reply-suggestion.js';
import { emitReplyEnded, onReplyEnded } from '../src/app/runtime/features/reply-events.js';

const QUESTION = '我可以做成 A 方案（8 頁精簡版）或 B 方案（15 頁完整版）。要不要採用 A 方案？';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup({ messages, config = { memoryModelId: 'mem-model' }, runModel, image = false, extra = {} } = {}) {
  const state = { conversation: { id: 'c1', messages: messages || [{ role: 'user', parts: [{ text: '幫我做簡報' }] }, { role: 'model', parts: [{ text: QUESTION }] }] }, config: { ...config }, shown: [], hidden: 0, asked: [] };
  const view = { show: (text) => state.shown.push(text), hide: () => { state.hidden += 1; } };
  const timers = [];
  const suggestion = createReplySuggestion({
    view,
    getConversation: () => state.conversation,
    getConfig: () => state.config,
    runModel: runModel || (async (options) => { state.asked.push(options); return '好，採用 A 方案'; }),
    isImageConversation: () => image,
    getErrorPrefixes: () => ['抱歉，發生錯誤：'],
    delayMs: 0,
    setTimer: (callback, ms) => { timers.push([callback, ms]); return timers.length; },
    clearTimer: (id) => { if (timers[id - 1]) timers[id - 1][0] = () => {}; },
    warn: () => {},
    ...extra
  });
  // Runs the timers that are waiting (the delay), then lets the model's answer come.
  const settle = async () => {
    for (let i = 0; i < timers.length; i += 1) { const [callback, ms] = timers[i]; if (ms <= 100) callback(); }
    await flush();
    await flush();
  };
  return { state, suggestion, settle, timers };
}

test('when a reply ends the small model is asked and its line is shown', async () => {
  const { state, suggestion, settle } = setup();
  suggestion.onReplyEnded();
  await settle();
  assert.deepEqual(state.shown, ['好，採用 A 方案']);
  assert.equal(state.asked.length, 1);
  assert.equal(state.asked[0].modelId, 'mem-model');
  assert.equal(state.asked[0].requestPurpose, 'background-suggestion');
  assert.equal(state.asked[0].maxTokens, 120);
  assert.match(state.asked[0].prompt, /要不要採用 A 方案/);
  assert.equal(suggestion.stillValid(), true);
});

test('nothing is asked when the setting is off, there is no memory model, or there is nothing to answer', async () => {
  for (const [config, messages, image] of [
    [{ memoryModelId: 'm', replySuggestionEnabled: false }],
    [{ memoryModelId: '' }],
    [{ memoryModelId: 'm' }, [{ role: 'user', parts: [{ text: 'hi' }] }, { role: 'model', parts: [{ text: '抱歉，發生錯誤：boom boom boom' }] }]],
    [{ memoryModelId: 'm' }, undefined, true]
  ]) {
    const { state, suggestion, settle } = setup({ config, messages, image });
    suggestion.onReplyEnded();
    await settle();
    assert.equal(state.asked.length, 0, JSON.stringify(config));
    assert.deepEqual(state.shown, []);
  }
});

test('NONE, an empty answer and a failing model show nothing, and a failing model is not an error for the person', async () => {
  for (const runModel of [async () => 'NONE', async () => '', async () => { throw new Error('no key'); }]) {
    const { state, suggestion, settle } = setup({ runModel });
    suggestion.onReplyEnded();
    await settle();
    assert.deepEqual(state.shown, []);
  }
});

test('a suggestion that comes late is not shown: another reply began, a message was sent, or another conversation is open', async () => {
  let release;
  const slow = () => new Promise((resolve) => { release = resolve; });
  const lateCases = [
    (state, suggestion) => suggestion.cancel(),
    (state) => { state.conversation = { id: 'c2', messages: state.conversation.messages }; },
    (state) => { state.conversation.messages.push({ role: 'user', parts: [{ text: '好' }] }); }
  ];
  for (const change of lateCases) {
    const { state, suggestion, settle } = setup({ runModel: slow });
    suggestion.onReplyEnded();
    await settle();
    change(state, suggestion);
    release('好，採用 A 方案');
    await flush();
    assert.deepEqual(state.shown, []);
  }
});

test('a second end of a reply takes the first one\'s line away and asks again', async () => {
  const { state, suggestion, settle } = setup();
  suggestion.onReplyEnded();
  await settle();
  const hiddenBefore = state.hidden;
  suggestion.onReplyEnded();
  assert.ok(state.hidden > hiddenBefore, 'the old line is taken away at once');
  assert.equal(suggestion.stillValid(), false);
  await settle();
  assert.equal(state.shown.length, 2);
});

test('a model that is too slow is let go', async () => {
  let signal;
  const { state, suggestion, timers } = setup({ runModel: (options) => new Promise((resolve, reject) => { signal = options.signal; signal.addEventListener('abort', () => reject(new Error('aborted'))); }), extra: { timeoutMs: 12_000 } });
  suggestion.onReplyEnded();
  timers[0][0]();
  await flush();
  const timeout = timers.find(([, ms]) => ms === 12_000);
  assert.ok(timeout, 'a time limit was set');
  timeout[0]();
  await flush();
  assert.equal(signal.aborted, true);
  assert.deepEqual(state.shown, []);
});

test('the end of a reply is told to whoever listens, and a listener that fails does not stop the others', () => {
  const seen = [];
  const stopA = onReplyEnded(() => { throw new Error('boom'); });
  const stopB = onReplyEnded(() => seen.push('b'));
  const warned = [];
  const realWarn = globalThis.console.warn;
  globalThis.console.warn = (...args) => warned.push(args);
  try {
    emitReplyEnded();
  } finally {
    globalThis.console.warn = realWarn;
  }
  stopA();
  stopB();
  emitReplyEnded();
  assert.deepEqual(seen, ['b']);
  assert.equal(warned.length, 1);
});
