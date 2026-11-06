#!/usr/bin/env node
// The probe of GPT Image 2.6 (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md): what the pages do not say, found out with small real requests, once through OpenRouter and once
// (with `--openai`) through OpenAI's own Images API. The requests are the ones the app itself builds (the same functions), so what is found is what the app will meet.
//
//   OPENROUTER_API_KEY=... node scripts/gpt-image-26-probe.mjs                     OpenRouter, the cheap tests (list, png, gif, svg), flare model
//   OPENAI_API_KEY=...     node scripts/gpt-image-26-probe.mjs --openai            OpenAI's own API, the same tests
//   ... --tests list                                  only some tests: list, png, gif, frames, duration, svg, svgcount, gifcount, refs   (default: list,png,gif,svg)
//   ... --tests frames                                the most frames each endpoint takes (4, 16, 17, 32, 64): dearer, one GIF each
//   ... --tests gifcount,svgcount                     does a request for 2 or 3 pictures (n) give that many GIFs / SVGs? (the pictures asked for are counted in the answer)
//   ... --model openai/gpt-image-2.6-sunburst         another model (OpenAI: gpt-image-2.6-sunburst)
//   ... --out probe-result.json                       where the result is written (default gpt-image-26-probe-result.json); the pictures go to a folder next to it (--pictures dir)
//
// The key is read from the environment, never printed, never written, and taken out of whatever the service says back. One request at a time; it stops after four 429 in a row.
// What it gives is a JSON (no key) with, for each test: the status, how long, the type and size of the picture, and for a GIF the frames, the time of each and whether it loops,
// and for an SVG how it starts. A default run is four small low-quality requests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenAiImageFields } from '../src/app/runtime/images/openai-image-generation.js';
import { buildOpenRouterImagePayload } from '../src/app/runtime/images/openrouter-image-generation.js';

export const TESTS = Object.freeze(['list', 'png', 'gif', 'frames', 'duration', 'svg', 'svgcount', 'gifcount', 'refs']);
const DEFAULT_TESTS = ['list', 'png', 'gif', 'svg'];
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
const TIMEOUT_MS = 300_000;
// A 2×2 PNG (to start from, in the test of the pictures that go with a GIF or an SVG).
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2P8z8Dwn4GBgYGJAQoAHxcCAeD+WHoAAAAASUVORK5CYII=';

/** The frames of a GIF: { frames, width, height, delaysMs, loops } or null when it is not one. */
export function gifInfo(bytes) {
  const data = Buffer.from(bytes);
  if (data.length < 13 || !/^GIF8[79]a/.test(data.subarray(0, 6).toString('latin1'))) return null;
  const width = data.readUInt16LE(6);
  const height = data.readUInt16LE(8);
  let position = 13 + ((data[10] & 0x80) ? 3 * 2 ** ((data[10] & 7) + 1) : 0);
  let frames = 0;
  let loops = false;
  const delaysMs = [];
  const skipBlocks = () => { while (position < data.length && data[position] !== 0) position += data[position] + 1; position += 1; };
  while (position < data.length) {
    const marker = data[position];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = data[position + 1];
      if (label === 0xf9) delaysMs.push(data.readUInt16LE(position + 4) * 10);
      if (label === 0xff && data.subarray(position + 3, position + 14).toString('latin1') === 'NETSCAPE2.0') loops = true;
      position += 2;
      skipBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      const flags = data[position + 9];
      position += 10 + ((flags & 0x80) ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1;
      skipBlocks();
    } else {
      break;
    }
  }
  return { frames, width, height, delaysMs, loops };
}

const kinds = (type) => (type === 'gif' ? 'image/gif' : type === 'svg' ? 'image/svg+xml' : `image/${type}`);

export async function runProbe({ provider, key, model, tests, fetchImpl = fetch, picturesDir = '', now = () => Date.now() }) {
  const secretText = (text) => String(text ?? '').split(key).join('[key]').slice(0, 1500);
  const results = {};
  let rateLimited = 0;
  const call = async (name, body, { kind = 'png' } = {}) => {
    const started = now();
    const record = { test: name, request: { ...body, ...(body.input_references ? { input_references: `[${body.input_references.length} picture(s)]` } : {}) } };
    try {
      const response = await fetchImpl(provider === 'openai' ? `${OPENAI_BASE}/images/generations` : `${OPENROUTER_BASE}/images`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      record.status = response.status;
      record.ms = now() - started;
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      if (response.status === 429) rateLimited += 1; else rateLimited = 0;
      if (!response.ok) {
        record.error = secretText(parsed?.error?.message || parsed?.message || text);
      } else {
        record.usage = parsed?.usage ?? null;
        record.pictures = [];
        for (const [index, item] of (parsed?.data || []).entries()) {
          const bytes = item.b64_json ? Buffer.from(item.b64_json, 'base64') : Buffer.alloc(0);
          const mediaType = item.media_type || parsed?.media_type || kinds(body.output_format || kind);
          const info = { mediaType, bytes: bytes.length, answeredType: item.media_type || null };
          if (/gif/.test(mediaType)) info.gif = gifInfo(bytes);
          if (/svg/.test(mediaType)) info.svg = { startsWith: bytes.toString('utf8', 0, 120) };
          if (picturesDir && bytes.length) {
            const file = join(picturesDir, `${name}-${index + 1}.${(body.output_format || kind) === 'jpeg' ? 'jpg' : (body.output_format || kind)}`);
            writeFileSync(file, bytes);
            info.file = file;
          }
          record.pictures.push(info);
        }
        record.pictureCount = record.pictures.length;
        if (!record.pictures.length) record.note = 'the answer held no picture';
      }
    } catch (error) {
      record.error = secretText(error?.message);
    }
    results[name] = record;
    if (rateLimited >= 4) throw new Error('four 429 in a row: stopped');
    return record;
  };

  const fields = (config, references = []) => (provider === 'openai'
    ? buildOpenAiImageFields({ model, prompt: PROMPTS[config.outputFormat] || PROMPTS.png, config: { aspectRatio: '1:1', resolution: '1K', quality: 'low', ...config } })
    : buildOpenRouterImagePayload({ model, prompt: PROMPTS[config.outputFormat] || PROMPTS.png, config: { aspectRatio: '1:1', quality: 'low', ...config }, inputReferences: references }));
  const PROMPTS = {
    png: 'A small red circle on a white background.',
    gif: 'A small red ball bouncing up and down on a white background.',
    svg: 'A simple flat icon of a red circle on a white background.'
  };

  if (tests.includes('list')) {
    try {
      const response = await fetchImpl(provider === 'openai' ? `${OPENAI_BASE}/models` : `${OPENROUTER_BASE}/models?output_modalities=image`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
      const parsed = await response.json().catch(() => null);
      const all = parsed?.data || [];
      results.list = {
        test: 'list', status: response.status,
        models: all.filter((item) => /gpt-image|crouton/.test(item.id)).map((item) => (provider === 'openai'
          ? { id: item.id }
          : { id: item.id, name: item.name, created: item.created, pricing: item.pricing, architecture: item.architecture, supported_parameters: item.supported_parameters, top_provider: item.top_provider }))
      };
    } catch (error) {
      results.list = { test: 'list', error: secretText(error?.message) };
    }
  }
  if (tests.includes('png')) await call('png', fields({ outputFormat: 'png' }));
  if (tests.includes('gif')) {
    await call('gif-4-frames', fields({ outputFormat: 'gif', frameCount: 4, frameDuration: 200 }), { kind: 'gif' });
    await call('gif-default-frames', (({ frame_count: _a, frame_duration_ms: _b, ...rest }) => rest)(fields({ outputFormat: 'gif', frameCount: 4 })), { kind: 'gif' });
  }
  if (tests.includes('frames')) {
    for (const frames of [16, 17, 32, 64]) await call(`gif-${frames}-frames`, { ...fields({ outputFormat: 'gif', frameCount: 4, frameDuration: 100 }), frame_count: frames }, { kind: 'gif' });
  }
  if (tests.includes('duration')) {
    for (const duration of [20, 2000, 5000]) await call(`gif-duration-${duration}`, { ...fields({ outputFormat: 'gif', frameCount: 3, frameDuration: 200 }), frame_duration_ms: duration }, { kind: 'gif' });
  }
  if (tests.includes('svg')) await call('svg', fields({ outputFormat: 'svg' }), { kind: 'svg' });
  if (tests.includes('svgcount')) await call('svg-two-pictures', { ...fields({ outputFormat: 'svg' }), n: 2 }, { kind: 'svg' });
  if (tests.includes('gifcount')) {
    for (const count of [2, 3]) await call(`gif-n-${count}`, { ...fields({ outputFormat: 'gif', frameCount: 3, frameDuration: 200 }), n: count }, { kind: 'gif' });
  }
  if (tests.includes('refs')) {
    await call('gif-with-reference', fields({ outputFormat: 'gif', frameCount: 3 }, [TINY_PNG]), { kind: 'gif' });
    await call('svg-with-reference', fields({ outputFormat: 'svg' }, [TINY_PNG]), { kind: 'svg' });
  }
  return { provider, model, at: new Date().toISOString(), results };
}

function parseArguments(argv) {
  const options = { provider: 'openrouter', tests: DEFAULT_TESTS, model: '', out: 'gpt-image-26-probe-result.json', pictures: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--openai') options.provider = 'openai';
    else if (argument === '--tests') options.tests = String(argv[++index] || '').split(',').filter(Boolean);
    else if (argument === '--model') options.model = argv[++index] || '';
    else if (argument === '--out') options.out = argv[++index] || options.out;
    else if (argument === '--pictures') options.pictures = argv[++index] || '';
    else throw new Error(`unknown argument ${argument}`);
  }
  for (const test of options.tests) if (!TESTS.includes(test)) throw new Error(`unknown test ${test} (${TESTS.join(', ')})`);
  if (!options.model) options.model = options.provider === 'openai' ? 'gpt-image-2.6-flare' : 'openai/gpt-image-2.6-flare';
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const key = process.env[options.provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'];
    if (!key) throw new Error(`put the key in the environment (${options.provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'}); it is not printed or written`);
    const out = resolve(options.out);
    const picturesDir = resolve(options.pictures || join(dirname(out), 'gpt-image-26-probe-pictures'));
    mkdirSync(picturesDir, { recursive: true });
    const result = await runProbe({ provider: options.provider, key, model: options.model, tests: options.tests, picturesDir });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    for (const record of Object.values(result.results)) {
      const first = record.pictures?.[0];
      console.log(`${String(record.test).padEnd(22)} ${record.status ?? '-'} ${record.ms ? `${(record.ms / 1000).toFixed(1)}s` : ''} ${record.error ? `ERROR ${record.error.slice(0, 120)}` : first ? `${record.pictureCount} picture(s), the first ${first.mediaType} ${first.bytes} bytes${first.gif ? ` ${first.gif.frames} frames` : ''}` : record.models ? `${record.models.length} model(s)` : ''}`);
    }
    console.log(`\nThe result is in ${out}; the pictures are in ${picturesDir}. Paste the JSON (it holds no key) to the one who asked.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
