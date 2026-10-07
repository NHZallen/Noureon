import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageGenerationResponseLifecycle } from '../src/app/legacy-runtime/features/image-generation-response-lifecycle.js';
import { createServerReplyReattach } from '../src/app/runtime/server-reply/reattach.js';
import { createServerReply, LOCAL_REASONS, localizeServerError, planServerImage, ServerReplyError } from '../src/app/runtime/server-reply/server-reply.js';
import { createBrowserServerReply } from '../src/app/runtime/server-reply/server-reply-runtime.js';
import { serverReplyText } from '../src/app/runtime/server-reply/server-reply-texts.js';

const KEY = 'sk-or-key-value-for-images';
const MESSAGE_ID = '223e4567-e89b-12d3-a456-426614174001';
const CONVERSATION = { id: '323e4567-e89b-12d3-a456-426614174002', messages: [] };
const MODEL = { provider: 'openrouter', id: 'black-forest-labs/flux-3-image', name: 'FLUX.3 Image' };
const PICTURE = { generatedImage: { id: 'img-1', storageKey: 'generatedImage:supabase:u:img-1', mediaType: 'image/png', size: 9, aspectRatio: '16:9', cloudAsset: { __astraCloudAsset: { path: 'u/abc', mimeType: 'image/png', encoding: 'blob' } } } };

// ----- the plan

test('an image goes to the server unless the person chose this device, has no cloud account, or the chat is not kept in the cloud', () => {
  assert.deepEqual(planServerImage({ config: {} }), { ok: true });
  assert.deepEqual(planServerImage({ config: { replyRunLocation: 'server' } }), { ok: true });
  assert.equal(planServerImage({ config: { replyRunLocation: 'local' } }).reason, LOCAL_REASONS.setting);
  assert.equal(planServerImage({ config: {}, hasAccount: false }).reason, LOCAL_REASONS.noAccount);
  assert.equal(planServerImage({ config: {}, conversation: { isTemporary: true } }).reason, LOCAL_REASONS.notSynced);
  assert.equal(planServerImage({ config: {}, conversation: { retentionMode: 'ephemeral' } }).reason, LOCAL_REASONS.notSynced);
});

test('the browser\'s wiring reads the setting as it is now: "this device" is kept for replies and for images', () => {
  let config = { replyRunLocation: 'server' };
  const wiring = createBrowserServerReply({
    getConfig: () => config,
    getApiKeyForProvider: () => '',
    getModelApiId: () => '',
    getDefaultGenConfig: () => ({}),
    describeRequest: async () => ({}),
    getSync: () => ({ getStatus: () => ({ enabled: true }) }),
    getClient: async () => null,
    document: null
  });
  assert.equal(wiring.plan({ conversation: CONVERSATION }).ok, true);
  assert.equal(wiring.planImage({ conversation: CONVERSATION }).ok, true);
  config = { replyRunLocation: 'local' };
  assert.equal(wiring.plan({ conversation: CONVERSATION }).reason, LOCAL_REASONS.setting, 'a reply is not sent to the server');
  assert.equal(wiring.planImage({ conversation: CONVERSATION }).reason, LOCAL_REASONS.setting, 'nor an image');
  const noAccount = createBrowserServerReply({ getConfig: () => ({}), getApiKeyForProvider: () => '', getModelApiId: () => '', getDefaultGenConfig: () => ({}), describeRequest: async () => ({}), getSync: () => null, getClient: async () => null, document: null });
  assert.equal(noAccount.planImage({ conversation: CONVERSATION }).reason, LOCAL_REASONS.noAccount);
});

// ----- handing the image over

function harness({ respond, rows = [], hydrate, readMessage } = {}) {
  const calls = [];
  const flushed = [];
  const stops = [];
  const reads = [];
  let rowIndex = 0;
  const reply = createServerReply({
    getAccessToken: async () => 'token-123',
    getApiKeyForProvider: (name) => ({ openrouter: KEY }[name] || ''),
    getModelApiId: (model) => model.id,
    flushSync: async () => { flushed.push(calls.length); },
    readMessage: readMessage || (async (id) => { reads.push(id); const row = rows[Math.min(rowIndex, rows.length - 1)]; rowIndex += 1; return row ?? null; }),
    hydrateParts: hydrate || (async (parts) => parts.map((part) => ({ generatedImage: { ...part.generatedImage, cloudAsset: undefined } }))),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/stop')) { stops.push(url); return new Response('{}', { status: 200 }); }
      if (String(url).endsWith('/stream')) return new Response('no', { status: 503 });
      if (/\/v1\/runs\/[^/]+$/.test(String(url))) return new Response(JSON.stringify({ run: { status: 'done' } }), { status: 200 });
      if (respond) return respond(url, options);
      return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 });
    },
    clientVersion: '17.9.0',
    wait: async () => {},
    warn: () => {}
  });
  return { reply, calls, flushed, stops, reads };
}
const imageArgs = (extra = {}) => ({
  conversation: CONVERSATION,
  modelInfo: MODEL,
  prompt: 'a cat in the rain',
  config: { aspectRatio: '16:9', resolution: '2K', n: 1, quality: '', seed: undefined, background: null },
  references: ['data:image/png;base64,QUJD'],
  assistantMessageId: MESSAGE_ID,
  sequence: 4,
  uiLanguage: 'zh-TW',
  ...extra
});

test('an image is handed over after the conversation was saved, with only the key of its provider and only the fields that have a value', async () => {
  const { reply, calls, flushed } = harness();
  const result = await reply.startImage(imageArgs());
  assert.equal(result.ok, true);
  assert.equal(result.run.runId, 'run-1');
  assert.equal(result.run.kind, 'image');
  assert.deepEqual(flushed, [0], 'saved before the request went out');
  assert.equal(calls[0].url, 'https://api.noureon.com/v1/runs');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-123');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.kind, 'image');
  assert.equal(body.protocol, 1);
  assert.equal(body.conversationId, CONVERSATION.id);
  assert.equal(body.assistantMessageId, MESSAGE_ID);
  assert.equal(body.sequence, 4);
  assert.deepEqual(body.model, { provider: 'openrouter', id: 'black-forest-labs/flux-3-image', info: MODEL });
  assert.deepEqual(body.request, { language: 'zh-TW' });
  assert.deepEqual(body.image, { prompt: 'a cat in the rain', config: { aspectRatio: '16:9', resolution: '2K', n: 1 }, references: ['data:image/png;base64,QUJD'] });
  assert.deepEqual(body.secrets, { providerKey: KEY });
  assert.equal('tools' in body, false);
});

test('an image that cannot go says why, and what the person is told is only for what they would want to know', async () => {
  assert.deepEqual(await harness().reply.startImage(imageArgs({ modelInfo: { provider: 'gemini', id: 'g' } })), { ok: false, reason: 'no-key', notify: false });
  const huge = await harness().reply.startImage(imageArgs({ references: ['data:image/png;base64,' + 'A'.repeat(21 * 1024 * 1024)] }));
  assert.deepEqual(huge, { ok: false, reason: LOCAL_REASONS.tooLarge, notify: false }, 'a request over the limit is made here');
  const refused = (status, code) => harness({ respond: async () => new Response(JSON.stringify({ error: { code } }), { status }) }).reply.startImage(imageArgs());
  assert.deepEqual(await refused(422, 'unsupported_mode'), { ok: false, reason: 'unsupported_mode', notify: false }, 'a server that cannot make images is not mentioned');
  assert.equal((await refused(429, 'too_many_runs')).notify, 'busy');
  assert.equal((await refused(404, 'conversation_not_found')).notify, false);
  const down = harness({ respond: async () => { throw new Error('offline'); } });
  assert.equal((await down.reply.startImage(imageArgs())).notify, 'unreachable');
});

// ----- following it

test('the finished picture comes back as parts with its file brought here', async () => {
  const { reply, reads } = harness({ rows: [{ status: 'streaming', parts: [{ imageGenerationLoading: true }] }, { status: 'complete', parts: [PICTURE] }] });
  const { run } = await reply.startImage(imageArgs());
  const outcome = await run.followImage({});
  assert.equal(outcome.parts.length, 1);
  assert.equal(outcome.parts[0].generatedImage.id, 'img-1');
  assert.equal(outcome.parts[0].generatedImage.cloudAsset, undefined, 'the file is here: no marker left');
  assert.equal(reads.length, 2, 'the message is read again until it is finished');
  assert.deepEqual(reads, [MESSAGE_ID, MESSAGE_ID]);
});

test('an image the server could not make is an error with the server\'s reason and code, carrying that it was the server\'s', async () => {
  const { reply } = harness({ rows: [{ status: 'error', parts: [{ text: 'x' }], metadata: { serverError: { code: 'provider_error', message: 'No credits left' } } }] });
  const { run } = await reply.startImage(imageArgs());
  await assert.rejects(() => run.followImage({}), (error) => error instanceof ServerReplyError && error.code === 'provider_error' && error.message === 'No credits left' && error.serverRun === true);
  const unsaved = harness({ rows: [{ status: 'error', parts: [], metadata: { serverError: { code: 'image_not_saved', message: 'The image could not be kept in the cloud space.' } } }] });
  const { run: second } = await unsaved.reply.startImage(imageArgs());
  const failure = await second.followImage({}).catch((error) => error);
  assert.equal(localizeServerError(failure, 'zh-TW').message, serverReplyText('zh-TW', 'imageNotSaved'), 'told in the language of the page');
  assert.match(serverReplyText('zh-TW', 'imageNotSaved'), /雲端空間/);
});

test('a stop is told to the server once and the end is still waited for; a stopped image comes back with no picture', async () => {
  const { reply, stops } = harness({ rows: [{ status: 'complete', parts: [{ text: '' }] }] });
  const { run } = await reply.startImage(imageArgs());
  const controller = new AbortController();
  controller.abort();
  const outcome = await run.followImage({ signal: controller.signal });
  assert.deepEqual(outcome.parts, []);
  assert.equal(stops.length, 1);
});

test('an image whose message never finishes does not leave the person waiting for ever', async () => {
  const { reply } = harness({ rows: [{ status: 'streaming', parts: [{ imageGenerationLoading: true }] }] });
  const { run } = await reply.startImage(imageArgs());
  await assert.rejects(() => run.followImage({}), (error) => error instanceof ServerReplyError && error.code === 'time_limit');
});

test('a run found for the chat may be an image', async () => {
  const { reply } = harness({ readMessage: async () => null });
  const replyWithFind = createServerReply({
    getAccessToken: async () => 't', getApiKeyForProvider: () => KEY, getModelApiId: (model) => model.id, flushSync: async () => {}, readMessage: async () => null,
    findLiveRun: async () => ({ id: 'run-7', message_id: MESSAGE_ID, kind: 'image' }), fetchImpl: async () => new Response('{}'), clientVersion: '1', wait: async () => {}
  });
  const found = await replyWithFind.find(CONVERSATION.id);
  assert.equal(found.kind, 'image');
  assert.equal(found.runId, 'run-7');
  assert.equal(found.assistantMessageId, MESSAGE_ID);
  assert.ok(reply);
});

// ----- the image lifecycle

function lifecycleHarness({ serverReply = null, generate } = {}) {
  const generated = [];
  const lifecycle = createImageGenerationResponseLifecycle({
    buildSingleModelTranslatedRequestParts: async (parts) => parts,
    generateImage: generate || (async (request) => { generated.push(request); return { images: [{ b64Json: 'aGVsbG8=', mediaType: 'image/png' }] }; }),
    saveImageAsset: async () => ({ id: 'local', storageKey: 'local-key', mediaType: 'image/png', size: 5 }),
    getStoredImageDataUrl: async () => '',
    getApiKey: () => KEY
  });
  const run = (extra = {}) => lifecycle.run({
    targetElement: { innerHTML: '' },
    userParts: [{ text: 'a cat in the rain' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }],
    modelInfo: { ...MODEL, supportedImageAspectRatios: ['1:1', '16:9'], supportedImageResolutions: ['1K', '2K'] },
    conversation: { id: CONVERSATION.id, imageConfig: { aspectRatio: '16:9', resolution: '2K' }, imageAdvancedConfig: { n: 2, quality: 'high' }, messages: [] },
    uiLanguage: 'zh-TW',
    serverReply,
    assistantMessageId: MESSAGE_ID,
    sequence: 5,
    ...extra
  });
  return { run, generated };
}
const fakeServerReply = ({ plan = { ok: true }, start, follow, notices = [] } = {}) => {
  const started = [];
  return {
    started,
    notices,
    planImage: () => plan,
    startImage: async (args) => { started.push(args); return start ? start(args) : { ok: true, run: { followImage: follow || (async () => ({ parts: [PICTURE] })) } }; },
    notify: (kind, language) => notices.push([kind, language]),
    localizeError: (error, language) => localizeServerError(error, language)
  };
};

test('when the server can make the picture, the page hands it over and only follows it: nothing is asked of the provider from here', async () => {
  const serverReply = fakeServerReply();
  const { run, generated } = lifecycleHarness({ serverReply });
  const result = await run();
  assert.equal(generated.length, 0);
  assert.equal(serverReply.started.length, 1);
  const args = serverReply.started[0];
  assert.equal(args.prompt, 'a cat in the rain');
  assert.deepEqual(args.config, { aspectRatio: '16:9', resolution: '2K', n: 2, quality: 'high' }, 'the shape, the size and the advanced settings');
  assert.deepEqual(args.references, ['data:image/png;base64,QUJD']);
  assert.equal(args.assistantMessageId, MESSAGE_ID);
  assert.equal(args.sequence, 5);
  assert.equal(args.uiLanguage, 'zh-TW');
  assert.deepEqual(result.parts, [PICTURE]);
  assert.deepEqual(result.descriptors, [PICTURE.generatedImage]);
});

test('the picture is made here when the server is not chosen, does not take it, or there is no message to write under', async () => {
  const notChosen = fakeServerReply({ plan: { ok: false, reason: LOCAL_REASONS.setting } });
  const first = lifecycleHarness({ serverReply: notChosen });
  const result = await first.run();
  assert.equal(first.generated.length, 1);
  assert.equal(notChosen.started.length, 0);
  assert.equal(result.parts[0].generatedImage.id, 'local');

  const refused = fakeServerReply({ start: async () => ({ ok: false, reason: 'unreachable', notify: 'unreachable' }) });
  const second = lifecycleHarness({ serverReply: refused });
  await second.run();
  assert.equal(second.generated.length, 1, 'made here after all');
  assert.deepEqual(refused.notices, [['unreachable', 'zh-TW']], 'and the person is told');

  const quiet = fakeServerReply({ start: async () => ({ ok: false, reason: 'unsupported_mode', notify: false }) });
  const third = lifecycleHarness({ serverReply: quiet });
  await third.run();
  assert.equal(third.generated.length, 1);
  assert.deepEqual(quiet.notices, []);

  const withoutId = lifecycleHarness({ serverReply: fakeServerReply() });
  await withoutId.run({ assistantMessageId: null });
  assert.equal(withoutId.generated.length, 1);
});

test('no picture is previewed while it is made here: the request carries no callback for one', async () => {
  const { run, generated } = lifecycleHarness();
  await run({ modelInfo: { id: 'openai/gpt-image-2.5-flare', provider: 'openrouter' }, userParts: [{ text: 'a cat' }] });
  assert.equal(generated[0].onPartial, undefined);
});

test('a picture the server was already making when the page was opened again is only followed, from the message alone', async () => {
  const { run, generated } = lifecycleHarness({ serverReply: fakeServerReply() });
  const followed = [];
  const result = await run({
    userParts: [],
    resumeRun: { followImage: async ({ signal }) => { followed.push(signal); return { parts: [PICTURE] }; } }
  });
  assert.equal(generated.length, 0, 'nothing is made here, and an empty prompt is no error');
  assert.equal(followed.length, 1);
  assert.deepEqual(result.parts, [PICTURE]);
});

test('an image the server could not make is an error in the language of the page; a stopped one ends like any stopped reply', async () => {
  const failing = fakeServerReply({ follow: async () => { throw new ServerReplyError('The image could not be kept in the cloud space.', 'image_not_saved'); } });
  const { run } = lifecycleHarness({ serverReply: failing });
  await assert.rejects(() => run({ uiLanguage: 'fr' }), (error) => error.message === serverReplyText('fr', 'imageNotSaved') && error.serverRun === true);

  const stopped = fakeServerReply({ follow: async () => ({ parts: [] }) });
  const second = lifecycleHarness({ serverReply: stopped });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => second.run({ signal: controller.signal }), { name: 'AbortError' });
  const third = lifecycleHarness({ serverReply: stopped });
  await assert.rejects(() => third.run(), { name: 'AbortError' }, 'stopped from another page');
});

// ----- opening the page again

test('a picture the server is still making is waited for under the picture place-holder, and followed, not made again here', async () => {
  const conv = { id: 'c1', imageConfig: { aspectRatio: '7:5' }, messages: [{ id: 'u1', role: 'user', parts: [{ text: 'a cat' }] }, { id: 'a1', role: 'model', parts: [{ imageGenerationLoading: true, imageAspectRatio: '7:5' }] }] };
  const added = [];
  const completed = [];
  const lifecycle = createServerReplyReattach({
    getActiveConversation: () => conv,
    getAbortController: () => null,
    setAbortController() {},
    serverReply: { find: async () => ({ runId: 'r1', assistantMessageId: 'a1', kind: 'image', followImage: async () => ({ parts: [] }) }) },
    messageList: () => ({ children: [] }),
    setSubmitBusy() {},
    addMessageToUI: (message) => { added.push(message.parts); return { querySelector: () => ({}), scrollIntoView() {} }; },
    completeReply: async (prepared, options) => { completed.push(options.resumeRun.kind); },
    document: null,
    window: null,
    scheduleTimeout: () => null
  });
  assert.equal(await lifecycle.reattachServerReply(), true);
  assert.deepEqual(added, [[{ imageGenerationLoading: true, imageAspectRatio: '7:5' }]], 'the place-holder of a picture, in the ratio asked for');
  assert.deepEqual(completed, ['image']);
});

test('every text of the image exists in all five languages', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    assert.ok(serverReplyText(language, 'sent6').length > 20, `${language} sent6`);
    assert.ok(serverReplyText(language, 'imageNotSaved').length > 20, `${language} imageNotSaved`);
  }
});
