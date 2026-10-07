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
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
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

test('preserves prompts when translation returns the original OpenRouter request parts', async () => {
  let request;
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      request = value;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'image', storageKey: 'image-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'openrouter-key'
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: '畫一隻穿雨衣的柴犬' }],
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
    conversation: { messages: [] }
  });

  assert.equal(request.prompt, '畫一隻穿雨衣的柴犬');
  assert.equal(request.model, 'openai/gpt-image-2.5-flare');
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
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
    conversation: {
      messages: [
        { role: 'model', parts: [{ generatedImage: { id: 'older', storageKey: '1' } }] },
        { role: 'model', parts: [{ generatedImage: { id: 'latest', storageKey: '2' } }] }
      ]
    }
  });

  assert.deepEqual(references, ['data:image/png;base64,latest']);
});

test('tells the user when the latest generated image can no longer be reused', async () => {
  let request;
  const notices = [];
  const label = { textContent: '正在建立圖像' };
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      request = value;
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'fresh', storageKey: 'fresh-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret',
    getText: key => (key === 'imageReferenceUnavailableLabel' ? '參考圖已遺失，正在重新生成' : '上一張圖片已遺失'),
    showNotification: (message, type) => notices.push({ message, type })
  });

  await lifecycle.run({
    targetElement: { innerHTML: '', querySelector: () => label },
    userParts: [{ text: 'make it darker' }],
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
    conversation: {
      messages: [{ role: 'model', parts: [{ generatedImage: { id: 'latest', storageKey: 'gone' } }] }]
    }
  });

  assert.deepEqual(notices, [{ message: '上一張圖片已遺失', type: 'warning' }]);
  assert.equal(label.textContent, '參考圖已遺失，正在重新生成');
  assert.deepEqual(request.inputReferences, []);
  // There are no preview pictures any more: the request never carries a callback for them.
  assert.equal(request.onPartial, undefined);
});

test('stays silent when the conversation has no generated image to reuse', async () => {
  const notices = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async () => ({ images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] }),
    saveImageAsset: async () => ({ id: 'fresh', storageKey: 'fresh-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret',
    showNotification: message => notices.push(message)
  });

  await lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'a shiba inu in a raincoat' }],
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
    conversation: { messages: [] }
  });

  assert.deepEqual(notices, []);
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
    modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' },
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
    modelInfo: { id: 'google/gemini-nano-banana-2.1', provider: 'openrouter' },
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
    modelInfo: { id: 'google/gemini-nano-banana-2.1', provider: 'openrouter' },
    conversation: { messages: [] }
  });

  assert.match(prompt, /exact target area/);
  assert.match(prompt, /remove all annotation marks/);
});

test('OpenRouter image payload emits reasoning effort without changing image config fields', () => {
  const payload = buildOpenRouterImagePayload({
    model: 'google/gemini-nano-banana-2.1',
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

test('sends the nearest ratio and resolution the model supports, and no resolution to a model with none to choose', async () => {
  const requests = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      requests.push(value);
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'image', storageKey: 'image-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'openrouter-key'
  });
  const conversation = { imageConfig: { aspectRatio: '1:8', resolution: '4K' }, messages: [] };
  const run = (modelInfo) => lifecycle.run({ targetElement: { innerHTML: '' }, userParts: [{ text: 'a cat' }], modelInfo, conversation });

  await run({ id: 'x/ratios-without-extremes', provider: 'openrouter', supportedImageAspectRatios: ['1:1', '2:3', '9:16'], supportedImageResolutions: ['1K', '2K', '4K'] });
  assert.equal(requests[0].config.aspectRatio, '9:16');
  assert.equal(requests[0].config.resolution, '4K');

  await run({ id: 'x/one-size-only', provider: 'openrouter', supportedImageAspectRatios: ['1:1', '1:8'], supportedImageResolutions: ['1K'] });
  assert.equal(requests[1].config.aspectRatio, '1:8');
  assert.equal(requests[1].config.resolution, '1K');

  await run({ id: 'x/no-sizes', provider: 'openrouter', supportedImageAspectRatios: ['1:1', '9:16'], supportedImageResolutions: [] });
  assert.equal(requests[2].config.resolution, '');
  assert.equal('resolution' in buildOpenRouterImagePayload({ model: 'm', prompt: 'p', config: requests[2].config }), false, 'nothing is sent for it');
  assert.equal(conversation.imageConfig.resolution, '4K', 'the saved choice itself is left alone');
});
