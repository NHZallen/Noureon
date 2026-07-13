import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStepFunImagePayload,
  countStepPromptUnits,
  createStepFunImageGenerator
} from '../src/app/legacy-runtime/features/stepfun-image-generation.js';

test('builds Step Plan image generation payloads with supported Step Image Edit 2 values', () => {
  assert.deepEqual(buildStepFunImagePayload({
    model: 'step-image-edit-2',
    prompt: 'a paper-cut city at dawn',
    config: {
      aspectRatio: '16:9',
      seed: 42,
      stepfun: { steps: 12, cfgScale: 2.5, textMode: true }
    }
  }), {
    model: 'step-image-edit-2',
    prompt: 'a paper-cut city at dawn',
    response_format: 'b64_json',
    size: '768x1360',
    cfg_scale: 2.5,
    steps: 12,
    text_mode: true,
    seed: 42
  });
});

test('uses the Step Plan generation proxy and normalizes base64 responses', async () => {
  let request;
  const generator = createStepFunImageGenerator({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        data: [{ b64_json: '/9j/4AAQSkZJRg==' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  const result = await generator({
    apiKey: 'step-key',
    model: 'step-image-edit-2',
    prompt: 'paint a quiet mountain lake',
    config: { aspectRatio: '3:4' },
    inputReferences: []
  });

  assert.equal(request.url, '/api/step-plan-images?operation=generations');
  assert.equal(request.options.headers.Authorization, 'Bearer step-key');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'step-image-edit-2',
    prompt: 'paint a quiet mountain lake',
    response_format: 'b64_json',
    size: '1184x896',
    cfg_scale: 1,
    steps: 8,
    text_mode: false
  });
  assert.deepEqual(result.images, [{ b64Json: '/9j/4AAQSkZJRg==', mediaType: 'image/jpeg' }]);
});

test('rejects multiple Step Image Edit 2 references before sending a request', async () => {
  let called = false;
  const generator = createStepFunImageGenerator({
    fetchImpl: async () => {
      called = true;
      throw new Error('should not fetch');
    }
  });

  await assert.rejects(
    generator({
      apiKey: 'step-key',
      model: 'step-image-edit-2',
      prompt: 'edit this',
      inputReferences: ['data:image/png;base64,one', 'data:image/png;base64,two']
    }),
    /一張圖片附件/
  );
  assert.equal(called, false);
});

test('counts Step prompt units and rejects prompts that exceed the 512-unit limit', async () => {
  assert.equal(countStepPromptUnits('兩個中文 words 123'), 6);
  const generator = createStepFunImageGenerator({
    fetchImpl: async () => {
      throw new Error('should not fetch');
    }
  });
  const prompt = Array.from({ length: 513 }, () => 'word').join(' ');

  await assert.rejects(
    generator({ apiKey: 'step-key', model: 'step-image-edit-2', prompt }),
    /提示詞上限為 512，目前為 513/
  );
});
