#!/usr/bin/env node
// The probe of the OpenCode provider (docs/superpowers/specs/2026-10-13-opencode-provider-design.md, §9): what the documents of OpenCode Go do not say, found out
// with small real requests. For each model it tries, with a very small `max_tokens`: a plain answer, a stream (which fields come in it), a tool call, a picture,
// and the settings that make a model think; once, it also tries the errors (a wrong key, a model that does not exist). What it gives is a JSON without the key,
// to fill the register of models with (the support for tools and for pictures, how thinking is turned on, where the thinking comes in the stream).
//
// The key is read from the environment (OPENCODE_GO_KEY); it is never printed, never written, and is taken out of whatever the service says back.
//
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --free            only the models that cost nothing
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --only kimi-k3    one or more models (comma between)
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --tests basic,stream
//   node scripts/opencode-probe.mjs --list                                the list of models of the service (public, no key, costs nothing)
//   --out file.json   where the result is written (default opencode-probe-result.json)        --base <address>   another base address
//
// It sends one request at a time and stops after four 429 in a row. A full run is about 250 small requests (a few cents at most, the reasoning models are the dearest).

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'https://opencode.ai/inference/go/v1';
export const TESTS = Object.freeze(['basic', 'stream', 'tools', 'vision', 'thinking', 'errors']);

// From https://opencode.ai/docs/go/ (Endpoints), 2026-10-13: the model, the form of its API, and whether it is free.
const chat = ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'longcat-2.0', 'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5', 'mimo-v2.5-pro', 'hy4-preview', 'hy3', 'space-bunny', 'longcat-2.5-preview-free', 'step-5-preview-free'];
const responses = ['grok-4.7', 'grok-4.6', 'gpt-6-luna', 'gpt-5.6-luna', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor'];
const messages = ['claude-haiku-5-5', 'minimax-m3', 'minimax-m2.7', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'];
export const MODELS = Object.freeze([
  ...chat.map((id) => ({ id, family: 'chat', free: id.endsWith('-free') })),
  ...responses.map((id) => ({ id, family: 'responses', free: false })),
  ...messages.map((id) => ({ id, family: 'messages', free: false })),
  // In the list of the service (2026-10-13) but not in the documents: the form of the API is a guess, and the probe tries the others when the guess is refused.
  ...['deepseek-flash', 'glm-5.1', 'omen-alpha', 'cat-jam-free'].map((id) => ({ id, family: 'chat', free: id.endsWith('-free'), guess: true })),
  ...['minimax-m2.5', 'qwen3.6-plus', 'qwen3.7-max'].map((id) => ({ id, family: 'messages', free: false, guess: true }))
]);

const PATH = { chat: '/chat/completions', responses: '/responses', messages: '/messages' };
const PROMPT = 'Reply with the single word: ok';
// A picture of one pixel (red): enough to see whether the model takes a picture at all.
// A solid red picture, 32 x 32 pixels (a service refused one pixel: "Image too small").
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NsQ0AAAzCMP5/un0CNkuZ41wybXsHAAAAAAAAAAAAxR4yw/wuPL6QkAAAAABJRU5ErkJggg==';
const TOOL = { name: 'get_time', description: 'Gets the local time of a city.', schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } };
const TOOL_PROMPT = 'What time is it in Paris? Use the tool.';

/** The settings that make a model think, by form of API: what is tried (each alone). */
export const THINKING = Object.freeze({
  chat: [
    ['reasoning_effort:low', { reasoning_effort: 'low' }],
    ['thinking:enabled', { thinking: { type: 'enabled' } }],
    ['thinking:disabled', { thinking: { type: 'disabled' } }],
    ['enable_thinking:true', { enable_thinking: true }]
  ],
  responses: [
    ['reasoning:low+summary', { reasoning: { effort: 'low', summary: 'auto' } }],
    ['reasoning:none', { reasoning: { effort: 'none' } }]
  ],
  messages: [
    ['thinking:adaptive', { thinking: { type: 'adaptive' } }],
    ['thinking:enabled+budget', { thinking: { type: 'enabled', budget_tokens: 1024 }, max_tokens: 2048 }],
    ['thinking:disabled', { thinking: { type: 'disabled' } }]
  ]
});

const stripKey = (text, key) => (key ? String(text).split(key).join('***') : String(text));
const plain = (text, limit = 240) => String(text ?? '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);

/** The body of a request (`kind`: basic, tool, vision) for a model of a form of API, with the settings added. */
export function buildBody(family, model, kind = 'basic', { stream = false, extra = {} } = {}) {
  const maxTokens = extra.max_tokens || 96;
  let body;
  if (family === 'chat') {
    const user = kind === 'vision'
      ? [{ type: 'text', text: 'What colour is this picture? One word.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }]
      : kind === 'tool' ? TOOL_PROMPT : PROMPT;
    body = { model, messages: [{ role: 'user', content: user }], max_tokens: maxTokens };
    if (kind === 'tool') Object.assign(body, { tools: [{ type: 'function', function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.schema } }], tool_choice: 'auto' });
    if (stream) Object.assign(body, { stream: true, stream_options: { include_usage: true } });
  } else if (family === 'responses') {
    const input = kind === 'vision'
      ? [{ role: 'user', content: [{ type: 'input_text', text: 'What colour is this picture? One word.' }, { type: 'input_image', image_url: `data:image/png;base64,${PNG}` }] }]
      : kind === 'tool' ? TOOL_PROMPT : PROMPT;
    body = { model, input, max_output_tokens: Math.max(maxTokens, 32) };
    if (kind === 'tool') Object.assign(body, { tools: [{ type: 'function', name: TOOL.name, description: TOOL.description, parameters: TOOL.schema }], tool_choice: 'auto' });
    if (stream) body.stream = true;
  } else {
    const user = kind === 'vision'
      ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }, { type: 'text', text: 'What colour is this picture? One word.' }]
      : kind === 'tool' ? TOOL_PROMPT : PROMPT;
    body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: user }] };
    if (kind === 'tool') Object.assign(body, { tools: [{ name: TOOL.name, description: TOOL.description, input_schema: TOOL.schema }], tool_choice: { type: 'auto' } });
    if (stream) body.stream = true;
  }
  const { max_tokens: _ignored, ...rest } = extra;
  Object.assign(body, rest);
  if (extra.max_tokens) body[family === 'responses' ? 'max_output_tokens' : 'max_tokens'] = extra.max_tokens;
  return body;
}

/** What an answer (not streamed) holds: the text, the thinking, the calls of tools, the numbers of tokens. */
export function readAnswer(family, data) {
  const out = { text: '', thinking: false, thinkingField: '', toolCalls: [], usage: null };
  if (!data || typeof data !== 'object') return out;
  if (family === 'chat') {
    const message = data.choices?.[0]?.message || {};
    out.text = typeof message.content === 'string' ? message.content : '';
    for (const field of ['reasoning_content', 'reasoning', 'reasoning_text']) if (typeof message[field] === 'string' && message[field]) { out.thinking = true; out.thinkingField = field; }
    out.toolCalls = (message.tool_calls || []).map((call) => call?.function?.name).filter(Boolean);
  } else if (family === 'responses') {
    for (const item of data.output || []) {
      if (item.type === 'message') out.text += (item.content || []).map((part) => part.text || '').join('');
      if (item.type === 'reasoning') { out.thinking = true; out.thinkingField = 'output[].reasoning'; }
      if (item.type === 'function_call' && item.name) out.toolCalls.push(item.name);
    }
  } else {
    for (const block of data.content || []) {
      if (block.type === 'text') out.text += block.text || '';
      if (block.type === 'thinking') { out.thinking = true; out.thinkingField = 'content[].thinking'; }
      if (block.type === 'tool_use' && block.name) out.toolCalls.push(block.name);
    }
  }
  out.usage = data.usage && typeof data.usage === 'object' ? Object.keys(data.usage).sort() : null;
  return out;
}

/** The events of a stream (the lines `data: {...}` of the text), in the order they came. */
export function parseEvents(text) {
  const events = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      events.push(JSON.parse(payload));
    } catch { /* a line that is not JSON */ }
  }
  return events;
}

/** What a stream shows: the fields of the changes, the kinds of events, whether the usage comes, whether the stream ends with [DONE]. */
export function summarizeStream(family, text) {
  const events = parseEvents(text);
  const fields = new Set();
  const types = new Set();
  let usage = false;
  let tools = false;
  for (const event of events) {
    if (event.type) types.add(event.type);
    if (event.usage || event.response?.usage || event.message?.usage) usage = true;
    if (family === 'chat') {
      for (const key of Object.keys(event.choices?.[0]?.delta || {})) fields.add(key);
      if (event.choices?.[0]?.delta?.tool_calls) tools = true;
    } else if (event.content_block?.type) fields.add(event.content_block.type);
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') tools = true;
    if (event.item?.type === 'function_call') tools = true;
  }
  return { events: events.length, fields: [...fields].sort(), types: [...types].sort(), usage, toolCalls: tools, done: /data:\s*\[DONE\]/.test(text) };
}

const messageOf = (body) => {
  try {
    const data = JSON.parse(body);
    return plain(data?.error?.message || data?.error || data?.message || data?.detail || body);
  } catch {
    return plain(body);
  }
};

/** One request, one result: { status, ok, ms, message?, text? }. Never keeps the key. */
export async function send({ fetchImpl = fetch, base = BASE, key = '', family, body, stream = false, headers = {}, session = 'probe', timeoutMs = 90_000 }) {
  const started = Date.now();
  const response = await fetchImpl(`${base}${PATH[family]}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), 'user-agent': 'Noureon-probe/1', 'x-opencode-session': session, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  }).catch((error) => ({ failed: plain(error?.message || error) }));
  if (response.failed) return { status: 0, ok: false, ms: Date.now() - started, message: stripKey(response.failed, key) };
  const text = stripKey(await response.text(), key);
  const result = { status: response.status, ok: response.status >= 200 && response.status < 300, ms: Date.now() - started };
  if (!result.ok) return { ...result, message: messageOf(text) };
  result.raw = text;
  result.stream = stream;
  return result;
}

const settle = (result, family) => {
  if (!result.ok) return { status: result.status, ok: false, message: result.message };
  if (result.stream) return { status: result.status, ok: true, ms: result.ms, ...summarizeStream(family, result.raw) };
  let data = null;
  try {
    data = JSON.parse(result.raw);
  } catch { /* not JSON */ }
  const answer = readAnswer(family, data);
  return { status: result.status, ok: true, ms: result.ms, text: plain(answer.text, 60), thinking: answer.thinking, thinkingField: answer.thinkingField, toolCalls: answer.toolCalls, usage: answer.usage };
};

/** The tests of one model. `run(body, options)` sends and gives the result of `send`. */
export async function probeModel({ model, tests = TESTS, run }) {
  const { id } = model;
  let { family } = model;
  const result = { id, family, free: Boolean(model.free) };
  if (model.guess) {
    result.guess = true;
    result.formsTried = {};
    for (const candidate of [family, ...['chat', 'responses', 'messages'].filter((name) => name !== family)]) {
      const attempt = settle(await run(candidate, buildBody(candidate, id, 'basic'), {}), candidate);
      result.formsTried[candidate] = { status: attempt.status, ok: attempt.ok, message: attempt.message };
      if (attempt.ok) {
        family = candidate;
        result.family = candidate;
        break;
      }
    }
  }
  const one = async (kind, options = {}) => settle(await run(family, buildBody(family, id, kind, options), options), family);
  if (tests.includes('basic')) result.basic = await one('basic');
  if (tests.includes('stream')) {
    result.stream = await one('basic', { stream: true });
    // A form of the stream that does not take the numbers of tokens: asked again without them.
    if (!result.stream.ok && family === 'chat') {
      const retry = settle(await run(family, (({ stream_options: _gone, ...rest }) => rest)(buildBody(family, id, 'basic', { stream: true })), { stream: true }), family);
      result.stream = { ...result.stream, includeUsageRefused: true, withoutIncludeUsage: retry };
    }
  }
  if (tests.includes('tools')) result.tools = await one('tool');
  if (tests.includes('vision')) result.vision = await one('vision');
  if (tests.includes('thinking')) {
    result.thinking = {};
    for (const [name, extra] of THINKING[family]) result.thinking[name] = await one('basic', { extra });
  }
  return result;
}

/** The errors, once: a wrong key, a model that is not there, and for the Messages form the headers. */
export async function probeErrors({ run, key }) {
  const out = {};
  const bad = await run('chat', buildBody('chat', 'kimi-k3'), { key: 'oc_wrong_key_for_the_probe' });
  out.wrongKey = { status: bad.status, message: bad.message };
  const missing = await run('chat', buildBody('chat', 'no-such-model-for-the-probe'), {});
  out.unknownModel = { status: missing.status, message: missing.message };
  const withoutKey = await run('chat', buildBody('chat', 'kimi-k3'), { key: '' });
  out.noKey = { status: withoutKey.status, message: withoutKey.message };
  out.messagesHeaders = {};
  for (const [name, headers] of [['bearerOnly', {}], ['withAnthropicVersion', { 'anthropic-version': '2023-06-01' }], ['xApiKeyOnly', { 'x-api-key': key, authorization: '' }]]) {
    const result = await run('messages', buildBody('messages', 'claude-haiku-5-5'), { headers });
    out.messagesHeaders[name] = { status: result.status, message: result.message };
  }
  return out;
}

export async function listModels({ fetchImpl = fetch, base = BASE } = {}) {
  const response = await fetchImpl(`${base}/models`, { headers: { 'user-agent': 'Noureon-probe/1' }, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch { /* not JSON */ }
  return { status: response.status, body: data ?? plain(text, 500) };
}

const argOf = (args, name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : '';
};

export async function main(args = process.argv.slice(2), env = process.env, out = console, fetchImpl = fetch) {
  const base = (argOf(args, '--base') || BASE).replace(/\/+$/, '');
  if (args.includes('--list')) {
    try {
      out.log(JSON.stringify(await listModels({ fetchImpl, base }), null, 2));
      return 0;
    } catch (error) {
      out.error(`The list could not be read: ${plain(error?.message || error)}`);
      return 1;
    }
  }
  const key = String(env.OPENCODE_GO_KEY || '');
  if (!key) {
    out.error('Set OPENCODE_GO_KEY in the environment (the key is never printed or written). To only read the list of models: --list');
    return 2;
  }
  let models = MODELS;
  const only = argOf(args, '--only');
  if (only) models = MODELS.filter((model) => only.split(',').map((name) => name.trim()).includes(model.id));
  else if (args.includes('--free')) models = MODELS.filter((model) => model.free);
  const tests = (argOf(args, '--tests') || TESTS.join(',')).split(',').map((name) => name.trim()).filter((name) => TESTS.includes(name));
  if (!models.length || !tests.length) {
    out.error('No model or no test matches.');
    return 2;
  }
  const session = `probe-${Math.random().toString(36).slice(2, 10)}`;
  let stopped = false;
  let tooMany = 0;
  const run = async (family, body, options = {}) => {
    if (stopped) return { status: 0, ok: false, message: 'stopped after a 429' };
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await send({ fetchImpl, base, key: options.key !== undefined ? options.key : key, family, body, stream: Boolean(options.stream), headers: options.headers || {}, session });
    // A 429 is told apart from the limit of the account only when it comes again and again: a free model whose endpoint is "unavailable" says 429 too.
    tooMany = result.status === 429 ? tooMany + 1 : 0;
    if (tooMany === 1) out.error(`429 (${plain(result.message, 120)}): going on; stops if it comes 4 times in a row.`);
    if (tooMany >= 4) {
      stopped = true;
      out.error('429 four times in a row: stopped (a limit was reached). What was found so far is kept.');
    }
    return result;
  };
  const report = { when: new Date().toISOString(), base, models: [] };
  for (const model of models) {
    out.log(`probing ${model.id} (${model.family}) ...`);
    report.models.push(await probeModel({ model, tests, run }));
  }
  if (tests.includes('errors')) report.errors = await probeErrors({ run, key });
  const file = argOf(args, '--out') || 'opencode-probe-result.json';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  out.log(`written: ${file} (no key in it; paste it to be read)`);
  return stopped ? 1 : 0;
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// Not process.exit(): on Windows it can crash Node ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") while the connections are still closing.
if (isMain) process.exitCode = await main();
