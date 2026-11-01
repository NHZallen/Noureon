// Speech to text as the settings keep it (`speechToText` of the config, in the Models settings; docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): whether it is on (and when the person
// agreed), the way it is done ('openrouter', 'openai', 'gemini' or 'browser': Whisper, run in this browser and, for a reply the server makes, on the server) and the size of Whisper. Pure: no window.

import { DEFAULT_WHISPER_SIZE, WHISPER_SIZES } from '../app/runtime/transcription/whisper-audio.js';

export const SPEECH_PROVIDERS = Object.freeze(['openrouter', 'openai', 'gemini', 'browser']);

/** The settings as they are used, from whatever was saved: on only with the time of the agreement. */
export function normalizeSpeech(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const consentAt = typeof raw.consentAt === 'string' && !Number.isNaN(Date.parse(raw.consentAt)) ? raw.consentAt : null;
  return {
    enabled: raw.enabled === true && Boolean(consentAt),
    consentAt,
    provider: SPEECH_PROVIDERS.includes(raw.provider) ? raw.provider : '',
    whisperSize: WHISPER_SIZES.includes(raw.whisperSize) ? raw.whisperSize : DEFAULT_WHISPER_SIZE
  };
}
