import assert from 'node:assert/strict';
import test from 'node:test';

import { executeReply, ReplyError, scrubMessage } from '../../server/executor.js';
import { liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';

const KEY = 'sk-provider-secret-value';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

const modelInfo = { id: 'openrouter-test', apiId: 'test/model', name: 'Test model', provider: 'openrouter' };
const specFor = (overrides = {}) => ({
  protocol: 1,
  clientVersion: '17.4.0',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 3,
  model: { provider: 'openrouter', id: 'test/model', info: modelInfo },
  request: {
    history: [{ role: 'user', parts: [{ text: 'Earlier question' }] }, { role: 'model', parts: [{ text: 'Earlier answer' }] }],
    currentMessage: { parts: [{ text: 'What is the weather?' }] },
    systemInstruction: 'You are the assistant the browser prepared.',
    language: 'en'
  },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false },
  ...overrides
});
const secrets = { providerKey: KEY, searchKey: 'tavily-secret-value' };

test('a plain reply is the browser\'s request, run on the server, and saved as the browser would save it', async () => {
  const requests = [];
  const updates = [];
  const result = await executeReply({
    spec: specFor(),
    secrets,
    onUpdate: (parts) => updates.push(parts[0].text),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return streamResponse(sse(content('Hello'), content(' there')));
    }
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(result.parts, [{ text: 'Hello there' }], 'nothing but the answer when no page was met');
  assert.deepEqual(updates, ['Hello', 'Hello there'], 'the message as it grows');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, 'test/model');
  assert.match(JSON.stringify(body.messages), /You are the assistant the browser prepared\./, 'the system instruction is the browser\'s, as given');
  assert.match(JSON.stringify(body.messages), /Earlier answer/);
  assert.match(JSON.stringify(body.messages), /What is the weather\?/);
});

test('a model that searches by itself: its calls are answered, pages are numbered, and the saved message carries the record', async () => {
  const requests = [];
  const checkpoints = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } }),
    secrets,
    onCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint); },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url) === 'https://api.tavily.com/search') {
        return new Response(JSON.stringify({ results: [{ title: 'Weather today', url: 'https://weather.example/today', content: 'Sunny, 24 degrees.' }] }), { status: 200 });
      }
      round += 1;
      return streamResponse(round === 1
        ? sse(toolCall('call_1', 'web_search', { query: 'weather today', note: 'Checking the weather.' }))
        : sse(content('It is sunny [1].')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(result.toolCalls, 1);
  const { run, text } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(text, 'It is sunny [1].');
  assert.equal(run.status, 'done');
  assert.equal(run.sources.length, 1);
  assert.deepEqual({ n: run.sources[0].n, url: run.sources[0].url }, { n: 1, url: 'https://weather.example/today' });
  const search = requests.find((request) => request.url === 'https://api.tavily.com/search');
  assert.equal(search.options.headers.Authorization, 'Bearer tavily-secret-value', 'the search key goes to the search service');
  assert.equal(requests.filter((request) => request.url.includes('openrouter')).every((request) => request.options.headers.Authorization === `Bearer ${KEY}`), true);
  assert.equal(checkpoints.length, 1, 'one checkpoint after the one round of calls');
  assert.equal(checkpoints[0].toolTurns.length, 1);
  assert.equal(checkpoints[0].research.used, 1);
  assert.equal(checkpoints[0].sources[0].n, 1);
  assert.equal(JSON.stringify(checkpoints).includes(KEY), false, 'a checkpoint never holds a key');
});

test('a reply taken up after a restart carries on from its checkpoint, with the pages numbered as before', async () => {
  let checkpoint = null;
  let round = 0;
  const first = async (url) => {
    if (String(url) === 'https://api.tavily.com/search') return new Response(JSON.stringify({ results: [{ title: 'Weather today', url: 'https://weather.example/today', content: 'Sunny.' }] }), { status: 200 });
    round += 1;
    if (round === 1) return streamResponse(sse(toolCall('call_1', 'web_search', { query: 'weather today' })));
    throw new Error('the server went down here');
  };
  await assert.rejects(() => executeReply({ spec: specFor({ tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } }), secrets, onCheckpoint: async (value) => { checkpoint = value; }, fetchImpl: first }), ReplyError);
  assert.ok(checkpoint, 'the checkpoint of the finished round was kept');

  // A new process: it starts from the checkpoint and does not search again.
  const requests = [];
  const result = await executeReply({
    spec: specFor({ tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } }),
    secrets,
    resume: checkpoint,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: options.body });
      return streamResponse(sse(content('It is sunny [1].')));
    }
  });
  assert.equal(requests.length, 1, 'only the model is asked, the search is not made again');
  assert.match(requests[0].body, /weather today/, 'what the first round found is sent to the model');
  assert.match(requests[0].body, /\[1\]/, 'with the number it had');
  const { run, text } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(text, 'It is sunny [1].');
  assert.equal(run.sources[0].url, 'https://weather.example/today');
});

test('the provider\'s own search: where the answer cites its pages is marked once it is whole', async () => {
  const geminiInfo = { id: 'gemini-test', apiId: 'gemini-test', name: 'Gemini test', provider: 'gemini' };
  const chunk = (text, extra = {}) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, ...extra }] })}\r\n\r\n`;
  const grounding = { groundingChunks: [{ web: { uri: 'https://one.example/a', title: 'one.example' } }], groundingSupports: [{ segment: { text: 'It is mild today.' }, groundingChunkIndices: [0] }] };
  const requests = [];
  const result = await executeReply({
    spec: specFor({ model: { provider: 'gemini', id: 'gemini-test', info: geminiInfo }, tools: { webSearch: 'grounding', searchProvider: 'tavily', advanced: false } }),
    secrets,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return streamResponse(chunk('It is mild today.') + chunk(' Bring a jacket.', { finishReason: 'STOP', groundingMetadata: grounding }));
    }
  });
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com.*streamGenerateContent/);
  assert.equal(JSON.stringify(requests[0].body.tools).includes('google_search') || JSON.stringify(requests[0].body.tools).includes('googleSearch'), true, 'the provider\'s search is asked for');
  const { run, text } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(text, 'It is mild today.[1] Bring a jacket.');
  assert.equal(run.sources[0].url, 'https://one.example/a');
});

test('a failed reply says why without any key in it', async () => {
  await assert.rejects(
    () => executeReply({ spec: specFor(), secrets, fetchImpl: async () => new Response(JSON.stringify({ error: { message: `Invalid key ${KEY} for this model` } }), { status: 401 }) }),
    (error) => {
      assert.equal(error.code, 'provider_error');
      assert.match(error.message, /Invalid key/);
      assert.doesNotMatch(error.message, new RegExp(KEY));
      return true;
    }
  );
  assert.equal(scrubMessage(`bad ${KEY} and tavily-secret-value`, secrets), 'bad [hidden] and [hidden]');
  assert.equal(scrubMessage('x'.repeat(500), secrets).length, 300);
  await assert.rejects(() => executeReply({ spec: specFor(), secrets, fetchImpl: async () => streamResponse(sse()) }), /no answer/);
});

test('a stop keeps what was written', async () => {
  const controller = new AbortController();
  controller.abort('stopped');
  const stopped = await executeReply({ spec: specFor(), secrets, signal: controller.signal, fetchImpl: async () => { throw new DOMException('Aborted', 'AbortError'); } });
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(stopped.parts, [{ text: '' }]);
});

test('every small piece is given to those watching live as it comes: the start, the answer, the thinking, the pages found', async () => {
  const events = [];
  await executeReply({
    spec: specFor(),
    secrets,
    onLive: (event) => events.push(event),
    fetchImpl: async () => streamResponse(sse({ choices: [{ delta: { reasoning: 'Let me think' } }] }, content('Hel'), content('lo')))
  });
  assert.deepEqual(events[0], { r: { answer: '', thought: { text: '', kind: 'model', ms: 0, ended: false }, sources: [], elapsedMs: 0 } }, 'what there is at the start');
  assert.deepEqual(events.filter((event) => event.a !== undefined).map((event) => event.a), ['Hel', 'lo']);
  assert.ok(events.some((event) => typeof event.th === 'string' && event.th.includes('think')), 'the thinking too');
  const resumed = [];
  await executeReply({
    spec: specFor(),
    secrets,
    resume: { toolTurns: [], text: 'Half an ans', research: null, sources: [{ url: 'https://a.example', title: 'A', n: 1 }] },
    onLive: (event) => resumed.push(event),
    fetchImpl: async () => streamResponse(sse(content('wer')))
  });
  assert.equal(resumed[0].r.answer, 'Half an ans', 'a reply taken up again starts from what it had');
  assert.equal(resumed[0].r.sources.length, 1);
});

test('the times pages show come from the server: the reply\'s own clock, and how long it thought, said once when the answer starts', async () => {
  let clock = 1000;
  const events = [];
  await executeReply({
    spec: specFor(),
    secrets,
    now: () => clock,
    onLive: (event) => events.push(event),
    fetchImpl: async () => {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'a' } }] })}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 5));
          clock += 4000;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'b' } }] })}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 5));
          clock += 2000;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(content('Hi'))}\n\ndata: [DONE]\n\n`));
          controller.close();
        }
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
  });
  const ended = events.filter((event) => typeof event.te === 'number');
  assert.equal(ended.length, 1, 'said once');
  assert.equal(ended[0].te, 6000, 'from the first thought to the first words of the answer');
  assert.ok(events.indexOf(ended[0]) < events.findIndex((event) => event.a === 'Hi'), 'before the answer');
});
