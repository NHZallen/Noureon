#!/usr/bin/env node
// A probe of Claude Haiku 5.5 on OpenCode Go (the Messages form of API), made with the code of the app itself: the same request builder
// (src/app/runtime/reply/opencode-request.js), the same tools and guidance of Advanced mode, the same collector of the stream. It answers, with real
// requests, why a reply of this model in Advanced mode so often has no tool call (and so no file):
//
//   limits   which `max_tokens` the service takes (the app sends 16384 when nothing else is said): a limit it refuses is a 400, a limit that is too
//            small for a model that thinks (`thinking: adaptive` with `output_config.effort`) ends the reply at `stop_reason: max_tokens`, often before
//            the call of the tool or the answer was written;
//   tools    for each depth of thinking, a request for a file with the tool of Advanced mode: how it ended (`stop_reason`), how many tokens it wrote,
//            how many characters of thinking and of text, and whether a call of the tool came with arguments that can be read;
//   loop     the answer of the tool sent back with the thinking block kept (its signature), as the app does for the next round: does the service take it.
//   route    which way the model makes a file when the request carries both sets of instructions the app sends in Advanced mode (the file instructions with
//            the ````file block, and the Python ones): for each version of the Python instructions (`legacy` = before 2026-10-23, `priority` = now,
//            `no-spec` = without the file instructions), each request is read only as far as the first sign of the way (a call of run_python, or a
//            ````file block) and counted. `--trials` requests for each prompt and version, `--efforts` picks the depth.
//   display  whether the service gives a summary of the thinking when `thinking.display` is `summarized` (and how long, with a sample of its first words).
//
// The key is read from the environment (OPENCODE_GO_KEY); it is never printed or written. Every request is small except the ones of `tools`, whose
// length is the point (a deep thinking can write the whole of `--limits`: a few cents at most per request).
//
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs                          limits, then tools and loop for medium, high and max at 16384
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs --tests limits           only which limits are taken
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs --efforts low,medium,high,xhigh,max --limits 16384,65536
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs --tests route,display --efforts medium --trials 4     which way a file is made, and the thinking summary
//   --trials N   requests for each version and prompt of `route` (default 4)       --display summarized   send thinking.display in the other tests too
//   --prompt "..."   another request for the tools test        --out file.json   where the result is written (default opencode-claude-probe-result.json)
//   --base <address>   another base address        --model <id>   another model of the Messages form (default claude-haiku-5-5)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildOpencodeRequest, OPENCODE_DEFAULT_MAX_TOKENS } from '../src/app/runtime/reply/opencode-request.js';
import { applyAnthropicTools, createAnthropicCollector } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { FILE_ROUTE, RUN_PYTHON_TOOL_SERVER, getSandboxGuidance } from '../src/app/runtime/sandbox/sandbox-guidance.js';
import { getFileAuthoringGuidance } from '../src/app/ui/files/file-authoring-guidance.js';

export const BASE = 'https://opencode.ai/inference/go/v1';
export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const LIMIT_CANDIDATES = Object.freeze([16384, 32768, 65536, 131072]);
export const DEFAULT_PROMPT = '請用 Python 做一份 3 頁的 PowerPoint 簡報，主題是颱風來臨前的準備，存成 typhoon.pptx，內容要有標題、重點條列與一頁檢查清單。';

// The instructions of Advanced mode before the order of the two ways was told (the line `FILE_ROUTE` replaced).
export const LEGACY_FILE_ROUTE = 'When the user does ask for a Word, PowerPoint, Excel or PDF file: create it with Python and save it in /output. You have full freedom over layout, colour, typography and graphics; do not write them as ````file blocks.';
// Asks that do not say how: the way is the model's to choose.
export const ROUTE_PROMPTS = Object.freeze([
  '幫我做一份 5 頁的簡報，主題是颱風來臨前的準備。',
  'Write me a two-page Word report on how to keep a household budget.'
]);
export const ROUTE_VARIANTS = Object.freeze(['legacy', 'priority', 'no-spec']);

const USER_AGENT = 'Noureon/1 (+https://noureon.com)';

/** The request of the app for this model: its payload, with what the app puts in it (system instruction, thinking depth, tools). */
export function buildProbeRequest({ model = 'claude-haiku-5-5', effort = null, maxTokens = null, prompt, tools = false, toolTurns = [], system = null, display = null }) {
  const modelInfo = { provider: 'opencode-go', id: model, name: model };
  const { payload } = buildOpencodeRequest({
    format: 'messages',
    modelId: model,
    apiKey: 'x',
    sessionId: 'noureon-probe',
    modelInfo,
    historyForApi: [],
    currentMessageForApi: { role: 'user', parts: [{ text: prompt }] },
    generationConfig: { maxTokens },
    reasoningEffort: effort,
    systemInstruction: { parts: [{ text: system ?? (tools ? getSandboxGuidance({ host: 'server' }) : 'Answer briefly.') }] },
    modelSupportsVision: () => true,
    buildChatMessages: () => [],
    buildResponsesInput: () => []
  });
  // The app asks for the summary of the thinking of this model itself now (opencode-models.js); `display: 'off'` takes that field out, to compare.
  if (display === 'off' && payload.thinking) delete payload.thinking.display;
  else if (display && payload.thinking) payload.thinking = { ...payload.thinking, display };
  if (tools || toolTurns.length) applyAnthropicTools(payload, { tools: tools ? [RUN_PYTHON_TOOL_SERVER] : [], toolTurns });
  return payload;
}

/** The system instruction of a version of Advanced mode: the file instructions of the app (when `withSpec`) and the Python ones, in that order. */
export async function routeSystem(variant) {
  const python = getSandboxGuidance({ host: 'server' });
  const spec = variant === 'no-spec' ? '' : await getFileAuthoringGuidance({ deckDesign: 'auto', documentDesign: 'auto' });
  const text = variant === 'legacy' ? python.replace(FILE_ROUTE, LEGACY_FILE_ROUTE) : python;
  return [spec, text].filter(Boolean).join('\n\n');
}

/** Which way a request goes, from its first signs: 'python' (a call of run_python), 'file-block' (a ````file block in its text), 'text' (it wrote on without either). */
export function routeDecider() {
  const seen = { route: '', text: '' };
  const decide = (event) => {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      seen.route = 'python';
      return true;
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      seen.text += event.delta.text || '';
      if (/`{3,}file\b/.test(seen.text)) seen.route = 'file-block';
      else if (seen.text.length > 800) seen.route = 'text';
      return Boolean(seen.route);
    }
    return false;
  };
  return { seen, decide };
}

/** The server-sent events of a response, one object for each `data:` line (a line that is not JSON is skipped). */
export async function* readEvents(response) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const text = line.replace(/\r$/, '');
      if (!text.startsWith('data:')) continue;
      const data = text.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        // not an event
      }
    }
  }
}

/** One request, sent and read to its end: how it went, in the terms of the questions above. */
export async function ask({ fetchImpl = fetch, key, base = BASE, payload, signal, earlyStop = null }) {
  const startedAt = Date.now();
  const response = await fetchImpl(`${base}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream', 'User-Agent': USER_AGENT, 'x-opencode-session': 'noureon-probe' },
    body: JSON.stringify(payload),
    signal
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, status: response.status, error: scrub(body, key).slice(0, 400), elapsedMs: Date.now() - startedAt };
  }
  const collector = createAnthropicCollector();
  let firstByteMs = null;
  let thinkingChars = 0;
  let thinkingSample = '';
  let stoppedEarly = false;
  let outputTokens = null;
  let inputTokens = null;
  let stopReason = '';
  const kinds = {};
  for await (const event of readEvents(response)) {
    firstByteMs ??= Date.now() - startedAt;
    kinds[event.type] = (kinds[event.type] || 0) + 1;
    if (event.type === 'message_start') inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
    if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens ?? outputTokens;
      stopReason = event.delta?.stop_reason || stopReason;
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
      thinkingChars += String(event.delta.thinking || '').length;
      if (thinkingSample.length < 300) thinkingSample += String(event.delta.thinking || '').slice(0, 300 - thinkingSample.length);
    }
    collector.add(event);
    if (earlyStop?.(event)) {
      stoppedEarly = true;
      break;
    }
  }
  const result = collector.result();
  return {
    ok: !collector.failure,
    status: response.status,
    failure: collector.failure ? scrub(collector.failure, key) : '',
    elapsedMs: Date.now() - startedAt,
    firstByteMs,
    stopReason: stopReason || result.finishReason,
    inputTokens,
    outputTokens,
    thinkingChars,
    thinkingSample,
    stoppedEarly,
    textChars: result.text.length,
    calls: result.toolCalls.map((call) => ({ name: call.name, argumentsReadable: call.args !== null, argumentChars: String(call.arguments || '').length })),
    eventKinds: kinds,
    collected: result
  };
}

const scrub = (text, key) => (key ? String(text).split(key).join('[key]') : String(text));

/** The row that tells a request in one line. */
export const line = (label, run) => {
  if (!run.ok && run.status !== 200) return `${label.padEnd(30)} HTTP ${run.status}  ${run.error}`;
  if (run.failure) return `${label.padEnd(30)} STREAM ERROR  ${run.failure}`;
  const calls = run.calls.length ? run.calls.map((call) => `${call.name}${call.argumentsReadable ? '' : '(arguments cut)'}`).join(',') : 'no call';
  return `${label.padEnd(30)} ${String(run.stopReason || '?').padEnd(10)} out ${String(run.outputTokens ?? '?').padStart(6)} tok  thinking ${String(run.thinkingChars).padStart(6)} ch  text ${String(run.textChars).padStart(5)} ch  ${calls}  ${(run.elapsedMs / 1000).toFixed(1)}s`;
};

/** What the numbers say, in words: the one thing worth reading first. */
export function verdict(results) {
  const notes = [];
  const cut = results.tools.filter((run) => run.stopReason === 'max_tokens');
  if (cut.length) notes.push(`${cut.length} of ${results.tools.length} requests for a file ended at max_tokens (${cut.map((run) => `${run.effort}@${run.limit}`).join(', ')}): the model ran out of room before it finished; thinking took ${cut.map((run) => run.thinkingChars).join('/')} characters.`);
  const noCall = results.tools.filter((run) => run.ok && run.stopReason !== 'max_tokens' && !run.calls.length);
  if (noCall.length) notes.push(`${noCall.length} requests ended normally with no call of the tool (${noCall.map((run) => `${run.effort}@${run.limit}`).join(', ')}): the model chose to answer with text; read its text before blaming the format.`);
  const unreadable = results.tools.filter((run) => run.calls.some((call) => !call.argumentsReadable));
  if (unreadable.length) notes.push(`${unreadable.length} requests had a call whose arguments could not be read (cut or not JSON): ${unreadable.map((run) => `${run.effort}@${run.limit}`).join(', ')}.`);
  const refused = results.limits.filter((run) => !run.ok);
  if (refused.length) notes.push(`The service refused these limits: ${refused.map((run) => `${run.limit} (HTTP ${run.status}: ${run.error})`).join('; ')}.`);
  const badLoop = results.loop.filter((run) => !run.ok);
  if (badLoop.length) notes.push(`The next round (answer of the tool, thinking kept) was refused or failed for: ${badLoop.map((run) => `${run.effort}@${run.limit}: ${run.error || run.failure}`).join('; ')}.`);
  if (results.route?.length) {
    const table = {};
    for (const row of results.route) {
      table[row.variant] ||= { python: 0, 'file-block': 0, text: 0, none: 0, error: 0 };
      table[row.variant][row.route] = (table[row.variant][row.route] || 0) + 1;
    }
    for (const [variant, counts] of Object.entries(table)) notes.push(`route ${variant}: ${Object.entries(counts).filter(([, count]) => count).map(([name, count]) => `${name} ${count}`).join(', ')}.`);
  }
  if (results.display?.length) {
    const summarized = results.display.filter((row) => row.display === 'summarized');
    if (summarized.some((row) => !row.ok)) notes.push(`thinking.display "summarized" was refused: ${summarized.find((row) => !row.ok).error}`);
    else if (summarized.length) notes.push(`thinking.display "summarized": ${summarized.every((row) => row.thinkingChars > 0) ? 'the service sent a summary of the thinking' : 'accepted, but no thinking text came'} (${summarized.map((row) => row.thinkingChars).join('/')} characters); without it: ${results.display.filter((row) => row.display !== 'summarized').map((row) => row.thinkingChars).join('/')}.`);
  }
  if (!notes.length) notes.push('Nothing wrong was found in this run: every request ended normally and every call of the tool was readable.');
  return notes;
}

export async function probe({ key, base = BASE, model = 'claude-haiku-5-5', tests = ['limits', 'tools', 'loop'], efforts = ['medium', 'high', 'max'], limits = [OPENCODE_DEFAULT_MAX_TOKENS], prompt = DEFAULT_PROMPT, trials = 4, display = null, fetchImpl = fetch, log = () => {} }) {
  const results = { model, limits: [], tools: [], loop: [], route: [], display: [] };
  if (tests.includes('limits')) {
    for (const limit of LIMIT_CANDIDATES) {
      const run = { limit, ...(await ask({ fetchImpl, key, base, payload: buildProbeRequest({ model, effort: 'low', maxTokens: limit, prompt: 'Reply with the single word: ok' }) })) };
      delete run.collected;
      results.limits.push(run);
      log(line(`limit ${limit}`, run));
    }
  }
  if (tests.includes('tools') || tests.includes('loop')) {
    for (const limit of limits) {
      for (const effort of efforts) {
        const run = { effort, limit, ...(await ask({ fetchImpl, key, base, payload: buildProbeRequest({ model, effort, maxTokens: limit, prompt, tools: true, display }) })) };
        const collected = run.collected;
        delete run.collected;
        results.tools.push(run);
        log(line(`tools ${effort} @ ${limit}`, run));
        if (tests.includes('loop') && run.ok && run.calls.length && run.calls.every((call) => call.argumentsReadable)) {
          const turn = { assistant: collected, results: collected.toolCalls.map((call) => ({ id: call.id, name: call.name, content: JSON.stringify({ ok: true, stdout: 'saved typhoon.pptx\n', stderr: '', files: [{ path: '/output/typhoon.pptx', size: 4096 }], elapsed_ms: 120 }) })) };
          const next = { effort, limit, ...(await ask({ fetchImpl, key, base, payload: buildProbeRequest({ model, effort, maxTokens: limit, prompt, tools: true, toolTurns: [turn], display }) })) };
          delete next.collected;
          results.loop.push(next);
          log(line(`loop  ${effort} @ ${limit}`, next));
        }
      }
    }
  }
  if (tests.includes('route')) {
    for (const effort of efforts) {
      const systems = Object.fromEntries(await Promise.all(ROUTE_VARIANTS.map(async (variant) => [variant, await routeSystem(variant)])));
      const jobs = [];
      for (const variant of ROUTE_VARIANTS) for (const text of ROUTE_PROMPTS) for (let trial = 1; trial <= trials; trial += 1) jobs.push({ variant, text, trial });
      // A few at a time: each is read only as far as its first sign, so they are short.
      for (let at = 0; at < jobs.length; at += 4) {
        await Promise.all(jobs.slice(at, at + 4).map(async ({ variant, text, trial }) => {
          const { seen, decide } = routeDecider();
          const run = await ask({ fetchImpl, key, base, earlyStop: decide, payload: buildProbeRequest({ model, effort, prompt: text, tools: true, system: systems[variant], display }) });
          delete run.collected;
          const row = { variant, prompt: text.slice(0, 24), trial, effort, route: seen.route || (run.ok ? 'none' : 'error'), elapsedMs: run.elapsedMs, stopReason: run.stopReason, outputTokens: run.outputTokens, error: run.error || run.failure || '' };
          results.route.push(row);
          log(`route ${variant.padEnd(8)} ${text.slice(0, 18).padEnd(18)} #${trial} ${row.route.padEnd(10)} ${(row.elapsedMs / 1000).toFixed(1)}s${row.error ? `  ${row.error.slice(0, 120)}` : ''}`);
        }));
      }
    }
  }
  if (tests.includes('display')) {
    for (const shown of ['off', 'summarized']) {
      for (let trial = 1; trial <= 2; trial += 1) {
        const { decide } = routeDecider();
        const run = await ask({ fetchImpl, key, base, earlyStop: decide, payload: buildProbeRequest({ model, effort: efforts[0] || 'medium', prompt: ROUTE_PROMPTS[0], tools: true, system: await routeSystem('priority'), display: shown }) });
        delete run.collected;
        results.display.push({ display: shown === 'off' ? '(not sent)' : shown, trial, ok: run.ok, status: run.status, error: run.error || run.failure || '', thinkingChars: run.thinkingChars, thinkingSample: run.thinkingSample, elapsedMs: run.elapsedMs });
        log(`display ${(shown === 'off' ? '(not sent)' : shown).padEnd(11)} #${trial} ${run.ok ? `thinking ${run.thinkingChars} ch` : `HTTP ${run.status} ${run.error}`}${run.thinkingSample ? `  «${run.thinkingSample.replace(/\s+/g, ' ').slice(0, 100)}»` : ''}`);
      }
    }
  }
  results.verdict = verdict(results);
  return results;
}

function parseArguments(argv) {
  const options = { tests: ['limits', 'tools', 'loop'], efforts: ['medium', 'high', 'max'], limits: [OPENCODE_DEFAULT_MAX_TOKENS], prompt: DEFAULT_PROMPT, trials: 4, display: null, out: 'opencode-claude-probe-result.json', base: BASE, model: 'claude-haiku-5-5' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--tests') options.tests = String(value).split(',');
    else if (flag === '--efforts') options.efforts = String(value).split(',').filter((effort) => EFFORTS.includes(effort));
    else if (flag === '--limits') options.limits = String(value).split(',').map(Number).filter((number) => number > 0);
    else if (flag === '--prompt') options.prompt = String(value);
    else if (flag === '--out') options.out = String(value);
    else if (flag === '--base') options.base = String(value);
    else if (flag === '--model') options.model = String(value);
    else if (flag === '--trials') options.trials = Math.max(1, Number(value) || 4);
    else if (flag === '--display') options.display = String(value);
    else continue;
    index += 1;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const key = process.env.OPENCODE_GO_KEY || '';
  if (!key) {
    console.error('Set OPENCODE_GO_KEY (the key of OpenCode Go) in the environment.');
    process.exit(1);
  }
  const options = parseArguments(process.argv.slice(2));
  console.log(`Claude probe: ${options.model}, tests ${options.tests.join(',')}, efforts ${options.efforts.join(',')}, limits ${options.limits.join(',')}\n`);
  const results = await probe({ key, ...options, log: (text) => console.log(text) });
  console.log('\nWhat it says:');
  for (const note of results.verdict) console.log(`- ${note}`);
  writeFileSync(options.out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nThe result is in ${options.out} (no key in it).`);
}
