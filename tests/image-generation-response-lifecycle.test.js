import test from 'node:test';
import assert from 'node:assert/strict';

import { createImageGenerationResponseLifecycle } from '../src/app/legacy-runtime/features/image-generation-response-lifecycle.js';
import { buildOpenRouterImagePayload } from '../src/app/legacy-runtime/features/openrouter-image-generation.js';

test('uses translated search context and new image attachments for generation', async () => {
  let request;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => [{ text: '# Web search packet\ncurrent facts' }, ...parts],
    generateImage: async value => {
      request = value;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async image => ({ id: 'new-1', storageKey: 'key', mediaType: image.mediaType, size: 5 }),
    getStoredImageDataUrl: async () => 'data:image/png;base64,old',
    getApiKey: () => 'secret'
  });

  const result = await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [
      { text: 'turn it into watercolor' },
      { inlineData: { mimeType: 'image/jpeg', data: 'new-reference' } }
    ],
    modelInfo: { id: 'openai/gpt-image-2', provider: 'openrouter' },
    conversation: {
      imageConfig: { aspectRatio: '16:9', resolution: '2K' },
      messages: [{ role: 'model', parts: [{ generatedImage: { id: 'old', storageKey: 'old-key' } }] }]
    }
  });

  assert.match(request.prompt, /Web search packet/);
  assert.match(request.prompt, /turn it into watercolor/);
  assert.deepEqual(request.inputReferences, ['data:image/jpeg;base64,new-reference']);
  assert.deepEqual(request.config, { aspectRatio: '16:9', resolution: '2K' });
  assert.deepEqual(result.parts, [{ generatedImage: { id: 'new-1', storageKey: 'key', mediaType: 'image/png', size: 5 } }]);
});

test('falls back to the latest generated image when there is no new attachment', async () => {
  let references;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      references = value.inputReferences;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'new', storageKey: 'new-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async descriptor => `data:image/png;base64,${descriptor.id}`,
    getApiKey: () => 'secret'
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'make it darker' }],
    modelInfo: { id: 'openai/gpt-image-2', provider: 'openrouter' },
    conversation: {
      messages: [
        { role: 'model', parts: [{ generatedImage: { id: 'older', storageKey: '1' } }] },
        { role: 'model', parts: [{ generatedImage: { id: 'latest', storageKey: '2' } }] }
      ]
    }
  });

  assert.deepEqual(references, ['data:image/png;base64,latest']);
});

test('keeps image-to-image requests buffered even when the model supports generation streaming', async () => {
  let request;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      request = value;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'edited', storageKey: 'edited-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret'
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [
      { text: 'make it winter' },
      { inlineData: { mimeType: 'image/png', data: 'reference' } }
    ],
    modelInfo: { id: 'openai/gpt-image-2', provider: 'openrouter', supportsImageStreaming: true },
    conversation: { messages: [] }
  });

  assert.equal(request.onPartial, undefined);
  assert.deepEqual(request.inputReferences, ['data:image/png;base64,reference']);
});

test('passes selected image reasoning effort into generation requests', async () => {
  let request;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      request = value;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'reasoned', storageKey: 'reasoned-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret',
    getModelReasoningConfig: () => ({
      providerParameter: 'openrouterReasoningEffort',
      options: ['minimal', 'high'],
      defaultEffort: 'minimal'
    }),
    normalizeReasoningEffort: (_model, value) => value || 'minimal'
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'make the lighting more cinematic' }],
    modelInfo: { id: 'google/gemini-3.1-flash-image', provider: 'openrouter' },
    conversation: { reasoningEffort: 'high', messages: [] }
  });

  assert.equal(request.config.reasoningEffort, 'high');
});

test('adds precise edit guidance for annotated references', async () => {
  let prompt;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      prompt = value.prompt;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'targeted', storageKey: 'targeted-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret'
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [
      { text: 'replace this fruit with flowers' },
      { inlineData: { mimeType: 'image/png', data: 'annotated', targetedEdit: true } }
    ],
    modelInfo: { id: 'google/gemini-3.1-flash-image', provider: 'openrouter' },
    conversation: { messages: [] }
  });

  assert.match(prompt, /exact target area/);
  assert.match(prompt, /remove all annotation marks/);
});

test('OpenRouter image payload emits reasoning effort without changing image config fields', () => {
  const payload = buildOpenRouterImagePayload({
    model: 'google/gemini-3.1-flash-image',
    prompt: 'paint a neon alley',
    config: {
      aspectRatio: '16:9',
      resolution: '2K',
      reasoningEffort: 'minimal'
    }
  });

  assert.deepEqual(payload.reasoning, { effort: 'minimal' });
  assert.equal(payload.aspect_ratio, '16:9');
  assert.equal(payload.resolution, '2K');
  assert.equal(payload.image_config, undefined);
});
