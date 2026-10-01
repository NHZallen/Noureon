import assert from 'node:assert/strict';
import test from 'node:test';

import { RETRY_NOTE, askVision } from '../src/app/ui/files/vision/vision-ask.js';
import { INVALID_VISION_RESPONSE, parseVisionResponse } from '../src/app/ui/files/vision/vision-prompt.js';
import { VISION_TEXTS, visionText } from '../src/app/ui/files/vision/vision-texts.js';

const GOOD = '{"issues":[{"slide":2,"category":"text","problem":"p","fix":"f"}],"edits":[],"summary":"s"}';

const scripted = (answers) => {
  const calls = [];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    calls.push({ parts, options });
    onChunk(answers[calls.length - 1] ?? '');
    return '';
  };
  return { calls, streamApiCall };
};

const ask = (model, extra = {}) => askVision({
  streamApiCall: model.streamApiCall,
  prompt: 'Look at the slides.',
  images: [{ inlineData: { mimeType: 'image/jpeg', data: 'x' } }],
  model: { id: 'm' },
  conversation: { id: 'c', reasoningEffort: 'low' },
  signal: new AbortController().signal,
  requireEdits: false,
  ...extra
});

test('an unreadable reply is an error with a code, so it can be told apart from a failure of the request', () => {
  for (const reply of ['', 'I cannot see the images.', '{"issues":', '{"edits":[]}']) {
    assert.throws(() => parseVisionResponse(reply), (error) => error.code === INVALID_VISION_RESPONSE, JSON.stringify(reply));
  }
});

test('a readable reply is used as it is, and the request leaves the thinking and the length alone', async () => {
  const model = scripted([GOOD]);
  const result = await ask(model);
  assert.equal(result.issues.length, 1);
  assert.equal(model.calls.length, 1);
  const { options, parts } = model.calls[0];
  assert.equal(options.disableReasoning, false, 'the person\'s thinking level stays as chosen');
  assert.equal(options.genConfig.maxTokens, null, 'no limit that the thinking could use up');
  assert.equal(parts[0].text, 'Look at the slides.');
  assert.equal(parts.length, 2);
});

test('a reply that cannot be read is asked for once more, with a reminder, and its time is renewed', async () => {
  const model = scripted(['Sorry, here is some prose.', GOOD]);
  const armed = [];
  const result = await ask(model, { arm: (ms) => armed.push(ms) });
  assert.equal(result.issues.length, 1);
  assert.equal(model.calls.length, 2);
  assert.equal(model.calls[1].parts[0].text, `Look at the slides.${RETRY_NOTE}`);
  assert.equal(model.calls[1].parts.length, 2, 'the pictures go again');
  assert.equal(model.calls[1].options.disableReasoning, false);
  assert.deepEqual(armed, [120_000]);
});

test('after two unreadable replies it gives up with the same error, and it does not ask again for a stop or a failed request', async () => {
  const twice = scripted(['', 'no json']);
  await assert.rejects(ask(twice), (error) => error.code === INVALID_VISION_RESPONSE);
  assert.equal(twice.calls.length, 2);

  const failing = { calls: [], streamApiCall: async () => { throw new Error('provider down'); } };
  await assert.rejects(ask(failing), /provider down/);

  const controller = new AbortController();
  const stopped = { calls: [], streamApiCall: async (parts, onChunk) => { stopped.calls.push(1); onChunk(''); controller.abort(); } };
  await assert.rejects(ask(stopped, { signal: controller.signal }), (error) => error.name === 'AbortError');
  assert.equal(stopped.calls.length, 1);
});

test('the two reasons that were English words are told in all five languages', () => {
  for (const language of Object.keys(VISION_TEXTS)) {
    assert.ok(visionText(language, 'timedOut').length > 5, language);
    assert.ok(visionText(language, 'invalidResponse').length > 5, language);
    assert.match(visionText(language, 'failed', { reason: visionText(language, 'invalidResponse') }), new RegExp(visionText(language, 'invalidResponse').slice(0, 8)));
  }
  assert.equal(Object.keys(VISION_TEXTS).length, 5);
});
