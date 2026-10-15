#!/usr/bin/env node
// Probe Nemotron 3.5 Super VL and Step-5 on NVIDIA's API, or Nemotron on OpenRouter (--openrouter).
// Usage:
//   NVIDIA_API_KEY=... node scripts/nvidia-probe.mjs
//   OPENROUTER_API_KEY=... node scripts/nvidia-probe.mjs --openrouter

const useOR = process.argv.includes('--openrouter');
const BASE = useOR ? 'https://openrouter.ai/api/v1' : 'https://integrate.api.nvidia.com/v1';
const KEY = useOR ? process.env.OPENROUTER_API_KEY : process.env.NVIDIA_API_KEY;
if (!KEY) { console.error(`Missing ${useOR ? 'OPENROUTER_API_KEY' : 'NVIDIA_API_KEY'}`); process.exit(1); }

const MODELS = useOR
  ? ['nvidia/nemotron-3.5-super-vl:free']
  : ['nvidia/nemotron-3.5-super-vl-120b-a12b', 'stepfun-ai/step-5-preview'];

const PROMPT = 'How many primes are below 200? Answer with the number only.';
const EXPECT = '46';

// Thinking modes per platform
const MODES = useOR
  ? [
      ['off', { reasoning: { effort: 'none' } }],
      ['on', { reasoning: { enabled: true } }],
    ]
  : [
      ['off', { chat_template_kwargs: { enable_thinking: false } }],
      ['medium', { chat_template_kwargs: { enable_thinking: true, medium_effort: true } }],
      ['on', { chat_template_kwargs: { enable_thinking: true } }],
    ];

async function run(model, mode, extra) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: PROMPT }],
        temperature: 1.0, top_p: 0.95, max_tokens: 8192, ...extra,
      }),
    });
    const ms = Math.round(performance.now() - t0);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { model, mode, status: res.status, ms, error: (d.error?.message || d.detail || JSON.stringify(d)).slice(0, 120) };
    const msg = d.choices?.[0]?.message || {};
    const reasoning = msg.reasoning_content || msg.reasoning || '';
    const u = d.usage || {};
    const content = (msg.content || '').trim();
    return {
      model, mode, status: res.status, ms,
      answer: content.slice(0, 40),
      correct: content.includes(EXPECT),
      reasoningChars: reasoning.length,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
      completionTokens: u.completion_tokens ?? null,
      tokPerSec: u.completion_tokens ? Math.round(u.completion_tokens / (ms / 1000)) : null,
    };
  } catch (e) {
    return { model, mode, status: 'ERR', ms: Math.round(performance.now() - t0), error: String(e).slice(0, 120) };
  }
}

console.log(`Platform: ${useOR ? 'OpenRouter' : 'NVIDIA'}  (${BASE})\n`);
const rows = [];
for (const m of MODELS) for (const [mode, extra] of MODES) rows.push(await run(m, mode, extra));
console.table(rows);
