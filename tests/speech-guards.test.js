import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseLoops, isLooping, isSilent, isSilentWav, runGuardedWhisper, RETRY_OPTIONS } from '../src/app/runtime/transcription/speech-guards.js';
import { transcribeMedia } from '../src/app/runtime/transcription/transcribe-file.js';
import { normalizeSpeech } from '../src/data/speech-settings.js';

const wav = (samples) => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  [...'RIFF'].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint32(4, 36 + samples.length * 2, true);
  [...'WAVEfmt '].forEach((c, i) => view.setUint8(8 + i, c.charCodeAt(0)));
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  [...'data'].forEach((c, i) => view.setUint8(36 + i, c.charCodeAt(0)));
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(value * 32767), true));
  return bytes;
};
const tone = (length, volume) => Float32Array.from({ length }, (_, i) => Math.sin(i / 5) * volume);

test('silence and very quiet noise are silent; speech is not', () => {
  assert.equal(isSilent(new Float32Array(16000)), true);
  assert.equal(isSilent(tone(16000, 0.002)), true);
  assert.equal(isSilent(tone(16000, 0.2)), false);
  assert.equal(isSilent(new Float32Array(0)), true);
  assert.equal(isSilentWav(wav(new Float32Array(1600))), true);
  assert.equal(isSilentWav(wav(tone(1600, 0.3))), false);
  assert.equal(isSilentWav(new Uint8Array([1, 2, 3])), false, 'a file that is not a WAV is sent as it is');
});

test('a phrase said many times in a row is a loop; a sentence said twice is not', () => {
  const loop = '好的。' + '把鑊子放在鑊子上，'.repeat(12);
  assert.equal(isLooping(loop), true);
  assert.equal(isLooping('I will go. I will go. Then we eat.'), false);
  assert.equal(isLooping('no no no no'), false);
  assert.equal(isLooping('ha '.repeat(10)), true);
  assert.equal(isLooping('the cat sat on the mat. '.repeat(5)), true);
});

test('collapseLoops keeps one saying and the rest of the text', () => {
  const out = collapseLoops(`Start here. ${'again and again, '.repeat(9)}Then the end.`);
  assert.match(out, /^Start here\. again and again/);
  assert.match(out, /Then the end\.$/);
  assert.equal((out.match(/again and again/g) || []).length, 1);
  assert.equal(collapseLoops('Plain text, said once.'), 'Plain text, said once.');
  assert.equal(collapseLoops('放放放放放放放放放放放放放放'), '放');
});

test('Whisper is not run on silence, and a loop is run again with a penalty, then cut down', async () => {
  const calls = [];
  const pipe = async (samples, options) => { calls.push(options); return { text: options.repetition_penalty ? 'ok ' + 'la '.repeat(10) : 'ha '.repeat(10) }; };
  assert.equal(await runGuardedWhisper(pipe, new Float32Array(16000), {}), '');
  assert.equal(calls.length, 0);
  const text = await runGuardedWhisper(pipe, tone(16000, 0.3), { task: 'transcribe' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].repetition_penalty, RETRY_OPTIONS.repetition_penalty);
  assert.equal(calls[1].task, 'transcribe');
  assert.equal(text, 'ok la');
  const clean = async () => ({ text: 'hello there' });
  assert.equal(await runGuardedWhisper(clean, tone(16000, 0.3)), 'hello there');
});

test('a file is transcribed without its silent pieces, and a loop of a provider is cut down', async () => {
  const sent = [];
  const media = {
    probe: async () => ({ hasAudio: true, duration: 180 }),
    audioWindow: async (start) => ({ mimeType: 'audio/wav', data: wav(start === 60 ? new Float32Array(16000) : tone(16000, 0.3)) })
  };
  const transcriber = { model: 'm', transcribe: async (audio, options) => { sent.push(options.language); return 'x '.repeat(20) + 'end'; } };
  const out = await transcribeMedia({ media, transcriber, duration: 180, language: 'zh' });
  assert.equal(sent.length, 2, 'the silent minute is not sent');
  assert.deepEqual([...new Set(sent)], ['zh']);
  assert.equal(out.text, '[0:00] x end\n[2:00] x end');
});

test('the language of the settings is kept only when it is one that can be told to Whisper', () => {
  assert.equal(normalizeSpeech({}).language, '');
  assert.equal(normalizeSpeech({ language: 'ja' }).language, 'ja');
  assert.equal(normalizeSpeech({ language: 'klingon' }).language, '');
});
