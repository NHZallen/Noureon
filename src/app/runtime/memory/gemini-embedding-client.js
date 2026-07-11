import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './embedding-config.js';
import {
  asBase64,
  base64ByteLength,
  createGeminiFileApiClient,
  GEMINI_FILE_INLINE_LIMIT_BYTES
} from './gemini-file-api-client.js';

const EMBEDDING_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

const asEmbeddingValues = (payload) => {
  const values = payload?.embedding?.values;
  if (!Array.isArray(values)) throw new Error('Gemini Embedding 2 未回傳有效向量。');
  return values;
};

export function createGeminiEmbeddingClient({
  getApiKey = () => '',
  fetchImpl = fetch,
  fileApiClient = createGeminiFileApiClient({ fetchImpl })
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
    ),
    async embedMedia({ mimeType, data, name = 'attachment', size = null, signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for media embeddings.');
      if (!mimeType || !data) throw new TypeError('Media embeddings require MIME type and bytes.');
      let uploadedFile = null;
      try {
        const byteLength = Number.isFinite(size) && size > 0 ? size : base64ByteLength(data);
        const part = byteLength > GEMINI_FILE_INLINE_LIMIT_BYTES
          ? (() => { throw new Error('upload-needed'); })()
          : { inline_data: { mime_type: mimeType, data: asBase64(data) } };
        const response = await fetchImpl(EMBEDDING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ content: { parts: [part] }, output_dimensionality: EMBEDDING_DIMENSIONS }),
          signal
        });
        if (!response?.ok) throw new Error(`Gemini media embedding failed: ${response?.status || 'unknown'}`);
        return asEmbeddingValues(await response.json());
      } catch (error) {
        if (error?.message !== 'upload-needed') throw error;
        uploadedFile = await fileApiClient.upload({
          apiKey,
          attachment: { mimeType, data, name },
          signal
        });
        const response = await fetchImpl(EMBEDDING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            content: { parts: [{ file_data: { mime_type: mimeType, file_uri: uploadedFile.uri } }] },
            output_dimensionality: EMBEDDING_DIMENSIONS
          }),
          signal
        });
        if (!response?.ok) throw new Error(`Gemini media embedding failed: ${response?.status || 'unknown'}`);
        return asEmbeddingValues(await response.json());
      } finally {
        if (uploadedFile?.name) {
          try {
            await fileApiClient.remove({ apiKey, fileName: uploadedFile.name });
          } catch {
            // The file expires automatically; cleanup must not discard a successful embedding.
          }
        }
      }
    }
  };
}
