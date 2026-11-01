// Speech to text for a reply the server makes (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3), so that it goes on when the page is closed: the recordings and videos of the message
// that have no transcript get one (`part.transcript`, which the request then puts in place of the file for a model that cannot listen: runtime/transcription/transcript-parts.js), and so do the
// videos the model looks at with the tool (`media[].transcribe`: their transcript is added to the request as a text part, since the video itself is not in it). The sound is cut with ffmpeg and
// sent, a minute at a time, with the key the page gave for this reply (`secrets.sttKey`, never kept), or run through Whisper here. Nothing of the sound is kept. A file that fails goes without.

import { createTranscriber } from '../src/app/runtime/transcription/stt-clients.js';
import { transcribeMedia, TRANSCRIPT } from '../src/app/runtime/transcription/transcribe-file.js';
import { transcriptTextPart } from '../src/app/runtime/transcription/transcript-parts.js';
import { createServerMediaToolbox } from './ffmpeg-runner.js';
import { DEFAULT_WHISPER_SIZE, WHISPER_SIZES, whisperModelOf } from '../src/app/runtime/transcription/whisper-audio.js';
import { createServerWhisper } from './whisper-runner.js';

export const SERVER_STT_PROVIDERS = Object.freeze(['openrouter', 'openai', 'gemini', 'whisper']);
const isTimed = (mimeType) => /^(audio|video)\//i.test(String(mimeType || ''));
const needs = (part) => Boolean(part?.inlineData && isTimed(part.inlineData.mimeType) && typeof part.inlineData.data === 'string' && part.inlineData.data && !part.transcript);

let sharedWhisper = null;
const whisper = () => (sharedWhisper ||= createServerWhisper());

/**
 * `parts` of the message and `spec.tools.transcription` ({ provider }); `key` is the key of the provider for this reply. `loadFile(entry)` resolves the bytes of a video of the message that is kept in the
 * person's cloud (or null). Resolves the parts (new objects for the ones changed; the same list when nothing was done). `onPhase()` is told when the work begins.
 */
export async function transcribeServerParts({ parts, spec, key = '', signal, loadFile = async () => null, onPhase = () => {}, language = '', toolbox = createServerMediaToolbox({ signal }), createRunner = () => whisper(), fetchImpl, logger = console }) {
  const setting = spec.tools?.transcription;
  if (!setting || !SERVER_STT_PROVIDERS.includes(setting.provider)) return parts;
  const size = WHISPER_SIZES.includes(setting.model) ? setting.model : DEFAULT_WHISPER_SIZE;
  const wanted = parts.filter(needs);
  const videos = (spec.tools?.projectFiles?.media || []).filter((entry) => entry.transcribe === true && entry.kind === 'video');
  if (!wanted.length && !videos.length) return parts;
  const transcriber = setting.provider === 'whisper'
    ? createTranscriber({ provider: 'browser', model: whisperModelOf(size), runWhisper: (audio, options) => createRunner()(audio, { ...options, size }) })
    : createTranscriber({ provider: setting.provider, getApiKey: () => key, fetchImpl });
  onPhase();
  const done = async (bytes, name, mime) => {
    const media = await toolbox.open({ data: bytes, name, mime });
    if (!media) return null;
    try {
      return await transcribeMedia({ media, transcriber, language: setting.provider === 'whisper' ? language : '', signal });
    } finally {
      await media.close();
    }
  };
  const made = new Map();
  for (const part of wanted) {
    if (signal?.aborted) break;
    try {
      const found = await done(Uint8Array.from(Buffer.from(part.inlineData.data, 'base64')), part.inlineData.name || '', part.inlineData.mimeType);
      if (found) made.set(part, { text: found.text || '', model: found.model || '', at: new Date().toISOString() });
    } catch (error) {
      if (signal?.aborted) break;
      logger.warn?.('A recording or a video could not be turned into text on the server; it goes without.', error?.message || error);
    }
  }
  const extra = [];
  for (const entry of videos) {
    if (signal?.aborted) break;
    try {
      const bytes = await loadFile(entry);
      if (!bytes) continue;
      const found = await done(new Uint8Array(bytes), entry.name, entry.mimeType || 'video/mp4');
      if (found?.text) extra.push(transcriptTextPart({ inlineData: { mimeType: entry.mimeType || 'video/mp4', name: entry.name }, transcript: { text: found.text, model: found.model } }, `[Transcript of the video: ${entry.name}]`));
    } catch (error) {
      if (signal?.aborted) break;
      logger.warn?.('A video could not be turned into text on the server; it goes without.', error?.message || error);
    }
  }
  if (!made.size && !extra.length) return parts;
  return [...parts.map((part) => (made.has(part) ? { ...part, transcript: made.get(part) } : part)), ...extra];
}

export { TRANSCRIPT };
