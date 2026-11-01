// Tries the speech to text routes with a real key (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3), the way the other probes in this folder do:
//   OPENROUTER_API_KEY=... node scripts/stt-probe.mjs speech.wav          (a short 16 kHz mono WAV with speech)
//   OPENAI_API_KEY=... GEMINI_API_KEY=... node scripts/stt-probe.mjs speech.wav
// It prints what each provider answered and the words, so the form of OpenRouter's request (JSON with `input_audio`, or a multipart file) and the model ids can be checked.

import { readFileSync } from 'node:fs';
import { createTranscriber } from '../src/app/runtime/transcription/stt-clients.js';

const file = process.argv[2];
if (!file) { console.error('Give a WAV file with speech.'); process.exit(1); }
const audio = { mimeType: 'audio/wav', data: new Uint8Array(readFileSync(file)) };
const tries = [
  ['openrouter', process.env.OPENROUTER_API_KEY, process.env.STT_OPENROUTER_MODEL || ''],
  ['openai', process.env.OPENAI_API_KEY, ''],
  ['gemini', process.env.GEMINI_API_KEY, '']
];
for (const [provider, key, model] of tries) {
  if (!key) { console.log(`${provider}: no key, skipped`); continue; }
  const transcriber = createTranscriber({ provider, getApiKey: () => key, model });
  const began = Date.now();
  try {
    console.log(`${provider} (${transcriber.model}): ${JSON.stringify(await transcriber.transcribe(audio))} in ${Date.now() - began} ms`);
  } catch (error) {
    console.log(`${provider} (${transcriber.model}): FAILED ${error.message}`);
  }
}
