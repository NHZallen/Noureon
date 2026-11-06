import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCanvas } from '@napi-rs/canvas';

import { executeImage } from '../../server/image-run.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { decodeGif } from '../../src/app/runtime/images/gif-frames.js';

// Frames of a GIF edited in the editor of a picture, on the server (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §10): the model is asked for each frame on its own, and the answers are put
// back in the GIF they came from; the GIF is kept in the cloud space like any picture the server makes.

const USER = '123e4567-e89b-12d3-a456-426614174000';
const fixtures = JSON.parse(readFileSync(new URL('../fixtures-gif-frames.json', import.meta.url), 'utf8'));
const GIF = Buffer.from(fixtures.d.b64, 'base64');
const GIF_URL = `data:image/gif;base64,${fixtures.d.b64}`;
const FRAME_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const answerPicture = () => {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgb(200, 30, 30)';
  context.fillRect(0, 0, 64, 64);
  return canvas.toBuffer('image/png').toString('base64');
};

const specFor = (image, model = { provider: 'openrouter', id: 'black-forest-labs/flux-3-image', info: { name: 'FLUX.3 Image', provider: 'openrouter' } }) => validateRunSpec({
  protocol: PROTOCOL_VERSION, kind: 'image', clientVersion: '19.3.0', conversationId: '323e4567-e89b-12d3-a456-426614174002', assistantMessageId: '223e4567-e89b-12d3-a456-426614174001', sequence: 1,
  model, request: { language: 'zh-TW' }, image: { prompt: 'remove the waves', config: { aspectRatio: '1:1', n: 1 }, references: [FRAME_URL], gifEdit: { source: GIF_URL, edits: [{ index: 3, count: 16 }] }, ...image }, secrets: { providerKey: 'sk-or-secret-secret' }
});

test('frames of a GIF to edit are accepted, and what is not in the right shape says where', () => {
  const ok = specFor({});
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.spec.image.gifEdit, { source: GIF_URL, edits: [{ index: 3, count: 16 }] });
  const paths = (result) => result.errors.map((error) => error.path);
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 3, count: 16 }, { index: 4, count: 16 }] } })).includes('image.gifEdit.edits'), 'one frame for each reference');
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 16, count: 16 }] } })).some((path) => path.startsWith('image.gifEdit.edits')), 'a frame that is not in the GIF');
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 0, count: 1 }] } })).some((path) => path.startsWith('image.gifEdit.edits')), 'a GIF has two frames or more');
  assert.ok(paths(specFor({ gifEdit: { source: 'https://example.com/a.gif', edits: [{ index: 0, count: 16 }] } })).includes('image.gifEdit.source'));
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 0, count: 16 }], extra: 1 } })).includes('image.gifEdit.extra'));
  const marker = { __astraCloudAsset: { path: `${USER}/${'a'.repeat(64)}`, mimeType: 'image/gif', encoding: 'blob' } };
  assert.equal(specFor({ gifEdit: { source: marker, edits: [{ index: 0, count: 16 }] } }).ok, true, 'the GIF may be a file of the cloud space');
});

test('the server asks the model for each marked frame and keeps the GIF with the answers put back', async () => {
  const asked = [];
  const saved = [];
  const fetchImpl = async (url, init) => { asked.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ data: [{ b64_json: answerPicture(), media_type: 'image/png' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const files = { save: async ({ bytes, mimeType }) => { saved.push({ bytes: Buffer.from(bytes), mimeType }); return { __astraCloudAsset: { path: `${USER}/x`, mimeType, encoding: 'blob' } }; }, load: async () => GIF };
  const done = await executeImage({ spec: specFor({}).spec, secrets: { providerKey: 'sk-or-secret-secret' }, signal: new AbortController().signal, userId: USER, files, fetchImpl });
  assert.equal(done.status, 'done');
  assert.equal(asked.length, 1, 'one request for the one marked frame');
  assert.equal(asked[0].url, 'https://openrouter.ai/api/v1/images');
  assert.match(asked[0].body.prompt, /^remove the waves\n\nThis picture is frame 4 of 16 of an animation/);
  assert.equal(asked[0].body.aspect_ratio, '1:1');
  assert.deepEqual(asked[0].body.input_references, [{ type: 'image_url', image_url: { url: FRAME_URL } }]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mimeType, 'image/gif');
  assert.equal(done.parts[0].generatedImage.mediaType, 'image/gif');
  const after = decodeGif(saved[0].bytes);
  const before = decodeGif(GIF);
  assert.equal(after.frames.length, 16);
  assert.deepEqual([...after.frames[3].rgba.slice(0, 4)], [200, 30, 30, 255], 'frame 4 is the edited one');
  for (const index of [0, 1, 2, 4, 9, 15]) assert.deepEqual([...after.frames[index].rgba], [...before.frames[index].rgba], `frame ${index + 1} is untouched`);
  assert.deepEqual(after.frames.map((frame) => frame.delayMs), before.frames.map((frame) => frame.delayMs), 'the times are kept');
});

test('the GIF may be read from the cloud space, and one that cannot be read is said, not guessed', async () => {
  const marker = { __astraCloudAsset: { path: `${USER}/${'a'.repeat(64)}`, mimeType: 'image/gif', encoding: 'blob' } };
  const loads = [];
  const saved = [];
  const fetchImpl = async () => new Response(JSON.stringify({ data: [{ b64_json: answerPicture() }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const files = { save: async ({ bytes, mimeType }) => { saved.push(mimeType); return { __astraCloudAsset: { path: `${USER}/y`, mimeType, encoding: 'blob' } }; }, load: async ({ marker: given }) => { loads.push(given); return GIF; } };
  const done = await executeImage({ spec: specFor({ gifEdit: { source: marker, edits: [{ index: 0, count: 16 }] } }).spec, secrets: { providerKey: 'k' }, signal: new AbortController().signal, userId: USER, files, fetchImpl });
  assert.equal(done.status, 'done');
  assert.deepEqual(loads, [marker]);
  const broken = { ...files, load: async () => { throw new Error('gone'); } };
  await assert.rejects(() => executeImage({ spec: specFor({ gifEdit: { source: marker, edits: [{ index: 0, count: 16 }] } }).spec, secrets: { providerKey: 'k' }, signal: new AbortController().signal, userId: USER, files: broken, fetchImpl }), /could not be read from your cloud space/);
  // a GIF of another number of frames than the editor said: nothing is made
  await assert.rejects(() => executeImage({ spec: specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 0, count: 5 }] } }).spec, secrets: { providerKey: 'k' }, signal: new AbortController().signal, userId: USER, files, fetchImpl }), /no longer in this conversation/);
});

test('"every frame" is asked of the model once, with the sheet of the frames, and the GIF keeps all its frames', async () => {
  assert.equal(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 3, count: 16 }], all: true } }).spec.image.gifEdit.all, true);
  assert.ok(specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 3, count: 16 }], all: false } }).errors.some((error) => error.path === 'image.gifEdit.all'));
  const asked = [];
  const saved = [];
  const fetchImpl = async (url, init) => { asked.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: [{ b64_json: answerPicture() }] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const files = { save: async ({ bytes, mimeType }) => { saved.push({ bytes: Buffer.from(bytes), mimeType }); return { __astraCloudAsset: { path: `${USER}/z`, mimeType, encoding: 'blob' } }; }, load: async () => GIF };
  const done = await executeImage({ spec: specFor({ gifEdit: { source: GIF_URL, edits: [{ index: 3, count: 16 }], all: true } }).spec, secrets: { providerKey: 'k' }, signal: new AbortController().signal, userId: USER, files, fetchImpl });
  assert.equal(done.status, 'done');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].input_references.length, 2, 'the sheet and the marked frame');
  assert.match(asked[0].prompt, /contact sheet of the 16 frames/);
  assert.equal(decodeGif(saved[0].bytes).frames.length, 16);
});

test('the sheet marked in the editor and the speed are accepted only in the right shape', () => {
  const edits = [{ index: 0, count: 16 }];
  const ok = specFor({ gifEdit: { source: GIF_URL, edits, all: true, sheet: true, speed: 0.5 } });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.spec.image.gifEdit, { source: GIF_URL, edits, all: true, sheet: true, speed: 0.5 });
  const paths = (result) => result.errors.map((error) => error.path);
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits, sheet: true } })).includes('image.gifEdit.sheet'), 'a sheet is for every frame');
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits, all: true, speed: 9 } })).includes('image.gifEdit.speed'));
  assert.ok(paths(specFor({ gifEdit: { source: GIF_URL, edits, all: true, speed: '2' } })).includes('image.gifEdit.speed'));
});
