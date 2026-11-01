// Speech to text on this page (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): off until the person reads what will be sent and agrees (the sound goes, in pieces of a minute,
// to the speech model of a provider they have a key for, or stays in this browser with Whisper). Once on, a recording or a video attached to a message gets its transcript before the reply is made;
// the transcript is kept in the part of the message (`part.transcript`: { text, model, at }), so it is synced with the conversation and is never made twice. Nothing here may break a reply:
// a file that cannot be turned into text is left as it was. Page only.

import { normalizeSpeech } from '../../../data/speech-settings.js';
import { createTranscriber, pickSttProvider, STT_PROVIDERS } from './stt-clients.js';
import { whisperModelOf } from './whisper-audio.js';
import { transcribeMedia } from './transcribe-file.js';

const isTimed = (mimeType) => /^(audio|video)\//i.test(String(mimeType || ''));
const fromBase64 = (data) => Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
/** The biggest file whose sound is turned into text (base64 characters): about 30 MB, what a project keeps. */
export const TRANSCRIBE_CHARS_MAX = 42 * 1024 * 1024;

export function createPageTranscription({
  // The settings (`config.speechToText`, data/speech-settings.js) and how they are kept: `setSettings(next)` replaces them in the config; the settings screen gives the saving (`setSaver`).
  getSettings = () => null,
  setSettings = () => {},
  getApiKeyForProvider = () => '',
  getLanguage = () => 'en',
  getToolbox = async () => (await import('../projects/ffmpeg-wasm.js')).mediaToolbox,
  createWhisper = async (options) => (await import('./whisper-browser.js')).createWhisperRunner(options),
  fetchImpl,
  now = () => new Date().toISOString(),
  logger = console
}) {
  const listeners = new Set();
  let state = { status: 'idle', done: 0, total: 0, name: '', model: '' };
  let whisper = null;
  let whisperSize = '';
  let saver = async () => {};
  const inflight = new Map();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) { try { listener(state); } catch { /* A broken listener must not stop the others. */ } }
  };

  const settings = () => normalizeSpeech(getSettings());
  const changed = new Set();
  const keep = async (next) => {
    setSettings(normalizeSpeech(next));
    await saver();
    for (const listener of [...changed]) { try { listener(); } catch { /* A broken listener must not stop the others. */ } }
  };
  const hasKey = (name) => Boolean(getApiKeyForProvider(name));
  const providerNow = () => pickSttProvider({ chosen: settings().provider, hasKey });
  const enabled = () => settings().enabled === true && Boolean(providerNow());

  const transcriberFor = (provider) => {
    if (provider === 'browser') {
      // The model is the size chosen in the settings; a runner of another size is made again.
      if (!whisper || whisperSize !== settings().whisperSize) {
        whisperSize = settings().whisperSize;
        whisper = createWhisper({ size: whisperSize, onProgress: (event) => { if (event?.status === 'progress' && event.file) set({ status: 'loading-model', name: event.file, done: Math.round(event.progress || 0), total: 100 }); } });
      }
      const runner = whisper;
      return createTranscriber({ provider, model: whisperModelOf(whisperSize), runWhisper: async (audio, options) => (await runner)(audio, options) });
    }
    return createTranscriber({ provider, getApiKey: () => getApiKeyForProvider(STT_PROVIDERS[provider].keyProvider), fetchImpl });
  };

  async function transcribePart(part, { signal, onProgress }) {
    const provider = providerNow();
    const transcriber = transcriberFor(provider);
    const media = await (await getToolbox()).open({ data: fromBase64(part.inlineData.data), name: part.inlineData.name || '', mime: part.inlineData.mimeType });
    if (!media) return { text: '', model: transcriber.model };
    try {
      return await transcribeMedia({ media, transcriber, language: settings().language || (provider === 'browser' ? getLanguage() : ''), signal, onProgress });
    } finally {
      await media.close();
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** `listener()` is called after the settings were changed (by the person). Returns the way to stop. */
    subscribeSettings(listener) {
      changed.add(listener);
      return () => changed.delete(listener);
    },
    isEnabled: enabled,
    /** The way it would be done now ('' when none can be: no key, and Whisper in this browser is not picked). */
    provider: providerNow,
    /**
     * The way a reply the server makes does it, with the key for that one reply: { provider: 'openrouter' | 'openai' | 'gemini' | 'whisper' (Whisper run by the server), key }, or null when it is off.
     * The browser's Whisper is the server's Whisper there: the sound is run through it on the server and not kept.
     */
    serverAccess() {
      const provider = providerNow();
      if (!enabled() || !provider) return null;
      const language = settings().language;
      if (provider === 'browser') return { provider: 'whisper', model: settings().whisperSize, ...(language ? { language } : {}) };
      const key = getApiKeyForProvider(STT_PROVIDERS[provider].keyProvider);
      return key ? { provider, key, ...(language ? { language } : {}) } : null;
    },
    /** The ways that can be used ([{ name, label, model, current }]): the ones the person has a key for, and Whisper in this browser. */
    providers() {
      const now = providerNow();
      return Object.keys(STT_PROVIDERS).filter((name) => name === 'browser' || hasKey(STT_PROVIDERS[name].keyProvider)).map((name) => ({ name, label: STT_PROVIDERS[name].label, model: name === 'browser' ? whisperModelOf(settings().whisperSize) : STT_PROVIDERS[name].model, current: name === now }));
    },
    /** The settings screen gives how the settings are saved (the config is saved as a whole). */
    setSaver(next) { saver = typeof next === 'function' ? next : async () => {}; },
    /** The size of Whisper chosen ('base' or 'small'). */
    whisperSize: () => settings().whisperSize,
    /** The language chosen for the recordings ('' follows the screen). */
    language: () => settings().language,
    async setLanguage(code) {
      const next = normalizeSpeech({ ...settings(), language: code });
      if (next.language !== (code || '')) return false;
      await keep({ ...settings(), language: code || '' });
      return true;
    },
    /** The person agreed: remember the time and the way. Resolves false when it cannot be turned on. */
    async enable(chosen = '') {
      const provider = pickSttProvider({ chosen, hasKey });
      if (!provider) return false;
      await keep({ ...settings(), enabled: true, consentAt: now(), provider });
      return true;
    },
    async disable() {
      await keep({ ...settings(), enabled: false, consentAt: null });
      return true;
    },
    async setProvider(name) {
      if (!STT_PROVIDERS[name] || (name !== 'browser' && !hasKey(STT_PROVIDERS[name].keyProvider))) return false;
      await keep({ ...settings(), provider: name });
      return true;
    },
    async setWhisperSize(size) {
      const next = normalizeSpeech({ ...settings(), whisperSize: size });
      if (next.whisperSize !== size) return false;
      await keep({ ...settings(), whisperSize: size });
      return true;
    },
    /** Whether a part is a recording or a video that has no transcript yet and can be turned into text. */
    needs: (part) => Boolean(part?.inlineData && isTimed(part.inlineData.mimeType) && typeof part.inlineData.data === 'string' && part.inlineData.data && part.inlineData.data.length <= TRANSCRIBE_CHARS_MAX && !part.transcript),
    /**
     * Gives each recording and video among `parts` its transcript (`part.transcript`), at most one file at a time. `onProgress({ name, done, total, file, files })` is told while it goes. Resolves the
     * number made. A file that fails keeps no transcript (it is tried again the next time); a stop ends it.
     */
    async ensureParts(parts, { signal, onProgress = () => {} } = {}) {
      if (!enabled()) return 0;
      const wanted = (Array.isArray(parts) ? parts : []).filter((part) => this.needs(part));
      let made = 0;
      for (const [index, part] of wanted.entries()) {
        if (signal?.aborted) break;
        const key = `${part.inlineData.data.length}:${part.inlineData.data.slice(0, 64)}:${part.inlineData.data.slice(-64)}`;
        const name = part.inlineData.name || '';
        try {
          if (!inflight.has(key)) {
            set({ status: 'working', done: 0, total: 0, name });
            inflight.set(key, transcribePart(part, { signal, onProgress: ({ done, total }) => { set({ status: 'working', done, total, name }); onProgress({ name, done, total, file: index + 1, files: wanted.length }); } }).finally(() => inflight.delete(key)));
          }
          const found = await inflight.get(key);
          part.transcript = { text: found.text || '', model: found.model || '', at: now() };
          made += 1;
        } catch (error) {
          if (error?.name === 'AbortError' || signal?.aborted) break;
          logger.warn?.('A recording or a video could not be turned into text; it goes without.', error?.message || error);
          set({ status: 'error', name });
        }
      }
      set({ status: 'idle', done: 0, total: 0, name: '' });
      return made;
    }
  };
}
