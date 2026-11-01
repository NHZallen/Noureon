import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranscriber, pickSttProvider, STT_PROVIDERS } from '../src/app/runtime/transcription/stt-clients.js';
import { pieceStarts, transcribeMedia, transcriptLines, TRANSCRIPT } from '../src/app/runtime/transcription/transcribe-file.js';

// Speech to text (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3), with the providers and the cutting tool replaced by fakes.

const AUDIO = { mimeType: 'audio/wav', data: new Uint8Array([82, 73, 70, 70, 1, 2, 3]) };

test('the provider is the one the person chose when it can be used, else the first that has a key, else the browser', () => {
  const keys = (names) => (name) => names.includes(name);
  assert.equal(pickSttProvider({ chosen: 'openai', hasKey: keys(['openai', 'openrouter']) }), 'openai');
  assert.equal(pickSttProvider({ chosen: 'openai', hasKey: keys(['openrouter']) }), 'openrouter', 'no key for the chosen one');
  assert.equal(pickSttProvider({ hasKey: keys(['gemini']) }), 'gemini');
  assert.equal(pickSttProvider({ hasKey: keys([]) }), 'browser', 'no key at all: the browser');
  assert.equal(pickSttProvider({ hasKey: keys([]), browserCan: false }), '');
  assert.equal(STT_PROVIDERS.openrouter.model, 'openai/whisper-large-v3');
  assert.equal(STT_PROVIDERS.openai.model, 'whisper-1');
});

test('OpenRouter takes the sound as JSON; a route that wants the form of OpenAI is tried after a refusal, and the way that worked is kept', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const isForm = options.body instanceof FormData;
    calls.push({ url, isForm, auth: options.headers.Authorization, body: isForm ? Object.fromEntries([...options.body.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : 'file'])) : JSON.parse(options.body) });
    return isForm ? Response.json({ text: ' hello  world ' }) : new Response('{"error":"bad"}', { status: 400 });
  };
  const stt = createTranscriber({ provider: 'openrouter', getApiKey: () => 'or-key', fetchImpl });
  assert.equal(await stt.transcribe(AUDIO, { language: 'zh' }), 'hello world');
  assert.deepEqual(calls.map((call) => call.isForm), [false, true]);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/audio/transcriptions');
  assert.equal(calls[0].auth, 'Bearer or-key');
  assert.equal(calls[0].body.model, 'openai/whisper-large-v3');
  assert.equal(calls[0].body.input_audio.format, 'wav');
  assert.equal(calls[0].body.language, 'zh');
  assert.deepEqual(calls[1].body, { model: 'openai/whisper-large-v3', file: 'file', language: 'zh' });
  await stt.transcribe(AUDIO);
  assert.deepEqual(calls.slice(2).map((call) => call.isForm), [true], 'the form that worked is used first now');
  const refused = createTranscriber({ provider: 'openrouter', getApiKey: () => 'k', fetchImpl: async () => new Response('no', { status: 401 }) });
  await assert.rejects(() => refused.transcribe(AUDIO), (error) => error.status === 401);
  await assert.rejects(() => createTranscriber({ provider: 'openrouter', getApiKey: () => '', fetchImpl }).transcribe(AUDIO), /key is needed/);
});

test('OpenAI is called with a file and whisper-1, Gemini with a prompt and the sound, and the browser with its own pipeline', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, body: options.body });
    if (url.includes('openai.com')) return Response.json({ text: 'from openai' });
    return Response.json({ candidates: [{ content: { parts: [{ text: 'from ' }, { text: 'gemini' }] } }] });
  };
  assert.equal(await createTranscriber({ provider: 'openai', getApiKey: () => 'sk', fetchImpl }).transcribe(AUDIO), 'from openai');
  assert.equal(seen[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(seen[0].body.get('model'), 'whisper-1');
  assert.equal(await createTranscriber({ provider: 'gemini', getApiKey: () => 'g', fetchImpl }).transcribe(AUDIO), 'from gemini');
  assert.match(seen[1].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(JSON.parse(seen[1].body).contents[0].parts[1].inline_data.mime_type, 'audio/wav');
  const browser = createTranscriber({ provider: 'browser', runWhisper: async (audio) => ` words of ${audio.data.length} bytes ` });
  assert.equal(await browser.transcribe(AUDIO), 'words of 7 bytes');
  await assert.rejects(() => createTranscriber({ provider: 'browser' }).transcribe(AUDIO), /not available/);
});

test('a file is cut into pieces of a minute (at most an hour), and the transcript is lines with the time each piece starts at', () => {
  assert.deepEqual(pieceStarts(150), [0, 60, 120]);
  assert.equal(pieceStarts(10 * 3600).length, 60, 'an hour at most');
  assert.deepEqual(pieceStarts(0), []);
  assert.equal(transcriptLines([{ start: 0, text: 'first' }, { start: 60, text: '' }, { start: 125, text: 'third' }]), '[0:00] first\n[2:05] third');
});

const fakeMedia = ({ hasAudio = true, duration = 190, texts = {} } = {}) => {
  const cuts = [];
  return { cuts, media: { probe: async () => ({ duration, hasAudio, hasVideo: false }), audioWindow: async (start) => { cuts.push(start); return { mimeType: 'audio/wav', data: new Uint8Array([start]) }; } }, transcriber: { model: 'm', transcribe: async (audio) => { const start = audio.data[0]; if (texts[start] instanceof Error) throw texts[start]; return texts[start] ?? `words at ${start}`; } } };
};

test('a file is transcribed piece by piece with the progress told, a file with no sound gives nothing, and a piece that fails is left out', async () => {
  const world = fakeMedia({ duration: 190 });
  const progress = [];
  const result = await transcribeMedia({ ...world, onProgress: (value) => progress.push(value.done) });
  assert.equal(result.text, '[0:00] words at 0\n[1:00] words at 60\n[2:00] words at 120\n[3:00] words at 180');
  assert.equal(result.model, 'm');
  assert.deepEqual(progress.sort(), [1, 2, 3, 4]);
  assert.deepEqual((await transcribeMedia(fakeMedia({ hasAudio: false }))).text, '');
  const flaky = await transcribeMedia(fakeMedia({ duration: 130, texts: { 60: new Error('busy') } }));
  assert.equal(flaky.text, '[0:00] words at 0\n[2:00] words at 120');
  assert.equal(flaky.failed, 1);
  await assert.rejects(() => transcribeMedia(fakeMedia({ duration: 130, texts: { 0: new Error('a'), 60: new Error('b'), 120: new Error('c') } })), /a|b|c/);
  const refused = Object.assign(new Error('no key'), { status: 401 });
  await assert.rejects(() => transcribeMedia(fakeMedia({ duration: 600, texts: { 0: refused, 60: refused, 120: refused } })), /no key/);
  assert.equal(TRANSCRIPT.parallel, 3);
});

// ---------- Whisper in this browser

import { samplesOfWav, whisperLanguageOf } from '../src/app/runtime/transcription/whisper-audio.js';
import { createWhisperRunner } from '../src/app/runtime/transcription/whisper-browser.js';

const wav = (samples, { extra = false, lie = false } = {}) => {
  const data = new Uint8Array(samples.length * 2);
  samples.forEach((value, index) => new DataView(data.buffer).setInt16(index * 2, value, true));
  const header = new Uint8Array(44 + (extra ? 12 : 0));
  const view = new DataView(header.buffer);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + data.length, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  let at = 36;
  if (extra) { text(at, 'LIST'); view.setUint32(at + 4, 4, true); text(at + 8, 'INFO'); at += 12; }
  text(at, 'data'); view.setUint32(at + 4, lie ? 0xffffffff : data.length, true);
  return new Uint8Array([...header, ...data]);
};

test('the samples of a WAV are read as numbers between -1 and 1, past other chunks, and a length that is not told truly is cut to what is there', () => {
  const read = samplesOfWav(wav([0, 16384, -32768, 32767]));
  assert.equal(read.rate, 16000);
  assert.deepEqual([...read.samples].map((value) => Math.round(value * 100) / 100), [0, 0.5, -1, 1]);
  assert.equal(samplesOfWav(wav([1, 2, 3], { extra: true })).samples.length, 3);
  assert.equal(samplesOfWav(wav([1, 2, 3], { lie: true })).samples.length, 3);
  assert.throws(() => samplesOfWav(new Uint8Array(60)), /Not a WAV/);
  assert.equal(whisperLanguageOf('zh-TW'), 'chinese');
  assert.equal(whisperLanguageOf('fr'), 'french');
  assert.equal(whisperLanguageOf('de'), '');
});

test('the browser loads the library and the model once, on the first piece, and gives the words of each piece with the language of the screen', async () => {
  const log = { loads: 0, calls: [], env: { backends: { onnx: { wasm: {} } } } };
  const library = { env: log.env, pipeline: async (task, model, options) => { log.loads += 1; log.task = [task, model, options.dtype, options.device]; return async (samples, options2) => { log.calls.push([samples.length, options2.language, options2.chunk_length_s]); return { text: ' hello ' }; }; } };
  const run = createWhisperRunner({ loadLibrary: async () => library, loadAssets: async () => ({ ortMjs: '/ort.mjs', ortWasm: '/ort.wasm' }) });
  assert.equal(log.loads, 0, 'nothing is loaded before the first piece');
  assert.equal(await run({ data: wav([1, 2, 3, 4]) }, { language: 'zh-TW' }), ' hello ');
  await run({ data: wav([1, 2]) }, {});
  assert.equal(log.loads, 1);
  assert.deepEqual(log.task, ['automatic-speech-recognition', 'onnx-community/whisper-base', 'q8', 'wasm']);
  assert.deepEqual(log.env.backends.onnx.wasm.wasmPaths, { mjs: '/ort.mjs', wasm: '/ort.wasm' });
  assert.equal(log.env.backends.onnx.wasm.numThreads, 1);
  assert.deepEqual(log.calls, [[4, 'chinese', 30], [2, undefined, 30]]);
});

test('a provider that is busy is asked again after a short wait (twice at most); a refusal of the key is not, and a stop ends the waiting', async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  let calls = 0;
  const busy = async () => { calls += 1; return calls < 3 ? new Response('{"error":{"message":"retry shortly"}}', { status: 429 }) : Response.json({ text: 'ok' }); };
  assert.equal(await createTranscriber({ provider: 'openrouter', getApiKey: () => 'k', fetchImpl: busy, sleep }).transcribe(AUDIO), 'ok');
  assert.deepEqual(waits, [1500, 4000]);
  calls = 0;
  waits.length = 0;
  const always = createTranscriber({ provider: 'openai', getApiKey: () => 'k', fetchImpl: async () => { calls += 1; return new Response('x', { status: 503 }); }, sleep });
  await assert.rejects(() => always.transcribe(AUDIO), (error) => error.status === 503);
  assert.equal(calls, 3);
  calls = 0;
  const refused = createTranscriber({ provider: 'openai', getApiKey: () => 'k', fetchImpl: async () => { calls += 1; return new Response('x', { status: 401 }); }, sleep });
  await assert.rejects(() => refused.transcribe(AUDIO), (error) => error.status === 401);
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  calls = 0;
  await assert.rejects(() => createTranscriber({ provider: 'openai', getApiKey: () => 'k', fetchImpl: async () => { calls += 1; return new Response('x', { status: 429 }); }, sleep }).transcribe(AUDIO, { signal: controller.signal }));
  assert.equal(calls, 1, 'no more tries after a stop');
});
