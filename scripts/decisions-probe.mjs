#!/usr/bin/env node
// Tries OpenRouter's Decisions API with the very request the page makes (src/app/runtime/decisions/decision-client.js), for a few messages, and says
// what came back: the status, how long it took, the raw answer, and the yes/no the page would take from it. Also asks the CORS question a browser asks.
// The key is read from the environment and is never printed.
//
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs --model typesafe/jev-1.14 --compare openai/gpt-6-luna-decisions

import { DECISION_MODEL, DECISION_THRESHOLD, DECISION_TIMEOUT_MS, DECISION_URL, buildDecisionRequest, parseDecisionResponse, verdictOf } from '../src/app/runtime/decisions/decision-client.js';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const key = String(process.env.OPENROUTER_API_KEY || '').trim();
if (!key) {
  console.error('Set OPENROUTER_API_KEY first:  OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs');
  process.exit(1);
}
const models = [option('--model') || DECISION_MODEL, option('--compare')].filter(Boolean);
const tools = [{ name: 'yt-dlp', description: 'download video or audio from a web page' }, { name: 'ffmpeg', description: 'convert audio and video files' }];

// message, and what the page should conclude (search, file, chart, tool): true / false
const CASES = [
  { message: '今天台北的天氣如何？', expect: { search: true, file: false, chart: false, tool: false } },
  { message: '幫我寫一份 3 頁的簡報，主題是 2026 電動車市場，做成 pptx 給我下載', expect: { search: false, file: true, chart: false, tool: false } },
  { message: '這是我們三季的營收：Q1 120、Q2 150、Q3 210，幫我畫成圖表', expect: { search: false, file: false, chart: true, tool: false } },
  { message: '把這個網址的影片下載成 mp3：https://example.com/watch?v=abc', expect: { search: false, file: false, chart: false, tool: true } },
  { message: '請用三句話解釋什麼是遞迴', expect: { search: false, file: false, chart: false, tool: false } },
  { message: 'Who won the Nobel Prize in Physics this year?', expect: { search: true, file: false, chart: false, tool: false } }
];

const redact = (text) => String(text).split(key).join('***');
const show = (value) => (value === null || value === undefined ? '-' : value.toFixed(2));

async function ask(model, testCase) {
  const request = buildDecisionRequest({ message: testCase.message, tools, model });
  const started = Date.now();
  let response;
  try {
    response = await fetch(DECISION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
  } catch (error) {
    return { ok: false, ms: Date.now() - started, detail: String(error?.message || error) };
  }
  const ms = Date.now() - started;
  const text = redact(await response.text());
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  const decisions = body ? parseDecisionResponse(body) : null;
  return { ok: response.ok && Boolean(decisions), status: response.status, ms, decisions, raw: text.slice(0, 600) };
}

for (const model of models) {
  console.log(`\n=== ${model} ===  (the page waits ${DECISION_TIMEOUT_MS} ms at most; a probability of ${DECISION_THRESHOLD} or more is "yes")`);
  let right = 0;
  let total = 0;
  let slow = 0;
  for (const testCase of CASES) {
    const result = await ask(model, testCase);
    if (!result.ok) {
      console.log(`✗ ${testCase.message.slice(0, 40)}…  HTTP ${result.status ?? '-'}  ${result.ms} ms  ${result.detail || result.raw}`);
      continue;
    }
    if (result.ms > DECISION_TIMEOUT_MS) slow += 1;
    const verdicts = Object.fromEntries(['search', 'file', 'chart', 'tool'].map((name) => [name, verdictOf(result.decisions, name)]));
    const wrong = Object.entries(testCase.expect).filter(([name, want]) => verdicts[name] !== null && verdicts[name] !== want).map(([name]) => name);
    Object.entries(testCase.expect).forEach(([name, want]) => { if (verdicts[name] !== null) { total += 1; if (verdicts[name] === want) right += 1; } });
    const numbers = ['search', 'file', 'chart', 'tool'].map((name) => `${name}=${show(result.decisions[name])}`).join(' ');
    console.log(`${wrong.length ? '≠' : '✓'} ${testCase.message.slice(0, 34).padEnd(34)}  ${String(result.ms).padStart(4)} ms${result.ms > DECISION_TIMEOUT_MS ? ' (TOO SLOW for the page)' : ''}  ${numbers}${wrong.length ? `   unexpected: ${wrong.join(',')}` : ''}`);
  }
  console.log(`agreed with my guess on ${right}/${total} answers; ${slow} of ${CASES.length} calls slower than the page's limit`);
}

// The question a browser asks before it lets a page call another site (the page is at these addresses).
for (const origin of ['https://noureon.com', 'https://staging.noureon.com']) {
  try {
    const response = await fetch(DECISION_URL, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    console.log(`\nCORS preflight from ${origin}: HTTP ${response.status}  allow-origin=${response.headers.get('access-control-allow-origin') ?? '(none)'}  allow-headers=${response.headers.get('access-control-allow-headers') ?? '(none)'}`);
  } catch (error) {
    console.log(`\nCORS preflight from ${origin}: failed (${error?.message || error})`);
  }
}
console.log('\nAnswers marked ✗ failed; the page silently goes back to its word lists for those. "≠" only means the model disagreed with my guess, which is for you to judge.');
