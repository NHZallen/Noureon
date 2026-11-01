import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { transcribeServerParts } from '../../server/transcribe-parts.js';
import { createServerWhisper } from '../../server/whisper-runner.js';
import { MODELS } from '../../src/app/runtime/shell/model-registry.js';

// Speech to text on the server, so that a reply goes on when the page is closed (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3).

const has = spawnSync('ffmpeg', ['-version']).status === 0;
const replyModel = MODELS.find((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4.1-flash');
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });

const sound = (seconds) => {
  const folder = mkdtempSync(join(tmpdir(), 'noureon-stt-test-'));
  const file = join(folder, 'memo.wav');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, file]).status, 0);
  const bytes = readFileSync(file);
  rmSync(folder, { recursive: true, force: true });
  return { mimeType: 'audio/wav', name: 'memo.wav', data: bytes.toString('base64') };
};

const specFor = ({ parts, transcription, secrets = {}, media }) => ({
  protocol: PROTOCOL_VERSION, clientVersion: '19.1.0', conversationId: '123e4567-e89b-12d3-a456-426614174000', assistantMessageId: '223e4567-e89b-12d3-a456-426614174001', sequence: 1,
  model: { provider: 'nvidia', id: replyModel.apiId || replyModel.id, info: replyModel },
  request: { history: [], currentMessage: { parts }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', searchDepth: 'basic', advanced: false, ...(transcription ? { transcription } : {}), ...(media ? { projectFiles: { entries: [], media, canView: true } } : {}) },
  documents: { linkedPages: false },
  secrets: { providerKey: 'sk-provider-secret-value', ...secrets }
});

test('the request may ask the server for speech to text: which way, and the key of the provider for this reply (none for Whisper); anything else is refused', () => {
  const parts = [{ text: 'hi' }];
  assert.equal(validateRunSpec(specFor({ parts, transcription: { provider: 'openrouter' }, secrets: { sttKey: 'or-key' } })).ok, true);
  assert.equal(validateRunSpec(specFor({ parts, transcription: { provider: 'whisper' } })).ok, true);
  const ok = validateRunSpec(specFor({ parts, transcription: { provider: 'openai' }, secrets: { sttKey: 'sk-openai' } }));
  assert.deepEqual(ok.spec.tools.transcription, { provider: 'openai' });
  assert.equal(ok.spec.secrets.sttKey, 'sk-openai');
  assert.deepEqual(validateRunSpec(specFor({ parts, transcription: { provider: 'whisper', model: 'base', language: 'ja' } })).spec.tools.transcription, { provider: 'whisper', model: 'base', language: 'ja' }, 'the language spoken is kept');
  assert.equal(validateRunSpec(specFor({ parts, transcription: { provider: 'whisper', language: 'klingon' } })).ok, false, 'a language that is not listed is refused');
  for (const bad of [specFor({ parts, transcription: { provider: 'openrouter' } }), specFor({ parts, transcription: { provider: 'nobody' }, secrets: { sttKey: 'k' } }), specFor({ parts, transcription: 'whisper' }), specFor({ parts, secrets: { sttKey: 'k' } }), specFor({ parts, transcription: { provider: 'whisper' }, secrets: { sttKey: 'k' } })]) {
    assert.equal(validateRunSpec(bad).ok, false);
  }
});

test('Whisper on the server loads its model on the first piece, does one piece at a time, takes the language of the screen, and lets the model go after a time of nothing', async () => {
  const log = { loads: 0, running: 0, most: 0, disposed: 0, calls: [] };
  const library = { env: {}, pipeline: async () => { log.loads += 1; return Object.assign(async (samples, options) => { log.running += 1; log.most = Math.max(log.most, log.running); await new Promise((resolve) => setTimeout(resolve, 5)); log.running -= 1; log.calls.push([samples.length, options.language]); return { text: ' words ' }; }, { dispose: async () => { log.disposed += 1; } }); } };
  const timers = [];
  const wav = new Uint8Array([...Buffer.from('RIFF')].concat([40, 0, 0, 0], [...Buffer.from('WAVE')], [...Buffer.from('fmt ')], [16, 0, 0, 0, 1, 0, 1, 0, 128, 62, 0, 0, 0, 125, 0, 0, 2, 0, 16, 0], [...Buffer.from('data')], [4, 0, 0, 0, 0, 64, 0, 192]));
  const run = createServerWhisper({ loadLibrary: async () => library, cacheDir: '/cache', setTimer: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; }, clearTimer() {} });
  assert.equal(log.loads, 0);
  const [one, two] = await Promise.all([run({ data: wav }, { language: 'zh-TW' }), run({ data: wav }, {})]);
  assert.deepEqual([one, two], [' words ', ' words ']);
  assert.equal(log.loads, 1);
  assert.equal(log.most, 1, 'one piece at a time');
  assert.deepEqual(log.calls, [[2, 'chinese'], [2, undefined]]);
  assert.equal(library.env.cacheDir, '/cache');
  timers.at(-1).fn();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(log.disposed, 1, 'the model is let go when idle');
  await run({ data: wav });
  assert.equal(log.loads, 2, 'and loaded again when needed');
});

test('a recording without a transcript gets one from the provider with the key of this reply, a minute at a time; a part that has one, a picture and a request with no setting are left as they were', { skip: !has }, async () => {
  const recording = sound(130);
  const parts = [{ text: 'hi' }, { inlineData: recording }, { inlineData: { mimeType: 'image/png', name: 'p.png', data: 'AAAA' } }];
  const seen = [];
  const fetchImpl = async (url, options) => { const body = JSON.parse(options.body); seen.push([String(url), options.headers.Authorization, body.model]); return Response.json({ text: `piece ${seen.length}` }); };
  const out = await transcribeServerParts({ parts, spec: { tools: { transcription: { provider: 'openrouter' } } }, key: 'or-key', fetchImpl });
  assert.equal(seen.length, 3, 'a piece for each minute');
  assert.ok(seen.every(([url, auth, model]) => url === 'https://openrouter.ai/api/v1/audio/transcriptions' && auth === 'Bearer or-key' && model === 'openai/whisper-large-v3'));
  assert.match(out[1].transcript.text, /^\[0:00\] piece \d\n\[1:00\] piece \d\n\[2:00\] piece \d$/);
  assert.equal(out[1].transcript.model, 'openai/whisper-large-v3');
  assert.equal(out[0], parts[0]);
  assert.equal(out[2], parts[2]);
  assert.equal(parts[1].transcript, undefined, 'the parts of the request are not changed');
  assert.equal(await transcribeServerParts({ parts, spec: { tools: {} }, key: '', fetchImpl }), parts);
  const again = await transcribeServerParts({ parts: out, spec: { tools: { transcription: { provider: 'openrouter' } } }, key: 'k', fetchImpl });
  assert.equal(again, out, 'a transcript that is there is not made again');
});

test('Whisper on the server is used for the way "whisper", with the language of the screen, and a video the model looks at gets its transcript as a text part from the copy in the cloud', { skip: !has }, async () => {
  const asked = [];
  const runner = async (audio, options) => { asked.push([audio.data.length > 0, options.language]); return 'spoken words'; };
  const recording = sound(5);
  const parts = [{ inlineData: recording }];
  const media = [{ id: 'att-1', name: 'talk.wav', kind: 'video', fileHash: 'a'.repeat(64), mimeType: 'video/mp4', transcribe: true }];
  const loaded = [];
  const out = await transcribeServerParts({ parts, spec: { tools: { transcription: { provider: 'whisper' }, projectFiles: { entries: [], media } } }, language: 'fr', createRunner: () => runner, loadFile: async (entry) => { loaded.push(entry.fileHash); return Buffer.from(recording.data, 'base64'); } });
  assert.equal(out[0].transcript.text, '[0:00] spoken words');
  assert.deepEqual(asked, [[true, 'fr'], [true, 'fr']]);
  assert.deepEqual(loaded, ['a'.repeat(64)]);
  assert.match(out.at(-1).text, /^\[Transcript of the video: talk\.wav\]\nTranscript of what is said in this video/);
  assert.match(out.at(-1).text, /\[0:00\] spoken words$/);
});

test('a reply the server makes puts the speech of a recording into text for a model that cannot listen, tells the pages the step, and the key of the provider is not in what is logged', { skip: !has }, async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const address = String(url);
    requests.push({ url: address, body: String(options?.body || '') });
    if (address.includes('/audio/transcriptions')) return Response.json({ text: 'the meeting starts at nine' });
    return streamResponse(sse(content('Nine.')));
  };
  const live = [];
  const spec = validateRunSpec(specFor({ parts: [{ text: 'When does it start?' }, { inlineData: sound(10) }], transcription: { provider: 'openrouter' }, secrets: { sttKey: 'or-stt-secret' } }));
  assert.equal(spec.ok, true, JSON.stringify(spec.errors));
  const result = await executeReply({ spec: spec.spec, secrets: spec.spec.secrets, fetchImpl, onLive: (event) => live.push(event) });
  assert.equal(result.status, 'done');
  const chat = requests.find((request) => request.url.includes('nvidia.com'));
  assert.match(chat.body, /Transcript of what is said in this recording/);
  assert.match(chat.body, /\[0:00\] the meeting starts at nine/);
  assert.ok(live.some((event) => event.dp === 'transcribing'));
  assert.doesNotMatch(JSON.stringify(live), /or-stt-secret/);
});
