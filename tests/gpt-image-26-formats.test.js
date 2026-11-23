import assert from 'node:assert/strict';
import test from 'node:test';

import { GIF_FRAME_COUNTS, GIF_FRAME_COUNT_DEFAULT, GIF_FRAME_DURATIONS_MS, GPT_IMAGE_26_FORMATS, settleImageFormatConfig, sniffImageType, supportedFormatsOf } from '../src/app/runtime/images/image-formats.js';
import { buildOpenRouterImagePayload, createOpenRouterImageGenerator } from '../src/app/runtime/images/openrouter-image-generation.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

// GPT Image 2.6 (OpenRouter; OpenAI's own API was taken out on 2026-11-23): the formats gif (frame_count, frame_duration_ms) and svg (one picture, no compression), asked for in the same way by both makers of pictures.

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const b64 = (text) => Buffer.from(text).toString('base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

test('the formats a model makes: GPT Image 2.6 makes gif and svg too, the others the still ones', () => {
  const models = MODELS.filter((model) => /gpt-image-2\.6/.test(model.id));
  assert.deepEqual(models.map((model) => model.id).sort(), ['openai/gpt-image-2.6-flare', 'openai/gpt-image-2.6-sunburst']);
  for (const model of models) {
    assert.deepEqual(model.supportedImageFormats, [...GPT_IMAGE_26_FORMATS], model.id);
    assert.ok(model.supportedImageOptions.includes('frameCount') && model.supportedImageOptions.includes('frameDuration'), model.id);
  }
  const others = MODELS.filter((model) => model.outputModality === 'image' && !/gpt-image-2\.6/.test(model.id));
  assert.ok(others.length > 0);
  for (const model of others) {
    assert.deepEqual(supportedFormatsOf(model), ['png', 'jpeg', 'webp'], model.id);
    assert.ok(!(model.supportedImageOptions || []).includes('frameCount'), model.id);
  }
  assert.ok(!MODELS.some((model) => /gpt-image-2\.5/.test(model.id)), 'the 2.5 models are gone from the list');
});

test('a request put right for its format: a gif has its frames and no compression, an svg is one picture, others have no frames', () => {
  assert.deepEqual(settleImageFormatConfig({ outputFormat: 'gif', outputCompression: 80, n: 3 }), { outputFormat: 'gif', n: 3, frameCount: GIF_FRAME_COUNT_DEFAULT, frameDuration: 200 });
  assert.deepEqual(settleImageFormatConfig({ outputFormat: 'gif', frameCount: 99, frameDuration: 5 }), { outputFormat: 'gif', frameCount: 16, frameDuration: 20 }, 'kept inside what is taken');
  assert.deepEqual(settleImageFormatConfig({ outputFormat: 'gif', frameCount: '12', frameDuration: '300' }), { outputFormat: 'gif', frameCount: 12, frameDuration: 300 });
  assert.deepEqual(settleImageFormatConfig({ outputFormat: 'svg', n: 4, outputCompression: 90, frameCount: 5 }), { outputFormat: 'svg', n: 1 });
  assert.deepEqual(settleImageFormatConfig({ outputFormat: 'webp', outputCompression: 60, frameCount: 5, frameDuration: 100 }), { outputFormat: 'webp', outputCompression: 60 });
  assert.deepEqual(settleImageFormatConfig({ n: 2 }), { n: 2 });
  assert.equal(GIF_FRAME_COUNTS[0], 2);
  assert.equal(GIF_FRAME_COUNTS.at(-1), 16);
  assert.ok(GIF_FRAME_COUNTS.includes(GIF_FRAME_COUNT_DEFAULT) && GIF_FRAME_DURATIONS_MS.includes(200));
});

test('OpenRouter is asked for a gif and for an svg with their own fields', () => {
  const gif = { aspectRatio: '1:1', resolution: '1K', outputFormat: 'gif', frameCount: 6, frameDuration: 150, outputCompression: 80, n: 2 };
  const router = buildOpenRouterImagePayload({ model: 'openai/gpt-image-2.6-flare', prompt: 'p', config: gif });
  assert.deepEqual([router.output_format, router.frame_count, router.frame_duration_ms, 'output_compression' in router], ['gif', 6, 150, false]);
  assert.equal(router.n, 2);
  const request = buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: { aspectRatio: '1:1', outputFormat: 'svg', n: 5, outputCompression: 90 } });
  assert.equal(request.output_format, 'svg');
  assert.equal(request.n, 1);
  assert.ok(!('output_compression' in request) && !('frame_count' in request));
  const still = buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: { aspectRatio: '1:1', outputFormat: 'png', frameCount: 6 } });
  assert.ok(!('frame_count' in still), 'only a gif has frames');
});

test('a svg comes back with its own type, and pictures to start from may go with it', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url: String(url), init }); return json({ data: [{ b64_json: b64(SVG) }] }); };
  const router = createOpenRouterImageGenerator({ fetchImpl });
  const svg = await router({ apiKey: 'k', model: 'openai/gpt-image-2.6-flare', prompt: 'a logo', config: { outputFormat: 'svg' }, inputReferences: ['data:image/png;base64,QQ=='] });
  assert.equal(svg.images.length, 1);
  assert.equal(svg.images[0].mediaType, 'image/svg+xml');
  assert.equal(Buffer.from(svg.images[0].b64Json, 'base64').toString('utf8'), SVG, 'the SVG is kept as it came');
  assert.ok(JSON.parse(sent[0].init.body).input_references, 'the pictures to start from go along');
});

test('the type of a picture is what its bytes are, not what was asked for or said', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');
  assert.equal(sniffImageType(png), 'image/png');
  assert.equal(sniffImageType(b64('GIF89a....')), 'image/gif');
  assert.equal(sniffImageType(b64('GIF87a....')), 'image/gif');
  assert.equal(sniffImageType(b64('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64')), 'image/jpeg');
  assert.equal(sniffImageType(b64('<?xml version="1.0"?>\n<svg xmlns="x"/>')), 'image/svg+xml');
  assert.equal(sniffImageType(b64('  <svg width="1"/>')), 'image/svg+xml');
  assert.equal(sniffImageType(b64('hello')), '');
  assert.equal(sniffImageType(''), '');
  assert.equal(sniffImageType('%%%not base64'), '');
  // OpenRouter answered a PNG sheet of frames when a GIF was asked for with a picture to start from: it is called what it is.
  const fetchImpl = async () => json({ data: [{ b64_json: png, media_type: 'image/gif' }] });
  const result = await createOpenRouterImageGenerator({ fetchImpl })({ apiKey: 'k', model: 'm', prompt: 'p', config: { outputFormat: 'gif' } });
  assert.equal(result.images[0].mediaType, 'image/png');
});

test('a GIF on OpenRouter is automatic by default: the square of the settings is not sent, a chosen shape is', () => {
  const payload = (aspectRatio, outputFormat = 'gif') => buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: { aspectRatio, outputFormat } });
  assert.ok(!('aspect_ratio' in payload('1:1')));
  assert.ok(!('aspect_ratio' in payload('auto')));
  assert.equal(payload('16:9').aspect_ratio, '16:9');
  assert.equal(payload('1:1', 'png').aspect_ratio, '1:1', 'other formats are asked as before');
});
