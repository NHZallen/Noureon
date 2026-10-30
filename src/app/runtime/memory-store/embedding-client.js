// The model that turns a text, a picture, a sound, a video or a document into a vector, for the search by meaning (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): always
// Gemini Embedding 2, called straight at Google with a Gemini key or through OpenRouter (`google/gemini-embedding-2`) with an OpenRouter key. It is the same model either way, so the vectors
// are the same kind and one index serves both (changing the key does not build it again). The page calls the provider with the person's own key, as for the replies; nothing goes through
// Noureon's server. What is sent is decided by the person's consent (page-vectors.js). The size of a vector is 768: the model can give 128 to 3072 numbers and is trained so that the first
// ones keep the meaning, so a longer answer is cut to 768 and made unit length here whatever the provider sends back.

import { toUnit } from '../memory-notes/vector-math.js';

export const EMBEDDING_DIMENSIONS = 768;
const MODEL = 'gemini-embedding-2';
const SCHEMA = 1;

export const EMBEDDING_PROVIDERS = Object.freeze({
  gemini: Object.freeze({ model: MODEL, dimensions: EMBEDDING_DIMENSIONS, keyProvider: 'gemini', label: 'Gemini' }),
  openrouter: Object.freeze({ model: `google/${MODEL}`, dimensions: EMBEDDING_DIMENSIONS, keyProvider: 'openrouter', label: 'OpenRouter' })
});

/** The kind of vectors, the same for both providers: the model, the size and the version of how texts are written for it. */
export const versionOf = (provider) => (EMBEDDING_PROVIDERS[provider] ? `${MODEL}:${EMBEDDING_DIMENSIONS}:v${SCHEMA}` : '');

/** The provider to use: the one the person chose if it has a key, else the first that has a key (Gemini first), else ''. */
export function pickEmbeddingProvider({ chosen = '', hasKey = () => false } = {}) {
  if (EMBEDDING_PROVIDERS[chosen] && hasKey(EMBEDDING_PROVIDERS[chosen].keyProvider)) return chosen;
  return Object.keys(EMBEDDING_PROVIDERS).find((name) => hasKey(EMBEDDING_PROVIDERS[name].keyProvider)) || '';
}

const asText = (kind, text) => (kind === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`);
const fit = (values) => toUnit(Array.isArray(values) ? values.slice(0, EMBEDDING_DIMENSIONS) : []);

async function failure(response, label) {
  let detail = '';
  try { detail = String((await response.text()) || '').slice(0, 120); } catch { /* The status is enough. */ }
  const error = new Error(`${label} embedding failed (${response?.status || 'unknown'})${detail ? `: ${detail}` : ''}`);
  error.status = response?.status || 0;
  return error;
}

/** How a file goes into the content of an OpenRouter embeddings request (the content blocks of its chat API). */
function openRouterBlock({ mimeType, data, kind }) {
  const url = `data:${mimeType};base64,${data}`;
  if (kind === 'image') return { type: 'image_url', image_url: { url } };
  if (kind === 'video') return { type: 'video_url', video_url: { url } };
  if (kind === 'audio') return { type: 'input_audio', input_audio: { data, format: String(mimeType).split('/')[1]?.split(';')[0] || 'wav' } };
  return { type: 'file', file: { filename: 'attachment.pdf', file_data: url } };
}

/**
 * `embed(texts, { kind: 'document' | 'query', signal })` gives one unit vector for each text; `embedMedia({ mimeType, data (base64), kind }, { signal })` gives one for a file. `getApiKey()` gives the
 * key of the provider. Throws when there is no key or the provider refuses (the error has `status`); the caller decides what to do (the search just goes on with the keywords).
 */
export function createEmbeddingClient({ provider, getApiKey = () => '', fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const spec = EMBEDDING_PROVIDERS[provider];
  if (!spec) throw new Error(`There is no embedding provider "${provider}".`);
  const key = () => {
    const value = String(getApiKey() || '').trim();
    if (!value) throw new Error(`A ${spec.label} key is needed for the search by meaning.`);
    return value;
  };

  // ---- Gemini, straight
  const geminiBase = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;
  const geminiHeaders = () => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key() });
  const geminiRequest = (parts) => ({ model: `models/${MODEL}`, content: { parts }, outputDimensionality: EMBEDDING_DIMENSIONS });

  async function geminiTexts(texts, kind, signal) {
    const headers = geminiHeaders();
    // Each text is a request of its own: the model gives ONE vector for all the parts of one request.
    const response = await fetchImpl(`${geminiBase}:batchEmbedContents`, { method: 'POST', headers, body: JSON.stringify({ requests: texts.map((text) => geminiRequest([{ text: asText(kind, text) }])) }), signal });
    if (response?.ok) {
      const values = (await response.json())?.embeddings;
      if (Array.isArray(values) && values.length === texts.length && values.every((entry) => Array.isArray(entry?.values))) return values.map((entry) => fit(entry.values));
      throw new Error('Gemini did not return one vector for each text.');
    }
    // A model that has no batch call is asked one text at a time.
    if (response?.status !== 404 && response?.status !== 400) throw await failure(response, 'Gemini');
    const out = [];
    for (const text of texts) out.push(await geminiOne([{ text: asText(kind, text) }], signal));
    return out;
  }

  async function geminiOne(parts, signal) {
    const single = await fetchImpl(`${geminiBase}:embedContent`, { method: 'POST', headers: geminiHeaders(), body: JSON.stringify(geminiRequest(parts)), signal });
    if (!single?.ok) throw await failure(single, 'Gemini');
    const values = (await single.json())?.embedding?.values;
    if (!Array.isArray(values)) throw new Error('Gemini did not return a vector.');
    return fit(values);
  }

  // ---- OpenRouter
  async function openRouter(input, signal) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` };
    const call = (extra) => fetchImpl('https://openrouter.ai/api/v1/embeddings', { method: 'POST', headers, body: JSON.stringify({ model: spec.model, input, encoding_format: 'float', ...extra }), signal });
    let response = await call({ dimensions: EMBEDDING_DIMENSIONS });
    // A route that does not take the size is asked again without it (the answer is cut here anyway).
    if (response?.status === 400) response = await call({});
    if (!response?.ok) throw await failure(response, 'OpenRouter');
    const data = (await response.json())?.data;
    if (!Array.isArray(data) || data.length !== input.length) throw new Error('OpenRouter did not return one vector for each input.');
    return [...data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0)).map((entry) => fit(entry.embedding));
  }

  return {
    provider,
    version: versionOf(provider),
    async embed(texts, { kind = 'document', signal } = {}) {
      const list = (texts || []).map((text) => String(text ?? ''));
      if (!list.length) return [];
      return provider === 'openrouter' ? openRouter(list.map((text) => asText(kind, text)), signal) : geminiTexts(list, kind, signal);
    },
    async embedMedia({ mimeType, data, kind }, { signal } = {}) {
      if (provider === 'openrouter') return (await openRouter([{ content: [openRouterBlock({ mimeType, data, kind })] }], signal))[0];
      return geminiOne([{ inline_data: { mime_type: mimeType, data } }], signal);
    }
  };
}
