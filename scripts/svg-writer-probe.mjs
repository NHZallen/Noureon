#!/usr/bin/env node
// Probe of the SVG written by a text model (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §6), with real keys. It uses the code of the app itself (images/svg-writer.js and the question of the
// Decisions API in decisions/decision-client.js), so what is found is what the app meets. Keys come from the environment, are never printed or written, and are taken out of whatever a service says back.
//
//   OPENROUTER_API_KEY=... OPENAI_API_KEY=... node scripts/svg-writer-probe.mjs [picture.png] [--out dir]
//     either key may be left out: the tests of that provider are skipped. Without a picture, a small one is drawn (a red square, a blue circle, a green triangle).
//   Tests:  openrouter-text      GPT-6 Luna through OpenRouter, from words
//           openrouter-picture   the same, redrawing the picture      <- the one never tried
//           openai-picture       GPT-6 Luna through OpenAI's Responses API, redrawing the picture
//           openai-images-svg    OpenAI's own way (Images API with svg.model), from words, for comparison
//           decisions            the svg question of the Decisions API on 14 sentences in five languages (OPENROUTER_API_KEY)
// Result: svg-writer-probe-result.json and the SVG files in --out (default ./svg-writer-probe).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { DECISION_URL, buildDecisionRequest, parseDecisionResponse } from '../src/app/runtime/decisions/decision-client.js';
import { SVG_WRITER_MODELS, createSvgWriter } from '../src/app/runtime/images/svg-writer.js';
import { createImageGenerator } from '../src/app/runtime/images/image-generators.js';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outDir = outAt >= 0 ? args[outAt + 1] : 'svg-writer-probe';
const pictureArg = args.find((arg, index) => !arg.startsWith('--') && index !== outAt + 1);
const keys = { openrouter: String(process.env.OPENROUTER_API_KEY || '').trim(), openai: String(process.env.OPENAI_API_KEY || '').trim() };
if (!keys.openrouter && !keys.openai) {
  console.error('Set OPENROUTER_API_KEY and/or OPENAI_API_KEY first.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// ---- a picture to redraw: 160x100, white, a red square, a blue circle, a green triangle (a PNG written here, no library)
function drawnPng() {
  const width = 160;
  const height = 100;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3, 255);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = [255, 255, 255];
      if (x >= 10 && x < 50 && y >= 20 && y < 60) color = [230, 30, 30];
      else if ((x - 80) ** 2 + (y - 40) ** 2 <= 20 ** 2) color = [30, 60, 230];
      else if (y >= 20 && y < 60 && Math.abs(x - 130) <= (y - 20) / 2) color = [20, 160, 60];
      row.set(color, 1 + x * 3);
    }
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const png = pictureArg ? readFileSync(pictureArg) : drawnPng();
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
writeFileSync(join(outDir, 'picture.png'), png);

const scrub = (text) => Object.values(keys).filter(Boolean).reduce((value, key) => value.split(key).join('[key]'), String(text ?? '')).slice(0, 800);
const results = [];

async function run(name, fn) {
  const started = Date.now();
  const record = { test: name };
  try {
    const { images } = await fn();
    const svg = Buffer.from(images[0].b64Json, 'base64').toString('utf8');
    const file = join(outDir, `${name}.svg`);
    writeFileSync(file, svg);
    Object.assign(record, { ok: true, ms: Date.now() - started, mediaType: images[0].mediaType, bytes: Buffer.byteLength(svg), startsWith: svg.slice(0, 100), file, hasViewBox: /viewBox=/i.test(svg), shapes: { rect: /<rect/i.test(svg), circle: /<circle|<ellipse/i.test(svg), triangle: /<polygon|<path/i.test(svg), text: /<text/i.test(svg) } });
  } catch (error) {
    Object.assign(record, { ok: false, ms: Date.now() - started, error: scrub(error?.message) });
  }
  results.push(record);
  console.log(`${name.padEnd(22)} ${record.ok ? `ok   ${(record.ms / 1000).toFixed(1)}s ${record.bytes} bytes ${record.hasViewBox ? 'viewBox' : 'NO viewBox'} ${JSON.stringify(record.shapes)}` : `FAIL ${(record.ms / 1000).toFixed(1)}s ${record.error}`}`);
}

const FOX = 'Draw a simple flat logo of a fox head in orange on a white background.';
const REDRAW = 'Redraw this picture as a clean flat vector: the red square, the blue circle and the green triangle in the same order and places.';
const write = createSvgWriter({});

if (keys.openrouter) {
  await run('openrouter-text', () => write({ provider: 'openrouter', apiKey: keys.openrouter, model: SVG_WRITER_MODELS.openrouter, prompt: FOX, config: { aspectRatio: '1:1' } }));
  await run('openrouter-picture', () => write({ provider: 'openrouter', apiKey: keys.openrouter, model: SVG_WRITER_MODELS.openrouter, prompt: REDRAW, config: { aspectRatio: 'auto' }, inputReferences: [dataUrl] }));
}
if (keys.openai) {
  await run('openai-picture', () => write({ provider: 'openai', apiKey: keys.openai, model: SVG_WRITER_MODELS.openai, prompt: REDRAW, config: { aspectRatio: 'auto' }, inputReferences: [dataUrl] }));
  // The app's own dispatcher: from words, OpenAI makes the SVG itself (the Images API with svg.model).
  await run('openai-images-svg', () => createImageGenerator({ getSafetyIdentifier: async () => '' })({ provider: 'openai', apiKey: keys.openai, model: 'gpt-image-2.6-flare', prompt: FOX, config: { outputFormat: 'svg', aspectRatio: '1:1', quality: 'low' }, inputReferences: [] }));
}

// ---- the svg question of the Decisions API: a yes (0.8 or more turns a chat into an SVG) for the first seven, a no for the rest
const SENTENCES = [
  ['Draw a fox logo as an SVG', true], ['幫我畫一個貓咪的向量圖', true], ['畫一個 SVG 的愛心圖示', true], ['Dessine-moi une illustration vectorielle d’une montagne', true],
  ['Нарисуй векторную иконку дома', true], ['Dibújame un logo vectorial de una taza de café', true], ['把這張圖重畫成向量圖（有附圖）', true],
  ['What is SVG and how do I animate it with CSS?', false], ['畫一張貓在窗邊的照片', false], ['幫我做一個長條圖比較三個月的銷售', false], ['Write a Python function that parses an SVG file', false],
  ['Quel temps fait-il à Paris ?', false], ['Explique la récursivité', false], ['Dame un resumen de este artículo', false]
];
if (keys.openrouter) {
  const decisions = { test: 'decisions', rows: [] };
  let right = 0;
  for (const [message, wantsSvg] of SENTENCES) {
    const request = buildDecisionRequest({ message });
    try {
      const response = await fetch(DECISION_URL, { method: 'POST', headers: { Authorization: `Bearer ${keys.openrouter}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(10_000) });
      const parsed = parseDecisionResponse(await response.json());
      const svg = parsed?.svg ?? null;
      const turned = svg !== null && svg >= 0.8;
      if (turned === wantsSvg) right += 1;
      decisions.rows.push({ message, expected: wantsSvg, svg, turnsIntoSvg: turned });
      console.log(`${turned === wantsSvg ? 'ok  ' : 'MISS'} svg=${svg === null ? '-' : svg.toFixed(2)}  ${message}`);
    } catch (error) {
      decisions.rows.push({ message, expected: wantsSvg, error: scrub(error?.message) });
      console.log(`FAIL ${message}  ${scrub(error?.message)}`);
    }
  }
  decisions.right = right;
  decisions.total = SENTENCES.length;
  console.log(`\nDecisions: ${right} of ${SENTENCES.length} as expected`);
  results.push(decisions);
}

writeFileSync(join(outDir, 'svg-writer-probe-result.json'), `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\nThe result (no key in it) is in ${join(outDir, 'svg-writer-probe-result.json')}; the SVG files and picture.png are next to it. Paste the JSON to the one who asked.`);
