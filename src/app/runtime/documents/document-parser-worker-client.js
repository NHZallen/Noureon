const directExtract = async ({ kind, bytes, name, signal }) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const extractors = await import('./office-document-extractors.js');
  const extractor = {
    docx: extractors.extractDocxDocument,
    xlsx: extractors.extractXlsxDocument,
    pptx: extractors.extractPptxDocument
  }[kind];
  return extractor({ bytes, name, signal });
};

export async function extractOfficeDocumentInWorker({ kind, bytes, name, signal } = {}) {
  if (typeof globalThis.Worker !== 'function') {
    return directExtract({ kind, bytes, name, signal });
  }
  return new Promise((resolve, reject) => {
    const createWorker = {
      docx: () => new Worker(new URL('./docx-parser-worker.js', import.meta.url), { type: 'module' }),
      xlsx: () => new Worker(new URL('./xlsx-parser-worker.js', import.meta.url), { type: 'module' }),
      pptx: () => new Worker(new URL('./pptx-parser-worker.js', import.meta.url), { type: 'module' })
    }[kind];
    if (!createWorker) {
      reject(new Error(`Unsupported worker document kind: ${kind}`));
      return;
    }
    const worker = createWorker();
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    worker.addEventListener('message', event => {
      if (event.data?.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    });
    worker.addEventListener('error', error => {
      cleanup();
      reject(error);
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    const transferable = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    worker.postMessage({ id, kind, bytes: transferable, name }, [transferable]);
  });
}
