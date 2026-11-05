import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeneratedImageAssetStore } from '../src/app/runtime/images/generated-image-assets.js';
import { GIF_FRAME_COUNTS, GIF_FRAME_COUNT_DEFAULT, GIF_FRAME_DURATIONS_MS, GPT_IMAGE_26_FORMATS, settleImageFormatConfig, supportedFormatsOf } from '../src/app/runtime/images/image-formats.js';
import { buildOpenAiImageFields, createOpenAiImageGenerator } from '../src/app/runtime/images/openai-image-generation.js';
import { buildOpenRouterImagePayload, createOpenRouterImageGenerator } from '../src/app/runtime/images/openrouter-image-generation.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

// GPT Image 2.6 (OpenAI's own API and OpenRouter): the formats gif (frame_count, frame_duration_ms) and svg (one picture, no compression), asked for in the same way by both makers of pictures.

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const b64 = (text) => Buffer.from(text).toString('base64');
const SVG = '<svg width="4" height="4"><script>alert(1)</script><rect width="4" height="4"/></svg>';
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

test('the formats a model makes: GPT Image 2.6 of both providers makes gif and svg too, the others the still ones', () => {
  const models = MODELS.filter((model) => /gpt-image-2\.6/.test(model.id));
  assert.deepEqual(models.map((model) => model.id).sort(), ['openai-api/gpt-image-2.6-flare', 'openai-api/gpt-image-2.6-sunburst', 'openai/gpt-image-2.6-flare', 'openai/gpt-image-2.6-sunburst']);
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

test('OpenAI and OpenRouter are asked in the same way for a gif and for an svg', () => {
  const gif = { aspectRatio: '1:1', resolution: '1K', outputFormat: 'gif', frameCount: 6, frameDuration: 150, outputCompression: 80, n: 2 };
  const openai = buildOpenAiImageFields({ model: 'gpt-image-2.6-flare', prompt: 'p', config: gif });
  assert.equal(openai.output_format, 'gif');
  assert.equal(openai.frame_count, 6);
  assert.equal(openai.frame_duration_ms, 150);
  assert.equal(openai.n, 2);
  assert.ok(!('output_compression' in openai));
  const router = buildOpenRouterImagePayload({ model: 'openai/gpt-image-2.6-flare', prompt: 'p', config: gif });
  assert.deepEqual([router.output_format, router.frame_count, router.frame_duration_ms, 'output_compression' in router], ['gif', 6, 150, false]);
  const svgConfig = { aspectRatio: '1:1', outputFormat: 'svg', n: 5, outputCompression: 90 };
  for (const request of [buildOpenAiImageFields({ model: 'm', prompt: 'p', config: svgConfig }), buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: svgConfig })]) {
    assert.equal(request.output_format, 'svg');
    assert.equal(request.n, 1);
    assert.ok(!('output_compression' in request) && !('frame_count' in request));
  }
  const still = buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { aspectRatio: '1:1', outputFormat: 'png', frameCount: 6 } });
  assert.ok(!('frame_count' in still), 'only a gif has frames');
});

test('a gif and an svg come back with their own types, the svg made safe; a gif or an svg cannot be made from pictures to start from', async () => {
  const sent = [];
  const gifBytes = b64('GIF89a-frames');
  const fetchImpl = async (url, init) => { sent.push({ url: String(url), init }); return json({ data: [{ b64_json: String(url).includes('openrouter') ? b64(SVG) : gifBytes }] }); };
  const openai = createOpenAiImageGenerator({ fetchImpl, getSafetyIdentifier: async () => '' });
  const gif = await openai({ apiKey: 'k', model: 'gpt-image-2.6-flare', prompt: 'a spinning cat', config: { aspectRatio: '1:1', outputFormat: 'gif', frameCount: 4 } });
  assert.deepEqual(gif.images, [{ b64Json: gifBytes, mediaType: 'image/gif' }]);
  assert.equal(JSON.parse(sent[0].init.body).frame_count, 4);
  assert.equal(sent[0].url, 'https://api.openai.com/v1/images/generations');
  await assert.rejects(() => openai({ apiKey: 'k', model: 'gpt-image-2.6-flare', prompt: 'p', config: { outputFormat: 'svg' }, inputReferences: ['data:image/png;base64,QQ=='] }), /words alone/);
  const router = createOpenRouterImageGenerator({ fetchImpl });
  const svg = await router({ apiKey: 'k', model: 'openai/gpt-image-2.6-flare', prompt: 'a logo', config: { outputFormat: 'svg' } });
  assert.equal(svg.images.length, 1);
  assert.equal(svg.images[0].mediaType, 'image/svg+xml', 'no type in the answer: an svg was asked for');
  assert.equal(Buffer.from(svg.images[0].b64Json, 'base64').toString('utf8'), SAFE_SVG, 'the script is left out');
  // An SVG that cannot be made safe is refused with a message; it is not kept.
  const broken = createOpenRouterImageGenerator({ fetchImpl: async () => json({ data: [{ b64_json: b64('<html><body onload="x()">'), media_type: 'image/svg+xml' }] }) });
  await assert.rejects(() => broken({ apiKey: 'k', model: 'm', prompt: 'p', config: { outputFormat: 'svg' } }), /not safe to show/);
});

test('an svg is made safe again when it is shown, whatever way it came; one that cannot be made safe is not shown', async () => {
  const blobs = new Map([['good', new Blob([SVG], { type: 'image/svg+xml' })], ['bad', new Blob(['<html onload="x()">'], { type: 'image/svg+xml' })], ['png', new Blob(['PNG'], { type: 'image/png' })]]);
  const shown = [];
  const store = createGeneratedImageAssetStore({ setItem: async () => {}, getItem: async (key) => blobs.get(key), getUserName: () => 'a', createObjectURL: (blob) => { shown.push(blob); return `blob:${shown.length}`; } });
  const elements = [];
  const root = { querySelectorAll: (selector) => elements.filter((element) => selector.includes(element.id)) };
  const img = (id) => ({ id, addEventListener() {}, closest: () => null, style: {} });
  for (const id of ['good', 'bad', 'png']) elements.push(img(`data-generated-image-id="${id}"`));
  await store.bind(root, [{ id: 'good', storageKey: 'good', mediaType: 'image/svg+xml' }, { id: 'bad', storageKey: 'bad', mediaType: 'image/svg+xml' }, { id: 'png', storageKey: 'png', mediaType: 'image/png' }]);
  const texts = await Promise.all(shown.map((blob) => blob.text()));
  assert.ok(texts.includes(SAFE_SVG), 'the svg is shown without its script');
  assert.ok(texts.includes('PNG'), 'a picture of another type is shown as it is');
  assert.ok(!texts.some((text) => /<script|onload/.test(text)), 'nothing unsafe is shown');
  assert.equal(shown.length, 2, 'the svg that cannot be made safe is not shown');
});
