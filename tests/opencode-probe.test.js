import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { MODELS, OFFICE_FILES, THINKING, buildBody, main, parseEvents, probeModel, probeToolLoop, readAnswer, send, summarizeStream } from '../scripts/opencode-probe.mjs';

const KEY = 'oc_sk_very-secret-key-for-the-test';
const reply = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('the models of the probe are those of the documents: three forms of API, and only the two named free ones are free', () => {
  assert.equal(MODELS.length, 40);
  assert.deepEqual([...new Set(MODELS.map((model) => model.family))].sort(), ['chat', 'gemini', 'messages', 'responses']);
  assert.deepEqual(MODELS.filter((model) => model.free).map((model) => model.id), ['longcat-2.5-preview-free', 'step-5-preview-free', 'cat-jam-free']);
  assert.equal(MODELS.find((model) => model.id === 'claude-haiku-5-5').family, 'messages');
  assert.equal(MODELS.find((model) => model.id === 'gpt-6-luna').family, 'responses');
  for (const family of ['chat', 'responses', 'messages', 'gemini']) assert.ok(THINKING[family].length >= 2);
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
  assert.deepEqual(readAnswer('chat', { choices: [{ message: { content: 'ok', reasoning_content: 'hmm', tool_calls: [{ function: { name: 'get_time' } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { text: 'ok', thinking: true, thinkingField: 'reasoning_content', toolCalls: ['get_time'], usage: ['completion_tokens', 'prompt_tokens'], tokens: { output: 1, thinking: null } });
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

test('a model whose form of API is only a guess is tried in the other forms when the guess is refused, and the form that answers is kept', async () => {
  const seen = [];
  const run = async (family) => {
    seen.push(family);
    return family === 'responses' ? { status: 200, ok: true, ms: 1, raw: JSON.stringify({ output: [] }) } : { status: 404, ok: false, message: 'no' };
  };
  const result = await probeModel({ model: { id: 'omen-alpha', family: 'chat', guess: true }, tests: ['basic'], run });
  assert.deepEqual(seen.slice(0, 2), ['chat', 'responses']);
  assert.equal(result.family, 'responses');
  assert.equal(result.formsTried.chat.status, 404);
});

test('one 429 does not stop the run (a free model whose endpoint is unavailable says it), four in a row do', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  const quiet = { log: () => {}, error: () => {} };
  try {
    let calls = 0;
    const once = async () => {
      calls += 1;
      return calls === 2 ? reply(429, { error: { message: 'Endpoint is unavailable.' } }) : reply(200, { choices: [{ message: { content: 'ok' } }] });
    };
    assert.equal(await main(['--only', 'kimi-k3,glm-5.3', '--tests', 'basic', '--out', join(dir, 'a.json')], { OPENCODE_GO_KEY: KEY }, quiet, once), 0);
    assert.equal(calls, 2);
    const always = async () => reply(429, { error: { message: 'limit' } });
    assert.equal(await main(['--only', 'kimi-k3,glm-5.3,glm-5.2,kimi-k2.6,hy3', '--tests', 'basic', '--out', join(dir, 'b.json')], { OPENCODE_GO_KEY: KEY }, quiet, always), 1);
    const stopped = JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8')).models.filter((model) => model.basic.status === 0);
    assert.ok(stopped.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a model whose endpoint is unavailable is left alone for the rest of the run and does not stop the others', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  const quiet = { log: () => {}, error: () => {} };
  try {
    const seen = [];
    const fetchImpl = async (url, options) => {
      const { model } = JSON.parse(options.body);
      seen.push(model);
      return model === 'glm-5.3' ? reply(429, { error: { message: 'Upstream request failed: Endpoint is unavailable.' } }) : reply(200, { choices: [{ message: { content: 'ok' } }] });
    };
    const file = join(dir, 'r.json');
    assert.equal(await main(['--only', 'glm-5.3,kimi-k3', '--tests', 'basic,stream,tools', '--out', file], { OPENCODE_GO_KEY: KEY }, quiet, fetchImpl), 0);
    assert.equal(seen.filter((model) => model === 'glm-5.3').length, 1);
    const written = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(written.models[1].basic.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--max-tokens raises the limit of every request, in the field of its form of API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  const quiet = { log: () => {}, error: () => {} };
  try {
    const bodies = [];
    const fetchImpl = async (url, options) => {
      bodies.push({ url, body: JSON.parse(options.body) });
      return reply(200, { choices: [{ message: { content: 'ok' } }], output: [] });
    };
    await main(['--only', 'muse-spark-1.3-contributor,kimi-k3', '--tests', 'basic', '--max-tokens', '1500', '--out', join(dir, 'a.json')], { OPENCODE_GO_KEY: KEY }, quiet, fetchImpl);
    assert.equal(bodies.find((entry) => entry.url.endsWith('/responses')).body.max_output_tokens, 1500);
    assert.equal(bodies.find((entry) => entry.url.endsWith('/chat/completions')).body.max_tokens, 1500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the tool loop: the first step gives the call, the second step sends the answer of the tool back with and without the thinking, in each form of API', async () => {
  const seen = [];
  const run = async (family, body) => {
    seen.push({ family, body });
    if (seen.filter((entry) => entry.family === family).length === 1) {
      const answers = {
        chat: { choices: [{ message: { content: '', reasoning_content: 'hm', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_time', arguments: '{"city":"Paris"}' } }] } }] },
        responses: { output: [{ type: 'reasoning', id: 'r1', summary: [] }, { type: 'function_call', id: 'f1', call_id: 'c1', name: 'get_time', arguments: '{}' }] },
        messages: { content: [{ type: 'thinking', thinking: 'hm', signature: 's' }, { type: 'tool_use', id: 'c1', name: 'get_time', input: { city: 'Paris' } }] }
      };
      return { status: 200, ok: true, ms: 1, raw: JSON.stringify(answers[family]) };
    }
    return { status: 200, ok: true, ms: 1, raw: JSON.stringify({ choices: [{ message: { content: '14:05' } }], output: [], content: [{ type: 'text', text: '14:05' }] }) };
  };
  for (const family of ['chat', 'responses', 'messages']) {
    const result = await probeToolLoop({ model: { id: 'x' }, family, run });
    assert.equal(Object.keys(result).filter((name) => /^[AB]:/.test(name)).length, 2, family);
  }
  const chatB = seen.filter((entry) => entry.family === 'chat')[2].body;
  assert.equal(chatB.messages[1].reasoning_content, undefined);
  assert.equal(chatB.messages[2].role, 'tool');
  const messagesA = seen.filter((entry) => entry.family === 'messages')[1].body;
  assert.equal(messagesA.messages[1].content[0].type, 'thinking');
  assert.equal(messagesA.messages[2].content[0].type, 'tool_result');
  const responsesB = seen.filter((entry) => entry.family === 'responses')[2].body;
  assert.deepEqual(responsesB.input.map((item) => item.type || item.role), ['user', 'function_call', 'function_call_output']);
  const refused = await probeToolLoop({ model: { id: 'x' }, family: 'chat', run: async () => ({ status: 400, ok: false, message: 'no' }) });
  assert.equal(refused.skipped, 'the first step failed');
});

test('the params test tries temperature, top_p and a long output, each alone, in the form of the model', async () => {
  const seen = [];
  const run = async (family, body) => {
    seen.push({ family, body });
    return { status: 200, ok: true, ms: 1, raw: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) };
  };
  const result = await probeModel({ model: { id: 'gpt-6-luna', family: 'responses' }, tests: ['params'], run });
  assert.deepEqual(Object.keys(result.params), ['temperature', 'top_p', 'max_tokens:16384']);
  assert.equal(seen[0].body.temperature, 0.7);
  assert.equal(seen[1].body.top_p, 0.95);
  assert.equal(seen[2].body.max_output_tokens, 16384);
});

test('the effort test tries each depth of thinking alone, in the setting of the form of the model, and reports the numbers of tokens', async () => {
  const seen = [];
  const run = async (family, body) => {
    seen.push({ family, body });
    return { status: 200, ok: true, ms: 1, raw: JSON.stringify({ choices: [{ message: { content: '370', reasoning_content: 'x' } }], usage: { completion_tokens: 40, completion_tokens_details: { reasoning_tokens: 30 } } }) };
  };
  const chat = await probeModel({ model: { id: 'kimi-k3', family: 'chat' }, tests: ['effort'], run });
  assert.deepEqual(Object.keys(chat.effort), ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(seen[2].body.reasoning_effort, 'low');
  assert.match(JSON.stringify(seen[0].body.messages), /17 times 24/);
  assert.deepEqual(chat.effort.low.tokens, { output: 40, thinking: 30 });
  seen.length = 0;
  await probeModel({ model: { id: 'gpt-6-luna', family: 'responses' }, tests: ['effort'], run });
  assert.deepEqual(seen[3].body.reasoning, { effort: 'medium' });
  seen.length = 0;
  const messages = await probeModel({ model: { id: 'claude-haiku-5-5', family: 'messages' }, tests: ['effort'], run });
  assert.deepEqual(Object.keys(messages.effort), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(seen[0].body.thinking, { type: 'adaptive' });
  assert.deepEqual(seen[0].body.output_config, { effort: 'low' });
});

test('the document test sends a one-page PDF in the way of each form of API', () => {
  const file = buildBody('chat', 'kimi-k3', 'document').messages[0].content[1];
  assert.deepEqual([file.type, file.file.filename, file.file.file_data.startsWith('data:application/pdf;base64,JVBER')], ['file', 'probe.pdf', true]);
  const input = buildBody('responses', 'gpt-6-luna', 'document').input[0].content[1];
  assert.deepEqual([input.type, input.file_data.startsWith('data:application/pdf;base64,JVBER')], ['input_file', true]);
  const block = buildBody('messages', 'claude-haiku-5-5', 'document').messages[0].content[0];
  assert.deepEqual([block.type, block.source.type, block.source.media_type], ['document', 'base64', 'application/pdf']);
  assert.ok(Buffer.from(block.source.data, 'base64').toString('latin1').includes('MANGO'));
});

test('the probe of Google\'s form: the model in the path, the body in Google\'s shape, the answer read (text, thoughts, calls, tokens), the key sent as asked', async () => {
  const seen = [];
  const run = async (family, body, options = {}) => {
    seen.push({ family, body, options });
    const answer = { candidates: [{ content: { parts: [{ text: 'hm', thought: true }, { text: 'ok' }, { functionCall: { name: 'get_time', args: { city: 'Paris' } } }] } }], usageMetadata: { candidatesTokenCount: 4, thoughtsTokenCount: 9, totalTokenCount: 20 } };
    return { status: 200, ok: true, ms: 1, raw: options.stream ? `data: ${JSON.stringify(answer)}\n\n` : JSON.stringify(answer), stream: Boolean(options.stream) };
  };
  const result = await probeModel({ model: { id: 'gemini-4-argon-contributor', family: 'gemini' }, tests: ['basic', 'stream', 'effort', 'vision', 'document', 'auth'], run, key: 'oc_sk_secret' });
  assert.equal(result.basic.text, 'ok');
  assert.equal(result.basic.thinking, true);
  assert.deepEqual(result.basic.tokens, { output: 4, thinking: 9 });
  assert.deepEqual(result.basic.toolCalls, ['get_time']);
  assert.deepEqual(result.stream.fields, ['functionCall', 'text', 'thought']);
  assert.equal(result.stream.usage, true);
  assert.deepEqual(Object.keys(result.effort), ['minimal', 'low', 'medium', 'high']);
  const effortBody = seen.find((entry) => entry.body.generationConfig?.thinkingConfig?.thinkingLevel === 'low').body;
  assert.equal(effortBody.generationConfig.maxOutputTokens, 1500);
  assert.equal(effortBody.__model, 'gemini-4-argon-contributor');
  assert.ok(seen.find((entry) => entry.body.contents?.[0].parts.some((part) => part.inlineData?.mimeType === 'image/png')));
  assert.ok(seen.find((entry) => entry.body.contents?.[0].parts.some((part) => part.inlineData?.mimeType === 'application/pdf')));
  assert.deepEqual(Object.keys(result.auth), ['bearerOnly', 'xGoogApiKeyOnly', 'both']);
  assert.equal(seen.find((entry) => entry.options.key === '').options.headers['x-goog-api-key'], 'oc_sk_secret');

  // The request itself: the model is in the path, not in the body, and the stream asks for lines.
  let sent = null;
  await send({ fetchImpl: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return reply(200, {}); }, key: KEY, family: 'gemini', body: buildBody('gemini', 'gemini-4-argon-contributor'), stream: true });
  assert.match(sent.url, /\/models\/gemini-4-argon-contributor:streamGenerateContent\?alt=sse$/);
  assert.equal('__model' in sent.body || 'model' in sent.body, false);
  await send({ fetchImpl: async (url) => { sent = { url }; return reply(200, {}); }, key: KEY, family: 'gemini', body: buildBody('gemini', 'gemini-4-argon-contributor') });
  assert.match(sent.url, /:generateContent$/);
  assert.equal(parseEvents('[{"a":1},{"b":2}]').length, 2);
});

test('the probe of Word and PowerPoint files: each form sends the file as it is, with its own type, and the answer is kept under office', async () => {
  const seen = [];
  const run = async (family, body) => { seen.push({ family, body }); return { status: 200, ok: true, ms: 1, raw: JSON.stringify({ choices: [{ message: { content: 'MANGO' } }] }) }; };
  const result = await probeModel({ model: { id: 'kimi-k3', family: 'chat' }, tests: ['office'], run });
  assert.deepEqual(Object.keys(result.office), ['docx', 'pptx']);
  assert.equal(result.office.docx.text, 'MANGO');
  const file = (entry) => entry.body.messages[0].content.find((part) => part.type === 'file').file;
  assert.match(file(seen[0]).file_data, new RegExp(`^data:${OFFICE_FILES.docx.mime};base64,UEsD`), 'a docx is a zip: it starts with PK');
  assert.match(file(seen[1]).file_data, new RegExp(`^data:${OFFICE_FILES.pptx.mime};base64,UEsD`));
  const body = (family, kind) => buildBody(family, 'm', kind);
  assert.ok(body('responses', 'docx').input[0].content.some((part) => part.type === 'input_file' && part.filename === 'probe.docx'));
  assert.ok(body('messages', 'pptx').messages[0].content.some((part) => part.type === 'document' && part.source.media_type === OFFICE_FILES.pptx.mime));
  assert.ok(body('gemini', 'docx').contents[0].parts.some((part) => part.inlineData?.mimeType === OFFICE_FILES.docx.mime));
});

test('the probe of converted files: the PDF made of the Word or PowerPoint file goes as a PDF in each form; a run that asks for it says what is missing first', async () => {
  const { existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const there = ['docx', 'pptx'].every((kind) => existsSync(new URL(`../scripts/probe-files/converted-${kind}.pdf`, import.meta.url)));
  if (there) {
    assert.ok(buildBody('chat', 'm', 'convdocx').messages[0].content.some((part) => part.file?.file_data.startsWith('data:application/pdf;base64,')));
    assert.ok(buildBody('gemini', 'm', 'convpptx').contents[0].parts.some((part) => part.inlineData?.mimeType === 'application/pdf'));
  } else {
    assert.throws(() => buildBody('chat', 'm', 'convdocx'), /converted-docx\.pdf is missing/);
    const errors = [];
    const code = await main(['--tests', 'converted', '--only', 'kimi-k3'], { OPENCODE_GO_KEY: 'k' }, { log() {}, error: (line) => errors.push(line) }, async () => { throw new Error('no network'); });
    assert.equal(code, 2);
    assert.match(errors.join(' '), /save it as PDF/);
  }
  // The default run does not include it.
  const seen = [];
  await main(['--only', 'kimi-k3', '--tests', 'basic', '--out', join(tmpdir(), `opencode-probe-test-${process.pid}.json`)], { OPENCODE_GO_KEY: 'k' }, { log() {}, error() {} }, async (url) => { seen.push(url); return reply(200, {}); });
  assert.ok(seen.length >= 1);
});
