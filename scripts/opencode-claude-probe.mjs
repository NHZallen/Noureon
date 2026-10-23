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
//
// The key is read from the environment (OPENCODE_GO_KEY); it is never printed or written. Every request is small except the ones of `tools`, whose
// length is the point (a deep thinking can write the whole of `--limits`: a few cents at most per request).
//
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs                          limits, then tools and loop for medium, high and max at 16384
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs --tests limits           only which limits are taken
//   OPENCODE_GO_KEY=... node scripts/opencode-claude-probe.mjs --efforts low,medium,high,xhigh,max --limits 16384,65536
//   --prompt "..."   another request for the tools test        --out file.json   where the result is written (default opencode-claude-probe-result.json)
//   --base <address>   another base address        --model <id>   another model of the Messages form (default claude-haiku-5-5)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildOpencodeRequest, OPENCODE_DEFAULT_MAX_TOKENS } from '../src/app/runtime/reply/opencode-request.js';
import { applyAnthropicTools, createAnthropicCollector } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { RUN_PYTHON_TOOL_SERVER, getSandboxGuidance } from '../src/app/runtime/sandbox/sandbox-guidance.js';

export const BASE = 'https://opencode.ai/inference/go/v1';
export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const LIMIT_CANDIDATES = Object.freeze([16384, 32768, 65536, 131072]);
export const DEFAULT_PROMPT = '請用 Python 做一份 3 頁的 PowerPoint 簡報，主題是颱風來臨前的準備，存成 typhoon.pptx，內容要有標題、重點條列與一頁檢查清單。';

const USER_AGENT = 'Noureon/1 (+https://noureon.com)';

/** The request of the app for this model: its payload, with what the app puts in it (system instruction, thinking depth, tools). */
export function buildProbeRequest({ model = 'claude-haiku-5-5', effort = null, maxTokens = null, prompt, tools = false, toolTurns = [] }) {
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
    systemInstruction: { parts: [{ text: tools ? getSandboxGuidance({ host: 'server' }) : 'Answer briefly.' }] },
    modelSupportsVision: () => true,
    buildChatMessages: () => [],
    buildResponsesInput: () => []
  });
  if (tools || toolTurns.length) applyAnthropicTools(payload, { tools: tools ? [RUN_PYTHON_TOOL_SERVER] : [], toolTurns });
  return payload;
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
export async function ask({ fetchImpl = fetch, key, base = BASE, payload, signal }) {
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
    if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') thinkingChars += String(event.delta.thinking || '').length;
    collector.add(event);
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
  if (!notes.length) notes.push('Nothing wrong was found in this run: every request ended normally and every call of the tool was readable.');
  return notes;
}

export async function probe({ key, base = BASE, model = 'claude-haiku-5-5', tests = ['limits', 'tools', 'loop'], efforts = ['medium', 'high', 'max'], limits = [OPENCODE_DEFAULT_MAX_TOKENS], prompt = DEFAULT_PROMPT, fetchImpl = fetch, log = () => {} }) {
  const results = { model, limits: [], tools: [], loop: [] };
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
        const run = { effort, limit, ...(await ask({ fetchImpl, key, base, payload: buildProbeRequest({ model, effort, maxTokens: limit, prompt, tools: true }) })) };
        const collected = run.collected;
        delete run.collected;
        results.tools.push(run);
        log(line(`tools ${effort} @ ${limit}`, run));
        if (tests.includes('loop') && run.ok && run.calls.length && run.calls.every((call) => call.argumentsReadable)) {
          const turn = { assistant: collected, results: collected.toolCalls.map((call) => ({ id: call.id, name: call.name, content: JSON.stringify({ ok: true, stdout: 'saved typhoon.pptx\n', stderr: '', files: [{ path: '/output/typhoon.pptx', size: 4096 }], elapsed_ms: 120 }) })) };
          const next = { effort, limit, ...(await ask({ fetchImpl, key, base, payload: buildProbeRequest({ model, effort, maxTokens: limit, prompt, tools: true, toolTurns: [turn] }) })) };
          delete next.collected;
          results.loop.push(next);
          log(line(`loop  ${effort} @ ${limit}`, next));
        }
      }
    }
  }
  results.verdict = verdict(results);
  return results;
}

function parseArguments(argv) {
  const options = { tests: ['limits', 'tools', 'loop'], efforts: ['medium', 'high', 'max'], limits: [OPENCODE_DEFAULT_MAX_TOKENS], prompt: DEFAULT_PROMPT, out: 'opencode-claude-probe-result.json', base: BASE, model: 'claude-haiku-5-5' };
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
