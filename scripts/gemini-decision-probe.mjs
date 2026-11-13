#!/usr/bin/env node
// Finds out how Google's own decision model `gemini-decision-1` is called (2026-11-13: nothing about it could be found in the public documents, so this asks the service itself).
// OpenRouter's Decisions API (scripts/decisions-probe.mjs, `--model google/gemini-decision-1`) is the other way to reach a model of the same name; this one uses the Gemini key.
// The key is read from the environment and never printed.
//
//   GEMINI_API_KEY=... node scripts/gemini-decision-probe.mjs
//   GEMINI_API_KEY=... node scripts/gemini-decision-probe.mjs --model gemini-decision-1 --out gemini-decision-probe-result.json
//
// Steps: (1) the model's own page (GET models/<id>): its methods, limits and the rest, printed in full; (2) the list of models whose name has "decision" in it; (3) the same question put in each
// form that is likely: the methods the page names (`:<method>`), `:decide`, `:decisions`, `:generateContent` (a normal model asked for JSON), and `/decisions` with the body of OpenRouter's
// Decisions API (a model, a state, typed questions). Every answer is printed with its status, so the form that works (or the message that says what the right form is) can be read.

import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const key = String(process.env.GEMINI_API_KEY || '').trim();
if (!key) {
  console.error('Set GEMINI_API_KEY first:  GEMINI_API_KEY=... node scripts/gemini-decision-probe.mjs');
  process.exit(1);
}
const model = (option('--model') || 'gemini-decision-1').replace(/^models\//, '');
const outFile = option('--out') || 'gemini-decision-probe-result.json';
const HOST = 'https://generativelanguage.googleapis.com';
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
const redact = (text) => String(text).split(key).join('***');
const results = [];
const note = (name, status, detail) => { const line = { name, status, detail: redact(detail).slice(0, 1200) }; results.push(line); console.log(`${String(status).padEnd(4)} ${name}\n     ${line.detail.replace(/\n/g, '\n     ')}`); };

const STATE = ['Latest message: What is the weather in Taipei today?', 'Files attached to the latest message: no. Files already in the conversation: no.'];
const QUESTIONS = {
  search: { type: 'noul', instructions: 'The latest message needs up-to-date facts from the web: news, today\'s weather, prices, scores, recent events.' },
  file: { type: 'noul', instructions: 'The person wants a file made for them to download or keep.' }
};
const OPENROUTER_BODY = { model, state: STATE, questions: QUESTIONS };
const CONTENT_BODY = {
  contents: [{ role: 'user', parts: [{ text: `${STATE.join('\n')}\n\nFor each question give a probability from 0 to 1 as JSON like {"search":0.9,"file":0.1}.\n- search: ${QUESTIONS.search.instructions}\n- file: ${QUESTIONS.file.instructions}` }] }],
  generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 200 }
};

async function call(method, url, body) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    return { status: response.status, ms: Date.now() - started, text };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, text: String(error?.message || error) };
  }
}

console.log(`=== ${model}`);
// (1) The page of the model.
const page = await call('GET', `${HOST}/v1beta/models/${model}`);
note('GET models/<id>', page.status, page.text);
let methods = [];
try { methods = JSON.parse(page.text).supportedGenerationMethods || []; } catch { /* no page */ }
if (methods.length) console.log(`\nthe methods the page names: ${methods.join(', ')}`);

// (2) The models with "decision" in their name (and what they are said to do).
const list = await call('GET', `${HOST}/v1beta/models?pageSize=1000`);
try {
  const listed = (JSON.parse(list.text).models || []).filter((entry) => /decision|decide|judge|classif/i.test(`${entry.name} ${entry.displayName} ${entry.description}`));
  note('list of models with decision/decide/judge/classif in them', list.status, listed.length ? listed.map((entry) => `${entry.name}  [${(entry.supportedGenerationMethods || []).join(',')}]  ${entry.displayName || ''}  ${String(entry.description || '').slice(0, 160)}`).join('\n') : '(none)');
} catch {
  note('list of models', list.status, list.text);
}

// (3) The forms.
const forms = [];
for (const method of new Set([...methods.filter((name) => !['countTokens', 'batchGenerateContent', 'generateContent'].includes(name)), 'decide', 'decisions', 'generateDecisions', 'makeDecisions'])) {
  forms.push([`POST models/<id>:${method} (the body of OpenRouter's Decisions API)`, `${HOST}/v1beta/models/${model}:${method}`, OPENROUTER_BODY]);
}
forms.push(['POST models/<id>:generateContent (a normal model asked for JSON)', `${HOST}/v1beta/models/${model}:generateContent`, CONTENT_BODY]);
for (const version of ['v1beta', 'v1alpha']) forms.push([`POST ${version}/decisions (the body of OpenRouter's Decisions API)`, `${HOST}/${version}/decisions`, OPENROUTER_BODY]);
for (const [name, url, body] of forms) {
  const result = await call('POST', url, body);
  note(`${name}  ${result.ms}ms`, result.status, result.text);
}

console.log('\nWhat to look for: a 200 with probabilities in it is the form to use; a 400 that names a field says how the body should look; a 404 means that address does not exist.');
writeFileSync(outFile, JSON.stringify({ model, results }, null, 2));
console.log(`The lines are kept in ${outFile} (no key in it).`);
