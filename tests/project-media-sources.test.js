import assert from 'node:assert/strict';
import test from 'node:test';

import { mediaPieceHash } from '../src/data/project-media.js';
import { EMBEDDING_PROVIDERS } from '../src/app/runtime/memory-store/embedding-client.js';
import { createPageVectors } from '../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../src/app/runtime/memory-store/notes-memory.js';
import { createMediaInfoStore, createMediaSources } from '../src/app/runtime/projects/project-media-source.js';
import { createProjectPieces } from '../src/app/runtime/projects/project-pieces.js';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.js';

// Videos, recordings and scanned PDFs as pieces of the vectors (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R6 to R8), with the tools that cut them replaced by fakes.

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const memoryInfo = () => { const data = new Map(); return createMediaInfoStore({ storage: () => ({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }) }); };
const VIDEO = { id: 'v1', title: 'talk.mp4', file: { hash: 'h-video', name: 'talk.mp4', mimeType: 'video/mp4', size: 5000 } };
const SOUND = { id: 'a1', title: 'memo.mp3', file: { hash: 'h-sound', name: 'memo.mp3', mimeType: 'audio/mpeg', size: 4000 } };
const SCAN = { id: 'p1', title: 'scan.pdf', file: { hash: 'h-scan', name: 'scan.pdf', mimeType: 'application/pdf', size: 3000 } };

function fakes({ probe = { duration: 70, hasVideo: true, hasAudio: true, width: 320, height: 240 }, here = true } = {}) {
  const log = { opened: [], probes: 0, cuts: [], closed: 0, pdf: [] };
  const toolbox = { open: async ({ name }) => {
    log.opened.push(name);
    return {
      probe: async () => { log.probes += 1; return probe; },
      videoWindow: async (start) => { log.cuts.push(['video', start]); return { mimeType: 'video/mp4', data: new Uint8Array([1, start]) }; },
      audioWindow: async (start) => { log.cuts.push(['audio', start]); return { mimeType: 'audio/wav', data: new Uint8Array([2, start]) }; },
      frame: async () => null,
      close: async () => { log.closed += 1; }
    };
  } };
  const getStore = () => ({ load: async () => (here ? { mimeType: 'video/mp4', data: b64([9, 9, 9]) } : null) });
  const openPdf = async () => ({ pages: 3, render: async (page) => { log.pdf.push(page); return { mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, page]) }; }, close: async () => { log.closed += 1; } });
  return { log, toolbox, getStore, openPdf };
}

test('a video becomes windows of picture and windows of its sound, found by opening it once with ffmpeg; each is cut only when its turn comes, from the one open copy', async () => {
  const { log, toolbox, getStore, openPdf } = fakes();
  const sources = createMediaSources({ getStore, getToolbox: async () => toolbox, openPdf, info: memoryInfo(), logger: { warn() {} } });
  const pieces = await sources.piecesFor(VIDEO, 'video');
  assert.deepEqual(pieces.map((piece) => piece.id), ['src:v1:v0', 'src:v1:v25', 'src:v1:v50', 'src:v1:a0', 'src:v1:a50']);
  assert.equal(pieces[1].hash, mediaPieceHash('h-video', 'v25'));
  assert.equal(pieces[3].hash, mediaPieceHash('h-video', 'a0'));
  assert.match(pieces[1].text, /^\[video\] talk\.mp4 0:25–0:55$/);
  assert.deepEqual(log.cuts, [], 'nothing is cut before its turn');
  assert.deepEqual(await pieces[1].loadMedia(), { mimeType: 'video/mp4', data: b64([1, 25]), kind: 'video' });
  assert.deepEqual(await pieces[3].loadMedia(), { mimeType: 'audio/wav', data: b64([2, 0]), kind: 'audio' });
  assert.deepEqual(log.opened, ['talk.mp4'], 'the same open copy serves the pieces of the file');
  assert.equal(log.probes, 1);
  await sources.release();
  assert.equal(log.closed, 1);
});

test('how long a file is, is remembered by its hash: the next time it is not opened to know', async () => {
  const info = memoryInfo();
  const first = fakes();
  await createMediaSources({ getStore: first.getStore, getToolbox: async () => first.toolbox, info, logger: { warn() {} } }).piecesFor(SOUND, 'audio');
  assert.equal(first.log.probes, 1);
  const second = fakes();
  const pieces = await createMediaSources({ getStore: second.getStore, getToolbox: async () => second.toolbox, info, logger: { warn() {} } }).piecesFor(SOUND, 'audio');
  assert.deepEqual(pieces.map((piece) => piece.id), ['src:a1:a0', 'src:a1:a50'], 'a recording has windows of sound only');
  assert.equal(second.log.probes, 0);
  assert.deepEqual(second.log.opened, [], 'not even opened until a piece is cut');
});

test('a file that is not here yet is pending, one that ffmpeg cannot read is failed, a tool that does not start is failed for now', async () => {
  const gone = fakes({ here: false });
  const sources = createMediaSources({ getStore: gone.getStore, getToolbox: async () => gone.toolbox, info: memoryInfo(), logger: { warn() {} } });
  assert.deepEqual(await sources.piecesFor(VIDEO, 'video'), []);
  assert.equal(sources.stateOf('v1'), 'pending');
  const broken = fakes({ probe: { duration: 0, hasVideo: false, hasAudio: false } });
  const other = createMediaSources({ getStore: broken.getStore, getToolbox: async () => broken.toolbox, info: memoryInfo(), logger: { warn() {} } });
  assert.deepEqual(await other.piecesFor(VIDEO, 'video'), []);
  assert.equal(other.stateOf('v1'), 'failed');
  const noTool = createMediaSources({ getStore: broken.getStore, getToolbox: async () => { throw new Error('wasm did not load'); }, info: memoryInfo(), logger: { warn() {} } });
  assert.deepEqual(await noTool.piecesFor(VIDEO, 'video'), []);
  assert.equal(noTool.stateOf('v1'), 'failed');
});

test('a window that ffmpeg gives nothing for is marked, so that it is not tried again; one that throws is left for the next build', async () => {
  const { toolbox, getStore } = fakes();
  const flaky = { open: async (options) => ({ ...(await toolbox.open(options)), videoWindow: async (start) => { if (start === 0) return null; throw new Error('worker died'); } }) };
  const sources = createMediaSources({ getStore, getToolbox: async () => flaky, info: memoryInfo(), logger: { warn() {} } });
  const pieces = await sources.piecesFor(VIDEO, 'video');
  assert.deepEqual(await pieces[0].loadMedia(), { unreadable: true });
  assert.equal(await pieces[1].loadMedia(), null);
});

test('a scanned PDF is a picture for each page, drawn when its turn comes', async () => {
  const { log, getStore, openPdf } = fakes();
  const sources = createMediaSources({ getStore, openPdf, info: memoryInfo(), logger: { warn() {} } });
  const pieces = await sources.piecesFor(SCAN, 'scan');
  assert.deepEqual(pieces.map((piece) => piece.id), ['src:p1:p1', 'src:p1:p2', 'src:p1:p3']);
  assert.equal(pieces[2].hash, mediaPieceHash('h-scan', 'p3'));
  assert.match(pieces[0].text, /^\[scan\] scan\.pdf page 1$/);
  assert.deepEqual(await pieces[1].loadMedia(), { mimeType: 'image/jpeg', data: b64([0xff, 0xd8, 2]), kind: 'image' });
  assert.deepEqual(log.pdf, [2]);
});

// ---------- the whole way: pieces -> vectors -> search

const DIMS = EMBEDDING_PROVIDERS.gemini.dimensions;
const unit = (axis) => { const vector = new Array(DIMS).fill(0); vector[axis] = 1; vector[DIMS - 1] = 0.01; return vector; };

async function setup({ folders, media, conversations = [], chatMedia = null }) {
  const rows = [{ record_key: 'meta:settings', payload: {}, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }];
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [] });
  const sent = [];
  // Every file sent gets an axis from its first byte; a question about "dogs" is the axis of the video window that starts at 25.
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':batchEmbedContents')) return Response.json({ embeddings: body.requests.map(() => ({ values: unit(25 % 50) })) });
    const part = body.content.parts[0];
    sent.push(part.inline_data ? [part.inline_data.mime_type, part.inline_data.data] : part.text);
    return Response.json({ embedding: { values: part.inline_data ? unit(Buffer.from(part.inline_data.data, 'base64')[1] % 50) : unit(25 % 50) } });
  };
  const projectPieces = createProjectPieces({ getFolders: () => folders, getConversations: () => conversations, chatMedia, loadAccess: async () => ({ searchableKindOf: (source) => (source.file?.mimeType === 'application/pdf' ? 'pdf' : ''), sourceTextOf: async () => '' }), media, logger: { warn() {} } });
  const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getProjectPieces: () => projectPieces, getApiKeyForProvider: (name) => (name === 'gemini' ? 'g-key' : ''), indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
  history.setVectors(vectors);
  return { vectors, projectPieces, sent };
}

test('the windows are sent to the model of the vectors as video and sound, found by meaning with their place, and the status of the file follows the build', async () => {
  const { log, toolbox, getStore, openPdf } = fakes();
  const media = createMediaSources({ getStore, getToolbox: async () => toolbox, openPdf, info: memoryInfo(), logger: { warn() {} } });
  const { vectors, sent } = await setup({ folders: [{ id: 'f', sources: [VIDEO] }], media });
  assert.equal(vectors.sourceStatus('v1'), 'off');
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal(vectors.sourceStatus('v1'), 'ready');
  assert.deepEqual(sent.map((item) => item[0]).sort(), ['audio/wav', 'audio/wav', 'video/mp4', 'video/mp4', 'video/mp4']);
  assert.deepEqual(log.cuts.map((cut) => cut.join(':')), ['video:0', 'video:25', 'video:50', 'audio:0', 'audio:50']);
  const found = await vectors.searchProject('dogs', { sourceIds: ['v1'], limit: 2, minCosine: 0.5 });
  assert.equal(found[0].id, 'src:v1:v25');
  assert.equal(found[0].hash, mediaPieceHash('h-video', 'v25'));
  assert.equal(log.closed, 1, 'the file kept open for the cuts is let go when the build is done');
});

test('a video that is not opened yet is pending in the status, and failed when it cannot be read', async () => {
  const gone = fakes({ here: false });
  const pending = await setup({ folders: [{ id: 'f', sources: [VIDEO] }], media: createMediaSources({ getStore: gone.getStore, getToolbox: async () => gone.toolbox, info: memoryInfo(), logger: { warn() {} } }) });
  await pending.vectors.enable('gemini');
  await pending.vectors.sync();
  assert.equal(pending.vectors.sourceStatus('v1'), 'pending');
  const broken = fakes({ probe: { duration: 0, hasVideo: false, hasAudio: false } });
  const failed = await setup({ folders: [{ id: 'f', sources: [VIDEO] }], media: createMediaSources({ getStore: broken.getStore, getToolbox: async () => broken.toolbox, info: memoryInfo(), logger: { warn() {} } }) });
  await failed.vectors.enable('gemini');
  await failed.vectors.sync();
  assert.equal(failed.vectors.sourceStatus('v1'), 'failed');
});

test('a PDF with no text layer is read page by page into the vectors', async () => {
  const { getStore, openPdf } = fakes();
  const { vectors, sent } = await setup({ folders: [{ id: 'f', sources: [SCAN] }], media: createMediaSources({ getStore, openPdf, info: memoryInfo(), logger: { warn() {} } }) });
  await vectors.enable('gemini');
  await vectors.sync();
  assert.equal(vectors.sourceStatus('p1'), 'ready');
  assert.equal(sent.length, 3);
  assert.ok(sent.every((item) => item[0] === 'image/jpeg'));
});

test('a video attached to a message (already measured) is cut into windows with the id the tool gives it, and found by meaning', async () => {
  const { log, toolbox, openPdf } = fakes();
  const hash = 'c'.repeat(64);
  const part = { inlineData: { mimeType: 'video/mp4', name: 'trip.mp4', data: b64([9, 9, 9]) }, mediaInfo: { hash, duration: 70 } };
  const unmeasured = { inlineData: { mimeType: 'video/mp4', name: 'other.mp4', data: b64([1]) } };
  const conversations = [
    { id: 'c1', messages: [{ role: 'user', parts: [{ text: 'look' }, part, unmeasured] }, { role: 'model', parts: [{ text: 'ok' }] }] },
    { id: 'c2', deletedAt: '2026-11-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ inlineData: { mimeType: 'video/mp4', name: 'gone.mp4', data: b64([5]) }, mediaInfo: { hash: 'd'.repeat(64), duration: 30 } }] }] }
  ];
  const seenBytes = [];
  const chatMedia = createMediaSources({ getStore: () => ({ load: async (file) => { seenBytes.push(file.hash); return { data: b64([9, 9, 9]), mimeType: file.mimeType }; } }), getToolbox: async () => toolbox, openPdf, info: memoryInfo(), logger: { warn() {} } });
  const { vectors, sent } = await setup({ folders: [], media: createMediaSources({ getStore: () => null, getToolbox: async () => toolbox, info: memoryInfo(), logger: { warn() {} } }), conversations, chatMedia });
  await vectors.enable('gemini');
  await vectors.sync();
  const id = `att-${hash.slice(0, 16)}`;
  assert.equal(vectors.sourceStatus(id), 'ready');
  assert.ok(sent.filter((item) => item[0] === 'video/mp4').length >= 3, 'a window of every 25 seconds is sent');
  assert.ok(seenBytes.every((seen) => seen === hash), 'only the measured video of the live conversation is read');
  const found = await vectors.searchProject('dogs', { sourceIds: [id], limit: 2, minCosine: 0.5 });
  assert.equal(found[0].id, `src:${id}:v25`);
  assert.equal(found[0].hash, mediaPieceHash(hash, 'v25'));
  assert.equal(log.closed >= 1, true);
});
