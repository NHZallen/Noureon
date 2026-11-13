import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanTitle, createRunNaming, NAMING } from '../../server/conversation-naming.js';
import { CURATOR_DEFAULTS } from '../../src/data/memory-curator.js';
import { MODELS } from '../../src/app/runtime/shell/model-registry.js';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const KEY = 'sk-naming-key-that-must-not-leak';
const model = MODELS.find((entry) => entry.id === CURATOR_DEFAULTS.openrouter);
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const answer = (text) => new Response(sse({ choices: [{ delta: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

function setup({ state = { title: 'New chat', renamed: false, deleted: false }, reply = '{"title":"Cats and where they sleep"}', written = true, fetchImpl = null, runModel = model } = {}) {
  const calls = [];
  const requests = [];
  const logs = [];
  const timers = [];
  const db = { rpc: async (name, args) => { calls.push([name, args]); return name === 'server_conversation_title_state' ? state : written; } };
  const naming = createRunNaming({
    db,
    userId: USER,
    spec: { conversationId: CONVERSATION, model: { provider: runModel.provider, id: runModel.id, info: runModel }, request: { language: 'en' } },
    secrets: { providerKey: KEY },
    fetchImpl: fetchImpl || (async (url, options) => { requests.push({ url, headers: options.headers, body: JSON.parse(options.body) }); return answer(reply); }),
    setTimer: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
    log: (event, data) => logs.push([event, data])
  });
  return { naming, calls, requests, logs, timers };
}
const ask = { prompt: 'Name this chat\n{"title": "Your title"}', placeholder: 'New chat' };

test('the conversation is named after the wait, with the model and the key of the reply, where the title is still the placeholder', async () => {
  const { naming, calls, requests, timers } = setup();
  assert.equal(naming.request(ask), true);
  assert.equal(timers[0].ms, NAMING.delayMs);
  assert.equal(calls.length, 0, 'nothing is done before the wait is up');
  timers[0].fn();
  await naming.flush();
  assert.deepEqual(calls.map(([name]) => name), ['server_conversation_title_state', 'server_set_conversation_title']);
  assert.deepEqual(calls[1][1], { p_user_id: USER, p_conversation_id: CONVERSATION, p_placeholder: 'New chat', p_title: 'Cats and where they sleep' });
  assert.equal(requests.length, 1);
  assert.match(requests[0].headers.Authorization, new RegExp(KEY));
  assert.match(JSON.stringify(requests[0].body.messages), /Name this chat/);
  assert.equal(JSON.stringify(calls).includes(KEY), false, 'the key goes nowhere but to the provider');
});

test('a title the page or the person already gave is left alone, and the model is not even asked', async () => {
  for (const state of [{ title: 'Real title', renamed: false, deleted: false }, { title: 'New chat', renamed: true, deleted: false }, { title: 'New chat', renamed: false, deleted: true }, null]) {
    const { naming, calls, requests } = setup({ state });
    naming.request(ask);
    assert.equal(await naming.flush(), 'skipped');
    assert.deepEqual(calls.map(([name]) => name), ['server_conversation_title_state']);
    assert.equal(requests.length, 0);
  }
});

test('a reply that ends before the wait is up names the conversation at once, once, and a reply with no request does nothing', async () => {
  const { naming, calls, timers } = setup();
  assert.equal(await naming.flush(), 'none');
  naming.request(ask);
  assert.equal(await naming.flush(), 'named');
  assert.equal(timers[0].cleared, true, 'the wait is dropped');
  assert.equal(await naming.flush(), 'named', 'asked again, it gives what it did');
  timers[0].fn();
  assert.equal(calls.filter(([name]) => name === 'server_set_conversation_title').length, 1, 'it is done once');
});

test('only a request in the right shape, once, for a model that writes text is taken', () => {
  const { naming } = setup();
  assert.equal(naming.request({ prompt: '', placeholder: 'New chat' }), false);
  assert.equal(naming.request({ prompt: 'x'.repeat(NAMING.maxPromptChars + 1), placeholder: 'New chat' }), false);
  assert.equal(naming.request({ prompt: 'p', placeholder: '' }), false);
  assert.equal(naming.request({ prompt: 'p', placeholder: 5 }), false);
  assert.equal(naming.request({ prompt: 'p', placeholder: 'New chat' }), true);
  assert.equal(naming.request({ prompt: 'p', placeholder: 'New chat' }), false, 'a second request is not taken');
  const image = MODELS.find((entry) => entry.outputModality === 'image' || entry.category === 'image_generation');
  assert.equal(setup({ runModel: image }).naming.request(ask), false, 'a model that draws does not write titles');
});

test('a model that fails, or answers with no title, changes nothing and the log holds no key', async () => {
  const failing = setup({ fetchImpl: async () => { throw new Error(`upstream said ${KEY.slice(0, 4)} no`); } });
  failing.naming.request(ask);
  assert.equal(await failing.naming.flush(), 'failed');
  assert.equal(failing.calls.filter(([name]) => name === 'server_set_conversation_title').length, 0);
  assert.equal(JSON.stringify(failing.logs).includes(KEY), false);
  const empty = setup({ reply: 'sorry, no' });
  empty.naming.request(ask);
  assert.equal(await empty.naming.flush(), 'no_title');
  const lost = setup({ written: false });
  lost.naming.request(ask);
  assert.equal(await lost.naming.flush(), 'skipped', 'the title changed while the model thought: nothing is written over it');
});

test('a title is one line without the quotes a model puts around it, and not longer than the limit', () => {
  assert.equal(cleanTitle('  "Cats and\n beds"  '), 'Cats and beds');
  assert.equal(cleanTitle('「貓睡在哪裡」'), '貓睡在哪裡');
  assert.equal(cleanTitle(''), '');
  assert.equal(cleanTitle(null), '');
  assert.equal(cleanTitle('x'.repeat(300)).length, NAMING.maxTitleChars);
});
