// Speech to text for the recordings and the videos a person attaches (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): a short piece of sound (16 kHz mono WAV, a minute) goes
// to the speech model of a provider with the person's own key, and the words come back. Four ways, all with the same shape `transcribe({ mimeType, data (Uint8Array) }, { signal, language }) -> text`:
// OpenRouter (Whisper large v3 by default), OpenAI itself (whisper-1), Gemini (a prompt with the sound), and Whisper run in this browser (nothing leaves the device). Page only: the fetch and the
// pipeline of the browser are given from outside, so the tests need neither.

export const STT_PROVIDERS = Object.freeze({
  openrouter: Object.freeze({ model: 'openai/whisper-large-v3', keyProvider: 'openrouter', label: 'OpenRouter' }),
  openai: Object.freeze({ model: 'whisper-1', keyProvider: 'openai', label: 'OpenAI' }),
  gemini: Object.freeze({ model: 'gemini-3.5-flash-lite', keyProvider: 'gemini', label: 'Gemini' }),
  browser: Object.freeze({ model: 'onnx-community/whisper-base', keyProvider: '', label: 'Whisper (this browser)' })
});

/** The order a provider is picked in when the person did not choose: the ones with a key first, the browser last (it needs no key). */
export const STT_ORDER = Object.freeze(['openrouter', 'openai', 'gemini', 'browser']);

/** The provider to use: the one the person chose when it can be used (it has a key, or it is the browser), else the first of STT_ORDER that can; '' when none. */
export function pickSttProvider({ chosen = '', hasKey = () => false, browserCan = true } = {}) {
  const usable = (name) => STT_PROVIDERS[name] && (name === 'browser' ? browserCan : hasKey(STT_PROVIDERS[name].keyProvider));
  if (usable(chosen)) return chosen;
  return STT_ORDER.find(usable) || '';
}

const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

async function failure(response, label) {
  let detail = '';
  try { detail = String((await response.text()) || '').slice(0, 120); } catch { /* The status is enough. */ }
  const error = new Error(`${label} transcription failed (${response?.status || 'unknown'})${detail ? `: ${detail}` : ''}`);
  error.status = response?.status || 0;
  return error;
}

const formatOf = (mimeType) => (/wav/i.test(mimeType) ? 'wav' : /mpeg|mp3/i.test(mimeType) ? 'mp3' : /flac/i.test(mimeType) ? 'flac' : /ogg/i.test(mimeType) ? 'ogg' : 'wav');

/**
 * `provider`: 'openrouter' | 'openai' | 'gemini' | 'browser'. `getApiKey()` gives the key of the provider (not for the browser). `model` replaces the default. For the browser, `runWhisper({ mimeType, data }, { signal })`
 * resolves the text (whisper-browser.js). Throws when there is no key or the provider refuses (the error has `status`).
 */
export function createTranscriber({ provider, getApiKey = () => '', model = '', fetchImpl = (...args) => globalThis.fetch(...args), runWhisper = null }) {
  const spec = STT_PROVIDERS[provider];
  if (!spec) throw new Error(`There is no speech to text provider "${provider}".`);
  const key = () => {
    const value = String(getApiKey() || '').trim();
    if (!value) throw new Error(`A ${spec.label} key is needed for speech to text.`);
    return value;
  };
  const used = model || spec.model;
  // OpenRouter's route is JSON with the sound in `input_audio`; a route that wants the form of OpenAI's (a file in multipart) is tried after a refusal, and the way that worked is kept.
  let openRouterForm = false;

  async function openRouter({ mimeType, data }, { signal, language }) {
    const headers = { Authorization: `Bearer ${key()}` };
    const url = 'https://openrouter.ai/api/v1/audio/transcriptions';
    const asJson = () => fetchImpl(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: used, input_audio: { data: toBase64(data), format: formatOf(mimeType) }, ...(language ? { language } : {}) }), signal });
    const asForm = () => {
      const form = new FormData();
      form.append('model', used);
      form.append('file', new Blob([data], { type: mimeType }), `audio.${formatOf(mimeType)}`);
      if (language) form.append('language', language);
      return fetchImpl(url, { method: 'POST', headers, body: form, signal });
    };
    let response = await (openRouterForm ? asForm() : asJson());
    if (!response?.ok && [400, 415, 422].includes(response?.status)) {
      const other = await (openRouterForm ? asJson() : asForm());
      if (other?.ok) { openRouterForm = !openRouterForm; response = other; }
    }
    if (!response?.ok) throw await failure(response, 'OpenRouter');
    return clean((await response.json())?.text);
  }

  async function openAi({ mimeType, data }, { signal, language }) {
    const form = new FormData();
    form.append('model', used);
    form.append('file', new Blob([data], { type: mimeType }), `audio.${formatOf(mimeType)}`);
    form.append('response_format', 'json');
    if (language) form.append('language', language);
    const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key()}` }, body: form, signal });
    if (!response?.ok) throw await failure(response, 'OpenAI');
    return clean((await response.json())?.text);
  }

  async function gemini({ mimeType, data }, { signal }) {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${used}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Transcribe the speech in this audio word for word, in the language spoken. Give only the words, with no comment. If there is no speech, give nothing.' }, { inline_data: { mime_type: mimeType, data: toBase64(data) } }] }] }),
      signal
    });
    if (!response?.ok) throw await failure(response, 'Gemini');
    const parts = (await response.json())?.candidates?.[0]?.content?.parts;
    return clean((Array.isArray(parts) ? parts : []).map((part) => part?.text || '').join(' '));
  }

  return {
    provider,
    model: used,
    async transcribe(audio, { signal, language = '' } = {}) {
      if (provider === 'openrouter') return openRouter(audio, { signal, language });
      if (provider === 'openai') return openAi(audio, { signal, language });
      if (provider === 'gemini') return gemini(audio, { signal });
      if (typeof runWhisper !== 'function') throw new Error('Whisper in this browser is not available.');
      return clean(await runWhisper(audio, { signal, language }));
    }
  };
}
