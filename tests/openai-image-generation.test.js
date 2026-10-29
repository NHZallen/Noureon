import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpenAiImageFields, createOpenAiImageGenerator, openAiImageSize } from '../src/app/runtime/images/openai-image-generation.js';
import { createImageGenerator } from '../src/app/runtime/images/image-generators.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';
import { IMAGE_ASPECT_RATIOS } from '../src/app/runtime/images/image-generation-config.js';
import { solidPng } from '../scripts/openai-probe.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body), json: async () => body });
const PNG = `data:image/png;base64,${solidPng(16)}`;

test('every shape and size tier the app offers for a GPT Image model gives a size inside the rules of OpenAI', () => {
  const models = MODELS.filter((model) => model.provider === 'openai' && model.outputModality === 'image');
  assert.equal(models.length, 2);
  for (const model of models) {
    for (const ratio of model.supportedImageAspectRatios.filter((candidate) => candidate !== 'auto')) {
      for (const tier of model.supportedImageResolutions) {
        const [width, height] = openAiImageSize(ratio, tier).split('x').map(Number);
        assert.ok(width % 16 === 0 && height % 16 === 0, `${ratio} ${tier}: multiples of 16 (${width}x${height})`);
        assert.ok(Math.max(width, height) <= 3840, `${ratio} ${tier}: edge at most 3840`);
        assert.ok(width * height >= 655_360 && width * height <= 8_294_400, `${ratio} ${tier}: pixels in range (${width * height})`);
        assert.ok(Math.max(width, height) / Math.min(width, height) <= 3.0001, `${ratio} ${tier}: ratio at most 3:1`);
      }
    }
  }
  assert.equal(openAiImageSize('auto', '2K'), 'auto');
  assert.equal(openAiImageSize('1:1', '1K'), '1024x1024');
  assert.equal(openAiImageSize('16:9', '4K'), '3840x2160');
  // Every shape of the app, even the ones a GPT Image model lacks, stays in the rules (a shape beyond 3:1 is brought to it).
  for (const ratio of IMAGE_ASPECT_RATIOS.filter((candidate) => candidate !== 'auto')) {
    const [width, height] = openAiImageSize(ratio, '1K').split('x').map(Number);
    assert.ok(width * height >= 655_360 && Math.max(width, height) / Math.min(width, height) <= 3.0001, ratio);
  }
});

test('the fields: only what has a value, a compression only for a format that loses something', () => {
  assert.deepEqual(buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { aspectRatio: '1:1', resolution: '1K' } }), { model: 'm', prompt: 'p', size: '1024x1024' });
  const fields = buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { aspectRatio: '3:2', resolution: '2K', n: 2, quality: 'xhigh', outputFormat: 'webp', outputCompression: 60, background: 'transparent' }, safetyIdentifier: 'abc' });
  assert.deepEqual(fields, { model: 'm', prompt: 'p', n: 2, size: fields.size, quality: 'xhigh', output_format: 'webp', background: 'transparent', output_compression: 60, safety_identifier: 'abc' });
  assert.equal('output_compression' in buildOpenAiImageFields({ model: 'm', prompt: 'p', config: { outputFormat: 'png', outputCompression: 60 } }), false);
});

test('a picture from words goes to the generations endpoint, and one built on pictures to the edits endpoint as a form', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return json({ data: [{ b64_json: 'QUJD' }], output_format: 'jpeg' }); };
  const generate = createOpenAiImageGenerator({ fetchImpl, getSafetyIdentifier: async () => 'ident' });
  const fresh = await generate({ apiKey: 'sk-1', model: 'gpt-image-2.5-flare', prompt: 'a cat', config: { aspectRatio: '1:1', resolution: '1K', quality: 'low', outputFormat: 'jpeg' } });
  assert.deepEqual(fresh.images, [{ b64Json: 'QUJD', mediaType: 'image/jpeg' }]);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'gpt-image-2.5-flare', prompt: 'a cat', size: '1024x1024', quality: 'low', output_format: 'jpeg', safety_identifier: 'ident' });
  const edited = await generate({ apiKey: 'sk-1', model: 'gpt-image-2.5-flare', prompt: 'make it blue', config: { aspectRatio: '1:1' }, inputReferences: [PNG, PNG] });
  assert.equal(edited.images.length, 1);
  assert.equal(calls[1].url, 'https://api.openai.com/v1/images/edits');
  assert.equal('Content-Type' in calls[1].init.headers, false, 'the form sets its own');
  const form = calls[1].init.body;
  assert.equal(form.get('prompt'), 'make it blue');
  assert.equal(form.get('safety_identifier'), 'ident');
  assert.equal(form.getAll('image[]').length, 2);
  assert.equal(form.getAll('image[]')[0].type, 'image/png');
});

test('pictures that each build on their own earlier picture are one request each, and one that fails does not take the others', async () => {
  let count = 0;
  const fetchImpl = async () => { count += 1; return count === 2 ? json({ error: { message: 'busy' } }, 429) : json({ data: [{ b64_json: `P${count}` }] }); };
  const generate = createOpenAiImageGenerator({ fetchImpl });
  const result = await generate({ apiKey: 'k', model: 'm', prompt: 'p', config: { aspectRatio: '1:1' }, groups: [{ inputReferences: [PNG], aspectRatio: '16:9' }, { inputReferences: [PNG] }, { inputReferences: [PNG], aspectRatio: '1:1' }] });
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].aspectRatio, '16:9');
  await assert.rejects(() => createOpenAiImageGenerator({ fetchImpl: async () => json({ error: { message: 'Your organization must be verified.' } }, 403) })({ apiKey: 'k', model: 'm', prompt: 'p' }), /must be verified/);
});

test('the one function for pictures sends a request to the provider it names', async () => {
  const urls = [];
  const generate = createImageGenerator({ fetchImpl: async (url) => { urls.push(String(url)); return json({ data: [{ b64_json: 'QQ==' }] }); }, getSafetyIdentifier: async () => '' });
  await generate({ provider: 'openai', apiKey: 'k', model: 'gpt-image-2.5-flare', prompt: 'p', config: {} });
  await generate({ provider: 'openrouter', apiKey: 'k', model: 'openai/gpt-image-2.5-flare', prompt: 'p', config: {} });
  assert.deepEqual(urls, ['https://api.openai.com/v1/images/generations', 'https://openrouter.ai/api/v1/images']);
});
