#!/usr/bin/env node
// The probe of the OpenAI provider (docs/superpowers/specs/2026-10-29-openai-provider-design.md, §8): what the pages of OpenAI do not say, found out with small real
// requests. For each model it tries, with a small output limit: a plain answer in the Responses form, the same in the Chat Completions form, a stream (which events
// come), every depth of thinking, a function call and its answer, a picture, a PDF, the built-in web search, `store: false` with `safety_identifier`; once, it also
// tries the errors (a wrong key, a model that does not exist) and lists the models the key may use. The image models are tried with `--tests image`.
// What it gives is a JSON without the key, to fill the register of models with.
//
// The key is read from the environment (OPENAI_API_KEY); it is never printed, never written, and is taken out of whatever the service says back.
//
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs                        the cheapest model (gpt-6-luna), the text tests
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --all                  the four text models
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --only gpt-6.1-terra   one or more models (comma between)
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --tests basic,stream   only some tests (list below)
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --tests image          the image tests (Responses tool and Images API; two small low-quality pictures, about a cent)
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --tests imagequality   the depths of quality of an image model, one picture each (dearer: xhigh and max)
//   OPENAI_API_KEY=... node scripts/openai-probe.mjs --tests list           the models the key may use (costs nothing)
//   node scripts/openai-probe.mjs --cors-snippet                            prints what to paste in the Console of a web page to see whether a browser may call the API
//   --image-models gpt-image-2.5-flare,gpt-image-2.5-sunburst   the image models for the image tests (default: flare)
//   --max-output 300   a bigger output limit for every request (for the models that think long before they answer)
//   --out file.json    where the result is written (default openai-probe-result.json)        --base <address>   another base address (default https://api.openai.com/v1)
//
// It sends one request at a time and stops after four 429 in a row. A default run is about 25 small requests on gpt-6-luna (a cent or two at most).

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const BASE = 'https://api.openai.com/v1';
// The text models, the cheapest first (the order of the prices of the register of OpenRouter: Luna, Terra, Sol, Astra).
export const TEXT_MODELS = Object.freeze(['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra']);
export const IMAGE_MODELS = Object.freeze(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']);
export const TEXT_TESTS = Object.freeze(['basic', 'chat', 'stream', 'effort', 'tools', 'toolloop', 'vision', 'pdf', 'websearch', 'identifier']);
export const TESTS = Object.freeze([...TEXT_TESTS, 'errors', 'list', 'image', 'imagequality']);
export const EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

const PROMPT = 'Reply with the single word: ok';
const TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 240_000;

export const CORS_SNIPPET = `// Open a page of the web (for example https://example.com), open the Console, paste this, and type the key in the box (it is not stored anywhere).
(async () => {
  const key = prompt('OpenAI API key');
  const headers = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  try {
    const list = await fetch('https://api.openai.com/v1/models', { headers });
    console.log('GET /models', list.status);
  } catch (error) { console.log('GET /models blocked', String(error)); }
  try {
    const body = JSON.stringify({ model: 'gpt-6-luna', input: 'Reply with the single word: ok', max_output_tokens: 200, store: false, stream: true });
    const reply = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers, body });
    const reader = reply.body.getReader();
    const first = await reader.read();
    console.log('POST /responses (stream)', reply.status, new TextDecoder().decode(first.value).slice(0, 200));
    reader.cancel();
  } catch (error) { console.log('POST /responses blocked', String(error)); }
})();`;

// ---- small pieces made on the spot: a plain colour picture and a one-page PDF (no files to carry)
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
/** A plain-colour PNG of `size` pixels square, as base64. */
export function solidPng(size = 32, [red, green, blue] = [255, 0, 0]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [red, green, blue]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
/** A one-page PDF with the line "The secret word is MANGO." as base64 (a correct table of offsets, so that every reader takes it). */
export function secretPdf() {
  const stream = 'BT /F1 18 Tf 20 50 Td (The secret word is MANGO.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let text = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = text.length; text += `${index + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  text += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text, 'latin1').toString('base64');
}

// ---- the request
const oneLine = (value, limit = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const KEPT_HEADERS = ['x-request-id', 'openai-processing-ms', 'openai-organization', 'openai-version', 'x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'retry-after'];

export function createClient({ key, base = BASE, fetchImpl = (...args) => globalThis.fetch(...args), log = () => {} }) {
  let tooMany = 0;
  const clean = (text) => (key ? String(text ?? '').split(key).join('[key]') : String(text ?? ''));
  /** { status, ok, ms, headers, json?, text } for one request; never throws, never carries the key. */
  async function send(path, { method = 'POST', body, auth = key, timeoutMs = TIMEOUT_MS, headers = {} } = {}) {
    if (tooMany >= 4) return { status: 0, ok: false, ms: 0, error: 'stopped after four 429 in a row' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = clean(await response.text());
      tooMany = response.status === 429 ? tooMany + 1 : 0;
      const kept = {};
      for (const name of KEPT_HEADERS) { const value = response.headers.get(name); if (value) kept[name] = value; }
      let json;
      try { json = JSON.parse(text); } catch { /* a stream, or not JSON */ }
      log(`${method} ${path} ${response.status}`);
      return { status: response.status, ok: response.ok, ms: Date.now() - started, headers: kept, json, text };
    } catch (error) {
      return { status: 0, ok: false, ms: Date.now() - started, error: clean(oneLine(error?.name === 'AbortError' ? 'timed out' : error?.message)) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { send };
}

// ---- reading the answers
const errorOf = (reply) => (reply.ok ? undefined : { status: reply.status, type: reply.json?.error?.type, code: reply.json?.error?.code, param: reply.json?.error?.param, message: oneLine(reply.json?.error?.message || reply.error || reply.text, 300) });
const outputItems = (json) => (Array.isArray(json?.output) ? json.output : []);
export const textOfResponse = (json) => outputItems(json).filter((item) => item.type === 'message').flatMap((item) => (item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text)).join('');
const usageOf = (json) => json?.usage ? { input: json.usage.input_tokens, output: json.usage.output_tokens, reasoning: json.usage.output_tokens_details?.reasoning_tokens, cached: json.usage.input_tokens_details?.cached_tokens } : undefined;
const summaryOf = (reply) => ({ status: reply.status, ms: reply.ms, error: errorOf(reply), text: oneLine(textOfResponse(reply.json), 120), itemTypes: outputItems(reply.json).map((item) => item.type), usage: usageOf(reply.json), incomplete: reply.json?.incomplete_details?.reason });

/** The events of a Responses stream (the text of an SSE answer): how many of each kind, and the first of the kinds that show where thinking and usage come in. */
export function readStream(text) {
  const counts = {};
  const samples = {};
  let completed = null;
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    const type = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const data = /^data:\s*(.+)$/m.exec(block)?.[1];
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
    let parsed;
    try { parsed = data ? JSON.parse(data) : null; } catch { parsed = null; }
    if (!samples[type] && parsed && /reasoning|summary|completed|failed|incomplete/.test(type)) samples[type] = oneLine(JSON.stringify(parsed), 240);
    if (type === 'response.completed' && parsed?.response) completed = parsed.response;
  }
  return { counts, samples, usage: usageOf(completed), text: oneLine(textOfResponse(completed), 120) };
}

// ---- the tests (each gives a small plain object)
const responsesBody = (model, extra = {}, maxOutput) => ({ model, input: PROMPT, max_output_tokens: maxOutput, store: false, ...extra });
const TOOL = { type: 'function', name: 'get_time', description: 'Gives the local time of a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false }, strict: true };

export function createTests({ client, maxOutput = 300, imageModels = [IMAGE_MODELS[0]], textModel = TEXT_MODELS[0] }) {
  const { send } = client;
  return {
    async basic(model) {
      const reply = await send('/responses', { body: responsesBody(model, {}, maxOutput) });
      return { ...summaryOf(reply), headers: reply.headers, model: reply.json?.model, serviceTier: reply.json?.service_tier };
    },
    async chat(model) {
      const reply = await send('/chat/completions', { body: { model, messages: [{ role: 'user', content: PROMPT }], max_completion_tokens: maxOutput, store: false } });
      return { status: reply.status, ms: reply.ms, error: errorOf(reply), text: oneLine(reply.json?.choices?.[0]?.message?.content, 120), finish: reply.json?.choices?.[0]?.finish_reason, usage: reply.json?.usage ? { input: reply.json.usage.prompt_tokens, output: reply.json.usage.completion_tokens, reasoning: reply.json.usage.completion_tokens_details?.reasoning_tokens } : undefined };
    },
    async stream(model) {
      const reply = await send('/responses', { body: responsesBody(model, { stream: true, reasoning: { summary: 'auto' } }, maxOutput) });
      return { status: reply.status, ms: reply.ms, error: errorOf(reply), ...(reply.ok ? readStream(reply.text) : {}) };
    },
    async effort(model) {
      const result = {};
      for (const effort of EFFORTS) {
        const reply = await send('/responses', { body: responsesBody(model, { reasoning: { effort } }, maxOutput) });
        result[effort] = { status: reply.status, error: errorOf(reply)?.message, reasoningTokens: usageOf(reply.json)?.reasoning, text: oneLine(textOfResponse(reply.json), 40) };
      }
      return result;
    },
    async tools(model) {
      const reply = await send('/responses', { body: { model, input: 'What time is it in Paris? Use the tool.', tools: [TOOL], tool_choice: 'auto', max_output_tokens: maxOutput * 2, store: false } });
      const call = outputItems(reply.json).find((item) => item.type === 'function_call');
      return { ...summaryOf(reply), called: Boolean(call), call: call ? { name: call.name, arguments: oneLine(call.arguments, 120) } : undefined };
    },
    async toolloop(model) {
      const first = await send('/responses', { body: { model, input: [{ role: 'user', content: 'What time is it in Paris? Use the tool.' }], tools: [TOOL], max_output_tokens: maxOutput * 2, store: false } });
      const call = outputItems(first.json).find((item) => item.type === 'function_call');
      if (!call) return { skipped: 'the model did not call the tool', first: summaryOf(first) };
      // With `store: false` nothing is kept on the other side: the items of the first answer go back with the result.
      const input = [{ role: 'user', content: 'What time is it in Paris? Use the tool.' }, ...outputItems(first.json), { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ time: '14:05' }) }];
      const second = await send('/responses', { body: { model, input, tools: [TOOL], max_output_tokens: maxOutput * 2, store: false } });
      return { ...summaryOf(second), hasTime: /14[:.]05|2:05/.test(textOfResponse(second.json)) };
    },
    async vision(model) {
      const input = [{ role: 'user', content: [{ type: 'input_text', text: 'What colour is this picture? One word.' }, { type: 'input_image', image_url: `data:image/png;base64,${solidPng(32)}`, detail: 'low' }] }];
      const reply = await send('/responses', { body: { model, input, max_output_tokens: maxOutput, store: false } });
      return { ...summaryOf(reply), sawRed: /red/i.test(textOfResponse(reply.json)) };
    },
    async pdf(model) {
      const input = [{ role: 'user', content: [{ type: 'input_text', text: 'What is the secret word in this document? One word.' }, { type: 'input_file', filename: 'probe.pdf', file_data: `data:application/pdf;base64,${secretPdf()}` }] }];
      const reply = await send('/responses', { body: { model, input, max_output_tokens: maxOutput, store: false } });
      return { ...summaryOf(reply), sawMango: /mango/i.test(textOfResponse(reply.json)) };
    },
    async websearch(model) {
      const reply = await send('/responses', { body: { model, input: 'Search the web: what is the latest stable version of Node.js? One short line.', tools: [{ type: 'web_search' }], max_output_tokens: maxOutput * 3, store: false } });
      return { ...summaryOf(reply), searched: outputItems(reply.json).some((item) => item.type === 'web_search_call') };
    },
    async identifier(model) {
      const safety = createHash('sha256').update('probe-user').digest('hex').slice(0, 32);
      const reply = await send('/responses', { body: responsesBody(model, { safety_identifier: safety }, maxOutput) });
      return { ...summaryOf(reply), accepted: reply.ok };
    },
    async errors() {
      const wrongKey = await send('/responses', { auth: 'sk-this-is-not-a-key', body: responsesBody(textModel, {}, 20) });
      const noKey = await send('/responses', { auth: '', body: responsesBody(textModel, {}, 20) });
      const noModel = await send('/responses', { body: responsesBody('gpt-does-not-exist', {}, 20) });
      const badEffort = await send('/responses', { body: responsesBody(textModel, { reasoning: { effort: 'nonsense' } }, 20) });
      return { wrongKey: errorOf(wrongKey), noKey: errorOf(noKey), noModel: errorOf(noModel), badEffort: errorOf(badEffort) };
    },
    async list() {
      const reply = await send('/models', { method: 'GET' });
      const ids = (reply.json?.data || []).map((entry) => entry.id).sort();
      const wanted = [...TEXT_MODELS, ...IMAGE_MODELS];
      return { status: reply.status, error: errorOf(reply), count: ids.length, wanted: Object.fromEntries(wanted.map((id) => [id, ids.includes(id)])), related: ids.filter((id) => /gpt-6|gpt-image|gpt-5\.[5-9]/.test(id)) };
    },
    /** A small low-quality picture by the tool of the Responses API (and then an edit of it, with the picture sent back as data and not as an id, since nothing is stored), and by the Images API. */
    async image() {
      const result = {};
      for (const imageModel of imageModels) {
        const tool = { type: 'image_generation', model: imageModel, quality: 'low', size: '1024x1024', output_format: 'jpeg', output_compression: 50 };
        const made = await send('/responses', { timeoutMs: IMAGE_TIMEOUT_MS, body: { model: textModel, input: 'Draw a small red circle on a white background.', tools: [tool], max_output_tokens: 600, store: false } });
        const call = outputItems(made.json).find((item) => item.type === 'image_generation_call');
        const entry = { tool: { ...summaryOf(made), gotImage: Boolean(call?.result), imageBytes: call?.result ? Math.round(call.result.length * 0.75) : 0, revisedPrompt: oneLine(call?.revised_prompt, 120), status: made.status } };
        if (call?.result) {
          const input = [{ role: 'user', content: [{ type: 'input_text', text: 'Make the circle blue.' }, { type: 'input_image', image_url: `data:image/jpeg;base64,${call.result}` }] }];
          const edited = await send('/responses', { timeoutMs: IMAGE_TIMEOUT_MS, body: { model: textModel, input, tools: [{ ...tool, action: 'edit' }], max_output_tokens: 600, store: false } });
          const editCall = outputItems(edited.json).find((item) => item.type === 'image_generation_call');
          entry.edit = { ...summaryOf(edited), gotImage: Boolean(editCall?.result) };
        }
        const direct = await send('/images/generations', { timeoutMs: IMAGE_TIMEOUT_MS, body: { model: imageModel, prompt: 'A small red circle on a white background.', quality: 'low', size: '1024x1024', output_format: 'jpeg', output_compression: 50 } });
        entry.imagesApi = { status: direct.status, ms: direct.ms, error: errorOf(direct), gotImage: Boolean(direct.json?.data?.[0]?.b64_json), usage: direct.json?.usage };
        result[imageModel] = entry;
      }
      return result;
    },
    async imagequality() {
      const result = {};
      for (const imageModel of imageModels) {
        result[imageModel] = {};
        for (const quality of ['auto', 'low', 'medium', 'high', 'xhigh', 'max']) {
          const reply = await send('/images/generations', { timeoutMs: IMAGE_TIMEOUT_MS, body: { model: imageModel, prompt: 'A small red circle on a white background.', quality, size: '1024x1024', output_format: 'jpeg', output_compression: 50 } });
          result[imageModel][quality] = { status: reply.status, ms: reply.ms, error: errorOf(reply)?.message, usage: reply.json?.usage };
        }
      }
      return result;
    }
  };
}

// ---- the run
export function parseArgs(argv) {
  const options = { models: [TEXT_MODELS[0]], tests: null, maxOutput: 300, out: 'openai-probe-result.json', base: BASE, imageModels: [IMAGE_MODELS[0]] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--all') options.models = [...TEXT_MODELS];
    else if (arg === '--only') options.models = String(next() || '').split(',').filter(Boolean);
    else if (arg === '--tests') options.tests = String(next() || '').split(',').filter(Boolean);
    else if (arg === '--max-output') options.maxOutput = Math.max(16, Number(next()) || 300);
    else if (arg === '--out') options.out = next();
    else if (arg === '--base') options.base = String(next() || '').replace(/\/+$/, '');
    else if (arg === '--image-models') options.imageModels = String(next() || '').split(',').filter(Boolean);
    else if (arg === '--cors-snippet') options.snippet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  for (const name of options.tests || []) if (!TESTS.includes(name)) throw new Error(`Unknown test "${name}". Tests: ${TESTS.join(', ')}`);
  return options;
}

export async function run(options, { key, fetchImpl, log = (line) => console.error(line) } = {}) {
  const client = createClient({ key, base: options.base, fetchImpl, log });
  const tests = createTests({ client, maxOutput: options.maxOutput, imageModels: options.imageModels, textModel: options.models[0] || TEXT_MODELS[0] });
  const chosen = options.tests || TEXT_TESTS;
  const result = { probedAt: new Date().toISOString(), base: options.base, maxOutput: options.maxOutput, models: {}, shared: {} };
  for (const name of chosen.filter((test) => ['errors', 'list', 'image', 'imagequality'].includes(test))) {
    log(`-- ${name}`);
    result.shared[name] = await tests[name]();
  }
  for (const model of options.models) {
    result.models[model] = {};
    for (const name of chosen.filter((test) => TEXT_TESTS.includes(test))) {
      log(`-- ${model}: ${name}`);
      result.models[model][name] = await tests[name](model);
    }
  }
  return result;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.snippet) { console.log(CORS_SNIPPET); process.exit(0); }
    if (options.help) { console.log('See the top of scripts/openai-probe.mjs.'); process.exit(0); }
    const key = String(process.env.OPENAI_API_KEY || '').trim();
    const needsKey = (options.tests || TEXT_TESTS).length > 0;
    if (!key && needsKey) { console.error('Set OPENAI_API_KEY in the environment (it is never printed or written).'); process.exit(1); }
    const result = await run(options, { key });
    writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
    console.error(`Written: ${options.out}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
