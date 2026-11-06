// The originals of the sources of a project that are files: a PDF, a Word, PowerPoint or Excel file, a picture, anything but text (docs/superpowers/specs/2026-10-31-projects-design.md, §13.1). They are kept as
// files, apart from the folder (which is rewritten whole whenever anything changes): the bytes are on this device in IndexedDB under the hash of the bytes, and, with a cloud account, in the person's
// cloud storage too (the same place as the files of the conversations, so another device and the clean-up of orphans know them); the source holds only the small description of the file.
// No reply takes them with the message (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, §10): a picture, a video or a sound is too big for a model to take whole, so the model of a
// reply, and each member of a council, looks into them by itself (the vectors find which file and which part, view_project_file shows it: project-files-access.js).
// The page gives what it has through `setProjectFileDeps`; nothing here touches `window`.

const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};
const fromBase64 = (value) => {
  const binary = atob(String(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** The files in memory (tests, and a browser with no IndexedDB). */
export function createMemoryFileBackend() {
  const files = new Map();
  return { async get(id) { return files.get(id) ?? null; }, async put(record) { files.set(record.id, record); }, async remove(id) { files.delete(id); } };
}

const wrap = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('IndexedDB request failed')); });

/** The files in IndexedDB under `name` (one database for each person on this device). */
export function createIdbFileBackend({ indexedDB, name }) {
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('files', { keyPath: 'id' }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened'));
      });
      opening.catch(() => { opening = null; });
    }
    return opening;
  };
  const store = async (mode) => (await open()).transaction('files', mode).objectStore('files');
  return {
    async get(id) { const value = await wrap((await store('readonly')).get(id)); return value ?? null; },
    async put(record) { await wrap((await store('readwrite')).put(record)); },
    async remove(id) { await wrap((await store('readwrite')).delete(id)); }
  };
}

/**
 * deps: backend ({ get, put, remove }), getAssets() (the cloud files service: { externalize, hydrate }, or null without a cloud account), cryptoProvider.
 * `save(file)` keeps a File and gives its description { name, mimeType, size, hash, asset? }; `load(description)` gives { mimeType, data (base64) } or null; `drop(descriptions)` forgets files here.
 */
export function createProjectFileStore({ backend, getAssets = () => null, cryptoProvider = globalThis.crypto } = {}) {
  return {
    async save(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = hex(await cryptoProvider.subtle.digest('SHA-256', bytes));
      const mimeType = String(file.type || 'application/octet-stream');
      await backend.put({ id: hash, mimeType, bytes });
      const description = { name: String(file.name || ''), mimeType, size: bytes.length, hash };
      // In the cloud too (what is already there is not sent again); if that fails the file is still here and is tried again when a reply needs it.
      try {
        const kept = await getAssets()?.externalize?.({ mimeType, data: toBase64(bytes) });
        if (kept?.data && typeof kept.data === 'object') description.asset = kept.data;
      } catch { /* kept on this device only */ }
      return description;
    },
    async load(description) {
      if (!description?.hash) return null;
      const here = await backend.get(description.hash).catch(() => null);
      if (here?.bytes) return { mimeType: description.mimeType || here.mimeType, data: toBase64(here.bytes) };
      if (description.asset) {
        try {
          const data = await getAssets()?.hydrate?.(description.asset);
          if (typeof data === 'string' && data) {
            await backend.put({ id: description.hash, mimeType: description.mimeType, bytes: fromBase64(data) }).catch(() => {});
            return { mimeType: description.mimeType, data };
          }
        } catch { /* not there */ }
      }
      return null;
    },
    /** A file kept on this device that the cloud does not have yet (its upload failed or the cloud was not ready when it was added) is sent now: gives its marker, or null when there is nothing to send or it fails again. */
    async keep(description) {
      if (!description?.hash || description.asset) return null;
      const here = await backend.get(description.hash).catch(() => null);
      if (!here?.bytes) return null;
      try {
        const kept = await getAssets()?.externalize?.({ mimeType: description.mimeType || here.mimeType || 'application/octet-stream', data: toBase64(here.bytes) });
        return kept?.data && typeof kept.data === 'object' ? kept.data : null;
      } catch { return null; }
    },
    async drop(descriptions) {
      for (const description of descriptions || []) if (description?.hash) await backend.remove(description.hash).catch(() => {});
    }
  };
}

let deps = { store: null };

/** The page says where the files are: { store }. */
export function setProjectFileDeps(next) {
  deps = { store: next?.store || null };
}
export const getProjectFileStore = () => deps.store;
