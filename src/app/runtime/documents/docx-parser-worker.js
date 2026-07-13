import { extractDocxDocument } from './office-document-extractors.js';

self.addEventListener('message', async event => {
  const { id, bytes, name } = event.data || {};
  try {
    const result = await extractDocxDocument({ bytes: new Uint8Array(bytes), name });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
});
