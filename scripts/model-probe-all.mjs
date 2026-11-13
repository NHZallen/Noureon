#!/usr/bin/env node
// One command for the capability checks of a new set of models: OpenRouter, Google's own Gemini API and OpenCode Go, one after the other, one log. Each part uses the probe that already
// exists for it (scripts/nvidia-probe.mjs --openrouter, scripts/gemini-probe.mjs, scripts/opencode-probe.mjs); a part with no key in the environment is left out and says so.
// The keys are read from the environment, never printed, and taken out of everything that is written.
//
//   OPENROUTER_API_KEY=sk-or-... GEMINI_API_KEY=... OPENCODE_GO_KEY=... node scripts/model-probe-all.mjs
//   node scripts/model-probe-all.mjs --only openrouter,gemini                      (some parts only: openrouter, gemini, opencode)
//   node scripts/model-probe-all.mjs --openrouter-models a/b,c/d --gemini-models x,y --opencode-models p,q    (other ids than the ones below)
//   node scripts/model-probe-all.mjs --out my-log.txt                              (default: model-probe-all.log, the whole output; the lines PASS and FAIL are repeated at the end)
//
// The ids of OpenCode are looked for in the public list of the service (no key, free): every id with "hy4" or "longcat" in it that the app does not have yet. When the list cannot be read,
// the guesses hy4 and longcat-2.5-free are tried. Whatever the list says is in the log, so the exact ids are known.
// The models of the date of writing (2026-11-13): OpenRouter google/gemini-4-hydrogen, google/gemini-4-carbon and anthropic/claude-fable-5.2; Gemini gemini-4-hydrogen and gemini-4-carbon.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { listModels, MODELS as OPENCODE_KNOWN } from './opencode-probe.mjs';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const parts = (option('--only') || 'openrouter,gemini,opencode').split(',').map((part) => part.trim());
const logFile = option('--out') || 'model-probe-all.log';
const keys = {
  openrouter: String(process.env.OPENROUTER_API_KEY || '').trim(),
  gemini: String(process.env.GEMINI_API_KEY || '').trim(),
  opencode: String(process.env.OPENCODE_GO_KEY || '').trim()
};
const secrets = Object.values(keys).filter(Boolean);
const redact = (text) => secrets.reduce((value, secret) => value.split(secret).join('***'), String(text));

const log = createWriteStream(logFile);
const say = (text) => { const clean = redact(text); process.stdout.write(`${clean}\n`); log.write(`${clean}\n`); };
const lines = [];

// Runs one probe; its output goes to the screen and to the log as it comes, and the PASS and FAIL lines are kept for the summary.
const run = (title, script, scriptArgs, env = {}) => new Promise((resolve) => {
  say(`\n########## ${title}\n$ node ${script} ${scriptArgs.join(' ')}\n`);
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...scriptArgs], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let pending = '';
  const take = (chunk) => {
    pending += chunk.toString();
    const rows = pending.split('\n');
    pending = rows.pop();
    for (const row of rows) {
      say(row);
      if (/^(PASS|FAIL)\b/.test(row)) lines.push(redact(row));
    }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('close', (code) => {
    if (pending) { say(pending); if (/^(PASS|FAIL)\b/.test(pending)) lines.push(redact(pending)); }
    say(`(${title} ended, exit code ${code})`);
    resolve(code);
  });
});

const skip = (name, envName) => say(`\n########## ${name}: skipped (no ${envName} in the environment)`);

if (parts.includes('openrouter')) {
  if (!keys.openrouter) skip('OpenRouter', 'OPENROUTER_API_KEY');
  else {
    const ids = option('--openrouter-models') || 'google/gemini-4-hydrogen,google/gemini-4-carbon,anthropic/claude-fable-5.2';
    await run('OpenRouter', 'nvidia-probe.mjs', ['--openrouter', '--model', ids]);
  }
}

if (parts.includes('gemini')) {
  if (!keys.gemini) skip('Gemini (Google)', 'GEMINI_API_KEY');
  else {
    const ids = option('--gemini-models') || 'gemini-4-hydrogen,gemini-4-carbon';
    await run('Gemini (Google)', 'gemini-probe.mjs', ['--model', ids, '--out', 'gemini-probe-result.json']);
  }
}

if (parts.includes('opencode')) {
  if (!keys.opencode) skip('OpenCode Go', 'OPENCODE_GO_KEY');
  else {
    let ids = option('--opencode-models');
    if (!ids) {
      say('\n########## OpenCode Go: the list of the service (public)');
      try {
        const listed = await listModels();
        const all = (listed.body?.data || listed.body?.models || (Array.isArray(listed.body) ? listed.body : [])).map((entry) => String(entry.id || entry.name || entry)).filter(Boolean);
        say(`the service lists ${all.length} ids (status ${listed.status}): ${all.join(', ')}`);
        const known = new Set(OPENCODE_KNOWN.map((model) => model.id));
        const found = all.filter((id) => /hy4|longcat/i.test(id) && !known.has(id));
        ids = found.join(',');
        say(found.length ? `to try: ${ids}` : 'no new id with hy4 or longcat in it; the guesses are tried (and the ids the app has for them)');
      } catch (error) {
        say(`the list could not be read (${error.message}); the guesses are tried`);
      }
      if (!ids) ids = 'hy4,longcat-2.5-free';
    }
    await run('OpenCode Go', 'opencode-probe.mjs', ['--model', ids, '--tests', 'basic,stream,effort,thinking,tools,toolloop,vision,document,office,maxout', '--max-tokens', '1500', '--out', 'opencode-probe-result.json'], { OPENCODE_GO_KEY: keys.opencode });
  }
}

say('\n########## Summary (every PASS and FAIL line)');
for (const row of lines) say(row);
say(`\nThe whole output is in ${logFile}. Nothing in it holds a key.`);
log.end();
