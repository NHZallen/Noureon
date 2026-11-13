import assert from 'node:assert/strict';
import test from 'node:test';

import { createCurrentModelJson, parseJsonAnswer } from '../src/app/runtime/shell/current-model-json.js';

const textModel = { id: 'gpt-x', name: 'GPT X', provider: 'openai' };
const silent = { warn() {} };

test('the JSON of an answer is found plain, in a code fence, with words around it, and a wrapped list is unwrapped', () => {
  assert.deepEqual(parseJsonAnswer('{"title":"A"}'), { title: 'A' });
  assert.deepEqual(parseJsonAnswer('```json\n{"title":"B"}\n```'), { title: 'B' });
  assert.deepEqual(parseJsonAnswer('Sure! {"title":"C"} Hope it helps.'), { title: 'C' });
  assert.equal(parseJsonAnswer('no json here'), null);
  assert.deepEqual(parseJsonAnswer('{"keywords":[{"keyword":"a","weight":3}]}', { type: 'ARRAY' }), [{ keyword: 'a', weight: 3 }]);
});

test('the call is made with the model of the conversation, and the schema goes in the prompt', async () => {
  const asked = [];
  const call = createCurrentModelJson({
    runMemoryModel: async (request) => { asked.push(request); return '{"title":"Hello"}'; },
    getActiveConversation: () => ({ id: 'active' }),
    modelFor: (conversation) => (conversation ? textModel : null),
    fallback: async () => { throw new Error('the fallback must not be used'); },
    logger: silent
  });
  assert.deepEqual(await call('Name it', { type: 'OBJECT' }, undefined, { conversation: { id: 'c1' } }), { title: 'Hello' });
  assert.equal(asked[0].modelId, 'gpt-x');
  assert.match(asked[0].prompt, /Name it/);
  assert.match(asked[0].prompt, /"type":"OBJECT"/);
  // With no conversation given, the one on the screen is used.
  await call('Again', { type: 'OBJECT' });
  assert.equal(asked.length, 2);
});

test('an image model, a failing call, an answer that is not JSON, or no conversation use the small model instead', async () => {
  const fallbackCalls = [];
  const fallback = async (prompt) => { fallbackCalls.push(prompt); return { title: 'fallback' }; };
  const build = (modelFor, runMemoryModel) => createCurrentModelJson({ runMemoryModel, getActiveConversation: () => null, modelFor, fallback, logger: silent });
  const never = async () => { throw new Error('not asked'); };
  assert.deepEqual(await build(() => ({ id: 'img', outputModality: 'image' }), never)('p1', {}), { title: 'fallback' });
  assert.deepEqual(await build(() => textModel, async () => { throw new Error('no key'); })('p2', {}), { title: 'fallback' });
  assert.deepEqual(await build(() => textModel, async () => 'not json')('p3', {}), { title: 'fallback' });
  assert.deepEqual(await build(() => null, never)('p4', {}), { title: 'fallback' });
  assert.deepEqual(fallbackCalls, ['p1', 'p2', 'p3', 'p4']);
});

test('a call that was cancelled is not answered by the small model', async () => {
  const controller = new AbortController();
  controller.abort();
  const call = createCurrentModelJson({
    runMemoryModel: async () => { throw new Error('aborted'); },
    getActiveConversation: () => null,
    modelFor: () => textModel,
    fallback: async () => ({ title: 'fallback' }),
    logger: silent
  });
  await assert.rejects(() => call('p', {}, controller.signal), /aborted/);
});
