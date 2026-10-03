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
  // Python runs on the server too, with the model's own web search; a search packet is still made here.
  assert.deepEqual(planServerReply({ config: {}, advanced: true }), { ok: true, webSearch: 'off', advanced: true });
  assert.deepEqual(planServerReply({ config: {}, advanced: true, webSearchEnabled: true, researchByModel: true }), { ok: true, webSearch: 'research', advanced: true });
  assert.deepEqual(planServerReply({ config: {}, advanced: true, webSearchEnabled: true, provider: 'gemini' }), { ok: true, webSearch: 'briefing', advanced: true });
  assert.equal(planServerReply({ config: {}, advanced: true, webSearchEnabled: true, provider: 'openrouter' }).reason, LOCAL_REASONS.packetSearch);
  assert.equal(planServerReply({ config: { replyRunLocation: 'local' }, advanced: true }).reason, LOCAL_REASONS.setting);
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

test('with pacing the words the server wrote are handed over in small pieces until the next look, and all of them arrive', async () => {
  const rows = [row('Hello wonderful world'), row('Hello wonderful world, and more', 'complete')];
  let index = 0;
  const waits = [];
  const { reply } = harness({ paceMs: 50, wait: async (ms) => { waits.push(ms); }, readMessage: async () => rows[Math.min(index++, rows.length - 1)] });
  const { run } = await reply.start(startArgs());
  const pieces = [];
  const result = await run.follow({ onText: (delta) => pieces.push(delta) });
  assert.equal(pieces.join(''), 'Hello wonderful world, and more');
  assert.ok(pieces.length > 4, 'in small pieces, not one block');
  assert.equal(result.text, 'Hello wonderful world, and more');
  assert.ok(waits.every((ms) => ms === 50 || ms === 350));
});

// ----- the live channel

const sseBody = (events, { end = true } = {}) => {
  const encoder = new TextEncoder();
  let controllerRef;
  const body = new ReadableStream({ start(controller) { controllerRef = controller; for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); if (end) controller.close(); } });
  return { body, push: (event) => controllerRef.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)), close: () => controllerRef.close() };
};
const liveHarness = ({ events, rows = [], extra = {} }) => {
  const calls = [];
  let index = 0;
  const live = sseBody(events, extra.sseOptions);
  const { reply } = harness({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/stream')) return new Response(live.body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 });
    },
    readMessage: async () => rows[Math.min(index++, rows.length - 1)] || null,
    paceMs: 50,
    ...extra
  });
  return { reply, calls, live };
};

test('a reply watched live is given to the page piece by piece as the server makes it, with nothing waiting for a database', async () => {
  const waits = [];
  const { reply, calls } = liveHarness({
    events: [{ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [] } }, { th: 'Let me think', k: 'summary' }, { a: 'Hel' }, { a: 'lo' }, { src: [{ url: 'https://a.example', n: 1 }] }, { a: ' world' }, { done: 'complete' }],
    rows: [row('Hello world', 'complete')],
    extra: { wait: async (ms) => { waits.push(ms); } }
  });
  const { run } = await reply.start(startArgs());
  const texts = [];
  const thoughts = [];
  const runs = [];
  const result = await run.follow({ onText: (delta) => texts.push(delta), onThought: (text, kind) => thoughts.push([text, kind]), onRun: (value) => runs.push(value) });
  assert.deepEqual(texts, ['Hel', 'lo', ' world'], 'each piece as it came');
  assert.deepEqual(thoughts, [['Let me think', 'summary']]);
  assert.equal(runs[0].sources[0].url, 'https://a.example');
  assert.equal(result.text, 'Hello world');
  assert.equal(result.rewritten, false);
  assert.equal(waits.length, 0, 'no poll was waited for');
  const streamCall = calls.find((call) => call.url.endsWith('/v1/runs/run-1/stream'));
  assert.equal(streamCall.options.headers.Authorization, 'Bearer token-123');
});

test('a page that comes in late is given what there is so far at once, then goes on with the rest', async () => {
  const { reply } = liveHarness({
    events: [{ r: { answer: 'Apple pie is', thought: { text: 'thinking', kind: 'model' }, sources: [] } }, { a: ' good' }, { done: 'complete' }],
    rows: [row('Apple pie is good', 'complete')]
  });
  const { run } = await reply.start(startArgs());
  const texts = [];
  const thoughts = [];
  const result = await run.follow({ onText: (delta) => texts.push(delta), onThought: (text) => thoughts.push(text) });
  assert.deepEqual(texts, ['Apple pie is', ' good']);
  assert.deepEqual(thoughts, ['thinking']);
  assert.equal(result.text, 'Apple pie is good');
});

test('when the live channel breaks the message is read instead and nothing is shown twice', async () => {
  const { reply } = liveHarness({
    events: [{ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [] } }, { a: 'Hello' }],
    rows: [row('Hello wor', 'streaming'), row('Hello world', 'complete')]
  });
  const { run } = await reply.start(startArgs());
  const texts = [];
  const result = await run.follow({ onText: (delta) => texts.push(delta) });
  assert.equal(texts.join(''), 'Hello world');
  assert.equal(result.text, 'Hello world');
});

test('a stop is sent at once while the page is following live, and the words written so far are kept', async () => {
  const controller = new AbortController();
  const { reply, calls, live } = liveHarness({
    events: [{ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [] } }, { a: 'Partial' }],
    rows: [row('Partial text', 'complete')],
    extra: { sseOptions: { end: false } }
  });
  const { run } = await reply.start(startArgs());
  const texts = [];
  const following = run.follow({ onText: (delta) => texts.push(delta), signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.filter((call) => call.url.endsWith('/stop')).length, 1, 'the server was told straight away');
  live.push({ done: 'complete' });
  live.close();
  const result = await following;
  assert.equal(texts.join(''), 'Partial text');
  assert.equal(result.text, 'Partial text');
});

test('the times are the server\'s: how long the reply has gone on and how long it thought are given to the page, so every page shows the same seconds', async () => {
  const { reply } = liveHarness({
    events: [{ r: { answer: 'Hi', thought: { text: 'thinking', kind: 'model', ms: 4200, ended: false }, sources: [], elapsedMs: 9100 } }, { th: ' more', k: 'model' }, { te: 6500 }, { a: ' there' }, { done: 'complete' }],
    rows: [row('Hi there', 'complete')]
  });
  const { run } = await reply.start(startArgs());
  const timings = [];
  const thoughts = [];
  const ends = [];
  await run.follow({ onText() {}, onTiming: (ms) => timings.push(ms), onThought: (text, kind, ms) => thoughts.push([text, ms]), onThoughtEnd: (ms) => ends.push(ms) });
  assert.deepEqual(timings, [9100]);
  assert.deepEqual(thoughts, [['thinking', 4200], [' more', undefined]]);
  assert.deepEqual(ends, [6500]);
  const late = liveHarness({ events: [{ r: { answer: 'Hi', thought: { text: 'done thinking', kind: 'model', ms: 8800, ended: true }, sources: [], elapsedMs: 15_000 } }, { done: 'complete' }], rows: [row('Hi', 'complete')] });
  const lateRun = (await late.reply.start(startArgs())).run;
  const lateEnds = [];
  await lateRun.follow({ onText() {}, onThoughtEnd: (ms) => lateEnds.push(ms) });
  assert.deepEqual(lateEnds, [8800], 'a page that comes in after it stopped thinking is told how long it thought');
});

test('a reply with Python is handed over with the Design menu\'s choices and the files of the message, and only then', async () => {
  const { reply, calls } = harness();
  const files = [{ name: 'a.csv', mimeType: 'text/csv', data: 'YSxi' }];
  await reply.start(startArgs({ advanced: true, designs: { deck: 'Slate', document: 'auto' }, inputs: files }));
  assert.deepEqual(JSON.parse(calls[0].options.body).tools, { webSearch: 'off', advanced: true, designs: { deck: 'Slate', document: 'auto' }, inputs: files });
  await reply.start(startArgs({ advanced: false, designs: { deck: 'Slate' }, inputs: files }));
  assert.deepEqual(JSON.parse(calls[1].options.body).tools, { webSearch: 'off', advanced: false }, 'a reply without Python carries neither');
});

test('the steps of a reply with Python reach the page as they happen, a page that joins late is given the ones so far, and the files come back as parts', async () => {
  const marker = { __astraCloudAsset: { path: 'u/abc', mimeType: 'image/png', encoding: 'base64' } };
  const finished = { parts: [{ text: 'Done.' }, { sandboxFile: { id: 'f1', name: 'chart.png', mimeType: 'image/png', size: 3, data: marker } }], status: 'complete', metadata: null };
  const hydrated = [];
  const { reply } = liveHarness({
    events: [
      { r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], events: [{ type: 'step', n: 1, title: 'Plot', code: 'plot()' }] } },
      { ev: { type: 'output', n: 1, stream: 'stdout', text: 'ok' } },
      { ev: { type: 'step-end', n: 1, ok: true, files: [{ name: 'chart.png', size: 3, data: Buffer.from([1, 2, 3]).toString('base64') }, { name: 'notes.txt', size: 5 }], elapsedMs: 4 } },
      { a: 'Done.' },
      { done: 'complete' }
    ],
    rows: [finished],
    extra: { hydrateParts: async (parts) => { hydrated.push(parts); return parts.map((part) => ({ sandboxFile: { ...part.sandboxFile, data: 'AQID' } })); } }
  });
  const { run } = await reply.start(startArgs({ advanced: true }));
  const events = [];
  const result = await run.follow({ onEvent: (event) => events.push(event) });
  assert.deepEqual(events.map((event) => event.type), ['step', 'output', 'step-end']);
  const end = events[2];
  assert.deepEqual([...end.files[0].bytes], [1, 2, 3], 'a picture in the event is given as bytes');
  assert.equal('data' in end.files[0], false);
  assert.deepEqual(end.files[1], { name: 'notes.txt', size: 5 });
  assert.equal(result.text, 'Done.');
  assert.deepEqual(hydrated[0], [finished.parts[1]], 'the file parts were handed to be brought here');
  assert.equal(result.extraParts[0].sandboxFile.data, 'AQID');
  assert.equal(result.extraParts[0].sandboxFile.name, 'chart.png');
});

test('a file that cannot be brought here is still listed, as the server wrote it', async () => {
  const finished = { parts: [{ text: 'Done.' }, { sandboxFile: { id: 'f1', name: 'a.txt', size: 1, data: { __astraCloudAsset: { path: 'u/x' } } } }], status: 'complete', metadata: null };
  const { reply } = liveHarness({ events: [{ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [] } }, { a: 'Done.' }, { done: 'complete' }], rows: [finished], extra: { hydrateParts: async () => { throw new Error('storage down'); } } });
  const { run } = await reply.start(startArgs({ advanced: true }));
  const result = await run.follow({});
  assert.equal(result.extraParts.length, 1);
  assert.equal(result.extraParts[0].sandboxFile.name, 'a.txt');
});

test('the files earlier replies made are kept in the cloud first, and the request names where they are instead of carrying them', async () => {
  const withFiles = { ...CONVERSATION, messages: [
    { role: 'user', parts: [{ text: 'make a file' }] },
    { role: 'model', parts: [{ text: 'here' }, { sandboxFile: { id: 'f1', name: 'a.xlsx', mimeType: 'application/octet-stream', size: 3, data: 'AQID' } }, { sandboxFile: { id: 'f2', name: 'b.txt', mimeType: 'text/plain', size: 1, data: 'YQ==' } }] },
    { role: 'user', parts: [{ text: 'now change it' }] }
  ] };
  const kept = [];
  const { reply, calls } = harness({
    externalizeParts: async (parts) => {
      kept.push(parts[0].sandboxFile.name);
      if (parts[0].sandboxFile.name === 'b.txt') throw new Error('storage down');
      return [{ sandboxFile: { ...parts[0].sandboxFile, data: { __astraCloudAsset: { path: 'u/hash', mimeType: 'application/octet-stream', encoding: 'base64' } } } }];
    }
  });
  await reply.start(startArgs({ conversation: withFiles }));
  const history = JSON.parse(calls[0].options.body).request.history;
  assert.deepEqual(kept, ['a.xlsx', 'b.txt']);
  assert.deepEqual(history[1].parts[1].sandboxFile.data, { __astraCloudAsset: { path: 'u/hash', mimeType: 'application/octet-stream', encoding: 'base64' } }, 'named by its place in the cloud');
  assert.equal(history[1].parts[2].sandboxFile.data, 'YQ==', 'a file that could not be kept there goes with the request');
  assert.deepEqual(history[0], { role: 'user', parts: [{ text: 'make a file' }] });
});
