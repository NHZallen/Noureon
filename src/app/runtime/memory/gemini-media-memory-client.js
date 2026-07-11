import { GEMINI_MEMORY_SUMMARY_MODEL } from './gemini-memory-capture-client.js';
import {
  asBase64,
  base64ByteLength,
  createGeminiFileApiClient,
  GEMINI_FILE_INLINE_LIMIT_BYTES
} from './gemini-file-api-client.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    keyFacts: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['summary', 'keyFacts']
};

const categoryForMime = mimeType => {
  if (String(mimeType).startsWith('image/')) return 'image';
  if (String(mimeType).startsWith('video/')) return 'video';
  if (String(mimeType).startsWith('audio/')) return 'audio';
  return 'document';
};

const readSummary = async response => {
  if (!response?.ok) throw new Error(`Gemini media memory failed: ${response?.status || 'unknown status'}`);
  const text = String((await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '');
  const result = JSON.parse(text);
  if (!result?.summary || !Array.isArray(result.keyFacts)) throw new TypeError('Gemini media memory response is incomplete.');
  return { summary: String(result.summary), keyFacts: result.keyFacts.map(String) };
};

export function createGeminiMediaMemoryClient({
  getApiKey,
  fetchImpl = fetch,
  fileApiClient = createGeminiFileApiClient({ fetchImpl })
} = {}) {
  if (typeof getApiKey !== 'function') throw new TypeError('Media memory requires getApiKey.');

  return {
    async describe({ attachment, signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for media memory.');
      if (!attachment?.data || !attachment?.mimeType) throw new TypeError('Media memory requires attachment bytes and a MIME type.');
      let uploadedFile = null;
      try {
        const mediaPart = base64ByteLength(attachment.data) > GEMINI_FILE_INLINE_LIMIT_BYTES
          ? (() => { throw new Error('upload-needed'); })()
          : { inline_data: { mime_type: attachment.mimeType, data: asBase64(attachment.data) } };
        const prompt = `Create a concise private-memory description of this ${categoryForMime(attachment.mimeType)}. Include visual, spoken, and document facts that could make a later conversation searchable. Do not infer user preferences or personal facts.`;
        const response = await fetchImpl(
          `${API_BASE}/models/${GEMINI_MEMORY_SUMMARY_MODEL}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [mediaPart, { text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
            }),
            signal
          }
        );
        return { kind: categoryForMime(attachment.mimeType), ...(await readSummary(response)) };
      } catch (error) {
        if (error?.message !== 'upload-needed') throw error;
        uploadedFile = await fileApiClient.upload({ apiKey, attachment, signal });
        const prompt = `Create a concise private-memory description of this ${categoryForMime(attachment.mimeType)}. Include visual, spoken, and document facts that could make a later conversation searchable. Do not infer user preferences or personal facts.`;
        const response = await fetchImpl(
          `${API_BASE}/models/${GEMINI_MEMORY_SUMMARY_MODEL}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ file_data: { mime_type: attachment.mimeType, file_uri: uploadedFile.uri } }, { text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
            }),
            signal
          }
        );
        return { kind: categoryForMime(attachment.mimeType), ...(await readSummary(response)) };
      } finally {
        if (uploadedFile?.name) {
          void fileApiClient.remove({ apiKey, fileName: uploadedFile.name });
        }
      }
    }
  };
}
