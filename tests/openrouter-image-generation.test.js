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
    model: 'openai/gpt-image-2',
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
    model: 'openai/gpt-image-2',
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

test('streams partial images and captures completed images', async () => {
  const partials = [];
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"partial"}\n'));
      controller.enqueue(encoder.encode('data: {"type":"image_generation.completed","b64_json":"final"}\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    }
  });
  const generate = createOpenRouterImageGenerator({
    fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  });

  const result = await generate({
    apiKey: 'secret', model: 'openai/gpt-image-2', prompt: 'landscape', onPartial: image => partials.push(image)
  });

  assert.deepEqual(partials, [{ index: 0, b64Json: 'partial', mediaType: 'image/png' }]);
  assert.deepEqual(result.images, [{ b64Json: 'final', mediaType: 'image/png' }]);
});

test('surfaces OpenRouter image API errors', async () => {
  const generate = createOpenRouterImageGenerator({
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'unsupported resolution' } }), { status: 400 })
  });
  await assert.rejects(
    generate({ apiKey: 'secret', model: 'openai/gpt-image-2', prompt: 'test' }),
    /unsupported resolution/
  );
});
