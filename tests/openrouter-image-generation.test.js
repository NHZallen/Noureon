import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenRouterImageGenerator } from '../src/app/legacy-runtime/features/openrouter-image-generation.js';

test('posts a normalized buffered request and returns raster and vector images', async () => {
  let request;
  const generate = createOpenRouterImageGenerator({
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        data: [
          { b64_json: 'raster' },
          { b64_json: 'vector', media_type: 'image/svg+xml' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const result = await generate({
    apiKey: 'secret',
    model: 'openai/gpt-image-2.5-flare',
    prompt: 'a red panda',
    config: {
      aspectRatio: '16:9',
      resolution: '2K',
      n: 2,
      quality: 'high',
      outputFormat: 'webp',
      background: 'transparent',
      outputCompression: 80,
      seed: 42
    },
    inputReferences: ['data:image/png;base64,reference']
  });

  assert.equal(request.url, 'https://openrouter.ai/api/v1/images');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(request.body, {
    model: 'openai/gpt-image-2.5-flare',
    prompt: 'a red panda',
    n: 2,
    resolution: '2K',
    aspect_ratio: '16:9',
    quality: 'high',
    output_format: 'webp',
    background: 'transparent',
    output_compression: 80,
    seed: 42,
    input_references: [{
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,reference' }
    }]
  });
  assert.deepEqual(result.images, [
    { b64Json: 'raster', mediaType: 'image/png' },
    { b64Json: 'vector', mediaType: 'image/svg+xml' }
  ]);
});

test('surfaces OpenRouter image API errors', async () => {
  const generate = createOpenRouterImageGenerator({
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'unsupported resolution' } }), { status: 400 })
  });
  await assert.rejects(
    generate({ apiKey: 'secret', model: 'openai/gpt-image-2.5-flare', prompt: 'test' }),
    /unsupported resolution/
  );
});

test('a model that gives the same picture again for a request of several gets one request for each, with its own seed, and the pictures come back in order', async () => {
  const { SEPARATE_REQUEST_MODELS } = await import('../src/app/legacy-runtime/features/openrouter-image-generation.js');
  const { MODELS } = await import('../src/app/runtime/legacy-core/model-registry.js');
  for (const id of SEPARATE_REQUEST_MODELS) assert.ok(MODELS.some(model => (model.apiId || model.id) === id), `${id} is a model of the app`);
  const bodies = [];
  let seed = 100;
  const generate = createOpenRouterImageGenerator({
    makeSeed: () => (seed += 1),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      return new Response(JSON.stringify({ data: [{ b64_json: `picture-${body.seed}` }] }), { status: 200 });
    }
  });
  const result = await generate({ apiKey: 'k', model: 'qwen/qwen-image-2.1-turbo', prompt: 'a meadow', config: { aspectRatio: '9:16', n: 3 } });
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies.map(body => body.n), [1, 1, 1]);
  assert.deepEqual(bodies.map(body => body.seed), [101, 102, 103]);
  assert.ok(bodies.every(body => body.aspect_ratio === '9:16' && body.prompt === 'a meadow'));
  assert.deepEqual(result.images.map(image => image.b64Json), ['picture-101', 'picture-102', 'picture-103']);

  // A seed of the person is kept for the first and counted up.
  bodies.length = 0;
  await generate({ apiKey: 'k', model: 'qwen/qwen-image-2.1-pro', prompt: 'x', config: { n: 2, seed: 7 } });
  assert.deepEqual(bodies.map(body => body.seed), [7, 8]);

  // One picture, or a model that does not need it: one request as before.
  bodies.length = 0;
  await generate({ apiKey: 'k', model: 'qwen/qwen-image-2.1-turbo', prompt: 'x', config: { n: 1 } });
  await generate({ apiKey: 'k', model: 'openai/gpt-image-2.5-flare', prompt: 'x', config: { n: 4 } });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].n, 4);
});

test('some pictures are better than none, and with none the first problem is the answer', async () => {
  let call = 0;
  const partial = createOpenRouterImageGenerator({
    makeSeed: () => 5,
    fetchImpl: async () => {
      call += 1;
      return call === 2 ? new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 429 }) : new Response(JSON.stringify({ data: [{ b64_json: `p${call}` }] }), { status: 200 });
    }
  });
  const got = await partial({ apiKey: 'k', model: 'qwen/qwen-image-2.1-turbo', prompt: 'x', config: { n: 3 } });
  assert.deepEqual(got.images.map(image => image.b64Json), ['p1', 'p3']);

  const failing = createOpenRouterImageGenerator({ fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'no credit' } }), { status: 402 }) });
  await assert.rejects(failing({ apiKey: 'k', model: 'qwen/qwen-image-2.1-pro', prompt: 'x', config: { n: 2 } }), /no credit/);
});

test('groups: one picture for each, each from its own pictures and shape, in the order of the groups', async () => {
  const calls = [];
  const generate = createOpenRouterImageGenerator({
    makeSeed: () => 9,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return new Response(JSON.stringify({ data: [{ b64_json: `from-${body.input_references[0].image_url.url}` }] }), { status: 200 });
    }
  });
  const result = await generate({
    apiKey: 'k', model: 'openai/gpt-image-2.5-sunburst', prompt: 'add some animals', config: { aspectRatio: '1:1', n: 2 },
    groups: [{ inputReferences: ['one'], aspectRatio: '9:16' }, { inputReferences: ['two'] }]
  });
  assert.deepEqual(calls.map(call => [call.n, call.aspect_ratio]), [[1, '9:16'], [1, '1:1']]);
  assert.equal('seed' in calls[0], false, 'a model that varies by itself gets no seed');
  assert.deepEqual(result.images.map(image => [image.b64Json, image.aspectRatio]), [['from-one', '9:16'], ['from-two', '1:1']]);

  calls.length = 0;
  await generate({ apiKey: 'k', model: 'qwen/qwen-image-2.1-pro', prompt: 'x', config: { aspectRatio: '1:1' }, groups: [{ inputReferences: ['a'] }, { inputReferences: ['b'] }] });
  assert.deepEqual(calls.map(call => call.seed), [9, 9], 'a model that gives the same picture again gets a seed for each');
});
