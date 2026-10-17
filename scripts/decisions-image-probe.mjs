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
// Part "battery": the yes/no questions the page could ask for a picture request, on sentences in five languages, with the probability of each.

import { DECISION_MODEL, DECISION_URL } from '../src/app/runtime/decisions/decision-client.js';

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

const LIMITS = 'The picture model in use makes 1 to 6 pictures per request and takes 0 to 4 reference pictures.';
const state = (message, attached = 0) => [`Latest message: ${message}`, LIMITS, `Reference pictures attached to the latest message: ${attached}.`];

// ---- Part 1: the kinds of question
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

// ---- Part 2: a battery of yes/no questions
const QUESTIONS = {
  collage: 'The person wants ONE single picture made of several parts put together (a collage, a grid, panels, a storyboard, a triptych), not several separate pictures.',
  separate: 'The person asks for more than one separate picture (a number of pictures, images or photos, each its own file).',
  exactly_1: 'The person asks for exactly one picture, or does not say how many.',
  exactly_2: 'The person asks for exactly two separate pictures.',
  exactly_3: 'The person asks for exactly three separate pictures.',
  exactly_4: 'The person asks for exactly four separate pictures.',
  exactly_6: 'The person asks for exactly six separate pictures.',
  more_than_limit: `The person asks for more pictures, or more reference pictures, than the picture model can do (${LIMITS}).`,
  portrait: 'The person asks for a tall picture (portrait, vertical, 9:16, 3:4, a phone wallpaper).',
  landscape: 'The person asks for a wide picture (landscape, horizontal, 16:9, 4:3, a banner).',
  square: 'The person asks for a square picture (1:1).'
};
const CASES = [
  ['給我兩張9:16草原的圖片', { separate: 1, exactly_2: 1, collage: 0, portrait: 1 }],
  ['請給我一張9:16的拼貼圖片', { collage: 1, exactly_1: 1, portrait: 1 }],
  ['畫三隻貓在曬太陽', { separate: 0, exactly_1: 1, collage: 0 }],
  ['把這兩張圖拼在一起，做成一張', { collage: 1, exactly_1: 1 }],
  ['畫四張不同風格的貓，橫式', { separate: 1, exactly_4: 1, landscape: 1 }],
  ['給我一張四格漫畫，主角是一隻柴犬', { collage: 1, exactly_1: 1 }],
  ['來六張手機桌布，山和海', { separate: 1, exactly_6: 1, portrait: 1 }],
  ['給我八張正方形的logo草稿', { separate: 1, more_than_limit: 1, square: 1 }],
  ['Make me two vertical pictures of a meadow', { separate: 1, exactly_2: 1, portrait: 1 }],
  ['One 16:9 collage of a trip to Japan', { collage: 1, exactly_1: 1, landscape: 1 }],
  ['Dessine-moi trois paysages de montagne', { separate: 1, exactly_3: 1 }],
  ['Нарисуй два вертикальных рисунка леса', { separate: 1, exactly_2: 1, portrait: 1 }],
  ['Hazme dos imágenes cuadradas de un gato', { separate: 1, exactly_2: 1, square: 1 }],
  ['一張貓的照片', { exactly_1: 1, separate: 0, collage: 0 }]
];
async function battery() {
  console.log('\n== The yes/no battery (probability per question; the page would say yes from 0.60) ==');
  const names = Object.keys(QUESTIONS);
  let right = 0;
  let total = 0;
  for (const [message, expect] of CASES) {
    const questions = Object.fromEntries(names.map(name => [name, { type: 'noul', instructions: QUESTIONS[name] }]));
    const result = await post({ model, state: state(message), questions });
    const answers = result.json?.answers;
    if (!answers) { console.log(`FAIL  ${message}  ${result.status} ${result.text.slice(0, 200)}`); continue; }
    const cells = names.map((name) => {
      const value = Number(answers[name]?.noul);
      const expected = expect[name];
      let mark = ' ';
      if (expected !== undefined && Number.isFinite(value)) { total += 1; if ((value >= 0.6) === Boolean(expected)) right += 1; else mark = '!'; }
      return `${name}=${Number.isFinite(value) ? value.toFixed(2) : '-'}${mark}`;
    });
    console.log(`${result.ms}ms  ${message}\n      ${cells.join('  ')}`);
  }
  console.log(`\nMatches with what was expected (the ! marks are the misses): ${right} of ${total}`);
}

if (!only || only === 'types') await types();
if (!only || only === 'battery') await battery();
