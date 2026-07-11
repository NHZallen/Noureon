export const GEMINI_FILE_INLINE_LIMIT_BYTES = 15 * 1024 * 1024;

const UPLOAD_ENDPOINT = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const asBase64 = value => String(value || '').replace(/^data:[^;]+;base64,/u, '');

export const base64ByteLength = value => {
  const base64 = asBase64(value).replace(/\s/gu, '');
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
};

const toBytes = value => Uint8Array.from(atob(asBase64(value)), character => character.charCodeAt(0));

export function createGeminiFileApiClient({
  fetchImpl = fetch,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  return {
    async upload({ apiKey, attachment, signal } = {}) {
      if (!apiKey) throw new Error('Gemini Files upload requires an API key.');
      if (!attachment?.data || !attachment?.mimeType) throw new TypeError('Gemini Files upload requires media bytes and a MIME type.');
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
        const status = await fetchImpl(`${API_BASE}/${file.name}`, {
          headers: { 'x-goog-api-key': apiKey },
          signal
        });
        if (!status.ok) throw new Error('Gemini Files status check failed.');
        file = await status.json();
      }
      if (file?.state && file.state !== 'ACTIVE') throw new Error('Gemini media processing timed out.');
      if (!file?.name || !file?.uri) throw new Error('Gemini Files upload returned an incomplete file reference.');
      return file;
    },
    async remove({ apiKey, fileName, signal } = {}) {
      if (!apiKey || !fileName) return;
      await fetchImpl(`${API_BASE}/${fileName}`, {
        method: 'DELETE',
        headers: { 'x-goog-api-key': apiKey },
        signal
      });
    }
  };
}
