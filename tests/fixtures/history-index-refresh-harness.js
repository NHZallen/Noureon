import { createHistoryIndexStore } from '../../src/app/runtime/memory/history-index-store.js';
import { createHistoryIndexPersistence } from '../../src/app/runtime/memory/history-index-persistence.js';

const currentKey = 'test:history-index:alice';
const recoveryKey = `${currentKey}:recovery`;
const fallbackKey = 'test:history-index:anonymous';
const testKeys = [currentKey, recoveryKey, fallbackKey];
const storage = {
  getItem: async key => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },
  setItem: async (key, value) => localStorage.setItem(key, JSON.stringify(value)),
  removeItem: async key => localStorage.removeItem(key),
  async setItemsAtomic(entries) {
    entries.forEach(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)));
  }
};
const index = createHistoryIndexStore();
const persistence = createHistoryIndexPersistence({
  index,
  storage,
  storageKey: currentKey,
  recoveryStorageKey: recoveryKey,
  fallbackStorageKeys: [fallbackKey]
});
const count = document.querySelector('#record-count');
const diagnostics = document.querySelector('#diagnostics');
const records = [
  {
    recordId: 'capsule:refresh-case',
    recordType: 'conversation-capsule',
    conversationId: 'refresh-case',
    sourceHash: 'refresh-hash',
    vector: [1, 0]
  },
  {
    recordId: 'fragment:refresh-case:0',
    recordType: 'conversation-fragment',
    conversationId: 'refresh-case',
    sourceHash: 'refresh-hash',
    vector: [0, 1]
  }
];
const render = () => {
  count.textContent = `Records: ${index.getAll().length}`;
  diagnostics.textContent = JSON.stringify(persistence.getDiagnostics(), null, 2);
};

await persistence.load();
render();

document.querySelector('#seed-current').addEventListener('click', async () => {
  index.clear();
  records.forEach(record => index.put(record));
  await persistence.save();
  render();
});
document.querySelector('#seed-migration').addEventListener('click', () => {
  const empty = { schemaVersion: 1, revision: 9, savedAt: 9, records: [] };
  localStorage.setItem(currentKey, JSON.stringify(empty));
  localStorage.setItem(recoveryKey, JSON.stringify(empty));
  localStorage.setItem(fallbackKey, JSON.stringify({
    schemaVersion: 1,
    revision: 2,
    savedAt: 2,
    records
  }));
  location.reload();
});
document.querySelector('#reset').addEventListener('click', () => {
  testKeys.forEach(key => localStorage.removeItem(key));
  location.reload();
});
