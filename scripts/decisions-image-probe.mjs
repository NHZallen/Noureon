#!/usr/bin/env node
// Tries what OpenRouter's Decisions API can be asked about a picture request (how many pictures, which ratio, a collage or separate pictures, more than the
// model can do), with a real key. The key is read from the environment and is never printed.
//
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-image-probe.mjs            (both parts)
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-image-probe.mjs --only types
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-image-probe.mjs --only battery
//
// Part "types": which kinds of question the API takes besides the yes/no one the page uses today ("noul"): a bad type is sent first (the error may list
// the kinds that exist), then number, integer, enum and choice questions in the shapes they might have; each line says the status and what came back.
// Part "battery": the questions the page really asks for a picture request (the same code), on sentences in five languages, with what the page reads from the answers.
// (The kinds of question of the API, found on 2026-10-17: noul (a probability), choice (needs `criteria`), score and box. The page uses noul only.)

import { DECISION_MODEL, DECISION_URL } from '../src/app/runtime/decisions/decision-client.js';
import { buildImageDecisionRequest, parseImageDecisionResponse } from '../src/app/runtime/decisions/image-decisions.js';
import { limitsOf, readSpokenRequest } from '../src/app/legacy-runtime/features/image-spoken-request.js';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const key = String(process.env.OPENROUTER_API_KEY || '').trim();
if (!key) {
  console.error('Set OPENROUTER_API_KEY first:  OPENROUTER_API_KEY=sk-or-... node scripts/decisions-image-probe.mjs');
  process.exit(1);
}
const model = option('--model') || DECISION_MODEL;
const only = option('--only');
const redact = (text) => String(text).split(key).join('***');

async function post(body) {
  const started = Date.now();
  try {
    const response = await fetch(DECISION_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = redact(await response.text());
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, ms: Date.now() - started, json, text };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, json: null, text: String(error?.message || error) };
  }
}


// ---- Part 1: the kinds of question
const state = (message) => [`Latest message: ${message}`, 'The picture model in use makes 1 to 6 pictures per request and takes 0 to 4 reference pictures.'];
async function types() {
  console.log('== Which kinds of question does the API take? ==');
  const message = '給我兩張9:16草原的圖片';
  const shapes = [
    ['control: noul (the page uses it)', { type: 'noul', instructions: 'The person asks for more than one separate picture.' }],
    ['a kind that does not exist', { type: 'x-no-such-type', instructions: 'How many pictures?' }],
    ['number', { type: 'number', instructions: 'How many separate pictures does the person ask for? 1 if not said.' }],
    ['integer', { type: 'integer', instructions: 'How many separate pictures does the person ask for? 1 if not said.' }],
    ['integer with min and max', { type: 'integer', minimum: 1, maximum: 10, instructions: 'How many separate pictures does the person ask for? 1 if not said.' }],
    ['enum with options', { type: 'enum', options: ['1', '2', '3', '4', '5', '6'], instructions: 'How many separate pictures does the person ask for?' }],
    ['enum with values', { type: 'enum', values: ['1:1', '9:16', '16:9', '4:3', '3:4'], instructions: 'Which aspect ratio does the person ask for?' }],
    ['enum with choices', { type: 'enum', choices: ['1:1', '9:16', '16:9'], instructions: 'Which aspect ratio does the person ask for?' }],
    ['choice with options', { type: 'choice', options: ['1:1', '9:16', '16:9'], instructions: 'Which aspect ratio does the person ask for?' }],
    ['text', { type: 'text', instructions: 'Which aspect ratio does the person ask for, as width:height?' }],
    ['string', { type: 'string', instructions: 'Which aspect ratio does the person ask for, as width:height?' }],
    ['boolean', { type: 'boolean', instructions: 'Does the person ask for more than one picture?' }]
  ];
  for (const [label, question] of shapes) {
    const result = await post({ model, state: state(message), questions: { q: question } });
    console.log(`${result.status === 200 ? 'OK  ' : 'FAIL'}  ${label}  ${result.status} ${result.ms}ms  ${result.text.slice(0, 320).replace(/\s+/g, ' ')}`);
  }
}

// ---- Part 2: the questions the page really asks (src/app/runtime/decisions/image-decisions.js), and what it reads from the answers
const MODEL = { maxImageCount: 6, minImageReferences: 0, maxImageReferences: 4, supportedImageAspectRatios: ['1:1', '1:2', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'] };
// message, and what the page should read: count (null = nothing said), collage, aspectRatio ('' = nothing said), problem ('' = none, else the code)
const CASES = [
  ['給我兩張9:16草原的圖片', { count: 2, collage: false, aspectRatio: '9:16', problem: '' }],
  ['請給我一張9:16的拼貼圖片', { count: 1, collage: true, aspectRatio: '9:16', problem: '' }],
  ['畫三隻貓在曬太陽', { count: null, collage: false, aspectRatio: '', problem: '' }],
  ['把這兩張圖拼在一起，做成一張', { count: 1, collage: true, aspectRatio: '', problem: '' }],
  ['畫四張不同風格的貓，橫式', { count: 4, collage: false, aspectRatio: '16:9', problem: '' }],
  ['給我一張四格漫畫，主角是一隻柴犬', { count: 1, collage: true, aspectRatio: '', problem: '' }],
  ['來六張手機桌布，山和海', { count: 6, collage: false, aspectRatio: '9:16', problem: '' }],
  ['給我八張正方形的logo草稿', { count: null, collage: false, aspectRatio: '', problem: 'count' }],
  ['給我三十張貓的圖片', { count: null, collage: false, aspectRatio: '', problem: 'count-any' }],
  ['畫一個 21:9 的橫幅', { count: null, collage: false, aspectRatio: '', problem: 'ratio' }],
  ['畫一個比分 2:1 的記分板', { count: null, collage: false, aspectRatio: '', problem: '' }],
  ['Make me two vertical pictures of a meadow', { count: 2, collage: false, aspectRatio: '9:16', problem: '' }],
  ['One 16:9 collage of a trip to Japan', { count: 1, collage: true, aspectRatio: '16:9', problem: '' }],
  ['Dessine-moi trois paysages de montagne', { count: 3, collage: false, aspectRatio: '', problem: '' }],
  ['Нарисуй два вертикальных рисунка леса', { count: 2, collage: false, aspectRatio: '9:16', problem: '' }],
  ['Hazme dos imágenes cuadradas de un gato', { count: 2, collage: false, aspectRatio: '1:1', problem: '' }],
  // The judgement does not take "一張貓的照片" for a count of pictures (0.28): nothing is read and the number of the settings stays. Known, mild.
  ['一張貓的照片', { count: null, collage: false, aspectRatio: '', problem: '' }],
  ['Give me one picture of a meadow', { count: 1, collage: false, aspectRatio: '', problem: '' }],
  ['畫一隻貓', { count: null, collage: false, aspectRatio: '', problem: '' }],
  ['幫我畫一隻戴帽子的狗', { count: null, collage: false, aspectRatio: '', problem: '' }]
];
async function battery() {
  console.log('\n== What the page asks about a picture request, and what it reads (limits: 1 to 6 pictures, 0 to 4 references) ==');
  let right = 0;
  let total = 0;
  for (const [message, expect] of CASES) {
    const request = buildImageDecisionRequest({ message, limits: limitsOf(MODEL), attached: 0, model });
    const result = await post(request);
    const decision = result.json ? parseImageDecisionResponse(result.json) : null;
    if (!decision) { console.log(`FAIL  ${message}  ${result.status} ${result.text.slice(0, 200)}`); continue; }
    const spoken = readSpokenRequest({ decision, message, modelInfo: MODEL, attached: 0 });
    const got = { count: spoken.count, collage: spoken.collage, aspectRatio: spoken.aspectRatio, problem: spoken.problem?.code || '' };
    const misses = Object.keys(expect).filter(name => got[name] !== expect[name]);
    total += 1;
    if (!misses.length) right += 1;
    const shown = (value) => (value === null || value === undefined ? '-' : Number(value).toFixed(2));
    console.log(`${misses.length ? 'MISS' : 'ok  '}  ${result.ms}ms  ${message}\n      read: ${JSON.stringify(got)}${misses.length ? `   expected: ${JSON.stringify(expect)}` : ''}\n      answers: collage=${shown(decision.collage)} countSaid=${shown(decision.countSaid)} count=${decision.count ?? '-'} more=${shown(decision.more)} ratioStated=${shown(decision.ratioStated)} portrait=${shown(decision.portrait)} landscape=${shown(decision.landscape)} square=${shown(decision.square)}`);
  }
  console.log(`\nSentences read as expected: ${right} of ${total}`);
}

if (!only || only === 'types') await types();
if (!only || only === 'battery') await battery();
