#!/usr/bin/env node
// Which models of OpenRouter, NVIDIA and Gemini give the text of their thinking (or a summary of it) in a stream, and what has to be asked for it. The same question as the test
// `shown` of scripts/opencode-probe.mjs, for the other providers of the app. Each model is asked a small question that makes it think, in the ways the app asks it:
//
//   default   nothing said about thinking;
//   asked     what the app sends to get it: OpenRouter `reasoning: { effort }`, NVIDIA `reasoning_effort` with `chat_template_kwargs`, Gemini `includeThoughts`;
//   responses OpenRouter only, for the models of OpenAI (they give a summary of their thinking in the Responses form with `reasoning.summary: auto`, and often none in the chat form).
//
// `verdict`: "by default" (text came with nothing asked), "only when asked", "only in the Responses form" (the app asks the chat form unless a tool is in use: nothing is shown for it),
// "none" (no text in any way: nothing to ask), "error". Each request is read until 200 characters of thinking have come, or until the answer has: a few tokens each.
//
// The keys are read from the environment and never printed or written: OPENROUTER_API_KEY, NVIDIA_API_KEY, GEMINI_API_KEY (a provider with no key is left out).
//
//   node scripts/thinking-shown-probe.mjs --dry-run
//   OPENROUTER_API_KEY=... NVIDIA_API_KEY=... GEMINI_API_KEY=... node scripts/thinking-shown-probe.mjs
//   node scripts/thinking-shown-probe.mjs --provider openrouter --only openai/gpt-6-luna,anthropic/claude-haiku-5.5      --out file.json   (default thinking-shown-probe-result.json)
//   --prompt "..."   another question (a model that does not think about an easy one, such as Claude Sonnet, says "none": ask it something that needs thinking)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MODELS, getModelApiId } from '../src/app/runtime/shell/model-registry.js';
import { readEvents } from './opencode-claude-probe.mjs';


const ENDPOINTS = Object.freeze({
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
});
const REGISTRY_PROVIDER = Object.freeze({ openrouter: 'openrouter', gemini: 'gemini', nvidia: 'nvidia' });
const USER_AGENT = 'Noureon-probe/1 (+https://noureon.com)';
export const PROMPT = 'A train leaves at 3:40 pm and travels 135 km at 45 km/h, stops 12 minutes, then travels 60 km at 40 km/h. At what time does it arrive? Answer with the time only.';

/** The models to ask, with the form of API each is asked in: the text models of the app of these providers. */
function modelsToAsk({ providers = Object.keys(ENDPOINTS), only = [] } = {}) {
  const wanted = new Set(only.map((name) => name.trim()).filter(Boolean));
  const rows = [];
  for (const provider of providers) {
    for (const model of MODELS.filter((entry) => entry.provider === REGISTRY_PROVIDER[provider] && entry.outputModality !== 'image')) {
      const form = provider === 'gemini' ? 'gemini' : 'chat';
      const apiId = getModelApiId(model);
      if (wanted.size && !wanted.has(model.id) && !wanted.has(apiId)) continue;
      rows.push({ provider, id: model.id, apiId, name: model.name || model.id, form });
    }
  }
  return rows;
}

/** The request for a model: no limit given, read as it streams. */
function buildRequest({ provider, apiId, form, key, prompt = PROMPT }) {
  const base = ENDPOINTS[provider];
  if (form === 'gemini') {
    return {
      url: `${base}/models/${apiId}:streamGenerateContent?alt=sse`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'user-agent': USER_AGENT },
      body: { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
    };
  }
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': USER_AGENT };
  if (form === 'responses') {
    return { url: `${base}/responses`, headers, body: { model: apiId, input: prompt, stream: true } };
  }
  return {
    url: `${base}/chat/completions`,
    headers,
    body: { model: apiId, messages: [{ role: 'user', content: prompt }], stream: true, stream_options: { include_usage: true } }
  };
}

/** What a stream has said so far, event by event: the characters written, the characters thought, and how it ended. */
function absorb(form, event, state) {
  if (form === 'gemini') {
    for (const part of event.candidates?.[0]?.content?.parts || []) {
      if (typeof part.text !== 'string') continue;
      if (part.thought) state.reasoningChars += part.text.length;
      else state.visibleChars += part.text.length;
    }
    if (event.candidates?.[0]?.finishReason) state.finish = event.candidates[0].finishReason;
    const usage = event.usageMetadata;
    if (usage) state.tokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) || state.tokens;
    return;
  }
  if (form === 'responses') {
    if (event.type === 'response.output_text.delta') state.visibleChars += String(event.delta || '').length;
    else if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') state.reasoningChars += String(event.delta || '').length;
    else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      state.finish = event.response?.status === 'incomplete' ? event.response?.incomplete_details?.reason || 'incomplete' : 'stop';
      state.tokens = event.response?.usage?.output_tokens ?? state.tokens;
    }
    return;
  }
  const delta = event.choices?.[0]?.delta || {};
  if (typeof delta.content === 'string') state.visibleChars += delta.content.length;
  for (const field of ['reasoning_content', 'reasoning', 'reasoning_text']) if (typeof delta[field] === 'string') state.reasoningChars += delta[field].length;
  if (event.choices?.[0]?.finish_reason) state.finish = event.choices[0].finish_reason;
  if (event.usage?.completion_tokens) state.tokens = event.usage.completion_tokens;
}

const PROVIDERS = Object.freeze(['openrouter', 'nvidia', 'gemini']);
const KEY_NAMES = Object.freeze({ openrouter: 'OPENROUTER_API_KEY', nvidia: 'NVIDIA_API_KEY', gemini: 'GEMINI_API_KEY' });
const ENOUGH_CHARS = 200;
const scrub = (text, key) => (key ? String(text).split(key).join('[key]') : String(text));

/** The ways to ask a model, as { name, form, extra } (`extra` is merged into the body of the request). */
export function variantsFor(row) {
  if (row.provider === 'openrouter') {
    const variants = [
      { name: 'default', form: 'chat', extra: {} },
      { name: 'asked', form: 'chat', extra: { reasoning: { effort: 'medium' } } }
    ];
    if (row.apiId.startsWith('openai/')) variants.push({ name: 'responses', form: 'responses', extra: { reasoning: { effort: 'medium', summary: 'auto' } } });
    return variants;
  }
  if (row.provider === 'nvidia') {
    return [
      { name: 'default', form: 'chat', extra: {} },
      { name: 'asked', form: 'chat', extra: { reasoning_effort: 'medium', chat_template_kwargs: { enable_thinking: true, thinking: true } } }
    ];
  }
  return [
    { name: 'default', form: 'gemini', extra: {} },
    { name: 'asked', form: 'gemini', extra: { generationConfig: { thinkingConfig: { includeThoughts: true } } } }
  ];
}

/** One request, read until enough thinking has come or the answer is there. */
export async function askOnce({ fetchImpl = fetch, row, variant, key, prompt = PROMPT }) {
  const request = buildRequest({ provider: row.provider, apiId: row.apiId, form: variant.form, key, prompt });
  const body = { ...request.body, ...variant.extra };
  const state = { visibleChars: 0, reasoningChars: 0, finish: '', tokens: null };
  const controller = new AbortController();
  const startedAt = Date.now();
  let stopped = false;
  try {
    const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]) });
    if (!response.ok) return { ok: false, status: response.status, message: scrub(await response.text().catch(() => ''), key).slice(0, 240) };
    for await (const event of readEvents(response)) {
      absorb(variant.form, event, state);
      if (state.reasoningChars >= ENOUGH_CHARS) {
        stopped = true;
        controller.abort();
        break;
      }
    }
  } catch (error) {
    if (!stopped) return { ok: false, status: 0, message: scrub(error?.message || error, key).slice(0, 240) };
  }
  return { ok: true, thinkingChars: state.reasoningChars, answerChars: state.visibleChars, finish: state.finish, ms: Date.now() - startedAt };
}

/** What the variants of a model say together. */
export function verdictOf(results) {
  const byName = Object.fromEntries(results.map((entry) => [entry.name, entry]));
  const has = (name) => byName[name]?.ok && byName[name].thinkingChars > 0;
  if (!byName.default?.ok && !byName.asked?.ok) return 'error';
  if (has('default')) return 'by default';
  if (has('asked')) return 'only when asked';
  if (has('responses')) return 'only in the Responses form';
  if (results.every((entry) => entry.ok)) return 'none';
  return 'error';
}

export async function runProbe({ fetchImpl = fetch, env = {}, providers = PROVIDERS, only = [], prompt = PROMPT, log = () => {}, delayMs = 800 }) {
  const result = { when: new Date().toISOString(), rows: [], skipped: [] };
  for (const row of modelsToAsk({ providers, only })) {
    const key = String(env[KEY_NAMES[row.provider]] || '').trim();
    if (!key) {
      if (!result.skipped.some((entry) => entry.provider === row.provider)) result.skipped.push({ provider: row.provider, reason: `no ${KEY_NAMES[row.provider]}` });
      continue;
    }
    const results = [];
    for (const variant of variantsFor(row)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      results.push({ name: variant.name, ...(await askOnce({ fetchImpl, row, variant, key, prompt })) });
    }
    const verdict = verdictOf(results);
    result.rows.push({ provider: row.provider, id: row.id, apiId: row.apiId, verdict, results });
    log(`${row.provider.padEnd(10)} ${row.apiId.padEnd(44)} ${verdict.padEnd(26)} ${results.map((entry) => `${entry.name} ${entry.ok ? entry.thinkingChars : `HTTP ${entry.status}`}`).join('  ')}`);
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
  const providers = option('--provider') ? option('--provider').split(',').filter((name) => PROVIDERS.includes(name)) : [...PROVIDERS];
  const only = option('--only') ? option('--only').split(',') : [];
  if (args.includes('--dry-run')) {
    const rows = modelsToAsk({ providers, only });
    for (const row of rows) console.log(`${row.provider.padEnd(10)} ${row.apiId.padEnd(44)} ${variantsFor(row).map((variant) => variant.name).join(', ')}`);
    console.log(`\n${rows.length} models; about ${rows.reduce((sum, row) => sum + variantsFor(row).length, 0)} small requests (each read until ${ENOUGH_CHARS} characters of thinking, a few tokens).`);
  } else {
    const out = option('--out') || 'thinking-shown-probe-result.json';
    const result = await runProbe({ env: process.env, providers, only, prompt: option('--prompt') || PROMPT, log: (text) => console.log(text) });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nThe result is in ${out} (no key in it).`);
  }
}
