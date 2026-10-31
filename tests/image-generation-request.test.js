import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS, modelCanCallModels, modelGeneratesImages } from '../src/app/runtime/shell/model-registry.js';
import { imageGenerationForReply } from '../src/app/runtime/tool-models/image-generation-request.js';
import { createServerReply } from '../src/app/runtime/server-reply/server-reply.js';

// What a reply sent to the server carries when a text model may draw pictures by itself.

const TEXT_MODEL = MODELS.find(modelCanCallModels);
const IMAGE_MODEL = MODELS.find((model) => model.provider === 'openrouter' && modelGeneratesImages(model));
const keys = { openrouter: 'sk-or-key', gemini: 'g-key', tavily: 'tvly-key' };
const getApiKeyForProvider = (provider) => keys[provider] || '';
const config = (extra = {}) => ({ toolModels: { image: { provider: IMAGE_MODEL.provider, id: IMAGE_MODEL.id } }, permissions: { imageGeneration: 'ask' }, ...extra });

test('a text model that calls models, a chosen picture model and its key give the tool, the permission and the key', () => {
  const result = imageGenerationForReply({ config: config(), modelInfo: TEXT_MODEL, getApiKeyForProvider });
  assert.equal(result.imageKey, 'sk-or-key');
  assert.equal(result.imageGeneration.permission, 'ask');
  assert.equal(result.imageGeneration.model.provider, 'openrouter');
  assert.equal(result.imageGeneration.model.id, IMAGE_MODEL.apiId || IMAGE_MODEL.id);
  assert.equal(result.imageGeneration.model.info.id, IMAGE_MODEL.id);
  assert.equal(imageGenerationForReply({ config: config({ permissions: { imageGeneration: 'always' } }), modelInfo: TEXT_MODEL, getApiKeyForProvider }).imageGeneration.permission, 'always');
});

test('nothing without a model that calls models, a chosen picture model that exists, or its key', () => {
  const none = (extra) => imageGenerationForReply({ config: config(), modelInfo: TEXT_MODEL, getApiKeyForProvider, ...extra });
  assert.equal(none({ modelInfo: { id: 'a-model-that-takes-no-tools', provider: 'gemini' } }), null);
  assert.equal(none({ modelInfo: IMAGE_MODEL }), null, 'a picture model does not call models');
  assert.equal(none({ modelInfo: null }), null);
  assert.equal(none({ config: { toolModels: { image: null } } }), null, 'none chosen');
  assert.equal(none({ config: {} }), null);
  assert.equal(none({ config: config({ toolModels: { image: { provider: 'openrouter', id: 'not-a-model' } } }) }), null, 'a model that is not in the registry');
  assert.equal(none({ config: config({ toolModels: { image: { provider: TEXT_MODEL.provider, id: TEXT_MODEL.id } } }) }), null, 'a text model is not a picture model');
  assert.equal(none({ getApiKeyForProvider: () => '' }), null, 'no key');
});

const CONVERSATION = { id: '323e4567-e89b-12d3-a456-426614174002', messages: [{ role: 'user', parts: [{ text: 'hello' }], createdAt: 'x' }] };
const MESSAGE_ID = '223e4567-e89b-12d3-a456-426614174001';

const start = async (args) => {
  const calls = [];
  const reply = createServerReply({
    getAccessToken: async () => 'token',
    getApiKeyForProvider,
    getModelApiId: (model) => model.apiId || model.id,
    getDefaultGenConfig: () => ({}),
    describeRequest: async () => ({ systemInstructionText: '' }),
    flushSync: async () => {},
    readMessage: async () => null,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 }); },
    clientVersion: '18.16.0',
    wait: async () => {}
  });
  const result = await reply.start({ conversation: CONVERSATION, modelInfo: TEXT_MODEL, requestParts: [{ text: 'draw' }], webSearch: 'off', assistantMessageId: MESSAGE_ID, sequence: 1, uiLanguage: 'en', config: config(), ...args });
  return { result, spec: calls[0] ? JSON.parse(calls[0].options.body) : null, reply };
};

test('the request to the server carries the tool and the picture model\'s key, and the run can send the answer to its question', async () => {
  const { result, spec } = await start({});
  assert.equal(result.ok, true);
  assert.equal(spec.protocol, 4);
  assert.equal(spec.tools.imageGeneration.permission, 'ask');
  assert.equal(spec.tools.imageGeneration.model.provider, 'openrouter');
  assert.equal(spec.secrets.imageKey, 'sk-or-key');
  assert.equal(typeof result.run.answerImage, 'function');
});

test('a deep research, a visual check and Gemini\'s own search carry no picture tool; nor does a request with nothing chosen', async () => {
  for (const args of [{ research: { topic: 'cats' }, webSearch: 'research' }, { webSearch: 'grounding' }, { config: {} }]) {
    const { spec } = await start(args);
    assert.equal(spec.tools.imageGeneration, undefined, JSON.stringify(Object.keys(args)));
    assert.equal(spec.secrets.imageKey, undefined);
  }
});
