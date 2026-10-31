import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';

const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';

// A text model that draws pictures by itself: tools.imageGeneration and secrets.imageKey (protocol 2).

const good = (extra = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.16.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'some/model', info: { name: 'Some model', provider: 'openrouter' } },
  request: { history: [], currentMessage: { parts: [{ text: 'draw a cat' }] }, systemInstruction: '', language: 'en' },
  tools: {
    webSearch: 'off',
    advanced: false,
    imageGeneration: { model: { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare', info: { name: 'GPT Image', outputModality: 'image', maxImageReferences: 16 } }, permission: 'ask' },
    ...extra.tools
  },
  secrets: { providerKey: 'sk-provider-secret-value', imageKey: 'sk-image-secret-value', ...extra.secrets }
});

test('the protocol is version 2', () => {
  assert.equal(PROTOCOL_VERSION, 4);
  const old = validateRunSpec({ ...good(), protocol: 1 });
  assert.equal(old.ok, false);
  assert.equal(old.unsupportedProtocol, true, 'a page of version 1 is told to make the reply itself');
});

test('a reply that draws keeps the picture model, the permission and the key of the picture model', () => {
  const result = validateRunSpec(good());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.spec.tools.imageGeneration.model.id, 'openai/gpt-image-2.5-flare');
  assert.equal(result.spec.tools.imageGeneration.permission, 'ask');
  assert.equal(result.spec.secrets.imageKey, 'sk-image-secret-value');
  const always = validateRunSpec(good({ tools: { imageGeneration: { model: { provider: 'openrouter', id: 'x', info: {} }, permission: 'always' } } }));
  assert.equal(always.ok, true);
  assert.equal(always.spec.tools.imageGeneration.permission, 'always');
});

test('a reply without it has neither the tool nor the key', () => {
  const plain = good();
  delete plain.tools.imageGeneration;
  delete plain.secrets.imageKey;
  const result = validateRunSpec(plain);
  assert.equal(result.ok, true);
  assert.equal('imageGeneration' in result.spec.tools, false);
  assert.equal('imageKey' in result.spec.secrets, false);
});

test('the picture model must be OpenRouter\'s, with an id, an info object and a permission it knows', () => {
  const bad = (imageGeneration) => validateRunSpec(good({ tools: { imageGeneration } }));
  assert.equal(bad({ model: { provider: 'gemini', id: 'x', info: {} }, permission: 'ask' }).ok, false, 'a picture is made with OpenRouter');
  assert.equal(bad({ model: { provider: 'openrouter', info: {} }, permission: 'ask' }).ok, false, 'no id');
  assert.equal(bad({ model: { provider: 'openrouter', id: 'x' }, permission: 'ask' }).ok, false, 'no info');
  assert.equal(bad({ model: { provider: 'openrouter', id: 'x', info: {} }, permission: 'never' }).ok, false, 'a permission it does not know');
  assert.equal(bad({ model: { provider: 'openrouter', id: 'x', info: {} }, permission: 'ask', extra: 1 }).ok, false, 'an unknown field');
  assert.equal(bad('openrouter').ok, false);
});

test('the key of the picture model is needed with the tool and only with it', () => {
  const noKey = good();
  delete noKey.secrets.imageKey;
  assert.equal(validateRunSpec(noKey).ok, false);
  const stray = good();
  delete stray.tools.imageGeneration;
  assert.equal(validateRunSpec(stray).ok, false, 'a key for nothing');
  assert.equal(validateRunSpec(good({ secrets: { imageKey: '' } })).ok, false);
});

test('a deep research and a visual check do not draw', () => {
  const research = good({ tools: { webSearch: 'research' } });
  research.kind = 'research';
  research.research = { topic: 'cats' };
  assert.equal(validateRunSpec(research).ok, false);
});
