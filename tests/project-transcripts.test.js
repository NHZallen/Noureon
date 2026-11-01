import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSource, normalizeSources, transcriptSourcesOf } from '../src/app/runtime/projects/project-source-model.js';
import { createProjectTranscripts } from '../src/app/runtime/projects/project-transcripts.js';
import { createProjectFilesAccess } from '../src/app/runtime/projects/project-files-access.js';
import { createProjectActions } from '../src/app/runtime/projects/project-actions.js';
import { setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { createProjectPieces } from '../src/app/runtime/projects/project-pieces.js';

// The words said in the videos and recordings of a project (project-transcripts.js, project-source-model.js): written down in the background, kept with the source, searched and read like a text.

const video = (extra = {}) => ({ id: 's1', kind: 'file', title: 'talk.mp4', mime: 'video/mp4', size: 100, text: '', file: { name: 'talk.mp4', mimeType: 'video/mp4', size: 100, hash: 'h-talk' }, addedAt: '', ...extra });
const TRANSCRIPT = { text: '[0:00] hello everyone\n[0:25] the budget is ten thousand', model: 'm', at: '2026-11-02T00:00:00.000Z' };

test('the transcript of a source is kept by the model, only for a source that has a file, and is a text source of its own for the tools', () => {
  const kept = normalizeSource(video({ transcript: TRANSCRIPT }));
  assert.deepEqual(kept.transcript, TRANSCRIPT);
  assert.equal(normalizeSource(video({ transcript: { nope: 1 } })).transcript, undefined);
  assert.equal(normalizeSource({ id: 't', kind: 'text', title: 'a', text: 'words', transcript: TRANSCRIPT }).transcript, undefined, 'a typed text has no sound');
  assert.deepEqual(normalizeSources([video({ transcript: { ...TRANSCRIPT, text: '' } })])[0].transcript.text, '', 'a file with no words said is marked as listened to');
  const own = transcriptSourcesOf([kept, video({ id: 's2', transcript: { ...TRANSCRIPT, text: '  ' } }), video({ id: 's3' })]);
  assert.equal(own.length, 1, 'no words, no transcript text');
  assert.equal(own[0].id, 's1~tr');
  assert.equal(own[0].title, 'talk.mp4 (transcript)');
  assert.equal(own[0].text, TRANSCRIPT.text);
});

function makeMaker({ enabled = true, sources, ensure } = {}) {
  const folders = [{ id: 'f1', sources }];
  const kept = [];
  const listeners = new Set();
  const transcription = {
    isEnabled: () => enabled,
    needs: () => true,
    subscribeSettings: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    ensureParts: async (parts) => { for (const part of parts) await ensure(part); }
  };
  const maker = createProjectTranscripts({
    getFolders: () => folders, getTranscription: () => transcription,
    getStore: () => ({ load: async (file) => ({ data: 'AAAA', mimeType: file.mimeType }) }),
    setTranscript: async (projectId, sourceId, transcript) => { kept.push([projectId, sourceId, transcript]); const source = folders[0].sources.find((item) => item.id === sourceId); source.transcript = transcript; },
    logger: { warn() {} }
  });
  return { maker, kept, listeners, turnOn: () => { enabled = true; for (const listener of listeners) listener(); }, turnOff: () => { enabled = false; } };
}

test('each video and recording without a transcript gets one when speech to text is on; a text, a picture and a file that has one are left alone', async () => {
  const made = [];
  const sources = [video(), video({ id: 's2', title: 'memo.mp3', file: { name: 'memo.mp3', mimeType: 'audio/mpeg', size: 50, hash: 'h-memo' } }), video({ id: 's3', transcript: TRANSCRIPT, file: { name: 'old.mp4', mimeType: 'video/mp4', size: 10, hash: 'h-old' } }),
    { id: 's4', kind: 'image', title: 'p.png', file: { name: 'p.png', mimeType: 'image/png', size: 5, hash: 'h-pic' } }, { id: 's5', kind: 'text', title: 'n', text: 'x' }];
  const { maker, kept } = makeMaker({ sources, ensure: async (part) => { made.push(part.inlineData.name); part.transcript = { text: `[0:00] ${part.inlineData.name}`, model: 'm', at: 'now' }; } });
  await maker.run();
  assert.deepEqual(made, ['talk.mp4', 'memo.mp3']);
  assert.deepEqual(kept.map((item) => item[1]), ['s1', 's2']);
  await maker.run();
  assert.equal(made.length, 2, 'a file that has its transcript is not done again');
});

test('nothing is done while it is off; turning it on starts the work; a file that failed is not tried again at once', async () => {
  let calls = 0;
  const { maker, kept, turnOn } = makeMaker({ enabled: false, sources: [video()], ensure: async () => { calls += 1; } });
  await maker.run();
  assert.equal(calls, 0);
  turnOn();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1, 'it began by itself');
  assert.deepEqual(kept, [], 'a file that gave no transcript keeps none');
  await maker.run();
  assert.equal(calls, 1, 'and is not tried again');
});

test('a call during a round asks for another round after it', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sources = [video()];
  const { maker } = makeMaker({ sources, ensure: async (part) => { await gate; part.transcript = TRANSCRIPT; } });
  const first = maker.run();
  const second = maker.run();
  release();
  await Promise.all([first, second]);
  assert.equal(sources[0].transcript.text, TRANSCRIPT.text);
});

test('the actions keep a transcript with the source and tell the vectors; it goes only to a source that has a file', async () => {
  const folders = [{ id: 'f1', name: 'P', sources: [video(), { id: 't', kind: 'text', title: 'n', text: 'words', addedAt: '' }] }];
  let changed = 0;
  const dataStore = { getFolders: () => folders, replaceFolders: (next) => { folders.splice(0, folders.length, ...next); }, getConversations: () => [] };
  const actions = createProjectActions({ dataStore, onSourcesChanged: () => { changed += 1; } });
  assert.deepEqual(await actions.setTranscript('f1', 's1', TRANSCRIPT), { ok: true });
  assert.equal(folders[0].sources[0].transcript.text, TRANSCRIPT.text);
  assert.equal(changed, 1);
  assert.equal((await actions.setTranscript('f1', 't', TRANSCRIPT)).ok, false);
  assert.equal((await actions.setTranscript('f1', 's1', { nope: 1 })).ok, false);
  assert.equal((await actions.setTranscript('gone', 's1', TRANSCRIPT)).ok, false);
});

test('the tools search and read the transcript like a text, and the server is given it as the text of a file', async () => {
  setProjectFoldersReader(() => [{ id: 'f1', name: 'P', sources: [video({ transcript: TRANSCRIPT })] }]);
  try {
    const access = await createProjectFilesAccess({ conversation: { folderId: 'f1' } });
    assert.deepEqual(access.entries.map((entry) => entry.name), ['talk.mp4 (transcript)']);
    assert.match(access.catalogText, /talk\.mp4 \(transcript\)/);
    const loader = access.make('en');
    assert.match(await loader.run({ name: 'search_project_files', args: { query: 'budget ten thousand' } }), /\[0:25\] the budget is ten thousand/);
    assert.match(await loader.run({ name: 'read_project_file', args: { file: 'talk.mp4 (transcript)' } }), /hello everyone/);
    const snapshot = access.snapshot();
    assert.equal(snapshot.entries[0].text, TRANSCRIPT.text);
    assert.deepEqual(snapshot.media.map((entry) => [entry.name, entry.kind]), [['talk.mp4', 'video']], 'the video itself is still named');
  } finally { setProjectFoldersReader(null); }
});

test('the passages of a transcript are pieces for the vectors, under the id of the text source', async () => {
  const folders = [{ id: 'f1', sources: [video({ transcript: { ...TRANSCRIPT, text: `[0:00] ${'words '.repeat(40)}` } })] }];
  const pieces = createProjectPieces({ getFolders: () => folders, loadAccess: async () => ({ searchableKindOf: () => '', sourceTextOf: async () => '' }), media: { piecesFor: async () => [], stateOf: () => '', release: async () => {} }, chatMedia: { piecesFor: async () => [], stateOf: () => '', release: async () => {} }, logger: { warn() {} } });
  const made = await pieces.refresh();
  assert.ok(made.some((piece) => piece.id.startsWith('src:s1~tr:')), 'a piece of the transcript');
  assert.ok(made.every((piece) => piece.sourceId === 's1~tr'));
});
