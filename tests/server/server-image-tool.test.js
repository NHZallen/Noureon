import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';

const USER = 'u1';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const PICTURE_B64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64');
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

// A text model that draws by itself, through a whole reply on the server: it calls generate_image, a picture comes back, and the reply says what it did.

const goodSpec = (permission = 'always', extraTools = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.16.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'draw me a cat' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, imageGeneration: { model: { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare', info: { name: 'GPT Image', maxImageCount: 4 } }, permission }, ...extraTools },
  secrets: { providerKey: 'sk-provider-secret-value', imageKey: 'sk-image-secret-value' }
});

const harness = (spec, { replies = ['Here is your cat.'] } = {}) => {
  const chat = [];
  const images = [];
  const saved = [];
  let round = 0;
  const files = { async save(args) { saved.push(args); return { __astraCloudAsset: { path: `${args.userId}/pic-${saved.length}`, mimeType: args.mimeType } }; }, async load() { throw new Error('nothing to load'); } };
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith('/api/v1/images')) {
      images.push({ headers: options.headers, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ data: [{ b64_json: PICTURE_B64, media_type: 'image/png' }] }), { status: 200 });
    }
    chat.push(JSON.parse(options.body));
    round += 1;
    return streamResponse(round === 1 ? sse(toolCall('call_1', 'generate_image', { prompt: 'a cat in the rain', reason: 'The user wants a cat.' })) : sse(content(replies[0])));
  };
  return { chat, images, saved, files, fetchImpl };
};

test('the model is offered the tool and told its rules; it draws; the picture is a part of the message after the text', async () => {
  const h = harness();
  const live = [];
  const updates = [];
  const result = await executeReply({
    spec: validateRunSpec(goodSpec()).spec,
    secrets: { providerKey: 'sk-provider-secret-value', imageKey: 'sk-image-secret-value' },
    userId: USER,
    files: h.files,
    fetchImpl: h.fetchImpl,
    onLive: (event) => live.push(event),
    onUpdate: (parts) => updates.push(parts)
  });
  assert.equal(result.status, 'done');
  assert.equal(result.parts[0].text, 'Here is your cat.');
  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[1].generatedImage.prompt, 'a cat in the rain');
  assert.equal(result.parts[1].generatedImage.cloudAsset.__astraCloudAsset.path, `${USER}/pic-1`);
  // The first request carries the tool and its rules; the second the picture's result.
  assert.equal(h.chat.length, 2);
  assert.ok(h.chat[0].tools.some((tool) => tool.function?.name === 'generate_image'));
  assert.match(JSON.stringify(h.chat[0].messages), /picture model \\"GPT Image\\"/);
  assert.match(JSON.stringify(h.chat[0].messages), /The message you are answering is round 1/);
  assert.match(JSON.stringify(h.chat[1].messages), /1 picture\(s\) drawn with GPT Image/);
  // The picture model is given its own key, and the key of the text model is not the one it sees.
  assert.equal(h.images[0].headers.Authorization, 'Bearer sk-image-secret-value');
  assert.equal(h.images[0].body.prompt, 'a cat in the rain');
  // The pages see the row while it is drawn, and the message with the picture as soon as it is kept.
  const rows = live.filter((event) => event.ev?.type === 'image').map((event) => [event.ev.event, event.ev.label]);
  assert.deepEqual(rows, [['start', 'Drawing…'], ['done', 'Drew a picture']]);
  assert.ok(updates.some((parts) => parts.some((part) => part.generatedImage)), 'the message is written with the picture');
  assert.equal(JSON.stringify([result, live, updates]).includes('sk-image-secret-value'), false);
});

test('a reply that draws and says nothing is not an empty reply', async () => {
  const h = harness();
  const result = await executeReply({ spec: validateRunSpec(goodSpec()).spec, secrets: { providerKey: 'k', imageKey: 'i' }, userId: USER, files: h.files, fetchImpl: h.fetchImpl });
  const silent = harness(undefined, { replies: [''] });
  const quiet = await executeReply({ spec: validateRunSpec(goodSpec()).spec, secrets: { providerKey: 'k', imageKey: 'i' }, userId: USER, files: silent.files, fetchImpl: silent.fetchImpl });
  assert.equal(result.status, 'done');
  assert.equal(quiet.status, 'done');
  assert.equal(quiet.parts.some((part) => part.generatedImage), true);
});

test('with permission to ask, the reply waits for the person and goes on with their answer', async () => {
  const h = harness();
  const live = [];
  const imageControl = { answer: null };
  const done = executeReply({
    spec: validateRunSpec(goodSpec('ask')).spec,
    secrets: { providerKey: 'sk-provider-secret-value', imageKey: 'sk-image-secret-value' },
    userId: USER,
    files: h.files,
    fetchImpl: h.fetchImpl,
    imageControl,
    onLive: (event) => live.push(event)
  });
  for (let i = 0; i < 200 && !live.some((event) => event.ev?.event === 'ask'); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const ask = live.find((event) => event.ev?.event === 'ask').ev;
  assert.equal(ask.type, 'image');
  assert.equal(ask.prompt, 'a cat in the rain');
  assert.equal(h.images.length, 0, 'nothing is drawn while the person has not answered');
  assert.equal(typeof imageControl.answer, 'function');
  assert.equal(imageControl.answer(ask.id, 'once').answered, true);
  const result = await done;
  assert.equal(result.status, 'done');
  assert.equal(h.images.length, 1);
  assert.equal(live.some((event) => event.ev?.event === 'answer' && event.ev.answer === 'once'), true, 'the pages are told the question is answered');
});

test('a reply with no picture tool in its request has no tool and no rules about pictures', async () => {
  const spec = goodSpec();
  delete spec.tools.imageGeneration;
  delete spec.secrets.imageKey;
  const requests = [];
  await executeReply({
    spec: validateRunSpec(spec).spec,
    secrets: { providerKey: 'k' },
    userId: USER,
    files: harness().files,
    fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('Hello.'))); }
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].tools, undefined);
  assert.equal(/generate_image/.test(JSON.stringify(requests[0])), false);
});

test('with Gemini\'s own search or with nowhere to keep pictures, the tool is not offered', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('Hello.'))); };
  await executeReply({ spec: validateRunSpec(goodSpec()).spec, secrets: { providerKey: 'k', imageKey: 'i' }, userId: USER, files: null, fetchImpl });
  await executeReply({ spec: validateRunSpec(goodSpec()).spec, secrets: { providerKey: 'k', imageKey: 'i' }, userId: '', files: harness().files, fetchImpl });
  assert.equal(requests.every((body) => !/generate_image/.test(JSON.stringify(body))), true);
});
