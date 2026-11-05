import assert from 'node:assert/strict';
import test from 'node:test';

import { GIF_FRAME_COUNTS, GIF_FRAME_COUNT_DEFAULT, GIF_FRAME_DURATIONS_MS, GPT_IMAGE_26_FORMATS, settleImageFormatConfig, sniffImageType, supportedFormatsOf } from '../src/app/runtime/images/image-formats.js';
import { OPENAI_SVG_MODEL, buildOpenAiImageFields, createOpenAiImageGenerator, openAiGifSize, openAiImageSize } from '../src/app/runtime/images/openai-image-generation.js';
import { buildOpenRouterImagePayload, createOpenRouterImageGenerator } from '../src/app/runtime/images/openrouter-image-generation.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

// GPT Image 2.6 (OpenAI's own API and OpenRouter): the formats gif (frame_count, frame_duration_ms) and svg (one picture, no compression), asked for in the same way by both makers of pictures.

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const b64 = (text) => Buffer.from(text).toString('base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';

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

test('a gif and an svg come back with their own types, and pictures to start from may go with them', async () => {
  const sent = [];
  const gifBytes = b64('GIF89a-frames');
  const fetchImpl = async (url, init) => { sent.push({ url: String(url), init }); return json({ data: [{ b64_json: String(url).includes('openrouter') ? b64(SVG) : gifBytes }] }); };
  const openai = createOpenAiImageGenerator({ fetchImpl, getSafetyIdentifier: async () => '' });
  const gif = await openai({ apiKey: 'k', model: 'gpt-image-2.6-flare', prompt: 'a spinning cat', config: { aspectRatio: '1:1', outputFormat: 'gif', frameCount: 4 } });
  assert.deepEqual(gif.images, [{ b64Json: gifBytes, mediaType: 'image/gif' }]);
  const gifBody = JSON.parse(sent[0].init.body);
  assert.equal(gifBody.frame_count, 4);
  assert.equal(gifBody.size, 'auto', 'a GIF is automatic by default: 1024x1024 was refused by OpenAI, the model chooses a size that fits');
  assert.equal(sent[0].url, 'https://api.openai.com/v1/images/generations');
  // A picture to start from goes to the endpoint that edits, for a GIF as for any format (it made a GIF in the probe of 2026-11-06).
  await openai({ apiKey: 'k', model: 'gpt-image-2.6-flare', prompt: 'animate it', config: { outputFormat: 'gif', frameCount: 4 }, inputReferences: ['data:image/png;base64,QQ=='] });
  assert.equal(sent[1].url, 'https://api.openai.com/v1/images/edits');
  assert.equal(sent[1].init.body.get('output_format'), 'gif');
  assert.equal(sent[1].init.body.get('frame_count'), '4');
  // An SVG is written by a text model that the API asks for by name; the person does not choose it.
  await openai({ apiKey: 'k', model: 'gpt-image-2.6-flare', prompt: 'a logo', config: { outputFormat: 'svg' } });
  assert.deepEqual(JSON.parse(sent[2].init.body).svg, { model: OPENAI_SVG_MODEL });
  assert.equal(JSON.parse(sent[2].init.body).output_format, 'svg');
  const router = createOpenRouterImageGenerator({ fetchImpl });
  const svg = await router({ apiKey: 'k', model: 'openai/gpt-image-2.6-flare', prompt: 'a logo', config: { outputFormat: 'svg' }, inputReferences: ['data:image/png;base64,QQ=='] });
  assert.equal(svg.images.length, 1);
  assert.equal(svg.images[0].mediaType, 'image/svg+xml');
  assert.equal(Buffer.from(svg.images[0].b64Json, 'base64').toString('utf8'), SVG, 'the SVG is kept as it came');
  assert.ok(JSON.parse(sent[3].init.body).input_references, 'the pictures to start from go along');
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
  const openaiResult = await createOpenAiImageGenerator({ fetchImpl: async () => json({ data: [{ b64_json: png }] }) })({ apiKey: 'k', model: 'm', prompt: 'p', config: { outputFormat: 'gif' } });
  assert.equal(openaiResult.images[0].mediaType, 'image/png');
});

test('the size of a GIF on OpenAI is automatic by default; a shape that is chosen is drawn with its longest edge at 512', () => {
  assert.equal(openAiGifSize('auto'), 'auto');
  assert.equal(openAiGifSize('1:1'), 'auto', 'the square is what the settings hold until a shape is chosen');
  assert.equal(openAiGifSize('3:3'), '512x512', 'a shape that is square but was written another way is drawn');
  assert.equal(openAiGifSize('16:9'), '512x288');
  assert.equal(openAiGifSize('9:16'), '288x512');
  assert.equal(openAiGifSize('21:9'), '512x224');
  assert.equal(openAiGifSize('1:8'), '176x512', 'the shapes OpenAI takes are 1:3 to 3:1');
  assert.equal(openAiGifSize(''), 'auto');
  const fields = (aspectRatio) => buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { aspectRatio, resolution: '4K', outputFormat: 'gif' } });
  assert.equal(fields('auto').size, 'auto');
  assert.equal(fields('4:3').size, '512x384', 'the size tier of the settings does not make a GIF bigger');
  assert.equal(buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { aspectRatio: '16:9', resolution: '1K', outputFormat: 'png' } }).size, openAiImageSize('16:9', '1K'));
});

test('a GIF on OpenRouter is automatic by default: the square of the settings is not sent, a chosen shape is', () => {
  const payload = (aspectRatio, outputFormat = 'gif') => buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: { aspectRatio, outputFormat } });
  assert.ok(!('aspect_ratio' in payload('1:1')));
  assert.ok(!('aspect_ratio' in payload('auto')));
  assert.equal(payload('16:9').aspect_ratio, '16:9');
  assert.equal(payload('1:1', 'png').aspect_ratio, '1:1', 'other formats are asked as before');
});
