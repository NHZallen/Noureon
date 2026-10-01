import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRewritePrompt,
  cleanQuery,
  createSearchQueryRewriter
} from '../src/app/legacy-runtime/features/search-query-rewriter.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';

const user = (text) => ({ role: 'user', parts: [{ text }] });
const assistant = (text) => ({ role: 'model', parts: [{ text }] });

const MODELS = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini Flash Lite', provider: 'gemini' },
  { id: 'qwen/qwen3.7-flash', name: 'Qwen Flash', provider: 'openrouter' },
  { id: 'anthropic/claude-opus-5.5', name: 'Opus', provider: 'openrouter' },
  { id: 'nvidia/z-ai/glm-5.3-flash', name: 'GLM Flash', provider: 'nvidia' },
  { id: 'nvidia/z-ai/glm-5.3', name: 'GLM', provider: 'nvidia' },
  { id: 'google/gemini-3.1-flash-image', name: 'Image', provider: 'openrouter', category: 'image_generation', outputModality: 'image' }
];

const createHarness = ({ keys = { openrouter: 'or' }, answers = ['  "DeepSeek V4.1 Flash reasoning effort parameter"  '], now = () => new Date('2026-10-01T12:00:00Z') } = {}) => {
  const calls = [];
  const timers = [];
  let index = 0;
  const rewrite = createSearchQueryRewriter({
    models: MODELS,
    cheapModelId: 'gemini-3.5-flash-lite',
    getApiKeyForProvider: (provider) => keys[provider] || '',
    now,
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn: () => {},
    streamApiCall: async (parts, onChunk, signal, forced, options) => {
      calls.push({ parts, signal, forced, options });
      const answer = answers[Math.min(index, answers.length - 1)];
      index += 1;
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'function') return answer({ signal, timers });
      onChunk(answer);
      return answer;
    }
  });
  return { calls, rewrite, timers };
};

const conversation = [
  user('Does DeepSeek V4.1 Flash have a reasoning effort parameter?'),
  assistant('I am not sure about that one.'),
  user('你去查阿')
];

test('a query line is taken out of the model\'s reply without its label or quotes', () => {
  assert.equal(cleanQuery('  "DeepSeek V4.1 Flash reasoning effort"  '), 'DeepSeek V4.1 Flash reasoning effort');
  assert.equal(cleanQuery('Search query: nvidia deepseek-v4.1-flash'), 'nvidia deepseek-v4.1-flash');
  assert.equal(cleanQuery('**Query:** 「台北天氣」'), '台北天氣');
  assert.equal(cleanQuery('\n\nfirst line\nsecond line'), 'first line');
  assert.equal(cleanQuery('`x y z`'), 'x y z');
  assert.equal(cleanQuery('a'.repeat(500)).length, 200);
  assert.equal(cleanQuery(''), '');
  assert.equal(cleanQuery(undefined), '');
});

test('the model is given the earlier messages, the latest one and the date, and told to answer with the query only', () => {
  const prompt = buildRewritePrompt({ text: '你去查阿', messages: conversation, now: new Date('2026-10-01T00:00:00Z') });
  assert.match(prompt, /You write the web search query for the latest user message/);
  assert.match(prompt, /Reply with the query only, on one line/);
  assert.match(prompt, /Do not add dates or words such as "latest"/);
  assert.match(prompt, /Today is 2026-10-01\./);
  assert.match(prompt, /# Earlier in the conversation\nUser: Does DeepSeek V4\.1 Flash have a reasoning effort parameter\?\nAssistant: I am not sure about that one\.\n\n# Latest user message\n你去查阿\n\nSearch query:$/);
  assert.doesNotMatch(prompt.split('# Earlier')[1], /User: 你去查阿/, 'the latest message is not repeated as history');
});

test('only the last six earlier messages are given, each cut, the answers shorter than the questions', () => {
  const many = Array.from({ length: 10 }, (_, n) => (n % 2 === 0 ? user(`question ${n} ${'q'.repeat(700)}`) : assistant(`answer ${n} ${'a'.repeat(700)}`)));
  const prompt = buildRewritePrompt({ text: 'again', messages: [...many, user('again')] });
  const history = prompt.split('# Earlier in the conversation\n')[1].split('\n\n# Latest')[0].split('\n');
  assert.equal(history.length, 6);
  assert.ok(history[0].startsWith('User: question 4'));
  assert.equal(history[0].length, 'User: '.length + 500);
  assert.equal(history[1].length, 'Assistant: '.length + 300);
  assert.equal(buildRewritePrompt({ text: 'hello there', messages: [] }).includes('# Earlier'), false, 'no history: no history section');
});

test('a message that is short and has nothing before it is not sent to a model, a long one or one with a history is', async () => {
  const { rewrite, calls } = createHarness();
  assert.equal(await rewrite({ text: 'What is the capital of Australia?', messages: [user('What is the capital of Australia?')], modelInfo: { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' } }), null);
  assert.equal(await rewrite({ text: '', messages: [], modelInfo: { provider: 'openrouter' } }), null);
  assert.equal(calls.length, 0);

  assert.equal(await rewrite({ text: '你去查阿', messages: conversation, modelInfo: { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' } }), 'DeepSeek V4.1 Flash reasoning effort parameter');
  assert.equal(calls.length, 1);

  assert.ok(await rewrite({ text: 'long '.repeat(60), messages: [], modelInfo: { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' } }));
  assert.equal(calls.length, 2, 'a long message is written down to a query even with no history');
});

test('the request is a small, quiet one: no reasoning, no search, no memory, nothing saved to the conversation', async () => {
  const { rewrite, calls } = createHarness();
  await rewrite({ text: '你去查阿', messages: conversation, modelInfo: { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' } });
  const { options, forced } = calls[0];
  assert.equal(forced, false);
  assert.equal(options.disableReasoning, true);
  assert.equal(options.ignoreConversationWebSearch, true);
  assert.equal(options.skipMemoryContext, true);
  assert.equal(options.skipConversationSystemContext, true);
  assert.equal(options.requestPurpose, NOURAS_REQUEST_PURPOSE.BACKGROUND_SEARCH);
  assert.deepEqual(options.historyForApi, []);
  assert.equal(options.genConfig.temperature, 0);
  assert.ok(options.genConfig.maxTokens <= 200);
  assert.deepEqual(options.conversation.messages, []);
});

test('the small model is the cheap Google one when there is a key for it, else the provider\'s cheap one, and last the reply\'s own', async () => {
  const chosen = async (keys, modelInfo, models = MODELS) => {
    const { rewrite, calls } = createHarness({ keys });
    await rewrite({ text: '你去查阿', messages: conversation, modelInfo });
    return calls.map((call) => call.options.modelInfo.id);
  };
  const openrouterOpus = { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' };
  assert.deepEqual(await chosen({ gemini: 'g', openrouter: 'or' }, openrouterOpus), ['gemini-3.5-flash-lite']);
  assert.deepEqual(await chosen({ openrouter: 'or' }, openrouterOpus), ['qwen/qwen3.7-flash']);
  assert.deepEqual(await chosen({ nvidia: 'nv' }, { provider: 'nvidia', id: 'nvidia/z-ai/glm-5.3' }), ['nvidia/z-ai/glm-5.3-flash']);
  // The reply's own model when it is the cheap one's provider's only: a key for it is enough.
  assert.deepEqual(await chosen({ openrouter: 'or' }, { provider: 'openrouter', id: 'qwen/qwen3.7-flash' }), ['qwen/qwen3.7-flash'], 'the same model is not asked twice');
  // No key for the cheap one's provider, no cheap model of the provider listed: the reply's model.
  assert.deepEqual(await chosen({ openrouter: 'or' }, { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' }), ['qwen/qwen3.7-flash']);
});

test('a model that fails or says nothing is followed by the next, at most two are tried, and then there is no query', async () => {
  const opus = { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' };
  const failing = createHarness({ keys: { gemini: 'g', openrouter: 'or' }, answers: [new Error('HTTP 500'), 'Fallback query'] });
  assert.equal(await failing.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus }), 'Fallback query');
  assert.deepEqual(failing.calls.map((call) => call.options.modelInfo.id), ['gemini-3.5-flash-lite', 'qwen/qwen3.7-flash']);

  const empty = createHarness({ keys: { gemini: 'g', openrouter: 'or' }, answers: ['   ', 'x'] });
  assert.equal(await empty.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus }), null, 'a one-character reply is no query');
  assert.equal(empty.calls.length, 2);

  const allFail = createHarness({ keys: { gemini: 'g', openrouter: 'or' }, answers: [new Error('a'), new Error('b')] });
  assert.equal(await allFail.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus }), null);

  const noKeys = createHarness({ keys: {} });
  assert.equal(await noKeys.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus }), null);
  assert.equal(noKeys.calls.length, 0);

  const imageOnly = createHarness({ keys: { openrouter: 'or' } });
  assert.equal(await imageOnly.rewrite({ text: '你去查阿', messages: conversation, modelInfo: { provider: 'openrouter', id: 'google/gemini-3.1-flash-image' } }), 'DeepSeek V4.1 Flash reasoning effort parameter', 'an image model is never the one asked');
  assert.equal(imageOnly.calls[0].options.modelInfo.id, 'qwen/qwen3.7-flash');
});

test('an attempt that takes too long is ended, and a stop by the person is not swallowed', async () => {
  const opus = { provider: 'openrouter', id: 'anthropic/claude-opus-5.5' };
  const slow = createHarness({
    keys: { gemini: 'g', openrouter: 'or' },
    answers: [
      ({ signal, timers }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        timers[0].callback();
      }),
      'After the timeout'
    ]
  });
  assert.equal(await slow.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus }), 'After the timeout');
  assert.equal(slow.timers[0].delay, 8000, 'eight seconds an attempt');

  const controller = new AbortController();
  const stopped = createHarness({
    keys: { gemini: 'g', openrouter: 'or' },
    answers: [() => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }, 'never']
  });
  await assert.rejects(() => stopped.rewrite({ text: '你去查阿', messages: conversation, modelInfo: opus, signal: controller.signal }), (error) => error.name === 'AbortError');
  assert.equal(stopped.calls.length, 1, 'no second attempt after a stop');
});

test('the rewriter needs a streamApiCall', () => {
  assert.throws(() => createSearchQueryRewriter({}), /requires streamApiCall/);
});
