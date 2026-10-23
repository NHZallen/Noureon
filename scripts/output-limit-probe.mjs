#!/usr/bin/env node
// What a reply may write at most, for the providers whose models the app calls without saying how long a reply may be (OpenRouter, Gemini, NVIDIA, and the chat and
// responses forms of OpenCode Go: the app sends them no `max_tokens`, so the provider decides). For each model it finds out two things with real requests:
//
//   official   the most the model may write in one reply: read from what the provider lists (OpenRouter `top_provider.max_completion_tokens`, Gemini `outputTokenLimit`),
//              or, where nothing is listed (NVIDIA, OpenCode), from the refusal of a request that asks for far too much;
//   default    what the provider does when the app says nothing: the model is asked for a very long output with no limit given, and read as it streams until it has
//              written `--stop-chars` characters (it is then cut off by this probe: the reply was not cut short by the provider) or until the provider ends the reply by
//              itself. A reply the provider ends at its own limit (`length`, `MAX_TOKENS`, `incomplete`) says what that default is: it is the number to compare with `official`.
//
// A model whose default is far below its official limit gets cut short in the middle of a long answer, with no error: the app has to send the limit for it.
//
// The keys are read from the environment and never printed or written (OPENROUTER_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY, OPENCODE_GO_KEY); a provider with no key is left
// out (the list of OpenRouter is public: its official limits are read without a key).
//
//   node scripts/output-limit-probe.mjs --dry-run                                  which models would be asked, and the most it can cost
//   OPENROUTER_API_KEY=... GEMINI_API_KEY=... NVIDIA_API_KEY=... OPENCODE_GO_KEY=... node scripts/output-limit-probe.mjs
//   node scripts/output-limit-probe.mjs --provider gemini,nvidia                   only some providers
//   node scripts/output-limit-probe.mjs --only gemini-4-argon,z-ai/glm-5.3         only some models (the id of the app, or the id of the provider)
//   --stop-chars 60000   how long a reply is read before it is cut off here (about 20000 to 30000 tokens of numbers)       --skip default|official
//   --out file.json   where the result is written (default output-limit-probe-result.json)
//
// The most it can cost: every model written about `--stop-chars` characters at most, one request at a time (a few cents for most, more for the dearest models: `--dry-run` counts).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MODELS, getModelApiId } from '../src/app/runtime/shell/model-registry.js';
import { OPENCODE_GO_BASE_URL, opencodeFormatOf } from '../src/app/runtime/shell/opencode-models.js';
import { contextNamed, limitNamed, MAXOUT_ASKED } from './opencode-probe.mjs';
import { readEvents } from './opencode-claude-probe.mjs';

export const PROMPT = 'Write the whole numbers from 1 to 30000 in order, separated by single spaces. Write nothing else, no comments, and do not stop early.';
export const SMALL_PROMPT = 'Reply with the single word: ok';
export const DEFAULT_STOP_CHARS = 60_000;
export const ENDPOINTS = Object.freeze({
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  opencode: OPENCODE_GO_BASE_URL
});
const KEY_NAMES = Object.freeze({ openrouter: 'OPENROUTER_API_KEY', gemini: 'GEMINI_API_KEY', nvidia: 'NVIDIA_API_KEY', opencode: 'OPENCODE_GO_KEY' });
const REGISTRY_PROVIDER = Object.freeze({ openrouter: 'openrouter', gemini: 'gemini', nvidia: 'nvidia', opencode: 'opencode-go' });
const CUT_BY_PROVIDER = /^(length|max_tokens|max_output_tokens|MAX_TOKENS|incomplete)$/;
const USER_AGENT = 'Noureon-probe/1 (+https://noureon.com)';

const scrub = (text, key) => (key ? String(text).split(key).join('[key]') : String(text));

/** The models to ask, with the form of API each is asked in: the text models of the app of these providers (OpenCode: only the forms that need no limit). */
export function modelsToAsk({ providers = Object.keys(ENDPOINTS), only = [] } = {}) {
  const wanted = new Set(only.map((name) => name.trim()).filter(Boolean));
  const rows = [];
  for (const provider of providers) {
    for (const model of MODELS.filter((entry) => entry.provider === REGISTRY_PROVIDER[provider] && entry.outputModality !== 'image')) {
      const form = provider === 'gemini' ? 'gemini' : provider === 'opencode' ? opencodeFormatOf(model) : 'chat';
      // OpenCode's own Gemini and Messages forms are not here: the Messages form is given a limit by the app, and its Gemini form was found to take any.
      if (!(provider === 'opencode' ? ['chat', 'responses'] : ['chat', 'gemini']).includes(form)) continue;
      const apiId = getModelApiId(model);
      if (wanted.size && !wanted.has(model.id) && !wanted.has(apiId)) continue;
      rows.push({ provider, id: model.id, apiId, name: model.name || model.id, form });
    }
  }
  return rows;
}

/** The request for a model: no limit given (`limit` null), or the limit asked for; `stream` true reads it as it comes. */
export function buildRequest({ provider, apiId, form, key, prompt = PROMPT, limit = null, stream = true }) {
  const base = ENDPOINTS[provider];
  if (form === 'gemini') {
    return {
      url: `${base}/models/${apiId}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'user-agent': USER_AGENT },
      body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], ...(limit ? { generationConfig: { maxOutputTokens: limit } } : {}) }
    };
  }
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': USER_AGENT, ...(provider === 'opencode' ? { 'x-opencode-session': 'noureon-output-probe' } : {}) };
  if (form === 'responses') {
    return { url: `${base}/responses`, headers, body: { model: apiId, input: prompt, ...(stream ? { stream: true } : {}), ...(limit ? { max_output_tokens: limit } : {}) } };
  }
  return {
    url: `${base}/chat/completions`,
    headers,
    body: { model: apiId, messages: [{ role: 'user', content: prompt }], ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}), ...(limit ? { max_tokens: limit } : {}) }
  };
}

/** What a stream has said so far, event by event: the characters written, the characters thought, how it ended, and the tokens the provider counted. */
export function absorb(form, event, state) {
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

/**
 * Asks for a very long output with no limit and reads it until the provider ends it or `stopChars` characters are written.
 * `verdict`: "cut" (the provider ended the reply at its own limit: `tokens` is that default), "not cut" (it wrote `stopChars` characters with no limit in sight),
 * "ended" (the model stopped by itself before: nothing is known), "error".
 */
export async function defaultLength({ fetchImpl = fetch, provider, apiId, form, key, stopChars = DEFAULT_STOP_CHARS }) {
  const request = buildRequest({ provider, apiId, form, key });
  const state = { visibleChars: 0, reasoningChars: 0, finish: '', tokens: null };
  const controller = new AbortController();
  const startedAt = Date.now();
  let stopped = false;
  try {
    const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)]) });
    if (!response.ok) return { verdict: 'error', status: response.status, error: scrub(await response.text().catch(() => ''), key).slice(0, 300), ms: Date.now() - startedAt };
    for await (const event of readEvents(response)) {
      absorb(form, event, state);
      if (state.visibleChars + state.reasoningChars >= stopChars && !state.finish) {
        stopped = true;
        controller.abort();
        break;
      }
    }
  } catch (error) {
    if (!stopped) return { verdict: 'error', status: 0, error: scrub(error?.message || error, key).slice(0, 300), ms: Date.now() - startedAt };
  }
  const written = state.visibleChars + state.reasoningChars;
  const base = { ...state, written, ms: Date.now() - startedAt, stopChars };
  if (state.finish && CUT_BY_PROVIDER.test(state.finish)) return { verdict: 'cut', ...base, tokensWritten: state.tokens ?? Math.round(written / 3) };
  if (stopped) return { verdict: 'not cut', ...base };
  return { verdict: 'ended', ...base };
}

/** The official limits the providers list: OpenRouter (public) and Gemini (with the key). A Map from the id the provider uses to { official, context }. */
export async function listedLimits({ provider, fetchImpl = fetch, key = '' }) {
  const limits = new Map();
  if (provider === 'openrouter') {
    const response = await fetchImpl(`${ENDPOINTS.openrouter}/models`, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) return limits;
    for (const model of (await response.json())?.data || []) limits.set(model.id, { official: model.top_provider?.max_completion_tokens ?? null, context: model.context_length ?? null, source: 'openrouter /models' });
  } else if (provider === 'gemini' && key) {
    const response = await fetchImpl(`${ENDPOINTS.gemini}/models?pageSize=200`, { headers: { 'x-goog-api-key': key, 'user-agent': USER_AGENT } });
    if (!response.ok) return limits;
    for (const model of (await response.json())?.models || []) limits.set(String(model.name || '').replace(/^models\//, ''), { official: model.outputTokenLimit ?? null, context: model.inputTokenLimit ?? null, source: 'gemini /models' });
  }
  return limits;
}

/** Where nothing is listed: a small question asked with far too large a limit; the refusal names the limit (or the context window, which is no limit of the output). */
export async function limitFromRefusal({ fetchImpl = fetch, provider, apiId, form, key }) {
  const request = buildRequest({ provider, apiId, form, key, prompt: SMALL_PROMPT, limit: MAXOUT_ASKED, stream: false });
  try {
    const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(60_000) });
    if (response.ok) return { official: null, accepted: MAXOUT_ASKED, source: 'accepted the huge limit: none that it names' };
    const message = scrub(await response.text().catch(() => ''), key);
    return { official: limitNamed(message), context: contextNamed(message), source: 'refusal', message: message.slice(0, 300), status: response.status };
  } catch (error) {
    return { official: null, source: 'error', message: scrub(error?.message || error, key).slice(0, 200) };
  }
}

/** The sentence that says what to do with a model. */
export function advice(row) {
  const official = row.official?.official ?? null;
  const verdict = row.default?.verdict;
  if (verdict === 'cut') return `the provider cuts it at about ${row.default.tokensWritten} tokens when none is given${official ? ` (official ${official})` : ''}: send ${official ? `the official ${official}` : 'a limit'}`;
  if (verdict === 'not cut') return `no limit hit up to ${row.default.written} characters: sending none is fine${official ? ` (official ${official})` : ''}`;
  if (verdict === 'ended') return 'the model stopped by itself: not enough to tell; ask again with another prompt';
  if (verdict === 'error') return `the request failed (${row.default.status}): ${String(row.default.error || '').slice(0, 80)}`;
  return official ? `official ${official}` : 'no limit found';
}

export async function runProbe({ fetchImpl = fetch, env = {}, providers, only = [], stopChars = DEFAULT_STOP_CHARS, skip = [], log = () => {}, delayMs = 300 }) {
  const asked = modelsToAsk({ providers, only });
  const results = { when: new Date().toISOString(), stopChars, rows: [], skipped: [] };
  const listed = {};
  for (const provider of [...new Set(asked.map((row) => row.provider))]) {
    const key = String(env[KEY_NAMES[provider]] || '').trim();
    if (!skip.includes('official')) listed[provider] = await listedLimits({ provider, fetchImpl, key }).catch(() => new Map());
    if (!key) {
      results.skipped.push({ provider, reason: `no ${KEY_NAMES[provider]}` });
      log(`${provider}: no ${KEY_NAMES[provider]}, left out`);
    }
  }
  for (const row of asked) {
    const key = String(env[KEY_NAMES[row.provider]] || '').trim();
    const out = { ...row };
    const fromList = listed[row.provider]?.get(row.apiId) || listed[row.provider]?.get(row.id);
    if (fromList) out.official = fromList;
    if (key) {
      if (!out.official && !skip.includes('official')) out.official = await limitFromRefusal({ fetchImpl, provider: row.provider, apiId: row.apiId, form: row.form, key });
      if (!skip.includes('default')) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        out.default = await defaultLength({ fetchImpl, provider: row.provider, apiId: row.apiId, form: row.form, key, stopChars });
      }
    }
    out.advice = advice(out);
    results.rows.push(out);
    log(`${row.provider.padEnd(10)} ${row.apiId.padEnd(44)} official ${String(out.official?.official ?? '?').padEnd(9)} default ${String(out.default?.verdict ?? '-').padEnd(8)} ${out.advice}`);
  }
  return results;
}

function parseArguments(argv) {
  const options = { providers: Object.keys(ENDPOINTS), only: [], stopChars: DEFAULT_STOP_CHARS, skip: [], out: 'output-limit-probe-result.json', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--provider') options.providers = String(value).split(',').map((name) => name.trim()).filter((name) => name in ENDPOINTS);
    else if (flag === '--only') options.only = String(value).split(',');
    else if (flag === '--stop-chars') options.stopChars = Math.max(1000, Number(value) || DEFAULT_STOP_CHARS);
    else if (flag === '--skip') options.skip = String(value).split(',');
    else if (flag === '--out') options.out = String(value);
    else if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    } else continue;
    index += 1;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = parseArguments(process.argv.slice(2));
  const asked = modelsToAsk(options);
  const tokens = Math.round(options.stopChars / 2.5);
  if (options.dryRun) {
    for (const row of asked) console.log(`${row.provider.padEnd(10)} ${row.form.padEnd(9)} ${row.apiId}`);
    console.log(`\n${asked.length} models; each is read until about ${options.stopChars} characters (about ${tokens} tokens) at most: up to ${(asked.length * tokens).toLocaleString('en')} tokens of output in all.`);
  } else {
    console.log(`Output limit probe: ${asked.length} models, ${options.providers.join(', ')}; each read until about ${options.stopChars} characters.\n`);
    const results = await runProbe({ ...options, env: process.env, log: (text) => console.log(text) });
    writeFileSync(options.out, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`\nThe result is in ${options.out} (no key in it).`);
  }
}
