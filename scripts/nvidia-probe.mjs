#!/usr/bin/env node
// Tries the new NVIDIA / OpenRouter models with a real key, one check at a time, and says what came back (status, time, the answer).
// Keys are read from the environment and never printed.
//
//   NVIDIA_API_KEY=nvapi-... node scripts/nvidia-probe.mjs                  (the two NVIDIA models)
//   OPENROUTER_API_KEY=sk-or-... node scripts/nvidia-probe.mjs --openrouter  (nvidia/nemotron-3.5-super-vl:free)
//   node scripts/nvidia-probe.mjs --only video --video ./clip.mp4            (one check; a video of your own instead of the made one)
//   node scripts/nvidia-probe.mjs --model stepfun-ai/step-5-preview          (one model id as the provider lists it)
//
// Checks: list (is the id in /v1/models), basic, stream, tool (a call and the answer of the tool sent back), vision (a red picture),
// video (a short clip, made with ffmpeg when it is installed), reasoning (the fields that switch thinking on, off and its level, with how many tokens each used).

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const viaOpenRouter = args.includes('--openrouter');
const key = String((viaOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.NVIDIA_API_KEY) || '').trim();
if (!key) {
  console.error(viaOpenRouter ? 'Set OPENROUTER_API_KEY first.' : 'Set NVIDIA_API_KEY first:  NVIDIA_API_KEY=nvapi-... node scripts/nvidia-probe.mjs');
  process.exit(1);
}
const BASE = viaOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://integrate.api.nvidia.com/v1';
const models = option('--model')
  ? [option('--model')]
  : viaOpenRouter ? ['nvidia/nemotron-3.5-super-vl:free'] : ['nvidia/nemotron-3.5-super-vl-120b-a12b', 'stepfun-ai/step-5-preview'];
const ALL = ['list', 'basic', 'stream', 'tool', 'vision', 'video', 'reasoning'];
const only = option('--only');
const checks = only ? only.split(',') : ALL;

const redact = (text) => String(text).split(key).join('***');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

// A solid red 64x64 PNG, made here so no file is needed.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
const makePng = () => {
  const size = 64;
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [220, 20, 20]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
};
const PNG = makePng().toString('base64');

const getVideo = () => {
  const given = option('--video');
  if (given) return readFileSync(given);
  const dir = mkdtempSync(join(tmpdir(), 'nvidia-probe-'));
  const file = join(dir, 'clip.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2:r=10', '-pix_fmt', 'yuv420p', file]);
  return readFileSync(file);
};

const post = async (body, { stream = false } = {}) => {
  const started = Date.now();
  const response = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!stream) {
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, ms: Date.now() - started, json, text };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let first = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!first) first = Date.now() - started;
    raw += decoder.decode(value, { stream: true });
  }
  return { status: response.status, ms: Date.now() - started, firstMs: first, text: raw };
};

const answerOf = (result) => {
  const message = result.json?.choices?.[0]?.message;
  if (!message) return `(no message) ${redact(result.text).slice(0, 300)}`;
  const calls = (message.tool_calls || []).map((call) => `${call.function?.name}(${call.function?.arguments})`).join(' ');
  const thinking = message.reasoning_content || message.reasoning || '';
  return `${calls ? `TOOL ${calls}  ` : ''}${String(message.content || '').trim().slice(0, 300)}${thinking ? `  [thinking ${String(thinking).length} chars]` : ''}`;
};
const report = (model, check, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${model}  ${check}  ${redact(detail)}`);

const TOOL = { type: 'function', function: { name: 'get_time', description: 'Get the current time in a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } };

const run = async (model, check) => {
  const base = { model, max_tokens: 400 };
  if (check === 'list') {
    const response = await fetch(`${BASE}/models`, { headers });
    const json = await response.json().catch(() => null);
    const ids = (json?.data || []).map((entry) => entry.id);
    const near = ids.filter((id) => /nemotron-3\.5|step-5/i.test(id));
    return report(model, check, ids.includes(model), ids.includes(model) ? 'listed' : `not listed; close ids: ${near.join(', ') || '(none)'}`);
  }
  if (check === 'basic') {
    const result = await post({ ...base, messages: [{ role: 'user', content: 'Reply with the single word: pong' }] });
    return report(model, check, result.status === 200, `${result.status} ${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'stream') {
    const result = await post({ ...base, stream: true, messages: [{ role: 'user', content: 'Count from 1 to 5.' }] }, { stream: true });
    const pieces = (result.text.match(/data: \{/g) || []).length;
    return report(model, check, result.status === 200 && pieces > 1, `${result.status} first ${result.firstMs}ms total ${result.ms}ms ${pieces} chunks`);
  }
  if (check === 'tool') {
    const messages = [{ role: 'user', content: 'What time is it in Paris? Use the tool.' }];
    const first = await post({ ...base, tools: [TOOL], tool_choice: 'auto', messages });
    const call = first.json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return report(model, check, false, `${first.status} no tool call: ${answerOf(first)}`);
    const second = await post({ ...base, tools: [TOOL], messages: [...messages, first.json.choices[0].message, { role: 'tool', tool_call_id: call.id, content: '{"time":"14:05"}' }] });
    return report(model, check, second.status === 200 && /14[:.]?05|2:05/.test(answerOf(second)), `call ${call.function.name}(${call.function.arguments}) -> ${second.status} ${answerOf(second)}`);
  }
  if (check === 'vision') {
    const result = await post({ ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'What colour is this picture? One word.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }] }] });
    return report(model, check, result.status === 200 && /red/i.test(answerOf(result)), `${result.status} ${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'video') {
    const clip = getVideo().toString('base64');
    const result = await post({ ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'What colour is this video? One word.' }, { type: 'video_url', video_url: { url: `data:video/mp4;base64,${clip}` } }] }] });
    return report(model, check, result.status === 200 && /blue/i.test(answerOf(result)), `${result.status} ${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'reasoning') {
    // The ways to switch thinking on or off: the OpenAI field, the OpenRouter object, and the NVIDIA chat template switch. A refused field shows as a FAIL with the reason.
    const variants = viaOpenRouter
      ? [['reasoning none', { reasoning: { effort: 'none' } }], ['reasoning low', { reasoning: { effort: 'low' } }], ['reasoning medium', { reasoning: { effort: 'medium' } }], ['reasoning high', { reasoning: { effort: 'high' } }], ['reasoning enabled', { reasoning: { enabled: true } }]]
      : [['reasoning_effort none', { reasoning_effort: 'none' }], ['reasoning_effort low', { reasoning_effort: 'low' }], ['reasoning_effort medium', { reasoning_effort: 'medium' }], ['reasoning_effort high', { reasoning_effort: 'high' }],
        ['enable_thinking false', { chat_template_kwargs: { enable_thinking: false } }], ['enable_thinking true', { chat_template_kwargs: { enable_thinking: true } }]];
    for (const [label, extra] of variants) {
      const result = await post({ ...base, max_tokens: 2000, ...extra, messages: [{ role: 'user', content: 'How many primes are below 200? Answer with the number only.' }] });
      const tokens = result.json?.usage?.completion_tokens;
      report(model, label, result.status === 200, `${result.status} ${result.ms}ms ${result.status === 200 ? `${answerOf(result)}  (${tokens ?? '?'} tokens; the answer is 46)` : redact(result.text).slice(0, 200)}`);
    }
    return null;
  }
  return report(model, check, false, 'unknown check');
};

for (const model of models) {
  for (const check of checks) {
    try { await run(model, check); } catch (error) { report(model, check, false, `error: ${error?.message || error}`); }
  }
}
