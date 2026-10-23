import assert from 'node:assert/strict';
import test from 'node:test';

import { absorb, advice, buildRequest, defaultLength, limitFromRefusal, listedLimits, modelsToAsk, runProbe } from '../scripts/output-limit-probe.mjs';

const KEY = 'sk-secret-key-for-the-test';
const sse = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const streamOf = (events) => new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
// A stream that goes on for ever (a provider with no limit in sight): it gives a chunk each time it is asked, until it is cancelled.
const endless = (chunk) => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (cancelled) return;
      controller.enqueue(new TextEncoder().encode(sse([chunk])));
    },
    cancel() { cancelled = true; }
  });
  return { response: new Response(body, { status: 200 }), wasCancelled: () => cancelled };
};

test('the models asked are the text models of the three providers and the forms of OpenCode that are sent no limit; an id of the app or of the provider picks them', () => {
  const by = (providers) => modelsToAsk({ providers }).length;
  assert.equal(by(['gemini']), 3);
  assert.equal(by(['nvidia']), 6);
  assert.equal(by(['openrouter']), 29, 'the picture models are not asked');
  const opencode = modelsToAsk({ providers: ['opencode'] });
  assert.ok(opencode.length > 15 && opencode.every((row) => ['chat', 'responses'].includes(row.form)));
  assert.equal(opencode.some((row) => row.apiId === 'claude-haiku-5-5'), false, 'the Messages form is given a limit by the app');
  assert.equal(opencode.some((row) => row.apiId === 'gemini-4-argon-contributor'), false);
  assert.deepEqual(modelsToAsk({ providers: ['gemini', 'nvidia'], only: ['gemini-4-argon', 'z-ai/glm-5.3'] }).map((row) => row.apiId), ['gemini-4-argon', 'z-ai/glm-5.3']);
  assert.equal(modelsToAsk({ providers: ['nvidia'] })[0].apiId.startsWith('nvidia/nvidia/'), false, 'the id of the provider, not the id of the app');
});

test('a request gives no limit unless one is asked for, in the field each form uses', () => {
  const hasLimit = (request) => JSON.stringify(request.body).match(/max_tokens|max_output_tokens|maxOutputTokens/) !== null;
  for (const [provider, form] of [['openrouter', 'chat'], ['nvidia', 'chat'], ['opencode', 'chat'], ['opencode', 'responses'], ['gemini', 'gemini']]) {
    assert.equal(hasLimit(buildRequest({ provider, apiId: 'm', form, key: KEY })), false, `${provider} ${form}`);
  }
  assert.equal(buildRequest({ provider: 'nvidia', apiId: 'm', form: 'chat', key: KEY, limit: 99, stream: false }).body.max_tokens, 99);
  assert.equal(buildRequest({ provider: 'opencode', apiId: 'm', form: 'responses', key: KEY, limit: 99 }).body.max_output_tokens, 99);
  assert.equal(buildRequest({ provider: 'gemini', apiId: 'gemini-4-argon', form: 'gemini', key: KEY, limit: 99 }).body.generationConfig.maxOutputTokens, 99);
  const gemini = buildRequest({ provider: 'gemini', apiId: 'gemini-4-argon', form: 'gemini', key: KEY });
  assert.match(gemini.url, /models\/gemini-4-argon:streamGenerateContent\?alt=sse$/);
  assert.equal(gemini.headers['x-goog-api-key'], KEY);
  assert.equal(buildRequest({ provider: 'openrouter', apiId: 'm', form: 'chat', key: KEY }).headers.authorization, `Bearer ${KEY}`);
  assert.equal(buildRequest({ provider: 'opencode', apiId: 'm', form: 'chat', key: KEY }).headers['x-opencode-session'], 'noureon-output-probe');
});

test('a stream is counted by the form of its API: what is written, what is thought, how it ended, and the tokens the provider counted', () => {
  const run = (form, events) => {
    const state = { visibleChars: 0, reasoningChars: 0, finish: '', tokens: null };
    for (const event of events) absorb(form, event, state);
    return state;
  };
  assert.deepEqual(run('chat', [{ choices: [{ delta: { reasoning_content: 'abc' } }] }, { choices: [{ delta: { content: 'hello' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }, { choices: [], usage: { completion_tokens: 777 } }]), { visibleChars: 5, reasoningChars: 3, finish: 'length', tokens: 777 });
  assert.deepEqual(run('responses', [{ type: 'response.output_text.delta', delta: 'hi' }, { type: 'response.reasoning_summary_text.delta', delta: 'abcd' }, { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { output_tokens: 50 } } }]), { visibleChars: 2, reasoningChars: 4, finish: 'max_output_tokens', tokens: 50 });
  assert.equal(run('responses', [{ type: 'response.completed', response: { status: 'completed', usage: { output_tokens: 9 } } }]).finish, 'stop');
  assert.deepEqual(run('gemini', [{ candidates: [{ content: { parts: [{ text: 'xy' }, { text: 'zzz', thought: true }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { candidatesTokenCount: 10, thoughtsTokenCount: 5 } }]), { visibleChars: 2, reasoningChars: 3, finish: 'MAX_TOKENS', tokens: 15 });
});

test('the default of a provider: cut at its own limit says that limit, a stream that goes on is not cut and is stopped here, a short answer tells nothing, an error is said without the key', async () => {
  const cut = await defaultLength({ provider: 'nvidia', apiId: 'm', form: 'chat', key: KEY, fetchImpl: async () => streamOf([{ choices: [{ delta: { content: 'x'.repeat(3000) } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }, { choices: [], usage: { completion_tokens: 1024 } }]) });
  assert.deepEqual([cut.verdict, cut.tokensWritten, cut.finish], ['cut', 1024, 'length']);
  const estimated = await defaultLength({ provider: 'gemini', apiId: 'm', form: 'gemini', key: KEY, fetchImpl: async () => streamOf([{ candidates: [{ content: { parts: [{ text: 'x'.repeat(3000) }] }, finishReason: 'MAX_TOKENS' }] }]) });
  assert.deepEqual([estimated.verdict, estimated.tokensWritten], ['cut', 1000], 'without a count from the provider: the characters over three');

  const stream = endless({ choices: [{ delta: { content: 'y'.repeat(500) } }] });
  const notCut = await defaultLength({ provider: 'openrouter', apiId: 'm', form: 'chat', key: KEY, stopChars: 2000, fetchImpl: async () => stream.response });
  assert.equal(notCut.verdict, 'not cut');
  assert.ok(notCut.written >= 2000);
  assert.equal(stream.wasCancelled(), true, 'the request is stopped here, not left to run');

  const ended = await defaultLength({ provider: 'openrouter', apiId: 'm', form: 'chat', key: KEY, fetchImpl: async () => streamOf([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]) });
  assert.equal(ended.verdict, 'ended');

  const failed = await defaultLength({ provider: 'nvidia', apiId: 'm', form: 'chat', key: KEY, fetchImpl: async () => new Response(`bad key ${KEY}`, { status: 401 }) });
  assert.deepEqual([failed.verdict, failed.status], ['error', 401]);
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(KEY));
});

test('the official limits are read from what OpenRouter and Gemini list, and from the refusal where nothing is listed', async () => {
  const openrouter = await listedLimits({ provider: 'openrouter', fetchImpl: async () => Response.json({ data: [{ id: 'a/b', context_length: 200000, top_provider: { max_completion_tokens: 64000 } }, { id: 'c/d', context_length: 1000, top_provider: {} }] }) });
  assert.deepEqual(openrouter.get('a/b'), { official: 64000, context: 200000, source: 'openrouter /models' });
  assert.equal(openrouter.get('c/d').official, null);
  const seen = [];
  const gemini = await listedLimits({ provider: 'gemini', key: KEY, fetchImpl: async (url, init) => { seen.push(init.headers['x-goog-api-key']); return Response.json({ models: [{ name: 'models/gemini-4-argon', outputTokenLimit: 65536, inputTokenLimit: 1048576 }] }); } });
  assert.equal(gemini.get('gemini-4-argon').official, 65536);
  assert.deepEqual(seen, [KEY]);
  assert.equal((await listedLimits({ provider: 'gemini', fetchImpl: async () => { throw new Error('no key: not asked'); } })).size, 0);

  const refusal = await limitFromRefusal({ provider: 'nvidia', apiId: 'm', form: 'chat', key: KEY, fetchImpl: async () => new Response('{"error":"Max tokens must not exceed 1048576, got 10000000"}', { status: 400 }) });
  assert.deepEqual([refusal.official, refusal.source], [1048576, 'refusal']);
  const context = await limitFromRefusal({ provider: 'opencode', apiId: 'm', form: 'responses', key: KEY, fetchImpl: async () => new Response("The input plus the requested output exceeds the model's context window of 1048576 tokens.", { status: 400 }) });
  assert.deepEqual([context.official, context.context], [null, 1048576], 'the context window is not a limit of the output');
  assert.equal((await limitFromRefusal({ provider: 'nvidia', apiId: 'm', form: 'chat', key: KEY, fetchImpl: async () => Response.json({}) })).accepted, 10_000_000);
});

test('the advice says what to do with each model, and a run asks every model once, leaves out a provider with no key, and never keeps a key', async () => {
  assert.match(advice({ official: { official: 8192 }, default: { verdict: 'cut', tokensWritten: 1024 } }), /cuts it at about 1024.*send the official 8192/);
  assert.match(advice({ official: { official: 65536 }, default: { verdict: 'not cut', written: 60000 } }), /sending none is fine/);
  assert.match(advice({ default: { verdict: 'ended' } }), /stopped by itself/);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('/models?')) return Response.json({ models: [{ name: 'models/gemini-4-argon', outputTokenLimit: 65536 }] });
    if (String(url).endsWith('/models')) return Response.json({ data: [] });
    return streamOf([{ candidates: [{ content: { parts: [{ text: 'x'.repeat(3000) }] }, finishReason: 'MAX_TOKENS' }] }]);
  };
  const lines = [];
  const result = await runProbe({ fetchImpl, env: { GEMINI_API_KEY: KEY }, providers: ['gemini', 'nvidia'], only: ['gemini-4-argon', 'z-ai/glm-5.3'], log: (line) => lines.push(line), delayMs: 0 });
  assert.deepEqual(result.skipped, [{ provider: 'nvidia', reason: 'no NVIDIA_API_KEY' }]);
  const gemini = result.rows.find((row) => row.apiId === 'gemini-4-argon');
  assert.deepEqual([gemini.official.official, gemini.default.verdict], [65536, 'cut']);
  assert.equal(result.rows.find((row) => row.apiId === 'z-ai/glm-5.3').default, undefined, 'nothing is asked of a provider with no key');
  assert.doesNotMatch(JSON.stringify(result) + lines.join('\n'), new RegExp(KEY));
  assert.equal(calls.filter((url) => url.includes('streamGenerateContent')).length, 1);
});
