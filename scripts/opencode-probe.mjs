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
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --model beam-free,minimax-m3.1-flash-free:messages
//                                                                          any id, in the list of the register or not (`id` alone: the form of its API is guessed and the others are tried
//                                                                          when it is refused; `id:chat`, `id:responses` or `id:messages` says it)
//   node scripts/opencode-probe.mjs --new                                  the ids the service lists that this probe does not know yet (public, no key, costs nothing)
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --tests basic,stream
//   node scripts/opencode-probe.mjs --list                                the list of models of the service (public, no key, costs nothing)
//   (Gemini 4 Argon Contributor, Google's own form: `--only gemini-4-argon-contributor --tests basic,stream,effort,thinking,tools,toolloop,vision,document,auth --max-tokens 1500`)
//   Word and PowerPoint sent as they are, to the models that read a PDF: `--tests office --only <models>` (the answer holds MANGO when the file was read; "text" shows it)
//   OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --tests shown                    which models give the text of their thinking (stream): by default, only when asked for it
//                                                                          (a summary: `thinking.display`, `reasoning.summary`, `includeThoughts`), or not at all; a table at the end
//   --max-tokens 1500   a bigger limit for every request (for the models that think long before they answer)
//   --out file.json   where the result is written (default opencode-probe-result.json)        --base <address>   another base address
//
// It sends one request at a time and stops after four 429 in a row. A full run is about 250 small requests (a few cents at most, the reasoning models are the dearest).

import { existsSync, readFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPENCODE_REASONING_CONFIGS, opencodeThinkingFields } from '../src/app/runtime/shell/opencode-models.js';

export const BASE = 'https://opencode.ai/inference/go/v1';
export const TESTS = Object.freeze(['basic', 'stream', 'tools', 'toolloop', 'params', 'effort', 'vision', 'document', 'office', 'converted', 'pdfimage', 'thinking', 'shown', 'auth', 'errors']);

// From https://opencode.ai/docs/go/ (Endpoints), 2026-10-13: the model, the form of its API, and whether it is free.
const chat = ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'longcat-2.0', 'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5', 'mimo-v2.5-pro', 'hy4-preview', 'hy3', 'space-bunny', 'longcat-2.5-preview-free', 'step-5-preview-free'];
const responses = ['grok-4.7', 'grok-4.6', 'gpt-6-luna', 'gpt-5.6-luna', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor'];
const messages = ['claude-haiku-5-5', 'minimax-m3', 'minimax-m2.7', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'];
export const MODELS = Object.freeze([
  ...chat.map((id) => ({ id, family: 'chat', free: id.endsWith('-free') })),
  ...responses.map((id) => ({ id, family: 'responses', free: false })),
  ...messages.map((id) => ({ id, family: 'messages', free: false })),
  // Google's own form (2026-10-14, told by the owner): only `models/<id>:generateContent` answers; the stream, the depths of thinking, documents and the key are what the probe finds out.
  { id: 'gemini-4-argon-contributor', family: 'gemini', free: false },
  // In the list of the service (2026-10-13) but not in the documents: the form of the API is a guess, and the probe tries the others when the guess is refused.
  ...['deepseek-flash', 'glm-5.1', 'omen-alpha', 'cat-jam-free'].map((id) => ({ id, family: 'chat', free: id.endsWith('-free'), guess: true })),
  ...['minimax-m2.5', 'qwen3.6-plus', 'qwen3.7-max'].map((id) => ({ id, family: 'messages', free: false, guess: true })),
  // Told by the owner on 2026-10-20 ("MiniMax M3.1 Flash Free", "Beam Free"): the ids are guessed from the names of the others (a free model ends in `-free`, MiniMax's are of the
  // Messages form) and may be spelt otherwise: `--new` shows what the service really lists, `--model <id>` tries any id.
  { id: 'minimax-m3.1-flash-free', family: 'messages', free: true, guess: true },
  { id: 'beam-free', family: 'chat', free: true, guess: true }
]);

const PATH = { chat: '/chat/completions', responses: '/responses', messages: '/messages' };
// Google's form names the model in the path (the body carries it as `__model`, which `send` takes out); `variant` 1 is the stream as lines of text (`alt=sse`), 2 the stream as one JSON list.
const pathOf = (family, model, stream, variant = 1) => (family === 'gemini'
  ? `/models/${model}:${stream ? `streamGenerateContent${variant === 1 ? '?alt=sse' : ''}` : 'generateContent'}`
  : PATH[family]);
const PROMPT = 'Reply with the single word: ok';
// A picture of one pixel (red): enough to see whether the model takes a picture at all.
// A solid red picture, 32 x 32 pixels (a service refused one pixel: "Image too small").
// A one-page PDF with a line of text in it ("The secret word is MANGO."): does the model read a document sent to it as it is?
const PDF = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1NSA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDIwIDUwIFRkIChUaGUgc2VjcmV0IHdvcmQgaXMgTUFOR08uKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDM0NiAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQxNgolJUVPRgo=';
const DOC_PROMPT = 'What is the secret word in this document? One word.';
// A Word file and a PowerPoint file with the same line in them (scripts/probe-files): does the model read an Office file sent as it is? Read once, when first asked for.
export const OFFICE_FILES = Object.freeze({
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'probe.docx' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name: 'probe.pptx' }
});
const officeCache = {};
// The PDF that Word / PowerPoint (or LibreOffice) made of the same two files: `scripts/probe-files/converted-docx.pdf` and `converted-pptx.pdf`
// (test `converted`: does a model read the PDF made of an Office file? If `soffice` is on the machine the probe makes them itself, once).
const CONVERTED = Object.freeze({ convdocx: 'docx', convpptx: 'pptx' });
// `pdfimage`: a PDF whose only line of text does not hold the word; the word is written inside a picture on the page (scripts/probe-files/image-pdf.pdf). A model that
// answers BANANA looked at the pictures of the PDF, one that says it cannot find a word read the text only.
const IMAGE_PDF_PROMPT = 'There is a picture in this document with one word written in it. What is the word? One word.';
const isPdfKind = (kind) => kind === 'document' || kind === 'pdfimage' || Boolean(CONVERTED[kind]);
const docPrompt = (kind) => (kind === 'pdfimage' ? IMAGE_PDF_PROMPT : DOC_PROMPT);
const pdfBase64 = (kind) => (kind === 'document' ? PDF : kind === 'pdfimage' ? readFileSync(new URL('./probe-files/image-pdf.pdf', import.meta.url)).toString('base64') : convertedBase64(CONVERTED[kind]));
export function convertedBase64(kind) {
  const file = new URL(`./probe-files/converted-${kind}.pdf`, import.meta.url);
  if (!existsSync(file)) {
    // Make it with LibreOffice when it is there; otherwise the person is told what to do.
    const made = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', fileURLToPath(new URL('./probe-files/', import.meta.url)), fileURLToPath(new URL(`./probe-files/${OFFICE_FILES[kind].name}`, import.meta.url))], { stdio: 'ignore' });
    const produced = new URL(`./probe-files/probe.pdf`, import.meta.url);
    if (made.status === 0 && existsSync(produced)) renameSync(produced, file);
  }
  if (!existsSync(file)) throw new Error(`scripts/probe-files/converted-${kind}.pdf is missing: open probe.${kind} in ${kind === 'docx' ? 'Word' : 'PowerPoint'} (or Pages, Keynote, LibreOffice), save it as PDF with that name, and run again`);
  return readFileSync(file).toString('base64');
}
const officeBase64 = (kind) => (officeCache[kind] ||= readFileSync(new URL(`./probe-files/${OFFICE_FILES[kind].name}`, import.meta.url)).toString('base64'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NsQ0AAAzCMP5/un0CNkuZ41wybXsHAAAAAAAAAAAAxR4yw/wuPL6QkAAAAABJRU5ErkJggg==';
const TOOL = { name: 'get_time', description: 'Gets the local time of a city.', schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } };
// A small sum: the thinking a model puts into it shows how much a setting of depth changes (the numbers of tokens of the thinking).
const THINK_PROMPT = 'What is 17 times 24, minus 38? Answer with just the number.';
// A question a model that can think does think about (the test `shown`).
const SHOWN_PROMPT = 'A train leaves at 3:40 pm and travels 135 km at 45 km/h, stops 12 minutes, then travels 60 km at 40 km/h. At what time does it arrive? Answer with the time only.';
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
  // Google's own settings, each alone: the depth (`thinkingLevel`), the budget of tokens, and the summaries of the thinking (`includeThoughts`).
  gemini: [
    ['thinkingLevel:minimal', { generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } }],
    ['thinkingLevel:low', { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }],
    ['thinkingLevel:high', { generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } }],
    ['thinkingBudget:0', { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }],
    ['thinkingBudget:1024', { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } }],
    ['includeThoughts:true', { generationConfig: { thinkingConfig: { includeThoughts: true } } }]
  ],
  messages: [
    ['thinking:adaptive', { thinking: { type: 'adaptive' } }],
    ['thinking:enabled+budget', { thinking: { type: 'enabled', budget_tokens: 1024 }, max_tokens: 2048 }],
    ['thinking:disabled', { thinking: { type: 'disabled' } }]
  ]
});

const stripKey = (text, key) => (key ? String(text).split(key).join('***') : String(text));
const plain = (text, limit = 240) => String(text ?? '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);

/** The body of a request (`kind`: basic, tool, vision, document) for a model of a form of API, with the settings added. */
export function buildBody(family, model, kind = 'basic', { stream = false, extra = {} } = {}) {
  const maxTokens = extra.max_tokens || 96;
  let body;
  if (family === 'gemini') {
    const text = kind === 'vision' ? 'What colour is this picture? One word.' : isPdfKind(kind) ? docPrompt(kind) : kind === 'tool' ? TOOL_PROMPT : kind === 'think' ? THINK_PROMPT : kind === 'shown' ? SHOWN_PROMPT : PROMPT;
    const parts = kind === 'vision' ? [{ text }, { inlineData: { mimeType: 'image/png', data: PNG } }]
      : isPdfKind(kind) ? [{ text }, { inlineData: { mimeType: 'application/pdf', data: pdfBase64(kind) } }]
        : OFFICE_FILES[kind] ? [{ text: DOC_PROMPT }, { inlineData: { mimeType: OFFICE_FILES[kind].mime, data: officeBase64(kind) } }] : [{ text }];
    const { max_tokens: limit, temperature, top_p: topP, generationConfig: wanted = {}, ...rest } = extra;
    const config = { maxOutputTokens: limit || maxTokens, ...(temperature !== undefined ? { temperature } : {}), ...(topP !== undefined ? { topP } : {}), ...wanted };
    if (wanted.thinkingConfig) config.thinkingConfig = { ...wanted.thinkingConfig };
    body = { __model: model, contents: [{ role: 'user', parts }], generationConfig: config, ...rest };
    if (kind === 'tool') body.tools = [{ functionDeclarations: [{ name: TOOL.name, description: TOOL.description, parameters: TOOL.schema }] }];
    return body;
  }
  if (family === 'chat') {
    const user = kind === 'vision'
      ? [{ type: 'text', text: 'What colour is this picture? One word.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }]
      : isPdfKind(kind) ? [{ type: 'text', text: docPrompt(kind) }, { type: 'file', file: { filename: 'probe.pdf', file_data: `data:application/pdf;base64,${pdfBase64(kind)}` } }]
        : OFFICE_FILES[kind] ? [{ type: 'text', text: DOC_PROMPT }, { type: 'file', file: { filename: OFFICE_FILES[kind].name, file_data: `data:${OFFICE_FILES[kind].mime};base64,${officeBase64(kind)}` } }]
        : kind === 'tool' ? TOOL_PROMPT : kind === 'think' ? THINK_PROMPT : kind === 'shown' ? SHOWN_PROMPT : PROMPT;
    body = { model, messages: [{ role: 'user', content: user }], max_tokens: maxTokens };
    if (kind === 'tool') Object.assign(body, { tools: [{ type: 'function', function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.schema } }], tool_choice: 'auto' });
    if (stream) Object.assign(body, { stream: true, stream_options: { include_usage: true } });
  } else if (family === 'responses') {
    const input = kind === 'vision'
      ? [{ role: 'user', content: [{ type: 'input_text', text: 'What colour is this picture? One word.' }, { type: 'input_image', image_url: `data:image/png;base64,${PNG}` }] }]
      : isPdfKind(kind) ? [{ role: 'user', content: [{ type: 'input_text', text: docPrompt(kind) }, { type: 'input_file', filename: 'probe.pdf', file_data: `data:application/pdf;base64,${pdfBase64(kind)}` }] }]
        : OFFICE_FILES[kind] ? [{ role: 'user', content: [{ type: 'input_text', text: DOC_PROMPT }, { type: 'input_file', filename: OFFICE_FILES[kind].name, file_data: `data:${OFFICE_FILES[kind].mime};base64,${officeBase64(kind)}` }] }]
        : kind === 'tool' ? TOOL_PROMPT : kind === 'think' ? THINK_PROMPT : kind === 'shown' ? SHOWN_PROMPT : PROMPT;
    body = { model, input, max_output_tokens: Math.max(maxTokens, 32) };
    if (kind === 'tool') Object.assign(body, { tools: [{ type: 'function', name: TOOL.name, description: TOOL.description, parameters: TOOL.schema }], tool_choice: 'auto' });
    if (stream) body.stream = true;
  } else {
    const user = kind === 'vision'
      ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }, { type: 'text', text: 'What colour is this picture? One word.' }]
      : isPdfKind(kind) ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64(kind) } }, { type: 'text', text: docPrompt(kind) }]
        : OFFICE_FILES[kind] ? [{ type: 'document', source: { type: 'base64', media_type: OFFICE_FILES[kind].mime, data: officeBase64(kind) } }, { type: 'text', text: DOC_PROMPT }]
        : kind === 'tool' ? TOOL_PROMPT : kind === 'think' ? THINK_PROMPT : kind === 'shown' ? SHOWN_PROMPT : PROMPT;
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
  const out = { text: '', thinking: false, thinkingField: '', toolCalls: [], usage: null, tokens: null };
  if (!data || typeof data !== 'object') return out;
  if (family === 'gemini') {
    for (const part of data.candidates?.[0]?.content?.parts || []) {
      if (part.thought && typeof part.text === 'string') { out.thinking = true; out.thinkingField = 'parts[].thought'; } else if (typeof part.text === 'string') out.text += part.text;
      if (part.functionCall?.name) out.toolCalls.push(part.functionCall.name);
    }
    const meta = data.usageMetadata || {};
    out.usage = Object.keys(meta).sort();
    if (meta.thoughtsTokenCount && !out.thinking) { out.thinking = true; out.thinkingField = 'usageMetadata.thoughtsTokenCount (no text)'; }
    out.tokens = { output: meta.candidatesTokenCount ?? null, thinking: meta.thoughtsTokenCount ?? null };
    return out;
  }
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
  // How many tokens the answer took, and how many of them the thinking (where the service says it).
  const usage = data.usage || {};
  const details = usage.completion_tokens_details || usage.output_tokens_details || {};
  out.tokens = { output: usage.completion_tokens ?? usage.output_tokens ?? null, thinking: details.reasoning_tokens ?? null };
  return out;
}

/** The events of a stream (the lines `data: {...}` of the text), in the order they came. */
export function parseEvents(text) {
  const events = [];
  // Google's stream without `alt=sse` is one JSON list.
  if (/^\s*\[/.test(String(text))) {
    try {
      const list = JSON.parse(text);
      if (Array.isArray(list)) return list.filter((item) => item && typeof item === 'object');
    } catch { /* not a list */ }
  }
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
    if (family === 'gemini') {
      for (const part of event.candidates?.[0]?.content?.parts || []) {
        for (const key of Object.keys(part)) fields.add(key);
        if (part.functionCall) tools = true;
      }
      if (event.usageMetadata) usage = true;
      continue;
    }
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
export async function send({ fetchImpl = fetch, base = BASE, key = '', family, body, stream = false, headers = {}, session = 'probe', timeoutMs = 90_000, variant = 1 }) {
  const started = Date.now();
  const { __model: modelName, ...payload } = body || {};
  const response = await fetchImpl(`${base}${pathOf(family, modelName, stream, variant)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), 'user-agent': 'Noureon-probe/1', 'x-opencode-session': session, ...headers },
    body: JSON.stringify(payload),
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
  return { status: result.status, ok: true, ms: result.ms, text: plain(answer.text, 60), thinking: answer.thinking, thinkingField: answer.thinkingField, toolCalls: answer.toolCalls, usage: answer.usage, tokens: answer.tokens };
};

/**
 * The second step of a tool call, which a research reply and Advanced mode do again and again: the model called a tool, the answer of the tool is sent back.
 * Two ways are tried, because a model that thinks may want its thinking sent back with the tool's answer (A: what the model said is sent back as it
 * came, thinking included; B: without the thinking). The result of each: whether it was accepted, and what the model answered.
 */
export async function probeToolLoop({ model, family, run }) {
  const id = model.id;
  const first = await run(family, buildBody(family, id, 'tool', { extra: { max_tokens: 800 } }), {});
  if (!first.ok) return { skipped: 'the first step failed', status: first.status, message: first.message };
  let data = null;
  try {
    data = JSON.parse(first.raw);
  } catch { /* not JSON */ }
  const ask = TOOL_PROMPT;
  let variants = null;
  if (family === 'chat') {
    const message = data?.choices?.[0]?.message || {};
    if (!message.tool_calls?.length) return { skipped: 'no tool call in the first step' };
    const call = message.tool_calls[0];
    const thinking = {};
    for (const field of ['reasoning_content', 'reasoning']) if (typeof message[field] === 'string' && message[field]) thinking[field] = message[field];
    const base = (assistantExtra) => ({
      model: id,
      max_tokens: 800,
      tools: [{ type: 'function', function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.schema } }],
      messages: [{ role: 'user', content: ask }, { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls, ...assistantExtra }, { role: 'tool', tool_call_id: call.id, content: '14:05' }]
    });
    variants = [['A:with-thinking', base(thinking)], ['B:without-thinking', base({})]];
    if (!Object.keys(thinking).length) variants = variants.slice(1);
  } else if (family === 'gemini') {
    const parts = (data?.candidates?.[0]?.content?.parts || []).filter(Boolean);
    const call = parts.find((part) => part.functionCall);
    if (!call) return { skipped: 'no tool call in the first step' };
    const base = (carried) => ({
      __model: id,
      generationConfig: { maxOutputTokens: 800 },
      tools: [{ functionDeclarations: [{ name: TOOL.name, description: TOOL.description, parameters: TOOL.schema }] }],
      contents: [{ role: 'user', parts: [{ text: ask }] }, { role: 'model', parts: carried }, { role: 'user', parts: [{ functionResponse: { name: call.functionCall.name, response: { result: '14:05' } } }] }]
    });
    variants = [['A:all-parts', base(parts)], ['B:without-thoughts', base(parts.filter((part) => !part.thought))], ['C:calls-only', base(parts.filter((part) => part.functionCall))]];
  } else if (family === 'responses') {
    const items = (data?.output || []).filter(Boolean);
    const call = items.find((item) => item.type === 'function_call');
    if (!call) return { skipped: 'no tool call in the first step' };
    const base = (carried) => ({
      model: id,
      max_output_tokens: 800,
      tools: [{ type: 'function', name: TOOL.name, description: TOOL.description, parameters: TOOL.schema }],
      input: [{ role: 'user', content: ask }, ...carried, { type: 'function_call_output', call_id: call.call_id, output: '14:05' }]
    });
    variants = [['A:all-items', base(items)], ['B:calls-only', base(items.filter((item) => item.type === 'function_call'))]];
  } else {
    const blocks = (data?.content || []).filter(Boolean);
    const call = blocks.find((block) => block.type === 'tool_use');
    if (!call) return { skipped: 'no tool call in the first step' };
    const base = (carried) => ({
      model: id,
      max_tokens: 800,
      tools: [{ name: TOOL.name, description: TOOL.description, input_schema: TOOL.schema }],
      messages: [{ role: 'user', content: ask }, { role: 'assistant', content: carried }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: '14:05' }] }]
    });
    variants = [['A:all-blocks', base(blocks)], ['B:without-thinking', base(blocks.filter((block) => block.type !== 'thinking' && block.type !== 'redacted_thinking'))]];
  }
  const out = { firstStep: { thinkingSent: variants.length > 1 || family !== 'chat' } };
  for (const [name, body] of variants) out[name] = settle(await run(family, body, {}), family);
  return out;
}

/** The text of the thinking in a stream (not only that there is a field), by the form of the API: how many characters, the first words, and where it came. */
export function thinkingOfStream(family, text) {
  let chars = 0;
  let sample = '';
  const fields = new Set();
  const take = (value, field) => {
    if (typeof value !== 'string' || !value) return;
    chars += value.length;
    fields.add(field);
    if (sample.length < 120) sample += value.slice(0, 120 - sample.length);
  };
  for (const event of parseEvents(text)) {
    if (family === 'gemini') {
      for (const part of event.candidates?.[0]?.content?.parts || []) if (part.thought) take(part.text, 'parts[].thought');
    } else if (family === 'chat') {
      const delta = event.choices?.[0]?.delta || {};
      for (const field of ['reasoning_content', 'reasoning', 'reasoning_text']) take(delta[field], field);
      for (const detail of Array.isArray(delta.reasoning_details) ? delta.reasoning_details : []) take(detail?.text || detail?.summary, 'reasoning_details');
    } else if (family === 'responses') {
      if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') take(event.delta, event.type);
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') take(event.delta.thinking, 'thinking_delta');
  }
  return { chars, sample: plain(sample, 120), fields: [...fields] };
}

/** What the app sends today to say how deep the model thinks (its default depth), without the field that only asks for the summary. */
function defaultThinkingFields(id) {
  const row = OPENCODE_REASONING_CONFIGS[`opencode-go/${id}`];
  const fields = row ? opencodeThinkingFields({ provider: 'opencode-go', id: `opencode-go/${id}` }, row.defaultEffort) : {};
  if (fields.thinking?.display) delete fields.thinking.display;
  return fields;
}

/** The field of each form that asks for the text of the thinking, added to what the app sends (a model of the chat form has none to add). */
export function askedThinkingFields(family, fields) {
  if (family === 'messages') return { ...fields, thinking: { ...(fields.thinking?.type === 'disabled' ? {} : fields.thinking), type: fields.thinking?.type && fields.thinking.type !== 'disabled' ? fields.thinking.type : 'adaptive', display: 'summarized' } };
  if (family === 'responses') return { ...fields, reasoning: { ...fields.reasoning, summary: 'auto' } };
  if (family === 'gemini') return { generationConfig: { thinkingConfig: { ...fields.generationConfig?.thinkingConfig, includeThoughts: true } } };
  return null;
}

/**
 * Whether the model gives the text of its thinking in a stream: with what the app sends today (`default`), and with the field of its form that asks for a
 * summary (`asked`). `verdict`: "by default", "only when asked", "refused when asked" (the service took the first and refused the second), "none" or "error".
 */
export async function probeShown({ id, family, run, maxTokens = 3000 }) {
  const attempt = async (extra) => {
    const result = await run(family, buildBody(family, id, 'shown', { stream: true, extra: { max_tokens: maxTokens, ...extra } }), { stream: true });
    if (!result.ok) return { ok: false, status: result.status, message: result.message };
    return { ok: true, status: result.status, ms: result.ms, ...thinkingOfStream(family, result.raw) };
  };
  const baseline = defaultThinkingFields(id);
  const byDefault = await attempt(baseline);
  const extra = askedThinkingFields(family, JSON.parse(JSON.stringify(baseline)));
  const asked = extra ? await attempt(extra) : null;
  let verdict = 'none';
  if (!byDefault.ok) verdict = 'error';
  else if (byDefault.chars > 0) verdict = 'by default';
  else if (asked?.ok && asked.chars > 0) verdict = 'only when asked';
  else if (asked && !asked.ok) verdict = 'refused when asked';
  return { default: byDefault, asked, verdict };
}

/** The tests of one model. `run(body, options)` sends and gives the result of `send`. */
export async function probeModel({ model, tests = TESTS, run, key = '' }) {
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
  if (family === 'gemini' && tests.includes('stream')) {
    // Google's stream in its other form (a JSON list, no `alt=sse`): which of the two answers?
    result.streamAsList = settle(await run(family, buildBody(family, id, 'basic'), { stream: true, variant: 2 }), family);
  }
  if (tests.includes('tools')) result.tools = await one('tool');
  if (tests.includes('toolloop')) result.toolloop = await probeToolLoop({ model, family, run });
  if (tests.includes('effort')) {
    // Each depth of thinking, alone, in the setting of the form of the model: is it accepted, and how much does the thinking take (the words and the numbers).
    result.effort = {};
    const values = family === 'messages' ? ['low', 'medium', 'high', 'xhigh', 'max'] : family === 'gemini' ? ['minimal', 'low', 'medium', 'high'] : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    for (const value of values) {
      const extra = family === 'gemini' ? { generationConfig: { thinkingConfig: { thinkingLevel: value, includeThoughts: true } }, max_tokens: 1500 } : family === 'chat' ? { reasoning_effort: value, max_tokens: 1500 }
        : family === 'responses' ? { reasoning: { effort: value }, max_tokens: 1500 }
          : { thinking: { type: 'adaptive' }, output_config: { effort: value }, max_tokens: 1500 };
      result.effort[value] = await one('think', { extra });
    }
  }
  if (tests.includes('params')) {
    // The settings the app sets on a reply (temperature, top_p, a long output): are they taken, or refused as the unknown thinking settings were?
    result.params = {};
    for (const [name, extra] of [['temperature', { temperature: 0.7 }], ['top_p', { top_p: 0.95 }], ['max_tokens:16384', { max_tokens: 16384 }]]) result.params[name] = await one('basic', { extra });
  }
  if (tests.includes('auth') && family === 'gemini' && key) {
    // Where does the key go? As the Bearer of the other forms, as Google's own header, or both (the app sends both).
    result.auth = {};
    for (const [name, options] of [['bearerOnly', {}], ['xGoogApiKeyOnly', { key: '', headers: { 'x-goog-api-key': key } }], ['both', { headers: { 'x-goog-api-key': key } }]]) {
      const attempt = await run(family, buildBody(family, id, 'basic'), options);
      result.auth[name] = { status: attempt.status, ok: attempt.ok, message: attempt.message };
    }
  }
  if (tests.includes('vision')) result.vision = await one('vision');
  if (tests.includes('document')) result.document = await one('document', { extra: { max_tokens: 200 } });
  if (tests.includes('converted')) {
    // The PDF made of a Word file and of a PowerPoint file (the plan to convert them before sending): is it read as well as the PDF of the first test?
    result.converted = {};
    for (const kind of Object.keys(CONVERTED)) result.converted[CONVERTED[kind]] = await one(kind, { extra: { max_tokens: 200 } });
  }
  if (tests.includes('pdfimage')) result.pdfimage = await one('pdfimage', { extra: { max_tokens: 200 } });
  if (tests.includes('office')) {
    // A Word file and a PowerPoint file, sent as they are (the answer should hold MANGO if the model read the file).
    result.office = {};
    for (const kind of Object.keys(OFFICE_FILES)) result.office[kind] = await one(kind, { extra: { max_tokens: 200 } });
  }
  if (tests.includes('shown')) result.shown = await probeShown({ id, family, run });
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

/** `--model a,b:messages`: models by id, each with the form of its API when it is given (`id:form`), else a guess that the probe checks. */
export const modelsNamed = (text) => String(text || '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [id, form] = entry.split(':');
  const known = MODELS.find((model) => model.id === id);
  if (PATH[form]) return { id, family: form, free: /free/.test(id), ...(known?.free ? { free: true } : {}) };
  return known || { id, family: 'chat', free: /free/.test(id), guess: true };
});

/** The ids the service lists that the probe does not have yet. */
export async function newModels({ fetchImpl = fetch, base = BASE } = {}) {
  const listed = await listModels({ fetchImpl, base });
  const ids = (Array.isArray(listed.body?.data) ? listed.body.data : Array.isArray(listed.body) ? listed.body : []).map((entry) => String(entry?.id ?? entry)).filter(Boolean);
  const known = new Set(MODELS.map((model) => model.id));
  return { status: listed.status, listed: ids.length, new: ids.filter((id) => !known.has(id)) };
}

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
  if (args.includes('--new')) {
    try {
      const found = await newModels({ fetchImpl, base });
      out.log(found.listed ? `${found.listed} models listed by the service; not in the probe yet: ${found.new.length ? found.new.join(', ') : '(none)'}` : `The service gave no list (status ${found.status}).`);
      return found.listed ? 0 : 1;
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
  const named = argOf(args, '--model');
  if (named) models = modelsNamed(named);
  else if (only) models = MODELS.filter((model) => only.split(',').map((name) => name.trim()).includes(model.id));
  else if (args.includes('--free')) models = MODELS.filter((model) => model.free);
  const asked = argOf(args, '--tests');
  // `converted` needs two PDFs made of the Office files: only in a run that asks for it by name, and then it says first what is missing.
  const tests = (asked || TESTS.filter((name) => name !== 'converted').join(',')).split(',').map((name) => name.trim()).filter((name) => TESTS.includes(name));
  if (tests.includes('converted')) {
    try {
      for (const kind of ['docx', 'pptx']) convertedBase64(kind);
    } catch (error) {
      out.error(plain(error.message, 400));
      return 2;
    }
  }
  if (!models.length || !tests.length) {
    out.error('No model or no test matches.');
    return 2;
  }
  const session = `probe-${Math.random().toString(36).slice(2, 10)}`;
  let stopped = false;
  let tooMany = 0;
  const unavailable = new Set();
  // `--max-tokens N`: a bigger limit for the models that think a long time before they answer (the answer of a small limit is cut: "incomplete").
  const more = Number(argOf(args, '--max-tokens')) || 0;
  const run = async (family, rawBody, options = {}) => {
    const body = more && family === 'gemini' ? { ...rawBody, generationConfig: { ...rawBody.generationConfig, maxOutputTokens: Math.max(more, Number(rawBody.generationConfig?.maxOutputTokens || 0)) } } : more ? { ...rawBody, [family === 'responses' ? 'max_output_tokens' : 'max_tokens']: Math.max(more, Number(rawBody.max_tokens || rawBody.max_output_tokens || 0)) } : rawBody;
    if (stopped) return { status: 0, ok: false, message: 'stopped after a 429' };
    if (unavailable.has(body?.model ?? body?.__model)) return { status: 429, ok: false, message: 'skipped: the endpoint of this model said it is unavailable' };
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await send({ fetchImpl, base, key: options.key !== undefined ? options.key : key, family, body, stream: Boolean(options.stream), headers: options.headers || {}, session, variant: options.variant || 1 });
    // A model whose endpoint is "unavailable" (a free one, now and then) says 429 too: it is left alone for the rest of the run, and it is not the limit of the account.
    if (result.status === 429 && /unavailable/i.test(result.message || '')) {
      unavailable.add(body?.model ?? body?.__model);
      out.error(`${body?.model ?? body?.__model}: endpoint unavailable (429); its other tests are skipped.`);
      return result;
    }
    // The limit of the account is told apart only when a 429 comes again and again.
    tooMany = result.status === 429 ? tooMany + 1 : 0;
    if (tooMany === 1) out.error(`429 (${plain(result.message, 120)}): going on; stops if it comes 4 times in a row.`);
    if (tooMany >= 4) {
      stopped = true;
      out.error('429 four times in a row: stopped (a limit was reached). What was found so far is kept.');
    }
    return result;
  };
  const report = { when: new Date().toISOString(), base, models: [] };
  const file = argOf(args, '--out') || 'opencode-probe-result.json';
  const { writeFileSync } = await import('node:fs');
  // On one line (a long run is easier to paste), and kept after each model: a long run that is stopped or crashes keeps what it found.
  const keep = () => writeFileSync(file, `${JSON.stringify(report)}\n`);
  for (const [at, model] of models.entries()) {
    out.log(`probing ${model.id} (${model.family}) ... ${at + 1}/${models.length}`);
    report.models.push(await probeModel({ model, tests, run, key }));
    keep();
  }
  if (tests.includes('errors')) report.errors = await probeErrors({ run, key });
  keep();
  if (tests.includes('shown')) {
    out.log('\nWho gives the text of the thinking (stream):');
    for (const model of report.models) if (model.shown) out.log(`${model.id.padEnd(30)} ${model.family.padEnd(10)} ${model.shown.verdict.padEnd(20)} default ${String(model.shown.default.chars ?? model.shown.default.message ?? '').slice(0, 40).padEnd(8)} asked ${model.shown.asked ? String(model.shown.asked.chars ?? model.shown.asked.message ?? '').slice(0, 60) : '-'}`);
  }
  out.log(`written: ${file} (no key in it; paste it to be read)`);
  return stopped ? 1 : 0;
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// Not process.exit(): on Windows it can crash Node ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") while the connections are still closing.
if (isMain) process.exitCode = await main();
