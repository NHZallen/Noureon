import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './embedding-config.js';

const EMBEDDING_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

const asEmbeddingValues = (payload) => {
  const values = payload?.embedding?.values;
  if (!Array.isArray(values)) throw new Error('Gemini Embedding 2 未回傳有效向量。');
  return values;
};

export function createGeminiEmbeddingClient({
  getApiKey = () => '',
  fetchImpl = fetch
} = {}) {
  async function embedText(text) {
    const apiKey = String(getApiKey() || '').trim();
    if (!apiKey) throw new Error('請先設定 Gemini API 金鑰以啟用歷史記憶搜尋。');

    const response = await fetchImpl(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '') }] },
        output_dimensionality: EMBEDDING_DIMENSIONS
      })
    });
    if (!response?.ok) {
      throw new Error(`Gemini Embedding 2 請求失敗（${response?.status || 'unknown'}）。`);
    }
    return asEmbeddingValues(await response.json());
  }

  return {
    embedHistoryQuery: (query) => embedText(`task: search result | query: ${String(query || '')}`),
    embedHistoryDocument: ({ title = 'none', text = '' } = {}) => (
      embedText(`title: ${String(title || 'none')} | text: ${String(text || '')}`)
    )
  };
}
