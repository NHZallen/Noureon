import assert from 'node:assert/strict';
import test from 'node:test';

import { createPageTranscription } from '../src/app/runtime/transcription/page-transcription.js';
import { hasTranscript, transcriptTextPart, withTranscriptText, TRANSCRIPT_IN_REQUEST_CHARS } from '../src/app/runtime/transcription/transcript-parts.js';
import { normalizeSettings } from '../src/app/runtime/memory-notes/records.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

// Speech to text on the page: off until agreed; a recording or a video of a message gets its transcript once; a model that cannot take the file is given the words instead.

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const fakeStore = (initial = {}) => {
  let settings = normalizeSettings(initial);
  return { isLoaded: () => true, getSettings: () => settings, setSettings: async (patch) => { settings = normalizeSettings({ ...settings, ...patch }); } };
};
const fakeToolbox = (log) => ({ open: async ({ name }) => { log.opened.push(name); return { probe: async () => ({ duration: 130, hasAudio: true, hasVideo: false }), audioWindow: async (start) => ({ mimeType: 'audio/wav', data: new Uint8Array([start]) }), close: async () => { log.closed += 1; } }; } });

function make({ keys = { openrouter: 'or-key' }, store = fakeStore(), text = (start) => `words at ${start}` } = {}) {
  const log = { opened: [], closed: 0, sent: [] };
  const fetchImpl = async (url, options) => { const body = JSON.parse(options.body); log.sent.push(url); return Response.json({ text: text(Buffer.from(body.input_audio.data, 'base64')[0]) }); };
  const transcription = createPageTranscription({ getStore: () => store, getApiKeyForProvider: (name) => keys[name] || '', getToolbox: async () => fakeToolbox(log), fetchImpl, now: () => '2026-11-02T00:00:00.000Z', logger: { warn() {} } });
  return { transcription, log, store };
}
const part = (mimeType, name, bytes = [1, 2, 3]) => ({ inlineData: { mimeType, name, data: b64(bytes) } });

test('the settings keep when and how it was agreed to; nothing is done before', async () => {
  const { transcription, store } = make();
  assert.equal(transcription.isEnabled(), false);
  assert.equal(await transcription.ensureParts([part('audio/mpeg', 'a.mp3')]), 0, 'off: nothing is sent');
  assert.deepEqual(transcription.providers().map((way) => [way.name, way.current]), [['openrouter', true], ['browser', false]]);
  assert.equal(await transcription.enable('openrouter'), true);
  assert.deepEqual({ ...store.getSettings().transcription }, { enabled: true, consentAt: '2026-11-02T00:00:00.000Z', provider: 'openrouter' });
  assert.equal(transcription.isEnabled(), true);
  assert.equal(await transcription.setProvider('openai'), false, 'no key for it');
  assert.equal(await transcription.setProvider('browser'), true);
  assert.equal(transcription.provider(), 'browser');
  await transcription.disable();
  assert.equal(transcription.isEnabled(), false);
  assert.equal(normalizeSettings({ transcription: { enabled: true } }).transcription.enabled, false, 'no consent time, not on');
});

test('a recording and a video get their transcript once, with the time of each minute; a picture, a file that has one and a part with no data are left alone', async () => {
  const { transcription, log } = make();
  await transcription.enable();
  const recording = part('audio/mpeg', 'memo.mp3');
  const video = part('video/mp4', 'talk.mp4');
  const picture = part('image/png', 'p.png');
  const done = part('audio/mpeg', 'old.mp3');
  done.transcript = { text: 'kept', model: 'm', at: '' };
  const progress = [];
  const made = await transcription.ensureParts([recording, video, picture, done, { text: 'hello' }, { inlineData: { mimeType: 'audio/wav', name: 'x' } }], { onProgress: (value) => progress.push(value.file) });
  assert.equal(made, 2);
  assert.equal(recording.transcript.text, '[0:00] words at 0\n[1:00] words at 60\n[2:00] words at 120');
  assert.equal(recording.transcript.model, 'openai/whisper-large-v3');
  assert.equal(video.transcript.at, '2026-11-02T00:00:00.000Z');
  assert.equal(picture.transcript, undefined);
  assert.equal(done.transcript.text, 'kept');
  assert.deepEqual(log.opened, ['memo.mp3', 'talk.mp4']);
  assert.equal(log.closed, 2, 'the copy in the tool is let go');
  assert.ok(progress.includes(2));
  assert.equal(await transcription.ensureParts([recording]), 0, 'made once');
});

test('a file that fails keeps no transcript and does not stop the reply; a stop ends it', async () => {
  const refusing = make({ text: () => { throw new Error('nope'); } });
  await refusing.transcription.enable();
  const failing = part('audio/mpeg', 'a.mp3');
  assert.equal(await refusing.transcription.ensureParts([failing]), 0);
  assert.equal(failing.transcript, undefined, 'tried again the next time');
  const stopped = make();
  await stopped.transcription.enable();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await stopped.transcription.ensureParts([part('audio/mpeg', 'b.mp3')], { signal: controller.signal }), 0);
});

const MODEL = (id) => JSON.parse(JSON.stringify(MODELS.find((model) => model.id === id)));

test('a model that cannot take the file is given the words in its place, one that can is given the file, and the label of the file stays in front', () => {
  const recording = { inlineData: { mimeType: 'audio/mpeg', name: 'memo.mp3', data: 'AAAA', attachmentLabel: 'File 1 of 1 in this message: memo.mp3' }, transcript: { text: '[0:00] hello', model: 'openai/whisper-large-v3' } };
  const picture = { inlineData: { mimeType: 'image/png', name: 'p.png', data: 'AAAA' } };
  assert.equal(hasTranscript(recording), true);
  assert.equal(hasTranscript(picture), false);
  const blind = MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash');
  const out = withTranscriptText([{ text: 'Summarise' }, recording, picture], blind, (item) => `[${item.inlineData.attachmentLabel}]`);
  assert.equal(out[0].text, 'Summarise');
  assert.match(out[1].text, /^\[File 1 of 1 in this message: memo\.mp3\]\nTranscript of what is said in this recording, written by a speech to text model \(openai\/whisper-large-v3\)/);
  assert.match(out[1].text, /\[0:00\] hello$/);
  assert.equal(out[2], picture);
  const hearing = MODEL('gemini-3.8-flash');
  assert.equal(withTranscriptText([recording], hearing)[0], recording, 'a model that takes the recording itself is given the recording');
  const nothing = [{ text: 'x' }, picture];
  assert.equal(withTranscriptText(nothing, blind), nothing, 'the same list when there is nothing to replace');
  const long = { inlineData: { mimeType: 'video/mp4', name: 'v.mp4', data: 'AAAA' }, transcript: { text: 'w'.repeat(TRANSCRIPT_IN_REQUEST_CHARS + 50), model: 'm' } };
  assert.match(transcriptTextPart(long).text, /The transcript goes on; it was cut here\.\]$/);
  assert.match(transcriptTextPart(long).text, /Only the words are given/);
});

test('a reply the server makes is told the way and the key for that reply; the browser\'s Whisper is the server\'s Whisper there (no key), and off is nothing', async () => {
  const withKey = make({ keys: { openrouter: 'or-key', openai: 'sk' } });
  assert.equal(withKey.transcription.serverAccess(), null, 'off');
  await withKey.transcription.enable('openai');
  assert.deepEqual(withKey.transcription.serverAccess(), { provider: 'openai', key: 'sk' });
  await withKey.transcription.setProvider('browser');
  assert.deepEqual(withKey.transcription.serverAccess(), { provider: 'whisper' });
  const noKey = make({ keys: {} });
  await noKey.transcription.enable();
  assert.deepEqual(noKey.transcription.serverAccess(), { provider: 'whisper' }, 'no key at all: Whisper');
});
