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
  const label = { textContent: '正在建立圖像', dataset: {} };
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

test('a count saved with another model is cut to one picture for a model that makes one per request', async () => {
  const requests = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      requests.push(value);
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'image', storageKey: 'image-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'key'
  });
  const run = (modelInfo) => lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'a cat' }],
    modelInfo,
    conversation: { imageConfig: { aspectRatio: '1:1', resolution: '1K' }, imageAdvancedConfig: { n: 4 }, messages: [] }
  });
  await run({ id: 'black-forest-labs/flux-3-image-klein', provider: 'openrouter', maxImageCount: 1 });
  await run({ id: 'black-forest-labs/flux-3-image', provider: 'openrouter' });
  assert.equal(requests[0].config.n, 1, 'Klein takes one');
  assert.equal(requests[1].config.n, 4, 'the other models keep the count');
});

test('an editing model is not asked without a picture to edit, and gets at most the references it takes', async () => {
  const requests = [];
  const notices = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      requests.push(value);
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'edited', storageKey: 'edited-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'secret',
    getText: (_key, fallback) => fallback,
    showNotification: (text, kind) => notices.push([text, kind])
  });
  const krea = { id: 'krea/k3-edit', provider: 'openrouter', minImageReferences: 1, maxImageReferences: 4 };
  const run = (userParts) => lifecycle.run({ targetElement: { innerHTML: '' }, userParts, modelInfo: krea, conversation: { messages: [] } });

  await assert.rejects(run([{ text: 'make it night' }]), /attach the picture to edit/);
  assert.equal(requests.length, 0, 'nothing is sent without a picture');

  const picture = (name) => ({ inlineData: { mimeType: 'image/png', data: name } });
  await run([{ text: 'make it night' }, ...['a', 'b', 'c', 'd'].map(picture)]);
  assert.equal(requests[0].inputReferences.length, 4, 'four are what it takes');
  // More than it takes: nothing is sent, and the words say how many it takes and how many were attached.
  await assert.rejects(run([{ text: 'make it night' }, ...['a', 'b', 'c', 'd', 'e', 'f'].map(picture)]), /takes 4 reference pictures at most and you attached 6, so nothing was sent/);
  assert.equal(requests.length, 1, 'the request of six was not sent');
});

test('quality, background and compression are sent only to a model that lists them', async () => {
  const requests = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      requests.push(value);
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'image', storageKey: 'image-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'key'
  });
  const advanced = { n: 2, quality: 'high', background: 'opaque', outputCompression: '80', outputFormat: 'png' };
  const run = (modelInfo) => lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'a cat' }],
    modelInfo,
    conversation: { imageConfig: { aspectRatio: '1:1', resolution: '1K' }, imageAdvancedConfig: { ...advanced }, messages: [] }
  });
  await run({ id: 'openai/gpt-image-2.5-flare', provider: 'openrouter', supportedImageOptions: ['quality', 'background', 'outputCompression'] });
  await run({ id: 'black-forest-labs/flux-3-image', provider: 'openrouter' });
  assert.equal(requests[0].config.quality, 'high');
  assert.equal(requests[0].config.background, 'opaque');
  assert.equal(requests[0].config.outputCompression, '80');
  for (const key of ['quality', 'background', 'outputCompression']) assert.equal(key in requests[1].config, false, `${key} is not sent to FLUX`);
  assert.equal(requests[1].config.outputFormat, 'png', 'the rest is left as it is');
  assert.equal(requests[1].config.n, 2);
});

const spokenHarness = (decision, overrides = {}) => {
  const requests = [];
  const asked = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async parts => parts,
    generateImage: async value => {
      requests.push(value);
      return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] };
    },
    saveImageAsset: async () => ({ id: 'image', storageKey: 'image-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => 'key',
    getText: (_key, fallback) => fallback
  });
  const model = { id: 'qwen/qwen-image-2.1-pro', provider: 'openrouter', maxImageCount: 6, maxImageReferences: 4, supportedImageAspectRatios: ['1:1', '1:2', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'], ...overrides };
  const run = (text, { advanced = {}, requestImageDecisions = async (input) => { asked.push(input); return decision; } } = {}) => lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text }],
    modelInfo: model,
    conversation: { imageConfig: { aspectRatio: '1:1', resolution: '1K' }, imageAdvancedConfig: { n: 1, ...advanced }, messages: [] },
    requestImageDecisions
  });
  return { run, requests, asked, model };
};
const answers = (over = {}) => ({ collage: 0.05, countSaid: 0.05, count: null, more: 0.02, ratioStated: 0.05, portrait: 0.05, landscape: 0.05, square: 0.05, ...over });

test('what is said about the count and the shape is used for this message: two pictures of 9:16', async () => {
  const { run, requests, asked } = spokenHarness(answers({ count: 2, ratioStated: 0.95, portrait: 0.92 }));
  await run('給我兩張9:16草原的圖片', { advanced: { n: 1 } });
  assert.equal(requests[0].config.n, 2);
  assert.equal(requests[0].config.aspectRatio, '9:16');
  assert.equal(requests[0].prompt, '給我兩張9:16草原的圖片', 'the words are the prompt as they were');
  assert.equal(asked[0].message, '給我兩張9:16草原的圖片');
  assert.deepEqual(asked[0].limits, { maxCount: 6, minReferences: undefined, maxReferences: 4 });
  assert.equal(asked[0].attached, 0);
});

test('a collage is one picture made of parts: the count is one whatever the settings say, and the prompt says so', async () => {
  const { run, requests } = spokenHarness(answers({ collage: 0.9, count: 2, ratioStated: 0.9, portrait: 0.9 }));
  await run('請給我一張9:16的拼貼圖片', { advanced: { n: 4 } });
  assert.equal(requests[0].config.n, 1);
  assert.equal(requests[0].config.aspectRatio, '9:16');
  assert.match(requests[0].prompt, /ONE single image, composed as a collage/);
});

test('a word for the shape (portrait) takes the nearest shape the model has; nothing said keeps the settings', async () => {
  const noNineSixteen = { supportedImageAspectRatios: ['1:1', '3:4', '4:3'] };
  const tall = spokenHarness(answers({ ratioStated: 0.9, portrait: 0.9 }), noNineSixteen);
  await tall.run('a vertical picture of a meadow');
  assert.equal(tall.requests[0].config.aspectRatio, '3:4');

  const plain = spokenHarness(answers());
  await plain.run('a meadow', { advanced: { n: 3 } });
  assert.equal(plain.requests[0].config.n, 3, 'the count of the settings stays when none is said');
  assert.equal(plain.requests[0].config.aspectRatio, '1:1');
});

test('more than the model can do is not sent: a count over its limit, a shape it does not take', async () => {
  const over = spokenHarness(answers({ count: 8, more: 0.95 }));
  await assert.rejects(over.run('給我八張logo'), /makes 6 pictures per request at most and you asked for 8, so nothing was sent/);
  assert.equal(over.requests.length, 0);

  const beyond = spokenHarness(answers({ more: 0.95 }));
  await assert.rejects(beyond.run('thirty pictures of cats'), /more pictures than this model makes per request \(6 at most\), so nothing was sent/);
  assert.equal(beyond.requests.length, 0);

  const shape = spokenHarness(answers({ ratioStated: 0.95, landscape: 0.9 }), { supportedImageAspectRatios: ['1:1', '9:16'] });
  await assert.rejects(shape.run('a 21:9 banner'), /does not take the shape 21:9, so nothing was sent/);
  assert.equal(shape.requests.length, 0);
});

test('without answers of the Decisions model (no key, slow, paused) the request goes with the settings', async () => {
  const none = spokenHarness(null);
  await none.run('給我兩張9:16草原的圖片', { advanced: { n: 3 } });
  assert.equal(none.requests[0].config.n, 3);
  assert.equal(none.requests[0].config.aspectRatio, '1:1');

  const failing = spokenHarness(null);
  await failing.run('two pictures', { requestImageDecisions: async () => { throw new Error('down'); } });
  assert.equal(failing.requests.length, 1, 'a failing question does not stop the picture');
  const without = spokenHarness(null);
  await without.run('two pictures', { requestImageDecisions: null });
  assert.equal(without.requests.length, 1);
});
