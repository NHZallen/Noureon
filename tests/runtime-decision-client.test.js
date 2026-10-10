import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DECISION_MODEL, DECISION_PAUSE_MS, DECISION_THRESHOLD, DECISION_URL,
  buildDecisionRequest, createDecisionService, parseDecisionResponse, verdictOf
} from '../src/app/runtime/decisions/decision-client.js';
import { decisionsFor, forgetDecisions, rememberDecisions } from '../src/app/runtime/decisions/decision-store.js';

const ok = (answers) => ({ ok: true, status: 200, json: async () => ({ model: DECISION_MODEL, answers }) });
const answers = { search: { type: 'noul', noul: 0.9 }, file: { type: 'noul', noul: 0.1 }, chart: { type: 'noul', noul: 0.65 } };

test('the request puts four questions in one call, the tool question only when the model has tools of its own', () => {
  const tools = [{ name: 'OfficeCLI', description: 'Reads and edits Word, Excel and PowerPoint files.' }];
  const request = buildDecisionRequest({ message: '幫我把這份報告做成簡報', tools, hasAttachment: true });
  assert.equal(request.model, 'openai/gpt-6-luna-decisions');
  assert.deepEqual(Object.keys(request.questions), ['search', 'file', 'chart', 'tool']);
  for (const question of Object.values(request.questions)) {
    assert.equal(question.type, 'noul');
    assert.ok(question.instructions.length > 40);
  }
  assert.ok(request.state.every((item) => typeof item === 'string'), 'the state is plain strings');
  assert.match(request.state[0], /^Latest message: 幫我把這份報告做成簡報$/);
  assert.ok(request.state.some((item) => /Files attached to the latest message: yes/.test(item)));
  assert.ok(request.state.some((item) => /Tools available:\n- OfficeCLI: Reads/.test(item)));
  assert.deepEqual(Object.keys(buildDecisionRequest({ message: 'hello' }).questions), ['search', 'file', 'chart']);
  assert.equal(buildDecisionRequest({ message: '   ' }), null);
});

test('what is sent is short: the message, the last two earlier messages and no images', () => {
  const long = 'x'.repeat(5000);
  const history = ['a', 'b', 'c', 'd'].map((text, index) => ({ role: index % 2 ? 'model' : 'user', parts: [{ text: long }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }));
  const request = buildDecisionRequest({ message: long, history });
  assert.ok(request.state[0].length <= 'Latest message: '.length + 1501);
  const earlier = request.state[1];
  assert.equal((earlier.match(/(?:Person|Assistant): /g) || []).length, 2);
  assert.ok(earlier.length < 800);
  assert.doesNotMatch(JSON.stringify(request), /AAAA|inlineData|image_url/);
});

test('the answers are probabilities, anything else is no answer', () => {
  assert.deepEqual(parseDecisionResponse({ answers }), { search: 0.9, file: 0.1, chart: 0.65, tool: null });
  assert.equal(parseDecisionResponse({ answers: { search: { type: 'noul', noul: 7 }, file: { noul: 'x' } } }), null);
  assert.equal(parseDecisionResponse({}), null);
  assert.equal(parseDecisionResponse(null), null);
});

test('a probability of 0.6 or more is a yes, a missing answer is neither', () => {
  const decisions = { search: 0.6, file: 0.59, chart: null };
  assert.equal(DECISION_THRESHOLD, 0.6);
  assert.equal(verdictOf(decisions, 'search'), true);
  assert.equal(verdictOf(decisions, 'file'), false);
  assert.equal(verdictOf(decisions, 'chart'), null);
  assert.equal(verdictOf(decisions, 'tool'), null);
  assert.equal(verdictOf(null, 'search'), null);
});

test('the service calls OpenRouter with the key and returns the decisions', async () => {
  const calls = [];
  const service = createDecisionService({
    getApiKey: () => 'sk-or-test',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return ok(answers); }
  });
  const decisions = await service.decide({ message: '今天台北天氣' });
  assert.deepEqual(decisions, { search: 0.9, file: 0.1, chart: 0.65, tool: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DECISION_URL);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-or-test');
  assert.equal(JSON.parse(calls[0].init.body).model, DECISION_MODEL);
});

test('no key, no message or an aborted message make no call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return ok(answers); };
  assert.equal(await createDecisionService({ getApiKey: () => '', fetchImpl }).decide({ message: 'hi' }), null);
  assert.equal(await createDecisionService({ getApiKey: () => 'k', fetchImpl }).decide({ message: '  ' }), null);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await createDecisionService({ getApiKey: () => 'k', fetchImpl }).decide({ message: 'hi' }, { signal: controller.signal }), null);
  assert.equal(calls, 0);
});

test('a failed, odd or slow call gives null and never throws', async () => {
  const input = { message: 'hello' };
  const service = (fetchImpl, extra = {}) => createDecisionService({ getApiKey: () => 'k', fetchImpl, ...extra });
  assert.equal(await service(async () => ({ ok: false, status: 500, json: async () => ({}) })).decide(input), null);
  assert.equal(await service(async () => { throw new TypeError('Failed to fetch'); }).decide(input), null);
  assert.equal(await service(async () => ok({})).decide(input), null);
  assert.equal(await service(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })).decide(input), null);
  // A call that does not come back in time is aborted by the timer.
  let aborted = false;
  const slow = service((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); })), {
    setTimer: (callback) => { queueMicrotask(callback); return 1; },
    clearTimer: () => {}
  });
  assert.equal(await slow.decide(input), null);
  assert.equal(aborted, true);
});

test('two failures in a row pause the judgements for ten minutes, a success starts the count again', async () => {
  let clock = 1_000;
  let calls = 0;
  let works = false;
  const service = createDecisionService({
    getApiKey: () => 'k',
    now: () => clock,
    fetchImpl: async () => { calls += 1; return works ? ok(answers) : { ok: false, status: 503, json: async () => ({}) }; }
  });
  await service.decide({ message: 'one' });
  works = true;
  assert.ok(await service.decide({ message: 'two' }), 'one failure and then a success');
  works = false;
  await service.decide({ message: 'three' });
  await service.decide({ message: 'four' });
  assert.equal(service.isPaused(), true);
  const before = calls;
  assert.equal(await service.decide({ message: 'five' }), null);
  assert.equal(calls, before, 'no call while paused');
  clock += DECISION_PAUSE_MS + 1;
  works = true;
  assert.ok(await service.decide({ message: 'six' }));
  assert.equal(service.isPaused(), false);
});

test('the store finds the decisions by the exact text of the last message, for a while', () => {
  forgetDecisions();
  assert.equal(decisionsFor('hello'), null);
  rememberDecisions('  hello  ', { search: 0.9 }, 1000);
  assert.deepEqual(decisionsFor('hello', 2000), { search: 0.9 });
  assert.equal(decisionsFor('hello there', 2000), null);
  assert.equal(decisionsFor('hello', 1000 + 10 * 60 * 1000 + 1), null);
  rememberDecisions('hello', null);
  assert.equal(decisionsFor('hello'), null);
  forgetDecisions();
});

test('the request made when a message is sent offers only the command tools the model may use by itself, and nothing is asked without a key', async () => {
  const { createRequestDecisions } = await import('../src/app/runtime/decisions/decision-request.js');
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return { ok: true, json: async () => ({ answers: { search: { type: 'noul', noul: 0.9 }, file: { type: 'noul', noul: 0.1 }, chart: { type: 'noul', noul: 0.1 }, tool: { type: 'noul', noul: 0.8 } } }) };
  };
  try {
    const config = { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: ['ffmpeg'] };
    let key = 'sk-or-test';
    const request = createRequestDecisions({ getApiKeyForProvider: (provider) => (provider === 'openrouter' ? key : ''), getConfig: () => config, logger: { warn() {} } });
    const decisions = await request({ conversation: { messages: [] }, userMessage: 'convert this video', uploadedFiles: [] });
    assert.equal(decisions.search, 0.9);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].auth, 'Bearer sk-or-test');
    assert.ok(seen[0].body.questions.tool, 'the tool question is asked');
    const stateText = JSON.stringify(seen[0].body.state).toLowerCase();
    assert.ok(stateText.includes('ffmpeg'), 'the tool the model may use by itself is listed');
    assert.equal(stateText.includes('officecli'), false, 'a tool that only "@" can bring in is not put to the question');

    key = '';
    assert.equal(await request({ conversation: { messages: [] }, userMessage: 'hello', uploadedFiles: [] }), null, 'no key, no call');
    assert.equal(seen.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
