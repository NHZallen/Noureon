// The model that turns a text into a vector, for the search by meaning (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): Gemini Embedding or OpenAI, whichever the person
// has a key for. The page calls the provider directly with the person's own key, as for the replies; nothing goes through Noureon's server. A text is sent only after the person agreed
// (page-vectors.js). The texts of the past conversations are sent in groups, the question of a search alone. One index belongs to one model: `versionOf` says which, so that changing the
// model builds the index again.

import { toUnit } from '../memory-notes/vector-math.js';

export const EMBEDDING_PROVIDERS = Object.freeze({
  gemini: Object.freeze({ model: 'gemini-embedding-2', dimensions: 768, keyProvider: 'gemini', label: 'Gemini' }),
  openai: Object.freeze({ model: 'text-embedding-3-small', dimensions: 768, keyProvider: 'openai', label: 'OpenAI' })
});

const SCHEMA = 1;

export const versionOf = (provider) => {
  const spec = EMBEDDING_PROVIDERS[provider];
  return spec ? `${provider}:${spec.model}:${spec.dimensions}:v${SCHEMA}` : '';
};

/** The provider to use: the one the person chose if it has a key, else the first that has a key (Gemini first), else ''. */
export function pickEmbeddingProvider({ chosen = '', hasKey = () => false } = {}) {
  if (EMBEDDING_PROVIDERS[chosen] && hasKey(EMBEDDING_PROVIDERS[chosen].keyProvider)) return chosen;
  return Object.keys(EMBEDDING_PROVIDERS).find((name) => hasKey(EMBEDDING_PROVIDERS[name].keyProvider)) || '';
}

const asText = (kind, text) => (kind === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`);

async function failure(response, label) {
  let detail = '';
  try { detail = String((await response.text()) || '').slice(0, 120); } catch { /* The status is enough. */ }
  const error = new Error(`${label} embedding failed (${response?.status || 'unknown'})${detail ? `: ${detail}` : ''}`);
  error.status = response?.status || 0;
  return error;
}

/**
 * `embed(texts, { kind: 'document' | 'query', signal })` gives one unit vector for each text. `getApiKey()` gives the key of the provider. Throws when there is no key or the provider
 * refuses; the caller decides what to do (the search just goes on with the keywords).
 */
export function createEmbeddingClient({ provider, getApiKey = () => '', fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const spec = EMBEDDING_PROVIDERS[provider];
  if (!spec) throw new Error(`There is no embedding provider "${provider}".`);

  async function gemini(texts, kind, signal) {
    const key = String(getApiKey() || '').trim();
    if (!key) throw new Error('A Gemini key is needed for the search by meaning.');
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}`;
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    const request = (text) => ({ model: `models/${spec.model}`, content: { parts: [{ text: asText(kind, text) }] }, outputDimensionality: spec.dimensions });
    const response = await fetchImpl(`${base}:batchEmbedContents`, { method: 'POST', headers, body: JSON.stringify({ requests: texts.map(request) }), signal });
    if (response?.ok) {
      const values = (await response.json())?.embeddings;
      if (Array.isArray(values) && values.length === texts.length && values.every((entry) => Array.isArray(entry?.values))) return values.map((entry) => toUnit(entry.values));
      throw new Error('Gemini did not return one vector for each text.');
    }
    // A model that has no batch call is asked one text at a time.
    if (response?.status !== 404 && response?.status !== 400) throw await failure(response, 'Gemini');
    const out = [];
    for (const text of texts) {
      const single = await fetchImpl(`${base}:embedContent`, { method: 'POST', headers, body: JSON.stringify({ content: { parts: [{ text: asText(kind, text) }] }, output_dimensionality: spec.dimensions }), signal });
      if (!single?.ok) throw await failure(single, 'Gemini');
      const values = (await single.json())?.embedding?.values;
      if (!Array.isArray(values)) throw new Error('Gemini did not return a vector.');
      out.push(toUnit(values));
    }
    return out;
  }

  async function openai(texts, kind, signal) {
    const key = String(getApiKey() || '').trim();
    if (!key) throw new Error('An OpenAI key is needed for the search by meaning.');
    const response = await fetchImpl('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: spec.model, input: texts, dimensions: spec.dimensions, encoding_format: 'float' }),
      signal
    });
    if (!response?.ok) throw await failure(response, 'OpenAI');
    const data = (await response.json())?.data;
    if (!Array.isArray(data) || data.length !== texts.length) throw new Error('OpenAI did not return one vector for each text.');
    return [...data].sort((left, right) => (left.index ?? 0) - (right.index ?? 0)).map((entry) => toUnit(entry.embedding));
  }

  return {
    provider,
    version: versionOf(provider),
    async embed(texts, { kind = 'document', signal } = {}) {
      const list = (texts || []).map((text) => String(text ?? ''));
      if (!list.length) return [];
      return provider === 'openai' ? openai(list, kind, signal) : gemini(list, kind, signal);
    }
  };
}
