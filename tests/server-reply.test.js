import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { createServerReply, LOCAL_REASONS, localizeServerError, planServerReply, ServerReplyError } from '../src/app/runtime/server-reply/server-reply.js';
import { SERVER_REPLY_TEXTS, serverReplyText } from '../src/app/runtime/server-reply/server-reply-texts.js';

const KEY = 'sk-provider-key-value';
const MESSAGE_ID = '223e4567-e89b-12d3-a456-426614174001';
const CONVERSATION = { id: '323e4567-e89b-12d3-a456-426614174002', messages: [{ role: 'user', parts: [{ text: 'earlier' }], createdAt: 'x' }, { role: 'model', parts: [{ text: 'answer' }], metadata: { a: 1 } }, { role: 'user', parts: [{ text: 'now' }] }], genConfig: null };
const MODEL = { provider: 'openrouter', id: 'm-local', name: 'M' };

test('the plan: the server is used unless the person chose this device, or the reply needs the browser', () => {
  assert.deepEqual(planServerReply({ config: {} }), { ok: true, webSearch: 'off' });
  assert.deepEqual(planServerReply({ config: { replyRunLocation: 'server' } }), { ok: true, webSearch: 'off' });
  assert.equal(planServerReply({ config: { replyRunLocation: 'local' } }).reason, LOCAL_REASONS.setting);
  assert.equal(planServerReply({ config: {}, hasAccount: false }).reason, LOCAL_REASONS.noAccount);
  assert.equal(planServerReply({ config: {}, advanced: true }).reason, LOCAL_REASONS.advanced);
  assert.equal(planServerReply({ config: {}, conversation: { isTemporary: true } }).reason, LOCAL_REASONS.notSynced);
  assert.equal(planServerReply({ config: {}, conversation: { retentionMode: 'ephemeral' } }).reason, LOCAL_REASONS.notSynced);
  assert.deepEqual(planServerReply({ config: {}, webSearchEnabled: true, researchByModel: true }), { ok: true, webSearch: 'research' });
  assert.deepEqual(planServerReply({ config: {}, webSearchEnabled: true, provider: 'gemini' }), { ok: true, webSearch: 'grounding' });
  assert.equal(planServerReply({ config: {}, webSearchEnabled: true, provider: 'openrouter' }).reason, LOCAL_REASONS.packetSearch, 'a search packet is made in the browser');
});

function harness(overrides = {}) {
  const calls = [];
  const flushed = [];
  const reply = createServerReply({
    getAccessToken: async () => 'token-123',
    getApiKeyForProvider: (name) => ({ openrouter: KEY, tavily: 'tvly-key' }[name] || ''),
    getModelApiId: (model) => model.id,
    getDefaultGenConfig: () => ({ temperature: 0.7 }),
    describeRequest: async () => ({ systemInstructionText: 'be kind' }),
    flushSync: async () => { flushed.push(calls.length); },
    readMessage: async () => null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 });
    },
    clientVersion: '17.5.0',
    wait: async () => {},
    ...overrides
  });
  return { reply, calls, flushed };
}
const startArgs = (extra = {}) => ({ conversation: CONVERSATION, modelInfo: MODEL, requestParts: [{ text: 'now' }], webSearch: 'off', assistantMessageId: MESSAGE_ID, sequence: 3, uiLanguage: 'en', config: {}, ...extra });

test('a reply is handed over with everything it needs, after the conversation was saved, and only the keys it uses', async () => {
  const { reply, calls, flushed } = harness();
  const result = await reply.start(startArgs());
  assert.equal(result.ok, true);
  assert.equal(result.run.runId, 'run-1');
  assert.deepEqual(flushed, [0], 'saved before the request went out');
  assert.equal(calls[0].url, 'https://api.noureon.com/v1/runs');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-123');
  const spec = JSON.parse(calls[0].options.body);
  assert.equal(spec.protocol, 1);
  assert.equal(spec.clientVersion, '17.5.0');
  assert.equal(spec.conversationId, CONVERSATION.id);
  assert.equal(spec.assistantMessageId, MESSAGE_ID);
  assert.equal(spec.sequence, 3);
  assert.deepEqual(spec.model, { provider: 'openrouter', id: 'm-local', info: MODEL });
  assert.deepEqual(spec.request.history, [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'answer' }] }], 'the current message is not in the history, and only role and parts are sent');
  assert.deepEqual(spec.request.currentMessage, { parts: [{ text: 'now' }] });
  assert.equal(spec.request.systemInstruction, 'be kind');
  assert.deepEqual(spec.request.generation, { temperature: 0.7 });
  assert.equal(spec.request.language, 'en');
  assert.deepEqual(spec.tools, { webSearch: 'off', advanced: false });
  assert.deepEqual(spec.secrets, { providerKey: KEY });
});

test('a search by the model sends the key of the search source in use, or the other one, or does not go', async () => {
  const { reply, calls } = harness();
  await reply.start(startArgs({ webSearch: 'research', config: { searchProvider: 'tavily' } }));
  const spec = JSON.parse(calls[0].options.body);
  assert.deepEqual(spec.tools, { webSearch: 'research', searchProvider: 'tavily', advanced: false });
  assert.deepEqual(spec.secrets, { providerKey: KEY, searchKey: 'tvly-key' });
  const other = harness();
  await other.reply.start(startArgs({ webSearch: 'research', config: { searchProvider: 'tinyfish' } }));
  assert.equal(JSON.parse(other.calls[0].options.body).tools.searchProvider, 'tavily', 'the one there is a key for');
  const none = harness({ getApiKeyForProvider: (name) => (name === 'openrouter' ? KEY : '') });
  const result = await none.reply.start(startArgs({ webSearch: 'research' }));
  assert.equal(result.ok, false);
  assert.equal(none.calls.length, 0);
  const metadata = harness();
  await metadata.reply.start(startArgs({ getHistorySourceIds: () => ['c1'] }));
  assert.deepEqual(JSON.parse(metadata.calls[0].options.body).request.messageMetadata, { historySourceConversationIds: ['c1'] });
});

test('when the server does not take the reply it says why, and what the person is told is only for what they would want to know', async () => {
  const answer = (status, code) => harness({ fetchImpl: async () => new Response(JSON.stringify({ error: { code } }), { status }) });
  assert.deepEqual(await answer(429, 'too_many_runs').reply.start(startArgs()), { ok: false, reason: 'too_many_runs', notify: 'busy' });
  assert.deepEqual(await answer(503, 'runs_unavailable').reply.start(startArgs()), { ok: false, reason: 'runs_unavailable', notify: false });
  assert.deepEqual(await answer(422, 'unsupported_mode').reply.start(startArgs()), { ok: false, reason: 'unsupported_mode', notify: false });
  assert.equal((await answer(404, 'conversation_not_found').reply.start(startArgs())).notify, false);
  assert.equal((await answer(401, 'unauthorized').reply.start(startArgs())).notify, 'unreachable');
  const offline = harness({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.deepEqual(await offline.reply.start(startArgs()), { ok: false, reason: 'unreachable', notify: 'unreachable' });
  const signedOut = harness({ getAccessToken: async () => '' });
  assert.equal((await signedOut.reply.start(startArgs())).ok, false);
  assert.equal(signedOut.calls.length, 0);
  const noKey = harness({ getApiKeyForProvider: () => '' });
  assert.equal((await noKey.reply.start(startArgs())).reason, 'no-key');
  const huge = harness();
  const tooLarge = await huge.reply.start(startArgs({ requestParts: [{ text: 'x'.repeat(21 * 1024 * 1024) }] }));
  assert.deepEqual(tooLarge, { ok: false, reason: LOCAL_REASONS.tooLarge, notify: false });
  const broken = harness({ describeRequest: async () => { throw new Error('boom'); } });
  assert.equal((await broken.reply.start(startArgs())).ok, false);
});

const row = (text, status = 'streaming', extra = {}) => ({ parts: [{ text }], status, metadata: null, ...extra });

test('following a reply: the answer arrives as it grows and the finished text comes back with its run record', async () => {
  const rows = [null, row('Hel'), row('Hello'), row(`${formatSandboxRunBlock({ status: 'done', steps: [], sources: [{ url: 'https://a.example', title: 'A', n: 1 }] })}Hello world`, 'complete')];
  let index = 0;
  const { reply } = harness({ readMessage: async () => rows[Math.min(index++, rows.length - 1)] });
  const { run } = await reply.start(startArgs());
  const seen = [];
  const result = await run.follow({ onText: (delta) => seen.push(delta) });
  assert.deepEqual(seen, ['Hel', 'lo', ' world']);
  assert.equal(result.text, 'Hello world');
  assert.equal(result.run.sources[0].url, 'https://a.example');
  assert.equal(result.rewritten, false);
});

test('a finished text that changed what was already shown is marked as rewritten', async () => {
  const rows = [row('Gemini says 1.'), row('Gemini says 1.[1]', 'complete')];
  let index = 0;
  const { reply } = harness({ readMessage: async () => rows[Math.min(index++, rows.length - 1)] });
  const { run } = await reply.start(startArgs());
  const result = await run.follow({});
  assert.equal(result.text, 'Gemini says 1.[1]');
  assert.equal(result.rewritten, false, 'more at the end is not a rewrite');
  const changed = [row('Hello wrld'), row('Hello world', 'complete')];
  let at = 0;
  const second = harness({ readMessage: async () => changed[Math.min(at++, changed.length - 1)] });
  const again = await (await second.reply.start(startArgs())).run.follow({});
  assert.equal(again.rewritten, true);
});

test('a reply the server could not finish is an error with the server\'s reason, carrying that it was the server\'s', async () => {
  const { reply } = harness({ readMessage: async () => row('', 'error', { metadata: { serverError: { code: 'provider_error', message: 'The provider said no' } } }) });
  const { run } = await reply.start(startArgs());
  await assert.rejects(() => run.follow({}), (error) => error instanceof ServerReplyError && error.code === 'provider_error' && error.message === 'The provider said no' && error.serverRun === true);
});

test('stopping tells the server once, then waits for the text it had written', async () => {
  const controller = new AbortController();
  const rows = [row('part'), row('partial text', 'complete')];
  let index = 0;
  const { reply, calls } = harness({ readMessage: async () => { const next = rows[Math.min(index++, rows.length - 1)]; if (index === 1) controller.abort(); return next; } });
  const { run } = await reply.start(startArgs());
  const result = await run.follow({ signal: controller.signal });
  assert.equal(result.text, 'partial text');
  assert.equal(calls.filter((call) => call.url.endsWith('/stop')).length, 1);
  assert.equal(calls.find((call) => call.url.endsWith('/stop')).options.method, 'POST');
});

test('when the run ends without the message being finished, the person is not left waiting for ever', async () => {
  const fetchImpl = async (url) => (url.includes('/v1/runs/run-1') && !url.endsWith('/stop') && !url.endsWith('/v1/runs')
    ? new Response(JSON.stringify({ run: { status: 'failed', error_code: 'internal_error' } }), { status: 200 })
    : new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 }));
  const { reply } = harness({ fetchImpl, readMessage: async () => null });
  const { run } = await reply.start(startArgs());
  await assert.rejects(() => run.follow({}), (error) => error.code === 'internal_error');
});

test('every text exists in all five languages', () => {
  const languages = ['zh-TW', 'en', 'fr', 'ru', 'es'];
  const keys = Object.keys(SERVER_REPLY_TEXTS.en);
  for (const language of languages) {
    assert.deepEqual(Object.keys(SERVER_REPLY_TEXTS[language]).sort(), [...keys].sort(), language);
    for (const key of keys) assert.ok(serverReplyText(language, key).length > 0, `${language}.${key}`);
  }
  assert.equal(serverReplyText('xx', 'runTitle'), 'Where replies run');
});

test('the server\'s own reasons are told in the language of the page, the provider\'s words are left alone', () => {
  const timeLimit = localizeServerError(new ServerReplyError('The reply took too long.', 'time_limit'), 'fr');
  assert.equal(timeLimit.message, serverReplyText('fr', 'timeLimit'));
  assert.equal(timeLimit.serverRun, true);
  const provider = new ServerReplyError('Rate limit exceeded', 'provider_error');
  assert.equal(localizeServerError(provider, 'fr'), provider);
});

test('a reply the server is still making is found for the conversation and followed from where it is', async () => {
  const rows = [row('Hel'), row('Hello', 'streaming'), row('Hello world', 'complete')];
  let index = 0;
  const queried = [];
  const { reply } = harness({
    findLiveRun: async (conversationId) => { queried.push(conversationId); return { id: 'run-7', message_id: MESSAGE_ID }; },
    readMessage: async () => rows[Math.min(index++, rows.length - 1)]
  });
  const run = await reply.find('conv-1');
  assert.deepEqual(queried, ['conv-1']);
  assert.equal(run.runId, 'run-7');
  assert.equal(run.assistantMessageId, MESSAGE_ID);
  const seen = [];
  const result = await run.follow({ onText: (delta) => seen.push(delta) });
  assert.deepEqual(seen, ['Hel', 'lo', ' world']);
  assert.equal(result.text, 'Hello world');
  const none = harness({ findLiveRun: async () => null });
  assert.equal(await none.reply.find('conv-2'), null, 'nothing is shown for a reply that is over');
});
