import assert from 'node:assert/strict';
import test from 'node:test';

import { GENERATE_IMAGE_TOOL, MAX_IMAGE_CALLS, createImageToolLoader, readReference } from '../../server/image-tool.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const KEY = 'sk-or-image-secret-value';
const PICTURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const PICTURE_B64 = PICTURE.toString('base64');

// The tool a text model has to draw pictures by itself: what it is told, what it asks the person, what it sends the picture model, what it gives back.

const marker = (path, mimeType = 'image/png') => ({ __astraCloudAsset: { path, mimeType } });
const drawn = (id, extra = {}) => ({ generatedImage: { id, mediaType: 'image/png', aspectRatio: '16:9', cloudAsset: marker(`${USER}/${id}`), ...extra } });
const attached = (name, data = 'QUJD') => ({ inlineData: { mimeType: 'image/jpeg', data, name } });

const baseSpec = (overrides = {}) => ({
  request: {
    history: [
      { role: 'user', parts: [{ text: 'a blue living room' }] },
      { role: 'model', parts: [drawn('g1'), drawn('g2')] },
      { role: 'user', parts: [{ text: 'my kettle' }, attached('kettle.jpg')] },
      { role: 'model', parts: [{ text: 'nice' }] }
    ],
    currentMessage: { parts: [{ text: 'put the kettle on the table' }, attached('sofa.jpg')] },
    language: 'en'
  },
  tools: { imageGeneration: { model: { provider: 'openrouter', id: 'openai/gpt-image-2.5-flare', info: { name: 'GPT Image', maxImageCount: 4, maxImageReferences: 16, supportedImageAspectRatios: ['1:1', '16:9', '9:16'] } }, permission: 'always' } },
  ...overrides
});

function fakes({ spec = baseSpec(), loadable = {}, status = 200, error = null, hang = false, ...options } = {}) {
  const requests = [];
  const events = [];
  const parts = [];
  const saved = [];
  const loads = [];
  const files = {
    async save(args) { saved.push(args); return marker(`${args.userId}/new-${saved.length}`, args.mimeType); },
    async load({ marker: m }) {
      loads.push(m.__astraCloudAsset.path);
      if (!(m.__astraCloudAsset.path in loadable)) throw new Error('gone');
      return loadable[m.__astraCloudAsset.path];
    }
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    if (hang) return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (error) return new Response(JSON.stringify({ error: { message: error } }), { status });
    return new Response(JSON.stringify({ data: [{ b64_json: PICTURE_B64, media_type: 'image/png' }] }), { status });
  };
  const loader = createImageToolLoader({
    spec,
    secrets: { providerKey: 'sk-provider', imageKey: KEY },
    userId: USER,
    files,
    fetchImpl,
    language: 'en',
    emit: (event) => events.push(event),
    onPictures: (made) => parts.push(...made),
    wait: async () => {},
    ...options
  });
  return { loader, requests, events, parts, saved, loads };
}
const call = (args) => ({ id: 'c1', name: 'generate_image', args });

test('the tool is offered with its instructions, the pictures of the conversation and the round of the message', () => {
  const { loader } = fakes();
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['generate_image']);
  assert.equal(loader.handles('generate_image'), true);
  assert.equal(loader.handles('load_skill'), false);
  assert.match(loader.instruction, /picture model "GPT Image"/);
  assert.match(loader.instruction, /round 3\. /, 'the message being answered is the third round');
  assert.match(loader.instruction, /Round 1: you drew picture 1 \(asked for: "a blue living room"\), picture 2/);
  assert.match(loader.instruction, /Round 2: the user sent picture 1 "kettle\.jpg"/);
  assert.match(loader.instruction, /Round 3 \(this message\): the user sent picture 1 "sofa\.jpg"/);
  assert.deepEqual(GENERATE_IMAGE_TOOL.parameters.required, ['prompt']);
});

test('a new picture: the prompt goes to the picture model with the picture key and the shape, and the part comes back with its prompt', async () => {
  const { loader, requests, parts, events, saved } = fakes();
  const text = await loader.run(call({ prompt: 'a cat in the rain', aspect_ratio: '9:16' }));
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /openrouter\.ai\/api\/v1\/images$/);
  assert.equal(requests[0].headers.Authorization, `Bearer ${KEY}`, 'the key of the picture model, not the reply\'s');
  assert.equal(requests[0].body.model, 'openai/gpt-image-2.5-flare');
  assert.equal(requests[0].body.prompt, 'a cat in the rain');
  assert.equal(requests[0].body.aspect_ratio, '9:16');
  assert.equal(requests[0].body.input_references, undefined, 'no reference, no starting picture');
  assert.equal(saved.length, 1);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].generatedImage.prompt, 'a cat in the rain');
  assert.equal(parts[0].generatedImage.cloudAsset.__astraCloudAsset.path, `${USER}/new-1`);
  assert.match(text, /1 picture\(s\) drawn with GPT Image/);
  assert.deepEqual(events.map((event) => [event.type, event.event]), [['image', 'done']]);
  assert.equal(events[0].count, 1);
  assert.equal(JSON.stringify([text, events]).includes(KEY), false, 'the key is never said');
});

test('references are read from the cloud space or the message, in the order given, and go as data addresses', async () => {
  const { loader, requests, loads } = fakes({ loadable: { [`${USER}/g2`]: PICTURE } });
  await loader.run(call({
    prompt: 'the kettle from the first on the table of the second',
    references: [{ round: 2, source: 'user', number: 1 }, { round: 1, source: 'generated', number: 2 }, { round: 3, source: 'user', number: 1 }]
  }));
  const refs = requests[0].body.input_references.map((entry) => entry.image_url.url);
  assert.deepEqual(refs, ['data:image/jpeg;base64,QUJD', `data:image/png;base64,${PICTURE_B64}`, 'data:image/jpeg;base64,QUJD']);
  assert.deepEqual(loads, [`${USER}/g2`], 'only what is kept in the cloud is fetched');
  assert.equal(requests[0].body.aspect_ratio, '16:9', 'with no shape asked, the shape of the first reference that has one');
});

test('the person is asked first unless they allowed it for good; once, always or no', async () => {
  const spec = baseSpec();
  spec.tools.imageGeneration.permission = 'ask';
  const f = fakes({ spec });
  const pending = f.loader.run(call({ prompt: 'a cat', count: 3 }));
  await new Promise((resolve) => setImmediate(resolve));
  const ask = f.events.find((event) => event.event === 'ask');
  assert.equal(ask.kind, 'draw');
  assert.equal(ask.prompt, 'a cat');
  assert.equal(ask.count, 3);
  assert.deepEqual(ask.model, { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image' });
  assert.equal(f.requests.length, 0, 'nothing is drawn before the answer');
  assert.equal(f.loader.answer(ask.id, 'maybe').answered, false, 'an answer the question does not take');
  assert.equal(f.loader.answer(ask.id, 'once').answered, true);
  await pending;
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.n, 3);
  // Once is once: the next picture asks again.
  const again = f.loader.run(call({ prompt: 'a dog' }));
  await new Promise((resolve) => setImmediate(resolve));
  const second = f.events.filter((event) => event.event === 'ask');
  assert.equal(second.length, 2);
  f.loader.answer(second[1].id, 'always');
  await again;
  // Always: no question after.
  await f.loader.run(call({ prompt: 'a bird' }));
  assert.equal(f.events.filter((event) => event.event === 'ask').length, 2);
  assert.equal(f.requests.length, 3);
});

test('a refusal is told to the model and nothing is drawn', async () => {
  const spec = baseSpec();
  spec.tools.imageGeneration.permission = 'ask';
  const f = fakes({ spec });
  const pending = f.loader.run(call({ prompt: 'a cat' }));
  await new Promise((resolve) => setImmediate(resolve));
  f.loader.answer(f.events.find((event) => event.event === 'ask').id, 'deny');
  const text = await pending;
  assert.match(text, /refused/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.parts.length, 0);
});

test('a question nobody answers ends as a refusal, and a stop while it waits ends the reply\'s work', async () => {
  const spec = baseSpec();
  spec.tools.imageGeneration.permission = 'ask';
  const quiet = fakes({ spec, waitMs: 5 });
  assert.match(await quiet.loader.run(call({ prompt: 'a cat' })), /did not answer in time/);
  const controller = new AbortController();
  const stopping = fakes({ spec, signal: controller.signal });
  const pending = stopping.loader.run(call({ prompt: 'a cat' }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.match(await pending, /stopped/);
  assert.equal(stopping.requests.length, 0);
});

test('a picture that does not exist, or is no longer kept, says so and draws nothing', async () => {
  const f = fakes();
  const missing = await f.loader.run(call({ prompt: 'x', references: [{ round: 9, source: 'generated', number: 1 }, { round: 1, source: 'user', number: 1 }] }));
  assert.match(missing, /do not exist: round 9, drawn by you, picture 1; round 1, sent by the user, picture 1/);
  assert.match(missing, /Round 1: you drew picture 1/, 'the model is shown the pictures that do exist');
  const spec = baseSpec();
  spec.request.history[1].parts = [{ generatedImage: { id: 'never-kept', mediaType: 'image/png' } }];
  const lost = fakes({ spec });
  assert.match(await lost.loader.run(call({ prompt: 'x', references: [{ round: 1, source: 'generated', number: 1 }] })), /never kept in the user's cloud space/);
  const unreadable = fakes({ loadable: {} });
  assert.match(await unreadable.loader.run(call({ prompt: 'x', references: [{ round: 1, source: 'generated', number: 1 }] })), /could not be read now/);
  assert.equal(f.requests.length + lost.requests.length + unreadable.requests.length, 0);
});

test('a file that is not the person\'s own is never read', async () => {
  const spec = baseSpec();
  spec.request.history[1].parts = [drawn('x', { cloudAsset: marker('someone-else/x') })];
  const f = fakes({ spec, loadable: { 'someone-else/x': PICTURE } });
  assert.match(await f.loader.run(call({ prompt: 'x', references: [{ round: 1, source: 'generated', number: 1 }] })), /cannot be read/);
  assert.deepEqual(f.loads, []);
});

test('the limits of the picture model: references it needs and takes, and how many pictures at once', async () => {
  const edit = baseSpec();
  Object.assign(edit.tools.imageGeneration.model.info, { minImageReferences: 1, maxImageReferences: 2, maxImageCount: 2 });
  const f = fakes({ spec: edit, loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  assert.match(await f.loader.run(call({ prompt: 'x' })), /needs at least 1 reference/);
  assert.match(await f.loader.run(call({ prompt: 'x', references: [{ round: 1, source: 'generated', number: 1 }, { round: 1, source: 'generated', number: 2 }, { round: 2, source: 'user', number: 1 }] })), /takes 2 reference pictures at most/);
  await f.loader.run(call({ prompt: 'x', count: 9, references: [{ round: 1, source: 'generated', number: 1 }] }));
  assert.equal(f.requests[0].body.n, 2, 'no more pictures than the model makes at once');
  assert.equal(f.requests.length, 1);
});

test('a shape the model does not make becomes the nearest one it does', async () => {
  const f = fakes();
  await f.loader.run(call({ prompt: 'x', aspect_ratio: '3:2' }));
  assert.equal(f.requests[0].body.aspect_ratio, '16:9');
  await f.loader.run(call({ prompt: 'x', aspect_ratio: 'wide' }));
  assert.equal(f.requests[1].body.aspect_ratio, '1:1', 'a word that is not a shape is ignored');
});

test('a failure of the picture model is told to the model briefly, without the key, and the page is told', async () => {
  const f = fakes({ status: 500, error: `quota exceeded for key ${KEY}` });
  const text = await f.loader.run(call({ prompt: 'x' }));
  assert.match(text, /could not draw it/);
  assert.equal(text.includes(KEY), false);
  assert.deepEqual(f.events.map((event) => event.event), ['failed']);
  assert.equal(f.parts.length, 0);
});

test('a stop while the picture is made ends it', async () => {
  const controller = new AbortController();
  const f = fakes({ hang: true, signal: controller.signal });
  const pending = f.loader.run(call({ prompt: 'x' }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.match(await pending, /stopped/);
  assert.equal(f.parts.length, 0);
});

test('no more than a few requests in a reply; then the tool is no longer offered', async () => {
  const f = fakes();
  for (let i = 0; i < MAX_IMAGE_CALLS; i += 1) await f.loader.run(call({ prompt: `p${i}` }));
  assert.equal(f.loader.tools.length, 0);
  assert.match(await f.loader.run(call({ prompt: 'one more' })), /limit of 4 picture requests/);
  assert.equal(f.requests.length, MAX_IMAGE_CALLS);
});

test('the step the page draws names the references; a call with nothing to draw says what is missing', async () => {
  const f = fakes();
  const step = f.loader.stepEvent(call({ prompt: 'x', references: [{ round: '2', source: 'User', number: 1 }, 'junk', { round: 1 }] }));
  assert.equal(step.type, 'image');
  assert.equal(step.event, 'start');
  assert.deepEqual(step.references, [{ round: 2, source: 'user', number: 1 }]);
  assert.match(await f.loader.run(call({})), /no "prompt"/);
  assert.match(await f.loader.run(call({ prompt: 'x', references: Array.from({ length: 17 }, () => ({ round: 1, source: 'user', number: 1 })) })), /At most 16/);
  assert.deepEqual(readReference({ round: '3', source: ' Generated ', number: 2 }), { round: 3, source: 'generated', number: 2 });
  assert.equal(readReference('x'), null);
});
