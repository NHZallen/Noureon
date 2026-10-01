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

const OPUS = { id: 'anthropic/claude-opus-5.5', name: 'Opus', provider: 'openrouter' };

const createHarness = ({ keys = { openrouter: 'or' }, answers = ['  "DeepSeek V4.1 Flash reasoning effort parameter"  '], now = () => new Date('2026-10-01T12:00:00Z') } = {}) => {
  const calls = [];
  const timers = [];
  let index = 0;
  const rewrite = createSearchQueryRewriter({
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
  assert.equal(await rewrite({ text: 'What is the capital of Australia?', messages: [user('What is the capital of Australia?')], modelInfo: OPUS }), null);
  assert.equal(await rewrite({ text: '', messages: [], modelInfo: { provider: 'openrouter' } }), null);
  assert.equal(calls.length, 0);

  assert.equal(await rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), 'DeepSeek V4.1 Flash reasoning effort parameter');
  assert.equal(calls.length, 1);

  assert.ok(await rewrite({ text: 'long '.repeat(60), messages: [], modelInfo: OPUS }));
  assert.equal(calls.length, 2, 'a long message is written down to a query even with no history');
});

test('the request is a small, quiet one: no reasoning, no search, no memory, nothing saved to the conversation', async () => {
  const { rewrite, calls } = createHarness();
  await rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS });
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

test('the model asked is the one that is answering: the reply\'s own, with its own key', async () => {
  const { rewrite, calls } = createHarness({ keys: { openrouter: 'or', gemini: 'g' } });
  await rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS });
  assert.deepEqual(calls.map((call) => call.options.modelInfo.id), ['anthropic/claude-opus-5.5'], 'not a cheaper one, whatever other keys there are');

  const nvidia = createHarness({ keys: { nvidia: 'nv' } });
  await nvidia.rewrite({ text: '你去查阿', messages: conversation, modelInfo: { id: 'nvidia/z-ai/glm-5.3', name: 'GLM', provider: 'nvidia' } });
  assert.deepEqual(nvidia.calls.map((call) => call.options.modelInfo.id), ['nvidia/z-ai/glm-5.3']);
});

test('no query when the model cannot be asked, fails, or says nothing; the search goes on without one', async () => {
  const failing = createHarness({ answers: [new Error('HTTP 500')] });
  assert.equal(await failing.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), null);
  assert.equal(failing.calls.length, 1, 'one attempt, no other model is tried');

  const empty = createHarness({ answers: ['   '] });
  assert.equal(await empty.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), null);
  const oneChar = createHarness({ answers: ['x'] });
  assert.equal(await oneChar.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), null, 'a one-character reply is no query');

  const noKey = createHarness({ keys: {} });
  assert.equal(await noKey.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), null);
  assert.equal(noKey.calls.length, 0);

  const image = createHarness();
  assert.equal(await image.rewrite({ text: '你去查阿', messages: conversation, modelInfo: { id: 'img', provider: 'openrouter', category: 'image_generation', outputModality: 'image' } }), null, 'an image model cannot write a query');
  assert.equal(await image.rewrite({ text: '你去查阿', messages: conversation, modelInfo: undefined }), null);
  assert.equal(image.calls.length, 0);
});

test('an attempt that takes too long is ended and gives no query, and a stop by the person is not swallowed', async () => {
  const slow = createHarness({
    answers: [({ signal, timers }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      timers[0].callback();
    })]
  });
  assert.equal(await slow.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS }), null);
  assert.equal(slow.timers[0].delay, 8000, 'eight seconds');

  const controller = new AbortController();
  const stopped = createHarness({ answers: [() => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }] });
  await assert.rejects(() => stopped.rewrite({ text: '你去查阿', messages: conversation, modelInfo: OPUS, signal: controller.signal }), (error) => error.name === 'AbortError');
  assert.equal(stopped.calls.length, 1);
});

test('the rewriter needs a streamApiCall', () => {
  assert.throws(() => createSearchQueryRewriter({}), /requires streamApiCall/);
});
