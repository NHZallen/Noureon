import assert from 'node:assert/strict';
import test from 'node:test';

import { askOnce, runProbe, variantsFor, verdictOf } from '../scripts/thinking-shown-probe.mjs';

const KEY = 'sk-secret-key-for-the-test';
const sse = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const stream = (events) => new Response(sse(events), { status: 200 });
const thinks = (text) => ({ choices: [{ delta: { reasoning: text } }] });
const answers = (text) => ({ choices: [{ delta: { content: text }, finish_reason: 'stop' }] });

test('each provider is asked in the ways the app asks it: OpenRouter with a depth (and the Responses form for OpenAI), NVIDIA with its two fields, Gemini with includeThoughts', () => {
  const names = (provider, apiId) => variantsFor({ provider, apiId }).map((variant) => variant.name);
  assert.deepEqual(names('openrouter', 'anthropic/claude-haiku-5.5'), ['default', 'asked']);
  assert.deepEqual(names('openrouter', 'openai/gpt-6-luna'), ['default', 'asked', 'responses']);
  assert.deepEqual(variantsFor({ provider: 'openrouter', apiId: 'openai/gpt-6-luna' })[2].extra, { reasoning: { effort: 'medium', summary: 'auto' } });
  assert.deepEqual(variantsFor({ provider: 'nvidia', apiId: 'z-ai/glm-5.3' })[1].extra, { reasoning_effort: 'medium', chat_template_kwargs: { enable_thinking: true, thinking: true } });
  assert.deepEqual(variantsFor({ provider: 'gemini', apiId: 'gemini-4-argon' })[1].extra, { generationConfig: { thinkingConfig: { includeThoughts: true } } });
});

test('a request is read until enough thinking has come (and stopped there), an answer with none says none, an error is said without the key', async () => {
  const sent = [];
  const row = { provider: 'openrouter', apiId: 'm/x' };
  const rich = await askOnce({ row, variant: { name: 'asked', form: 'chat', extra: { reasoning: { effort: 'medium' } } }, key: KEY, fetchImpl: async (url, init) => { sent.push([url, JSON.parse(init.body)]); return stream([thinks('a'.repeat(150)), thinks('b'.repeat(150)), answers('ok')]); } });
  assert.equal(rich.ok, true);
  assert.ok(rich.thinkingChars >= 200);
  assert.deepEqual(sent[0][1].reasoning, { effort: 'medium' });
  assert.equal(sent[0][1].stream, true);
  const quiet = await askOnce({ row, variant: { name: 'default', form: 'chat', extra: {} }, key: KEY, fetchImpl: async () => stream([answers('ok')]) });
  assert.deepEqual([quiet.ok, quiet.thinkingChars, quiet.answerChars], [true, 0, 2]);
  const failed = await askOnce({ row, variant: { name: 'default', form: 'chat', extra: {} }, key: KEY, fetchImpl: async () => new Response(`bad ${KEY}`, { status: 401 }) });
  assert.deepEqual([failed.ok, failed.status], [false, 401]);
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(KEY));
  const responses = await askOnce({ row: { provider: 'openrouter', apiId: 'openai/gpt-6-luna' }, variant: { name: 'responses', form: 'responses', extra: { reasoning: { summary: 'auto' } } }, key: KEY, fetchImpl: async (url) => { sent.push([url]); return stream([{ type: 'response.reasoning_summary_text.delta', delta: 'c'.repeat(250) }]); } });
  assert.equal(responses.ok && responses.thinkingChars >= 200, true);
  assert.match(sent.at(-1)[0], /openrouter\.ai\/api\/v1\/responses$/);
});

test('the verdict of a model: by default, only when asked, only in the Responses form, none, or error', () => {
  const ok = (name, thinkingChars) => ({ name, ok: true, thinkingChars });
  assert.equal(verdictOf([ok('default', 300), ok('asked', 300)]), 'by default');
  assert.equal(verdictOf([ok('default', 0), ok('asked', 250)]), 'only when asked');
  assert.equal(verdictOf([ok('default', 0), ok('asked', 0), ok('responses', 220)]), 'only in the Responses form');
  assert.equal(verdictOf([ok('default', 0), ok('asked', 0), ok('responses', 0)]), 'none');
  assert.equal(verdictOf([{ name: 'default', ok: false }, { name: 'asked', ok: false }]), 'error');
  assert.equal(verdictOf([ok('default', 0), { name: 'asked', ok: false }]), 'error', 'a refused variant cannot say that nothing comes');
});

test('a run asks each model in each way, leaves out a provider with no key, and never keeps a key', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    const body = JSON.parse(init.body);
    return stream(body.reasoning ? [thinks('t'.repeat(300))] : [answers('ok')]);
  };
  const lines = [];
  const result = await runProbe({ fetchImpl, env: { OPENROUTER_API_KEY: KEY }, providers: ['openrouter', 'nvidia'], only: ['openai/gpt-6-luna', 'z-ai/glm-5.3'], log: (line) => lines.push(line), delayMs: 0 });
  assert.deepEqual(result.skipped, [{ provider: 'nvidia', reason: 'no NVIDIA_API_KEY' }]);
  const luna = result.rows.find((row) => row.apiId === 'openai/gpt-6-luna');
  assert.equal(luna.verdict, 'only when asked');
  assert.equal(luna.results.length, 3);
  assert.equal(calls.filter((url) => url.endsWith('/responses')).length, 1);
  assert.doesNotMatch(JSON.stringify(result) + lines.join('\n'), new RegExp(KEY));
});
