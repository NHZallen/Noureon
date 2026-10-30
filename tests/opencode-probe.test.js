import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { MODELS, OFFICE_FILES, THINKING, askedThinkingFields, buildBody, contextNamed, limitNamed, main, modelsNamed, newModels, parseEvents, probeMaxOut, probeModel, probeShown, probeToolLoop, readAnswer, send, summarizeStream, thinkingOfStream } from '../scripts/opencode-probe.mjs';

const KEY = 'oc_sk_very-secret-key-for-the-test';
const reply = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('the models of the probe are those of the app (the page of limits of OpenCode): four forms of API, and only the two named free ones are free', () => {
  assert.equal(MODELS.length, 30);
  assert.deepEqual([...new Set(MODELS.map((model) => model.family))].sort(), ['chat', 'gemini', 'messages', 'responses']);
  assert.deepEqual(MODELS.filter((model) => model.free).map((model) => model.id), ['longcat-2.5-preview-free', 'beam-free']);
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
    assert.equal(await main(['--only', 'kimi-k3,glm-5.3,glm-5.2,kimi-k2.7-code,hy3', '--tests', 'basic', '--out', join(dir, 'b.json')], { OPENCODE_GO_KEY: KEY }, quiet, always), 1);
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
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // Whether the PDFs are there depends on the machine: they are made from the Word and PowerPoint files when LibreOffice is installed (and kept), otherwise they must be saved by hand.
  // So each kind is checked either way: the PDF goes in the request, or the person is told what to do.
  const tried = ['docx', 'pptx'].map((kind) => {
    try {
      return { kind, body: buildBody('chat', 'm', `conv${kind}`), gemini: buildBody('gemini', 'm', `conv${kind}`) };
    } catch (error) {
      return { kind, error };
    }
  });
  for (const entry of tried) {
    if (entry.error) assert.match(entry.error.message, new RegExp(`converted-${entry.kind}\\.pdf is missing`), `${entry.kind}: the person is told what is missing`);
    else {
      assert.ok(entry.body.messages[0].content.some((part) => part.file?.file_data.startsWith('data:application/pdf;base64,')), `${entry.kind}: goes as a PDF`);
      assert.ok(entry.gemini.contents[0].parts.some((part) => part.inlineData?.mimeType === 'application/pdf'), `${entry.kind}: goes as a PDF to Gemini`);
    }
  }
  if (tried.some((entry) => entry.error)) {
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

test('the probe of the picture inside a PDF: the PDF whose only picture holds the word goes in each form, with the question about the picture', async () => {
  const chat = buildBody('chat', 'm', 'pdfimage').messages[0].content;
  assert.match(chat.find((part) => part.type === 'text').text, /picture in this document/);
  assert.match(chat.find((part) => part.type === 'file').file.file_data, /^data:application\/pdf;base64,JVBER/);
  assert.ok(buildBody('responses', 'm', 'pdfimage').input[0].content.some((part) => part.type === 'input_file'));
  assert.ok(buildBody('messages', 'm', 'pdfimage').messages[0].content.some((part) => part.type === 'document' && part.source.media_type === 'application/pdf'));
  assert.ok(buildBody('gemini', 'm', 'pdfimage').contents[0].parts.some((part) => part.inlineData?.mimeType === 'application/pdf'));
  const run = async () => ({ status: 200, ok: true, ms: 1, raw: JSON.stringify({ choices: [{ message: { content: 'BANANA' } }] }) });
  const result = await probeModel({ model: { id: 'hy3', family: 'chat' }, tests: ['pdfimage'], run });
  assert.equal(result.pdfimage.text, 'BANANA');
});

test('MiniMax M3.1 Flash and Step 5 Preview are in the probe with ids guessed from the page of limits (they were free before); --model tries any id, with or without its form', async () => {
  for (const [id, family] of [['minimax-m3.1-flash', 'messages'], ['step-5-preview', 'chat']]) {
    const model = MODELS.find((entry) => entry.id === id);
    assert.deepEqual([model.family, model.free, model.guess], [family, false, true], id);
  }
  assert.equal(MODELS.find((entry) => entry.id === 'beam-free').guess, undefined);
  assert.deepEqual(modelsNamed('some-new-free, other:responses , kimi-k3'), [
    { id: 'some-new-free', family: 'chat', free: true, guess: true },
    { id: 'other', family: 'responses', free: false },
    MODELS.find((entry) => entry.id === 'kimi-k3')
  ]);
  assert.equal(modelsNamed('beam-free:chat')[0].guess, undefined, 'the form is told: no guess');
  const dir = mkdtempSync(join(tmpdir(), 'opencode-model-'));
  try {
    const bodies = [];
    const fetchImpl = async (url, options) => { bodies.push([String(url), JSON.parse(options.body).model]); return reply(200, { choices: [{ message: { content: 'ok' } }] }); };
    assert.equal(await main(['--model', 'brand-new-free:chat', '--tests', 'basic', '--out', join(dir, 'r.json')], { OPENCODE_GO_KEY: KEY }, { log() {}, error() {} }, fetchImpl), 0);
    assert.deepEqual(bodies, [['https://opencode.ai/inference/go/v1/chat/completions', 'brand-new-free']]);
    assert.equal(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).models[0].id, 'brand-new-free');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--model takes the form of Google for a model that is not in the list yet', () => {
  assert.equal(modelsNamed('gemini-4-argon:gemini')[0].family, 'gemini');
  assert.equal(modelsNamed('iceman-contributor-free')[0].family, 'chat');
  assert.equal(modelsNamed('iceman-contributor-free')[0].free, true);
});

test('--new lists the ids the service has that the probe does not, without a key', async () => {
  const fetchImpl = async () => reply(200, { data: [{ id: 'kimi-k3' }, { id: 'minimax-m3.1-flash' }, { id: 'a-brand-new-one' }, { id: 'another-one-free' }] });
  const found = await newModels({ fetchImpl });
  assert.deepEqual([found.status, found.listed, found.new], [200, 4, ['a-brand-new-one', 'another-one-free']]);
  assert.ok(found.gone.includes('kimi-k3.1-pro') && !found.gone.includes('kimi-k3') && !found.gone.includes('minimax-m3.1-flash'), 'a model of the probe that the service does not list is said to be gone');
  const lines = [];
  assert.equal(await main(['--new'], {}, { log: (line) => lines.push(line), error() {} }, fetchImpl), 0);
  assert.match(lines[0], /4 models listed.*a-brand-new-one, another-one-free.*no longer listed: .*kimi-k3\.1-pro/);
  assert.equal(await main(['--new'], {}, { log() {}, error() {} }, async () => reply(404, 'nope')), 1);
});

const streamText = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

test('the text of the thinking is counted in the stream of each form of the API, and a field without text is not thinking', () => {
  const chat = streamText([
    { choices: [{ delta: { reasoning_content: 'Let me ' } }] },
    { choices: [{ delta: { reasoning: 'compute.' } }] },
    { choices: [{ delta: { content: 'ok' } }] }
  ]);
  assert.deepEqual(thinkingOfStream('chat', chat), { chars: 15, sample: 'Let me compute.', fields: ['reasoning_content', 'reasoning'] });
  const responses = streamText([{ type: 'response.reasoning_summary_text.delta', delta: 'Summary.' }, { type: 'response.output_text.delta', delta: 'ok' }, { type: 'response.output_item.added', item: { type: 'reasoning' } }]);
  assert.equal(thinkingOfStream('responses', responses).chars, 8, 'a reasoning item with no summary text is nothing to show');
  const messages = streamText([{ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Plan.' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }]);
  assert.equal(thinkingOfStream('messages', messages).chars, 5);
  const gemini = streamText([{ candidates: [{ content: { parts: [{ thought: true, text: 'Hmm.' }, { text: 'ok' }] } }] }]);
  assert.equal(thinkingOfStream('gemini', gemini).chars, 4);
  assert.equal(thinkingOfStream('messages', streamText([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }])).chars, 0);
});

test('each form asks for the summary of the thinking with its own field, added to what the app already sends', () => {
  assert.deepEqual(askedThinkingFields('messages', { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } }), { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'high' } });
  assert.deepEqual(askedThinkingFields('messages', {}), { thinking: { type: 'adaptive', display: 'summarized' } }, 'a model that is sent no setting is asked in the adaptive form');
  assert.deepEqual(askedThinkingFields('responses', { reasoning: { effort: 'medium' } }), { reasoning: { effort: 'medium', summary: 'auto' } });
  assert.deepEqual(askedThinkingFields('gemini', { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }), { generationConfig: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: true } } });
  assert.equal(askedThinkingFields('chat', { reasoning_effort: 'high' }), null, 'the chat form has no field for it');
});

test('the test shown says, for each model, whether the thinking comes by default, only when asked, is refused when asked, or does not come', async () => {
  const think = (text) => ({ ok: true, status: 200, ms: 5, raw: streamText([{ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: text } }]) });
  const quiet = { ok: true, status: 200, ms: 5, raw: streamText([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }]) };
  const bodies = [];
  const make = (answers) => async (family, body) => {
    bodies.push(body);
    return answers.shift();
  };
  assert.equal((await probeShown({ id: 'claude-haiku-5-5', family: 'messages', run: make([quiet, think('plan')]) })).verdict, 'only when asked');
  assert.equal((await probeShown({ id: 'minimax-m3', family: 'messages', run: make([think('plan'), think('plan')]) })).verdict, 'by default');
  assert.equal((await probeShown({ id: 'qwen3.7-plus', family: 'messages', run: make([quiet, { ok: false, status: 400, message: 'unknown field display' }]) })).verdict, 'refused when asked');
  assert.equal((await probeShown({ id: 'gpt-6-luna', family: 'responses', run: make([quiet, quiet]) })).verdict, 'none');
  assert.equal((await probeShown({ id: 'kimi-k3', family: 'chat', run: make([think('x')]) })).asked, null, 'a chat model is asked once');
  assert.equal((await probeShown({ id: 'kimi-k3', family: 'chat', run: make([{ ok: false, status: 500, message: 'down' }]) })).verdict, 'error');
  // What the first request holds is what the app sends today, without the field that only asks for the summary.
  assert.deepEqual(bodies[0].thinking, { type: 'adaptive' });
  assert.equal(bodies[0].output_config.effort, 'medium');
  assert.equal(bodies[0].stream, true, 'it is read as a stream, as the app reads it');
  assert.deepEqual(bodies[1].thinking, { type: 'adaptive', display: 'summarized' });
});

test('the limit of a reply is read from what the service says when it is asked for far too much, and found by smaller numbers when it says none', async () => {
  assert.equal(limitNamed('Upstream request failed: [invalid_request_error] max_tokens: 131072 > 128000, which is the maximum allowed number of output tokens for claude-haiku-5-5'), 128000);
  assert.equal(limitNamed('max_tokens must be less than or equal to 65536'), 65536);
  assert.equal(limitNamed('max_tokens is too large: 10000000. This model supports at most 32768 completion tokens'), 32768);
  assert.equal(limitNamed('Invalid value'), null);

  const sentLimits = [];
  const runWith = (rule) => async (family, body) => {
    const limit = body.max_tokens ?? body.max_output_tokens ?? body.generationConfig?.maxOutputTokens;
    sentLimits.push(limit);
    return rule(limit);
  };
  const ok = { ok: true, status: 200 };
  // The service names its limit: asked once for it, to be sure.
  const named = await probeMaxOut({ id: 'claude-haiku-5-5', family: 'messages', run: runWith((limit) => (limit > 128000 ? { ok: false, status: 400, message: `max_tokens: ${limit} > 128000, which is the maximum allowed` } : ok)) });
  assert.deepEqual([named.cap, named.accepted], [128000, 128000]);
  assert.deepEqual(sentLimits, [10_000_000, 128000]);
  // A service that takes the huge number says no limit.
  sentLimits.length = 0;
  const taken = await probeMaxOut({ id: 'kimi-k3', family: 'chat', run: runWith(() => ok) });
  assert.deepEqual([taken.cap, taken.accepted, sentLimits.length], [null, 10_000_000, 1]);
  // A service that refuses without saying: smaller numbers until one is taken.
  sentLimits.length = 0;
  const found = await probeMaxOut({ id: 'hy3', family: 'chat', run: runWith((limit) => (limit > 32768 ? { ok: false, status: 400, message: 'invalid max_tokens' } : ok)) });
  assert.deepEqual([found.cap, found.accepted], [null, 32768]);
  assert.deepEqual(sentLimits, [10_000_000, 1_000_000, 524_288, 262_144, 131_072, 65_536, 32_768]);
  // Nothing taken: said.
  const none = await probeMaxOut({ id: 'x', family: 'chat', run: runWith(() => ({ ok: false, status: 500, message: 'down' })) });
  assert.deepEqual([none.cap, none.accepted], [null, null]);
});

test('every refusal the service gave in the probe of 2026-10-23 is read right: its limit when it names one, never the status or a request id, and the context window is not a limit', () => {
  const real = [
    ['Upstream request failed: [400] Validation: Max tokens must not exceed 1048576, got 10000000', 1048576],
    ['Upstream request failed: [invalid_value] Validation: Max tokens must not exceed 1048576, got 10000000', 1048576],
    ['Upstream request failed: [invalid_parameter] : /max_tokens: 10000000 is not less or equal to 131072', 131072],
    ['Upstream request failed: [invalid_request_error] Invalid max_tokens value, the valid range of max_tokens is [1, 393216] (request_id: fafd6508-d850-4c45-baf6-10cddc4993a3)', 393216],
    ['Upstream request failed: [invalid_request_error] invalid params, model[MiniMax-M3] does not support max tokens > 524288 (2013)', 524288],
    ['Upstream request failed: [invalid_request_error] max_tokens: 10000000 > 128000, which is the maximum allowed number of output tokens for claude-haiku-5-5', 128000],
    ["Upstream request failed: [400] This endpoint's maximum context length is 262144 tokens. However, you requested about 262152 tokens (8 of text input, 262144 in the output). Please reduce the length of either one", null],
    ["The input (172 tokens) plus the requested output (10000000 tokens) exceeds the model's context window of 1048576 tokens. Reduce the input or the maximum output tokens.", null],
    ['Upstream request failed: [400] Param Incorrect', null],
    ['Upstream request failed: Invalid request parameters. Please check your input and try again.', null],
    ['{"model":"qwen3.7-plus"}', null],
    ['Upstream request failed: [400] Unsupported model mimo-v2.5-pro', null]
  ];
  for (const [message, limit] of real) assert.equal(limitNamed(message), limit, message.slice(0, 70));
  assert.equal(contextNamed(real[6][0]), 262144);
  assert.equal(contextNamed(real[7][0]), 1048576);
  assert.equal(contextNamed(real[0][0]), null);
});
