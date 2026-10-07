import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNCIL_CHECKPOINT_VERSION, executeCouncil } from '../../server/council-run.js';
import { ReplyError, scrubMessage } from '../../server/executor.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { MODELS } from '../../src/app/runtime/legacy-core/model-registry.js';

const KEYS = { openrouter: 'sk-or-secret-value', nvidia: 'nv-secret-value' };
const TAVILY = 'tvly-secret-value';
const byId = (id) => JSON.parse(JSON.stringify(MODELS.find((model) => model.id === id)));
const entry = (id) => { const model = byId(id); return { provider: model.provider, id: model.id, info: model }; };
const MEMBER_A = 'anthropic/claude-haiku-4.5';
const MEMBER_B = 'nvidia/deepseek-ai/deepseek-v4.1-flash';
const SYNTH = 'anthropic/claude-sonnet-5.5';

const rawSpec = ({ mode = 'consensus', search = false, history = [{ role: 'user', parts: [{ text: 'Earlier question' }] }, { role: 'model', parts: [{ text: 'Earlier answer' }] }], participants = [MEMBER_A, MEMBER_B], keys = KEYS } = {}) => ({
  protocol: PROTOCOL_VERSION,
  kind: 'council',
  clientVersion: '17.11.0',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 3,
  council: { mode, showRawResponses: true, showComparisonTable: true, participants: participants.map(entry), synthesizer: entry(SYNTH) },
  request: {
    history,
    currentMessage: { parts: [{ text: 'Compare the latest pricing of Vercel plans' }] },
    systemInstructions: { participant: 'SYS-MEMBER', deliberation: 'SYS-DELIB', synthesis: 'SYS-SYNTH' },
    language: 'en'
  },
  tools: { webSearch: search ? 'on' : 'off', searchProvider: 'tavily', searchDepth: 'basic' },
  secrets: { keys, ...(search ? { searchKey: TAVILY } : {}) }
});
const specFor = (options) => {
  const result = validateRunSpec(rawSpec(options));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result;
};
const secretsOf = (options) => specFor(options).spec.secrets;

const sseText = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
const streaming = (text) => new Response(sseText(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const idOf = (body) => String(body.model || '');
const isRewrite = (body) => /You write the web search query/.test(JSON.stringify(body.messages));

// One world: the providers and the search service. `answer(model, body, options)` may be replaced for a model that fails, hangs or breaks.
const world = ({ answer = null, searchResults = [{ title: 'Vercel Pro', url: 'https://vercel.com/pricing', content: 'Pro is $20 a month.' }] } = {}) => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const address = String(url);
    const body = options.body ? JSON.parse(options.body) : {};
    requests.push({ url: address, headers: options.headers, body, model: idOf(body) });
    if (address.includes('api.tavily.com')) return new Response(JSON.stringify({ results: searchResults }), { status: 200 });
    if (isRewrite(body)) return streaming('Vercel plans price');
    if (answer) {
      const custom = await answer({ model: idOf(body), body, options, address });
      if (custom) return custom;
    }
    const model = idOf(body);
    return streaming(model.includes('sonnet') ? 'SYNTH-ANSWER' : `ANSWER of ${model}`);
  };
  return { requests, fetchImpl };
};
const modelCalls = (requests) => requests.filter((request) => !request.url.includes('tavily') && !isRewrite(request.body));
const onlyModel = (requests, fragment) => modelCalls(requests).filter((request) => request.model.includes(fragment));

test('a council: the members answer with the key of their own provider, the synthesizer writes the answer, and the pages are shown every step', async () => {
  const w = world();
  const live = [];
  const updates = [];
  const result = await executeCouncil({ ...specFor(), secrets: secretsOf(), fetchImpl: w.fetchImpl, onLive: (event) => live.push(event), onUpdate: (parts) => updates.push(parts[0].text) });
  assert.equal(result.status, 'done');
  assert.match(result.parts[0].text, /^SYNTH-ANSWER/);
  assert.match(result.parts[0].text, /ANSWER of anthropic\/claude-haiku-4\.5/, 'the answers of the first round are in the block the council adds');

  const [a] = onlyModel(w.requests, 'haiku');
  const [b] = onlyModel(w.requests, 'deepseek');
  const [s] = onlyModel(w.requests, 'sonnet');
  assert.equal(a.headers.Authorization, `Bearer ${KEYS.openrouter}`);
  assert.equal(b.headers.Authorization, `Bearer ${KEYS.nvidia}`, 'a member of another provider gets that provider\'s key');
  assert.equal(s.headers.Authorization, `Bearer ${KEYS.openrouter}`);
  assert.match(JSON.stringify(a.body.messages), /SYS-MEMBER/, 'each kind of call is told what the page put together for it');
  assert.match(JSON.stringify(s.body.messages), /SYS-SYNTH/);
  assert.match(JSON.stringify(a.body.messages), /Earlier answer/, 'the members see the conversation');

  const stages = live.filter((event) => event.cs).map((event) => event.cs.stage);
  assert.deepEqual([...new Set(stages)], ['firstRound', 'synthesis', 'completed']);
  const last = live.filter((event) => event.cs).at(-1).cs;
  assert.deepEqual(last.modelStates.map((state) => state.status), ['done', 'done']);
  assert.equal(live.filter((event) => typeof event.a === 'string').map((event) => event.a).join(''), result.parts[0].text, 'the pages that watch are given the whole text, the council\'s blocks included');
  assert.ok(updates.length > 0 && updates.at(-1).startsWith('SYNTH-ANSWER'), 'the message is written as the synthesis comes');
  assert.equal(JSON.stringify(live).includes(KEYS.openrouter), false, 'no key reaches the pages');
});

test('a deliberation asks every member again, and the search is made once for the council', async () => {
  const w = world();
  await executeCouncil({ ...specFor({ mode: 'deliberation', search: true }), secrets: secretsOf({ mode: 'deliberation', search: true }), fetchImpl: w.fetchImpl });
  assert.equal(onlyModel(w.requests, 'haiku').length, 2, 'a first and a second round');
  assert.equal(onlyModel(w.requests, 'deepseek').length, 2);
  assert.ok(w.requests.filter((request) => request.url.includes('tavily')).length >= 1);
  assert.equal(w.requests.find((request) => request.url.includes('tavily')).headers.Authorization, `Bearer ${TAVILY}`);
});

test('a member that fails does not end the council; a member that never answers runs out of time and is told as a failure', async () => {
  const failing = world({ answer: async ({ model }) => (model.includes('deepseek') ? new Response(JSON.stringify({ error: { message: `Rate limited for ${KEYS.nvidia}` } }), { status: 429 }) : null) });
  const one = await executeCouncil({ ...specFor(), secrets: secretsOf(), fetchImpl: failing.fetchImpl, retryDelayMs: 1 });
  assert.equal(one.status, 'done');
  assert.match(one.parts[0].text, /SYNTH-ANSWER/);
  assert.equal(one.parts[0].text.includes(KEYS.nvidia), false, 'the key is not in what is written');
  assert.equal(onlyModel(failing.requests, 'deepseek').length, 2, 'one more try');

  const hanging = world({
    answer: ({ model, options }) => (model.includes('deepseek')
      ? new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      : null)
  });
  const started = Date.now();
  const two = await executeCouncil({ ...specFor(), secrets: secretsOf(), fetchImpl: hanging.fetchImpl, callTimeoutMs: 60, retryDelayMs: 1 });
  assert.ok(Date.now() - started < 3000, 'the council did not wait for it');
  assert.equal(two.status, 'done');
  assert.match(two.parts[0].text, /did not answer within/);
  assert.equal(onlyModel(hanging.requests, 'deepseek').length, 1, 'a call that ran out of time is not tried again');
});

test('when every member fails the reply fails with their message, and no key is in it', async () => {
  const w = world({ answer: async ({ model }) => (model.includes('sonnet') ? null : new Response(JSON.stringify({ error: { message: `Bad key ${KEYS.openrouter} ${KEYS.nvidia}` } }), { status: 401 })) });
  await assert.rejects(
    () => executeCouncil({ ...specFor(), secrets: secretsOf(), fetchImpl: w.fetchImpl, retryDelayMs: 1 }),
    (error) => error instanceof ReplyError && error.code === 'provider_error' && !error.message.includes(KEYS.openrouter) && !error.message.includes(KEYS.nvidia)
  );
});

test('a synthesis that broke after it began is not tried again (the words would be written twice); the council gives the members\' answers instead', async () => {
  const w = world({
    answer: async ({ model }) => (model.includes('sonnet')
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'HALF-' } }] })}\n\n`)); setTimeout(() => controller.error(new Error('stream broke')), 10); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      : null)
  });
  const live = [];
  const result = await executeCouncil({ ...specFor(), secrets: secretsOf(), fetchImpl: w.fetchImpl, retryDelayMs: 1, onLive: (event) => live.push(event) });
  assert.equal(onlyModel(w.requests, 'sonnet').length, 1, 'one call to the synthesizer');
  assert.equal(result.status, 'done');
  assert.match(result.parts[0].text, /ANSWER of anthropic\/claude-haiku-4\.5/, 'what the members said, as the council does when the synthesis fails');
});

test('a council taken up after a restart does not ask the models (or the search) again; only the synthesis is made again', async () => {
  const first = world();
  const checkpoints = [];
  const options = { mode: 'deliberation', search: true };
  await executeCouncil({ ...specFor(options), secrets: secretsOf(options), fetchImpl: first.fetchImpl, onCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint); } });
  assert.ok(checkpoints.length >= 4, 'saved as the calls finished');
  const last = checkpoints.at(-1);
  assert.equal(last.version, COUNCIL_CHECKPOINT_VERSION);
  assert.equal(last.kind, 'council');
  assert.equal(JSON.stringify(last).includes(KEYS.openrouter), false, 'a checkpoint never holds a key');
  const memoed = Object.keys(last.memo).length;

  const again = world();
  const result = await executeCouncil({ ...specFor(options), secrets: secretsOf(options), resume: last, fetchImpl: again.fetchImpl });
  assert.equal(result.status, 'done');
  assert.equal(onlyModel(again.requests, 'haiku').length, 0, 'the members are not asked again');
  assert.equal(onlyModel(again.requests, 'deepseek').length, 0);
  assert.equal(again.requests.filter((request) => request.url.includes('tavily')).length, 0, 'nor the search');
  assert.equal(onlyModel(again.requests, 'sonnet').length, 1, 'the synthesis is made again');
  assert.match(result.parts[0].text, /^SYNTH-ANSWER/);
  assert.ok(memoed >= 5);
});

test('a stop keeps what the synthesis had written, and a stop before it leaves nothing', async () => {
  const controller = new AbortController();
  const w = world({
    answer: async ({ model, options }) => (model.includes('sonnet')
      ? new Response(new ReadableStream({
        async start(stream) {
          stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 30));
          if (options.signal?.aborted) { stream.error(new DOMException('Aborted', 'AbortError')); return; }
          stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'world' } }] })}\n\ndata: [DONE]\n\n`));
          stream.close();
        }
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      : null)
  });
  const result = await executeCouncil({ ...specFor(), secrets: secretsOf(), signal: controller.signal, fetchImpl: w.fetchImpl, onUpdate: () => controller.abort() });
  assert.equal(result.status, 'stopped');
  assert.equal(result.parts[0].text, 'Hello ');

  const early = new AbortController();
  early.abort();
  const none = await executeCouncil({ ...specFor(), secrets: secretsOf(), signal: early.signal, fetchImpl: world().fetchImpl });
  assert.equal(none.status, 'stopped');
  assert.equal(none.parts[0].text, '');
});

test('a request for a council is checked: models, keys of their providers, search key, and what may be in it', () => {
  const places = (input) => validateRunSpec(input).errors.map((error) => error.path).join(' ');
  assert.equal(validateRunSpec(rawSpec()).ok, true);
  const accepted = validateRunSpec(rawSpec({ search: true })).spec;
  assert.equal(accepted.model.id, SYNTH, 'the model recorded with the run is the synthesizer\'s');
  assert.equal(accepted.tools.advanced, false);
  assert.deepEqual(Object.keys(accepted.secrets.keys).sort(), ['nvidia', 'openrouter']);

  assert.match(places(rawSpec({ keys: { openrouter: KEYS.openrouter } })), /secrets\.keys\.nvidia/, 'a model whose provider has no key');
  const oneMember = rawSpec(); oneMember.council.participants = oneMember.council.participants.slice(0, 1);
  assert.match(places(oneMember), /council\.participants/);
  const six = rawSpec(); six.council.participants = Array.from({ length: 6 }, (_, index) => ({ ...entry(MEMBER_A), id: `m${index}` }));
  assert.match(places(six), /council\.participants/);
  const twice = rawSpec(); twice.council.participants = [entry(MEMBER_A), entry(MEMBER_A)];
  assert.match(places(twice), /council\.participants/);
  const noSearchKey = rawSpec({ search: true }); delete noSearchKey.secrets.searchKey;
  assert.match(places(noSearchKey), /secrets\.searchKey/);
  const badMode = rawSpec(); badMode.council.mode = 'vote';
  assert.match(places(badMode), /council\.mode/);
  const extra = rawSpec(); extra.secrets.other = 'x'; extra.tools.advanced = true; extra.council.extra = 1;
  assert.match(places(extra), /secrets\.other/);
  assert.match(places(extra), /tools\.advanced/);
  assert.match(places(extra), /council\.extra/);
  const noInstructions = rawSpec(); delete noInstructions.request.systemInstructions.synthesis;
  assert.match(places(noInstructions), /request\.systemInstructions\.synthesis/);
  const unknownProvider = rawSpec(); unknownProvider.council.synthesizer.provider = 'acme';
  assert.match(places(unknownProvider), /council\.synthesizer\.provider/);
});

test('a key is hidden from a message wherever it sits in the secrets', () => {
  const secrets = { keys: { openrouter: 'sk-or-secret-value', nvidia: 'nv-secret-value' }, searchKey: 'tvly-secret-value' };
  const text = scrubMessage('failed with sk-or-secret-value and nv-secret-value and tvly-secret-value', secrets);
  assert.equal(/secret-value/.test(text), false);
  assert.match(text, /\[hidden\]/);
});
