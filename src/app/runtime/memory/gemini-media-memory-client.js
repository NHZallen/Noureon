import { GEMINI_MEMORY_SUMMARY_MODEL } from './gemini-memory-capture-client.js';

const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;
const UPLOAD_ENDPOINT = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
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

const asBase64 = value => String(value || '').replace(/^data:[^;]+;base64,/u, '');

const toBytes = value => Uint8Array.from(atob(asBase64(value)), character => character.charCodeAt(0));

const readSummary = async response => {
  if (!response?.ok) throw new Error(`Gemini media memory failed: ${response?.status || 'unknown status'}`);
  const text = String((await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '');
  const result = JSON.parse(text);
  if (!result?.summary || !Array.isArray(result.keyFacts)) throw new TypeError('Gemini media memory response is incomplete.');
  return { summary: String(result.summary), keyFacts: result.keyFacts.map(String) };
};

export function createGeminiMediaMemoryClient({ getApiKey, fetchImpl = fetch, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (typeof getApiKey !== 'function') throw new TypeError('Media memory requires getApiKey.');

  const upload = async ({ apiKey, attachment, signal }) => {
    const bytes = toBytes(attachment.data);
    const start = await fetchImpl(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': attachment.mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: attachment.name || 'attachment' } }),
      signal
    });
    const uploadUrl = start.headers?.get('x-goog-upload-url');
    if (!start.ok || !uploadUrl) throw new Error('Gemini Files upload could not start.');
    const finish = await fetchImpl(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: bytes,
      signal
    });
    if (!finish.ok) throw new Error(`Gemini Files upload failed: ${finish.status || 'unknown status'}`);
    let file = (await finish.json())?.file;
    for (let attempt = 0; file?.state && file.state !== 'ACTIVE' && attempt < 30; attempt += 1) {
      if (file.state === 'FAILED') throw new Error('Gemini could not process this media file.');
      await delay(1000);
      const status = await fetchImpl(`${API_BASE}/${file.name}`, { headers: { 'x-goog-api-key': apiKey }, signal });
      if (!status.ok) throw new Error('Gemini Files status check failed.');
      file = await status.json();
    }
    if (file?.state && file.state !== 'ACTIVE') throw new Error('Gemini media processing timed out.');
    return file;
  };

  return {
    async describe({ attachment, signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for media memory.');
      if (!attachment?.data || !attachment?.mimeType) throw new TypeError('Media memory requires attachment bytes and a MIME type.');
      const bytes = toBytes(attachment.data);
      let uploadedFile = null;
      try {
        const mediaPart = bytes.byteLength > INLINE_LIMIT_BYTES
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
        uploadedFile = await upload({ apiKey, attachment, signal });
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
          void fetchImpl(`${API_BASE}/${uploadedFile.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': apiKey } });
        }
      }
    }
  };
}
