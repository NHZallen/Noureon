import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient, parseArgs, readStream, run, secretPdf, solidPng, textOfResponse, TEXT_MODELS } from '../scripts/openai-probe.mjs';

const KEY = 'sk-test-key-123';
const json = (status, body, headers = {}) => ({ status, ok: status < 400, headers: { get: (name) => headers[name] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const message = (text) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 5, output_tokens: 3, output_tokens_details: { reasoning_tokens: 1 } } });

test('the pictures made on the spot are a real PNG and a PDF with a correct table of offsets', () => {
  const png = Buffer.from(solidPng(32), 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 32);
  const pdf = Buffer.from(secretPdf(), 'base64').toString('latin1');
  assert.match(pdf, /MANGO/);
  const offsets = [...pdf.matchAll(/(\d{10}) 00000 n/g)].map((entry) => Number(entry[1]));
  assert.equal(offsets.length, 5);
  offsets.forEach((at, index) => assert.equal(pdf.slice(at, at + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`));
  assert.equal(pdf.slice(Number(/startxref\n(\d+)/.exec(pdf)[1]), Number(/startxref\n(\d+)/.exec(pdf)[1]) + 4), 'xref');
});

test('a stream of events is counted, and the place of thinking and usage is shown', () => {
  const sse = [
    'event: response.created\ndata: {"type":"response.created"}',
    'event: response.reasoning_summary_text.delta\ndata: {"delta":"thinking"}',
    'event: response.output_text.delta\ndata: {"delta":"ok"}',
    `event: response.completed\ndata: ${JSON.stringify({ response: message('ok') })}`
  ].join('\n\n');
  const read = readStream(sse);
  assert.equal(read.counts['response.output_text.delta'], 1);
  assert.match(read.samples['response.reasoning_summary_text.delta'], /thinking/);
  assert.deepEqual(read.usage, { input: 5, output: 3, reasoning: 1, cached: undefined });
  assert.equal(read.text, 'ok');
});

test('the options are read, and a wrong test name is refused', () => {
  assert.deepEqual(parseArgs([]).models, ['gpt-6-luna']);
  assert.deepEqual(parseArgs(['--all']).models, [...TEXT_MODELS]);
  assert.deepEqual(parseArgs(['--only', 'a,b', '--tests', 'basic,image']).models, ['a', 'b']);
  assert.throws(() => parseArgs(['--tests', 'nope']), /Unknown test/);
  assert.throws(() => parseArgs(['--what']), /Unknown option/);
});

test('a run gives a result without the key, even when the service repeats it', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/models')) return json(200, { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-image-2.5-flare' }] });
    if (init.headers.Authorization === 'Bearer sk-this-is-not-a-key') return json(401, { error: { message: `Incorrect API key provided: ${KEY}`, type: 'invalid_request_error', code: 'invalid_api_key' } });
    if (url.endsWith('/chat/completions')) return json(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
    const body = JSON.parse(init.body);
    if (body.stream) return json(200, 'event: response.completed\ndata: {"response":{"output":[]}}');
    if (body.reasoning?.effort === 'max') return json(400, { error: { message: `Unsupported value: 'max' (${KEY})`, code: 'unsupported_value', param: 'reasoning.effort' } });
    if (body.tools?.some((tool) => tool.type === 'function') && Array.isArray(body.input) && body.input.some((item) => item.type === 'function_call_output')) return json(200, message('It is 14:05 in Paris.'));
    if (body.tools?.some((tool) => tool.type === 'function')) return json(200, { output: [{ type: 'function_call', name: 'get_time', call_id: 'c1', arguments: '{"city":"Paris"}' }] });
    return json(200, message('ok'), { 'x-request-id': 'req_1' });
  };
  const result = await run({ ...parseArgs(['--tests', 'basic,chat,stream,effort,tools,toolloop,identifier,errors,list']), base: 'https://example.invalid/v1' }, { key: KEY, fetchImpl, log: () => {} });
  const model = result.models['gpt-6-luna'];
  assert.equal(model.basic.text, 'ok');
  assert.equal(model.basic.headers['x-request-id'], 'req_1');
  assert.equal(model.chat.text, 'ok');
  assert.equal(model.effort.max.status, 400);
  assert.equal(model.effort.low.status, 200);
  assert.equal(model.tools.called, true);
  assert.equal(model.toolloop.hasTime, true);
  assert.equal(model.identifier.accepted, true);
  assert.equal(result.shared.errors.wrongKey.status, 401);
  assert.equal(result.shared.list.wanted['gpt-6-luna'], true);
  assert.equal(result.shared.list.wanted['gpt-6-astra'], false);
  assert.ok(seen.some((request) => request.body?.safety_identifier && request.body.store === false));
  assert.equal(JSON.stringify(result).includes(KEY), false, 'the key is nowhere in the result');
  assert.equal(textOfResponse(message('x')), 'x');
});

test('the client stops after four 429 in a row and never throws', async () => {
  const client = createClient({ key: KEY, fetchImpl: async () => json(429, { error: { message: 'slow down' } }) });
  for (let i = 0; i < 4; i += 1) assert.equal((await client.send('/responses', { body: {} })).status, 429);
  assert.match((await client.send('/responses', { body: {} })).error, /four 429/);
  const broken = createClient({ key: KEY, fetchImpl: async () => { throw new Error(`network ${KEY}`); } });
  const reply = await broken.send('/models', { method: 'GET' });
  assert.equal(reply.status, 0);
  assert.equal(reply.error.includes(KEY), false);
});
