import { DOCUMENT_INDEX_SCHEMA_VERSION } from './document-schema.js';

export const DOCUMENT_INDEX_STORAGE_KEY = 'noureon:document-index:v1';

const copy = value => value == null ? value : structuredClone(value);
const linkKey = link => `${link.userId}:${link.conversationId}:${link.messageId || 'message'}:${link.documentHash}`;

export function createDocumentIndexStore() {
  const documents = new Map();
  const links = new Map();
  const jobs = new Map();

  const api = {
    putDocument(document) {
      if (!document?.storageKey || !document?.documentHash || !document?.userId) {
        throw new TypeError('Document records require storageKey, userId, and documentHash.');
      }
      documents.set(document.storageKey, copy(document));
      return copy(document);
    },
    getDocument(storageKey) {
      return copy(documents.get(storageKey) || null);
    },
    getDocuments() {
      return [...documents.values()].map(copy);
    },
    removeDocument(storageKey) {
      documents.delete(storageKey);
    },
    putLink(link) {
      if (!link?.userId || !link?.conversationId || !link?.documentHash) {
        throw new TypeError('Document links require userId, conversationId, and documentHash.');
      }
      const normalized = { scopeType: 'conversation', scopeId: link.conversationId, ...copy(link) };
      links.set(linkKey(normalized), normalized);
      return copy(normalized);
    },
    getLinks(filters = {}) {
      return [...links.values()].filter(link => Object.entries(filters)
        .every(([key, value]) => value == null || link[key] === value)).map(copy);
    },
    removeLink(filters = {}) {
      let removed = 0;
      for (const [key, link] of links) {
        if (Object.entries(filters).every(([field, value]) => value == null || link[field] === value)) {
          links.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    countReferences({ userId, documentHash }) {
      return [...links.values()].filter(link => link.userId === userId && link.documentHash === documentHash).length;
    },
    putJob(job) {
      if (!job?.jobId) throw new TypeError('Document index jobs require jobId.');
      jobs.set(job.jobId, copy(job));
      return copy(job);
    },
    getJob(jobId) {
      return copy(jobs.get(jobId) || null);
    },
    getJobs() {
      return [...jobs.values()].map(copy);
    },
    removeJob(jobId) {
      jobs.delete(jobId);
    },
    clear() {
      documents.clear();
      links.clear();
      jobs.clear();
    },
    exportState() {
      return {
        schemaVersion: DOCUMENT_INDEX_SCHEMA_VERSION,
        documents: api.getDocuments(),
        links: api.getLinks(),
        jobs: api.getJobs()
      };
    },
    importState(state = {}) {
      api.clear();
      for (const document of state.documents || []) api.putDocument(document);
      for (const link of state.links || []) api.putLink(link);
      for (const job of state.jobs || []) api.putJob(job);
      return { documents: documents.size, links: links.size, jobs: jobs.size };
    }
  };
  return api;
}
export function createDocumentIndexPersistence({
  index,
  storage,
  storageKey = DOCUMENT_INDEX_STORAGE_KEY
} = {}) {
  if (!index?.exportState || !index?.importState) throw new TypeError('Document index persistence requires an index store.');
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('Document index persistence requires a storage adapter.');
  }
  const resolveKey = () => typeof storageKey === 'function' ? storageKey() : storageKey;
  return {
    async load() {
      const state = await storage.getItem(resolveKey());
      return state ? index.importState(state) : { documents: 0, links: 0, jobs: 0 };
    },
    save: () => storage.setItem(resolveKey(), index.exportState()),
    async clear() {
      index.clear();
      await storage.removeItem(resolveKey());
    }
  };
}
