import assert from 'node:assert/strict';
import test from 'node:test';

import { GENERATE_IMAGE_TOOL, MAX_IMAGE_CALLS, MAX_VIEW_CALLS, MAX_VIEW_PICTURES, createImageToolLoader, readReference } from '../../server/image-tool.js';

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
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['generate_image', 'view_images', 'choose_image', 'list_images']);
  assert.equal(loader.handles('generate_image'), true);
  assert.equal(loader.handles('load_skill'), false);
  assert.match(loader.instruction, /picture model "GPT Image"/);
  assert.match(loader.instruction, /round 3\. /, 'the message being answered is the third round');
  assert.match(loader.instruction, /Round 1: you drew picture 1 \(asked for: "a blue living room"\), picture 2/);
  assert.match(loader.instruction, /Round 2: the user sent picture 1 "kettle\.jpg"/);
  assert.match(loader.instruction, /Round 3 \(this message\): the user sent picture 1 "sofa\.jpg"/);
  assert.deepEqual(GENERATE_IMAGE_TOOL.parameters.required, ['prompt', 'summary']);
});

test('a new picture: the prompt goes to the picture model with the picture key and the shape, and the part comes back with its prompt', async () => {
  const { loader, requests, parts, events, saved } = fakes();
  const result = await loader.run(call({ prompt: 'a cat in the rain', aspect_ratio: '9:16' }));
  const text = result.content;
  assert.equal(result.images.length, 1, 'the model is shown a small copy of the picture');
  assert.match(result.images[0].mimeType, /^image\/(jpeg|png)$/);
  assert.match(result.images[0].label, /Picture 1 of your message/);
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
  assert.deepEqual(events.map((event) => [event.type, event.event]), [['image', 'drawing'], ['image', 'done']]);
  assert.equal(events.at(-1).count, 1);
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
  assert.deepEqual(f.events.map((event) => event.event), ['drawing', 'failed']);
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
  assert.equal(f.loader.tools.some((tool) => tool.name === 'generate_image'), false);
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

const look = (args, name = 'view_images') => ({ id: 'v1', name, args });

test('view_images shows the named pictures, each after a line with its round, source and number', async () => {
  const { loader, events } = fakes({ loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  const result = await loader.run(look({ reason: 'looking for the blue one', references: [{ round: 1, source: 'generated', number: 2 }, { round: 3, source: 'user', number: 1 }] }));
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].label, 'Round 1, drawn by you, picture 2 (asked for: "a blue living room"):');
  assert.equal(result.images[1].label, 'Round 3, sent by the user, picture 1 "sofa.jpg":');
  assert.match(result.content, /2 picture\(s\) follow/);
  assert.deepEqual(events.map((event) => [event.type, event.event, event.kind]), [['image', 'done', 'view']]);
  assert.equal(events[0].label, 'Looked at picture 1 and 2');
  assert.equal(events[0].reason, 'looking for the blue one');
  assert.deepEqual(events[0].pictures, [{ round: 1, source: 'generated', number: 2 }, { round: 3, source: 'user', number: 1 }]);
  assert.equal(loader.stepEvent(look({ reason: 'x' })).kind, 'view');
});

test('view_images with a filter finds a number in every round, and says when nothing fits or a picture does not exist', async () => {
  const { loader } = fakes({ loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  const ones = await loader.run(look({ reason: 'all the first pictures', filter: { number: 1 } }));
  assert.deepEqual(ones.images.map((image) => image.label.split(', picture')[0] + ' #' + /picture (\d+)/.exec(image.label)[1]), ['Round 1, drawn by you #1', 'Round 2, sent by the user #1', 'Round 3, sent by the user #1']);
  const none = await loader.run(look({ reason: 'x', filter: { number: 9 } }));
  assert.match(none, /No picture matches/);
  assert.match(await loader.run(look({ reason: 'x', references: [{ round: 9, source: 'user', number: 1 }] })), /do not exist/);
  assert.match(await loader.run(look({ reason: 'x' })), /Name the pictures/);
});

test('more than twelve pictures: the newest twelve are shown and the model is told; a picture that cannot be read is said, not an error', async () => {
  const many = Array.from({ length: 14 }, (_, index) => drawn(`m${index}`));
  const spec = baseSpec({ request: { history: [{ role: 'user', parts: [{ text: 'many' }] }, { role: 'model', parts: many }], currentMessage: { parts: [{ text: 'which?' }] }, language: 'en' } });
  const loadable = Object.fromEntries(many.slice(0, 13).map((part) => [`${USER}/${part.generatedImage.id}`, PICTURE]));
  const { loader } = fakes({ spec, loadable });
  const result = await loader.run(look({ reason: 'all', filter: { source: 'generated' } }));
  assert.equal(MAX_VIEW_PICTURES, 12);
  assert.equal(result.images.length, 11, 'twelve newest, one of them (the fourteenth) cannot be read');
  assert.match(result.content, /14 pictures match; you are shown the newest 12/);
  assert.match(result.content, /Not available to show \(round 1, drawn by you, picture 14\)/);
});

test('five looks per reply: the sixth is refused with what to tell the user, and the tool is no longer offered', async () => {
  const { loader } = fakes({ loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  for (let index = 0; index < MAX_VIEW_CALLS; index += 1) await loader.run(look({ reason: 'again', filter: { number: 1 } }));
  assert.equal(loader.tools.some((tool) => tool.name === 'view_images'), false);
  assert.match(await loader.run(look({ reason: 'again', filter: { number: 1 } })), /ask them to describe it/);
});

test('list_images gives the whole list as text, or the part a filter names', async () => {
  const { loader } = fakes();
  const all = await loader.run(look({}, 'list_images'));
  assert.match(all, /Round 1: you drew picture 1 \(asked for: "a blue living room"\), picture 2/);
  assert.match(all, /Round 3 \(this message\): the user sent picture 1 "sofa\.jpg"/);
  const mine = await loader.run(look({ filter: { source: 'user', from_round: 3 } }, 'list_images'));
  assert.doesNotMatch(mine, /Round 1/);
  assert.match(mine, /sofa\.jpg/);
  assert.equal(loader.stepEvent(look({}, 'list_images')), null);
});

test('without any picture in the conversation only the drawing tool is offered', () => {
  const { loader } = fakes({ spec: baseSpec({ request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, language: 'en' } }) });
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['generate_image']);
});

const until = async (check) => {
  for (let index = 0; index < 400; index += 1) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('it never happened');
};
const choose = (args) => ({ id: 'p1', name: 'choose_image', args });
const CANDIDATES = [{ round: 1, source: 'generated', number: 1 }, { round: 1, source: 'generated', number: 2 }, { round: 2, source: 'user', number: 1 }];
const askedEvent = (events) => events.find((event) => event.event === 'ask');

test('choose_image shows the candidates with small pictures, waits for a tap and gives the model the picture the person chose', async () => {
  const { loader, events } = fakes({ waitMs: 3000, loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  const running = loader.run(choose({ title: 'Which one is the blue living room?', candidates: CANDIDATES, step: 1, of: 2 }));
  const ask = await until(() => askedEvent(events));
  assert.equal(ask.kind, 'pick');
  assert.equal(ask.title, 'Which one is the blue living room?');
  assert.deepEqual([ask.step, ask.of], [1, 2]);
  assert.deepEqual(ask.candidates.map((card) => [card.round, card.source, card.number, Boolean(card.thumb?.data)]), [[1, 'generated', 1, true], [1, 'generated', 2, true], [2, 'user', 1, true]], 'each has its small picture');
  assert.match(ask.candidates[0].caption, /^Round 1, drawn by you, picture 1/);
  assert.deepEqual(loader.answer(ask.id, 'pick:9'), { answered: false }, 'a number outside the candidates is not an answer');
  assert.deepEqual(loader.answer(ask.id, 'once'), { answered: false });
  assert.deepEqual(loader.answer(ask.id, 'pick:1'), { answered: true });
  assert.equal(await running, 'The user chose round 1, drawn by you, picture 2. Use it.');
  assert.deepEqual(events.map((event) => event.event), ['ask', 'answer']);
  assert.equal(events[1].answer, 'pick:1');
});

test('"none of these" the first time sends the model to look again without them, the second time to ask the person', async () => {
  const { loader, events } = fakes();
  const asked = async (list) => {
    const before = events.filter((event) => event.event === 'ask').length;
    const running = loader.run(choose({ title: 'Which?', candidates: list }));
    const ask = await until(() => events.filter((event) => event.event === 'ask')[before]);
    loader.answer(ask.id, 'retry');
    return running;
  };
  const first = await asked(CANDIDATES.slice(0, 2));
  assert.match(first, /Look again for other pictures/);
  assert.match(await loader.run(choose({ title: 'Which?', candidates: CANDIDATES.slice(0, 2) })), /already said that none of these/);
  const third = loader.run(choose({ title: 'Which?', candidates: CANDIDATES.slice(2) }));
  const thirdAsk = await until(() => events.filter((event) => event.event === 'ask')[1]);
  loader.answer(thirdAsk.id, 'retry');
  assert.match(await third, /second time[\s\S]*describe/);
});

test('choose_image checks its call: a title, pictures that exist, and not too many questions', async () => {
  const { loader } = fakes();
  assert.match(await loader.run(choose({ candidates: CANDIDATES })), /no "title"/);
  assert.match(await loader.run(choose({ title: 'x', candidates: [{ round: 9, source: 'user', number: 1 }] })), /do not exist/);
  assert.equal(loader.tools.some((tool) => tool.name === 'choose_image'), true);
});

test('a question nobody answered, or a stopped reply, ends without a picture', async () => {
  const { loader } = fakes({ waitMs: 20 });
  assert.match(await loader.run(choose({ title: 'Which?', candidates: CANDIDATES })), /did not answer in time/);
});

test('"not this one" on a pick the person made: the picture is not offered again, and the model hears it with its next answer', async () => {
  const { loader, events } = fakes();
  const running = loader.run(choose({ title: 'Which one is the blue living room?', candidates: CANDIDATES }));
  const id = (await until(() => askedEvent(events))).id;
  loader.answer(id, 'pick:0');
  await running;
  assert.deepEqual(loader.answer('no-such-question', 'redo'), { answered: false });
  assert.deepEqual(loader.answer(id, 'redo'), { answered: true });
  assert.deepEqual(loader.answer(id, 'redo'), { answered: false }, 'only once');
  const next = await loader.run(look({ reason: 'x', filter: { number: 99 } }));
  assert.match(next, /^The user pressed "not this one" on round 1, drawn by you, picture 1, the picture you used for "Which one is the blue living room\?"/);
  const again = loader.run(choose({ title: 'Again?', candidates: CANDIDATES }));
  const second = await until(() => events.filter((event) => event.event === 'ask')[1]);
  assert.deepEqual(second.candidates.map((card) => [card.round, card.source, card.number]), [[1, 'generated', 2], [2, 'user', 1]], 'the refused picture is left out');
  loader.answer(second.id, 'pick:0');
  await again;
});

test('"not this one" while a picture is drawn stops that drawing, tells the row, and the reply goes on', async () => {
  const { loader, events, requests } = fakes({ hang: true, loadable: { [`${USER}/g1`]: PICTURE } });
  const picking = loader.run(choose({ title: 'Which?', candidates: CANDIDATES }));
  const id = (await until(() => askedEvent(events))).id;
  loader.answer(id, 'pick:0');
  await picking;
  const drawing = loader.run(call({ prompt: 'a cat', references: [CANDIDATES[0]] }));
  await until(() => requests.length);
  assert.deepEqual(loader.answer(id, 'redo'), { answered: true });
  const result = await drawing;
  assert.match(result, /The user stopped this drawing/);
  assert.match(result, /pressed "not this one"/);
  assert.equal(events.at(-1).event, 'stopped');
  assert.equal(events.at(-1).label, 'Stopped.');
});

test('the record keeps what was looked at, chosen and drawn, with the pictures used marked in the looks before', async () => {
  const { loader, events } = fakes({ loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  await loader.run(look({ reason: 'the blue one may be the first', filter: { number: 1 } }));
  const picking = loader.run(choose({ title: 'Which?', candidates: CANDIDATES.slice(0, 2) }));
  const ask = await until(() => askedEvent(events));
  loader.answer(ask.id, 'pick:1');
  await picking;
  await loader.run(call({ prompt: 'a cat', references: [CANDIDATES[1]] }));
  const record = loader.record;
  assert.deepEqual(record.map((step) => step.kind), ['view', 'pick', 'draw']);
  assert.equal(record[0].reason, 'the blue one may be the first');
  assert.deepEqual(record[0].shown.map((entry) => [entry.round, entry.source, entry.number]), [[1, 'generated', 1], [2, 'user', 1], [3, 'user', 1]]);
  assert.ok(record[0].shown.every((entry) => entry.thumb?.data), 'a tiny picture each');
  assert.deepEqual(record[0].used, [], 'the picture used was not among the ones looked at');
  assert.deepEqual([record[1].title, record[1].picked.number], ['Which?', 2]);
  assert.deepEqual(record[2].references.map((entry) => entry.number), [2]);
  assert.equal(JSON.stringify(record).includes(KEY), false);
});

test('a look marks the pictures used later', async () => {
  const { loader } = fakes({ loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  await loader.run(look({ reason: 'x', references: CANDIDATES.slice(0, 2) }));
  await loader.run(call({ prompt: 'a cat', references: [CANDIDATES[0]] }));
  assert.deepEqual(loader.record[0].used, [{ round: 1, source: 'generated', number: 1 }]);
});

test('the person sees the pictures a drawing starts from, and "not this one" on the question stops it before anything is drawn', async () => {
  const { loader, events, requests } = fakes({ spec: baseSpec({ tools: { imageGeneration: { ...baseSpec().tools.imageGeneration, permission: 'ask' } } }), loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE }, waitMs: 3000 });
  const start = loader.stepEvent(call({ prompt: 'x' }));
  assert.match(start.id, /^[0-9a-f-]{36}$/);
  const running = loader.run(call({ prompt: 'a cat', references: [CANDIDATES[0], CANDIDATES[1]] }));
  const ask = await until(() => askedEvent(events));
  const refs = events.find((event) => event.event === 'refs');
  assert.deepEqual(refs.references.map((entry) => [entry.round, entry.number, Boolean(entry.thumb)]), [[1, 1, true], [1, 2, true]]);
  assert.equal(ask.drawId, refs.id);
  assert.deepEqual(loader.answer(ask.id, 'not:5'), { answered: false });
  assert.deepEqual(loader.answer(ask.id, 'not:1'), { answered: true });
  const result = await running;
  assert.match(result, /pressed "not this one" on round 1, drawn by you, picture 2/);
  assert.equal(requests.length, 0, 'nothing was drawn, nothing was spent');
  assert.match(await loader.run(call({ prompt: 'again', references: [CANDIDATES[1]] })), /already said that round 1, drawn by you, picture 2 is not the one/);
});

test('"not this one" on the row while the picture is drawn names the drawing: it stops, and the model learns it', async () => {
  const { loader, events } = fakes({ hang: true, loadable: { [`${USER}/g1`]: PICTURE, [`${USER}/g2`]: PICTURE } });
  const start = loader.stepEvent(call({ prompt: 'a cat' }));
  const callObject = call({ prompt: 'a cat', references: [CANDIDATES[0]] });
  const startFor = loader.stepEvent(callObject);
  const drawing = loader.run(callObject);
  await until(() => events.find((event) => event.event === 'refs'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(loader.answer(start.id, 'not:0'), { answered: false }, 'another drawing\'s id');
  assert.deepEqual(loader.answer(startFor.id, 'not:3'), { answered: false }, 'a picture it does not start from');
  assert.deepEqual(loader.answer(startFor.id, 'not:0'), { answered: true });
  assert.match(await drawing, /pressed "not this one" on round 1, drawn by you, picture 1[\s\S]*stopped this drawing/);
  assert.equal(events.at(-1).event, 'stopped');
  assert.deepEqual(loader.answer(startFor.id, 'not:0'), { answered: false }, 'only once');
});

test('the page is told when the picture model is asked (after the question), with the shape', async () => {
  const { loader, events } = fakes();
  await loader.run(call({ prompt: 'a cat', aspect_ratio: '9:16' }));
  const drawing = events.find((event) => event.event === 'drawing');
  assert.equal(drawing.aspectRatio, '9:16');
  assert.ok(events.findIndex((event) => event.event === 'drawing') < events.findIndex((event) => event.event === 'done'));
  assert.equal(loader.stepEvent(call({ prompt: 'x', aspect_ratio: '16:9' })).aspectRatio, '16:9');
});
