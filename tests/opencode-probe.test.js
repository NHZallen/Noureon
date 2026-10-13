import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { MODELS, THINKING, buildBody, main, parseEvents, probeModel, readAnswer, send, summarizeStream } from '../scripts/opencode-probe.mjs';

const KEY = 'oc_sk_very-secret-key-for-the-test';
const reply = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('the models of the probe are those of the documents: three forms of API, and only the two named free ones are free', () => {
  assert.equal(MODELS.length, 32);
  assert.deepEqual([...new Set(MODELS.map((model) => model.family))].sort(), ['chat', 'messages', 'responses']);
  assert.deepEqual(MODELS.filter((model) => model.free).map((model) => model.id), ['longcat-2.5-preview-free', 'step-5-preview-free']);
  assert.equal(MODELS.find((model) => model.id === 'claude-haiku-5-5').family, 'messages');
  assert.equal(MODELS.find((model) => model.id === 'gpt-6-luna').family, 'responses');
  for (const family of ['chat', 'responses', 'messages']) assert.ok(THINKING[family].length >= 2);
});

test('a request is made in the form of the API of the model: the fields each form wants, and the small number of tokens', () => {
  const chat = buildBody('chat', 'kimi-k3');
  assert.deepEqual([chat.model, chat.max_tokens, chat.messages[0].role], ['kimi-k3', 96, 'user']);
  assert.equal(buildBody('chat', 'kimi-k3', 'basic', { stream: true }).stream_options.include_usage, true);
  assert.equal(buildBody('chat', 'kimi-k3', 'tool').tools[0].function.name, 'get_time');
  assert.equal(buildBody('chat', 'kimi-k3', 'vision').messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'), true);

  const responses = buildBody('responses', 'gpt-6-luna', 'tool');
  assert.deepEqual([typeof responses.input, responses.tools[0].name, responses.tools[0].type], ['string', 'get_time', 'function']);
  assert.equal(buildBody('responses', 'gpt-6-luna', 'vision').input[0].content[1].type, 'input_image');
  assert.ok(buildBody('responses', 'gpt-6-luna').max_output_tokens >= 32);

  const messages = buildBody('messages', 'claude-haiku-5-5', 'vision');
  assert.equal(messages.max_tokens, 96, 'the Messages form wants max_tokens');
  assert.equal(messages.messages[0].content[0].source.type, 'base64');
  assert.equal(buildBody('messages', 'claude-haiku-5-5', 'tool').tools[0].input_schema.type, 'object');
  // A setting that needs more room gives its own number of tokens, and it is the one used.
  const thinking = buildBody('messages', 'qwen3.8-max', 'basic', { extra: Object.fromEntries(THINKING.messages)['thinking:enabled+budget'] });
  assert.deepEqual([thinking.max_tokens, thinking.thinking.budget_tokens], [2048, 1024]);
});

test('an answer is read for its text, its thinking and the calls of tools, in each form', () => {
  assert.deepEqual(readAnswer('chat', { choices: [{ message: { content: 'ok', reasoning_content: 'hmm', tool_calls: [{ function: { name: 'get_time' } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { text: 'ok', thinking: true, thinkingField: 'reasoning_content', toolCalls: ['get_time'], usage: ['completion_tokens', 'prompt_tokens'] });
  const responses = readAnswer('responses', { output: [{ type: 'reasoning' }, { type: 'message', content: [{ text: 'ok' }] }, { type: 'function_call', name: 'get_time' }] });
  assert.deepEqual([responses.text, responses.thinking, responses.toolCalls], ['ok', true, ['get_time']]);
  const messages = readAnswer('messages', { content: [{ type: 'thinking' }, { type: 'text', text: 'ok' }, { type: 'tool_use', name: 'get_time' }], usage: { input_tokens: 1 } });
  assert.deepEqual([messages.text, messages.thinkingField, messages.toolCalls, messages.usage], ['ok', 'content[].thinking', ['get_time'], ['input_tokens']]);
  assert.deepEqual(readAnswer('chat', null).toolCalls, []);
});

test('a stream shows the fields where the text and the thinking come, and whether the numbers of tokens come', () => {
  const chat = ['data: {"choices":[{"delta":{"reasoning_content":"a"}}]}', 'data: {"choices":[{"delta":{"content":"b"}}]}', 'data: {"choices":[],"usage":{"total_tokens":3}}', 'data: [DONE]'].join('\n\n');
  assert.deepEqual(summarizeStream('chat', chat), { events: 3, fields: ['content', 'reasoning_content'], types: [], usage: true, toolCalls: false, done: true });
  const messages = ['event: x', 'data: {"type":"content_block_start","content_block":{"type":"thinking"}}', 'data: {"type":"content_block_start","content_block":{"type":"tool_use"}}', 'data: {"type":"message_delta","usage":{"output_tokens":2}}'].join('\n');
  const summary = summarizeStream('messages', messages);
  assert.deepEqual([summary.fields, summary.usage, summary.toolCalls, summary.done], [['thinking', 'tool_use'], true, true, false]);
  assert.equal(parseEvents('data: not json\ndata: {"a":1}\n').length, 1);
});

test('the key is never kept: what the service says back is cleaned of it, in an error and in an answer', async () => {
  const echo = async () => reply(401, { error: { message: `Bad key ${KEY} for this call` } });
  const refused = await send({ fetchImpl: echo, key: KEY, family: 'chat', body: {} });
  assert.equal(refused.status, 401);
  assert.ok(!JSON.stringify(refused).includes(KEY));
  assert.match(refused.message, /Bad key \*\*\* for this call/);
  const failing = await send({ fetchImpl: async () => { throw new Error(`could not reach ${KEY}`); }, key: KEY, family: 'chat', body: {} });
  assert.deepEqual([failing.status, failing.message.includes(KEY)], [0, false]);
  // The headers: the key as a bearer, the name of the client, a session.
  let seen;
  await send({ fetchImpl: async (url, options) => { seen = { url, headers: options.headers }; return reply(200, {}); }, key: KEY, family: 'messages', body: {}, session: 'probe-1' });
  assert.equal(seen.url, 'https://opencode.ai/inference/go/v1/messages');
  assert.deepEqual([seen.headers.authorization, seen.headers['user-agent'], seen.headers['x-opencode-session']], [`Bearer ${KEY}`, 'Noureon-probe/1', 'probe-1']);
});

test('a model is tried in each test, and a stream that does not take the numbers of tokens is asked again without them', async () => {
  const sent = [];
  const run = async (family, body) => {
    sent.push(body);
    if (body.stream_options) return { status: 400, ok: false, message: 'unknown field stream_options' };
    return { status: 200, ok: true, ms: 5, stream: Boolean(body.stream), raw: body.stream ? 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]' : JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) };
  };
  const result = await probeModel({ model: { id: 'kimi-k3', family: 'chat' }, tests: ['basic', 'stream', 'thinking'], run });
  assert.equal(result.basic.text, 'ok');
  assert.equal(result.stream.includeUsageRefused, true);
  assert.deepEqual(result.stream.withoutIncludeUsage.fields, ['content']);
  assert.deepEqual(Object.keys(result.thinking), THINKING.chat.map(([name]) => name));
  assert.equal(sent.filter((body) => body.reasoning_effort === 'low').length, 1);
});

test('the command: without a key it says so and does nothing; with one it writes a result that does not have the key in it', async () => {
  const messagesOut = [];
  const quiet = { log: (line) => messagesOut.push(line), error: (line) => messagesOut.push(line) };
  assert.equal(await main(['--only', 'kimi-k3'], {}, quiet), 2);
  assert.match(messagesOut.join('\n'), /OPENCODE_GO_KEY/);

  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  try {
    const file = join(dir, 'result.json');
    const fetchImpl = async (url, options) => reply(200, { choices: [{ message: { content: `ok ${options.headers.authorization}` } }] });
    assert.equal(await main(['--only', 'kimi-k3', '--tests', 'basic', '--out', file], { OPENCODE_GO_KEY: KEY }, quiet, fetchImpl), 0);
    const written = readFileSync(file, 'utf8');
    assert.ok(!written.includes(KEY), 'no key in the result');
    assert.equal(JSON.parse(written).models[0].id, 'kimi-k3');
    assert.ok(!messagesOut.join('\n').includes(KEY), 'no key on the screen');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run from the command line, the script really runs, with a relative path as well as an absolute one (it once printed nothing on Windows)', () => {
  const script = join(process.cwd(), 'scripts', 'opencode-probe.mjs');
  const run = (cwd, path) => spawnSync(process.execPath, [path, '--help-that-does-not-exist'], { cwd, encoding: 'utf8', env: { ...process.env, OPENCODE_GO_KEY: '' } });
  for (const result of [run(process.cwd(), script), run(join(process.cwd(), 'scripts'), 'opencode-probe.mjs'), run(join(process.cwd(), 'scripts'), './opencode-probe.mjs')]) {
    assert.ok(`${result.stdout}${result.stderr}`.trim().length > 0, 'the script should say something');
  }
});
