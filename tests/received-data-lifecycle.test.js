import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createReceivedDataLifecycle } from '../src/app/legacy-runtime/features/received-data-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createZip = (filesByName) => ({
  files: Object.fromEntries(Object.keys(filesByName).map((name) => [name, {}])),
  file(name) {
    return {
      async async(format) {
        assert.equal(format, 'string');
        if (!(name in filesByName)) throw new Error(`Missing zip file: ${name}`);
        return filesByName[name];
      }
    };
  }
});

const createHarness = (zip, overrides = {}) => {
  const calls = [];
  const astras = overrides.astras ?? [];
  const conversations = overrides.conversations ?? [];
  const folders = overrides.folders ?? [];
  let uuidIndex = 0;
  const uuids = overrides.uuids ?? ['new-a', 'new-conv', 'new-folder'];
  const lifecycle = createReceivedDataLifecycle({
    BlobCtor: class TestBlob {
      constructor(buffers) {
        this.buffers = buffers;
      }
    },
    JSZip: {
      async loadAsync(blob) {
        calls.push(['loadAsync', blob.buffers]);
        if (zip instanceof Error) throw zip;
        return zip;
      }
    },
    getAstras: () => astras,
    getConversations: () => conversations,
    getFolders: () => folders,
    getDefaultFolder: () => ({ color: '#fff', icon: 'folder', textColor: '#111' }),
    randomUUID: () => uuids[uuidIndex++] ?? `uuid-${uuidIndex}`,
    saveAppData: async () => calls.push(['saveAppData']),
    renderAll: () => calls.push(['renderAll']),
    showNotification: (message, type) => calls.push(['notify', message, type]),
    toggleModal: (modal, isOpen) => calls.push(['toggleModal', modal, isOpen]),
    getP2pShareModal: overrides.getP2pShareModal ?? (() => 'share-modal'),
    scheduleTimeout: (callback, delay) => {
      calls.push(['setTimeout', delay]);
      callback();
    },
    logger: { error: (error) => calls.push(['error', error.message]) }
  });

  return { astras, calls, conversations, folders, lifecycle };
};

test('imports received Astras, resolves duplicate ids, and runs success handoffs', async () => {
  const zip = createZip({
    'astra_existing.json': JSON.stringify({ id: 'a-1', name: 'Nova', officialId: 'official' }),
    'notes.txt': 'ignored'
  });
  const { astras, calls, lifecycle } = createHarness(zip, {
    astras: [{ id: 'a-1', name: 'Existing' }]
  });

  await lifecycle.processReceivedData(['chunk'], 'astras');

  assert.deepEqual(astras.map(({ id, name, officialId }) => ({ id, name, officialId })), [
    { id: 'new-a', name: 'Nova (Imported)', officialId: null },
    { id: 'a-1', name: 'Existing', officialId: undefined }
  ]);
  assert.deepEqual(calls.map((call) => call[0]), [
    'loadAsync',
    'notify',
    'saveAppData',
    'renderAll',
    'setTimeout',
    'toggleModal'
  ]);
  assert.equal(calls[1][2], 'success');
});

test('imports conversations and folders with new ids, duplicate folder suffixes, and Astra cleanup', async () => {
  const zip = createZip({
    'folders.json': JSON.stringify([
      { name: 'Work', color: '#123', icon: 'briefcase', textColor: '#eee', conversationIds: ['old-conv'] }
    ]),
    'conversations.json': JSON.stringify([
      { id: 'old-conv', title: 'Shared', folderId: 'old-folder', astrasId: 'missing-astra' }
    ])
  });
  const { conversations, folders, calls, lifecycle } = createHarness(zip, {
    folders: [{ id: 'existing-folder', name: 'Work', conversationIds: [] }],
    uuids: ['new-conv', 'new-folder']
  });

  await lifecycle.processReceivedData([], 'conversations');

  assert.equal(conversations[0].id, 'new-conv');
  assert.equal(conversations[0].folderId, 'new-folder');
  assert.equal(conversations[0].astrasId, null);
  assert.equal(folders[1].id, 'new-folder');
  assert.equal(folders[1].name, 'Work (Shared)');
  assert.equal(folders[1].color, '#123');
  assert.equal(folders[1].icon, 'briefcase');
  assert.equal(folders[1].textColor, '#eee');
  assert.deepEqual(folders[1].conversationIds, ['new-conv']);
  assert.equal(calls.find((call) => call[0] === 'notify')?.[2], 'success');
});

test('invalid received payload reports the legacy error path without saving or rendering', async () => {
  const { calls, lifecycle } = createHarness(new Error('bad zip'));

  await lifecycle.processReceivedData(['bad'], 'astras');

  assert.deepEqual(calls.map((call) => call[0]), ['loadAsync', 'error', 'notify']);
  assert.equal(calls[2][2], 'error');
});

test('rejects invalid P2P schema atomically before saving or rendering', async () => {
  const zip = createZip({
    'astra_valid.json': JSON.stringify({ id: 'a-valid', name: 'Valid' }),
    'astra_invalid.json': JSON.stringify({ id: 'a-invalid', name: '' })
  });
  const { astras, calls, lifecycle } = createHarness(zip);

  await lifecycle.processReceivedData([], 'astras');

  assert.deepEqual(astras, []);
  assert.deepEqual(calls.map((call) => call[0]), ['loadAsync', 'error', 'notify']);
});

test('rejects dangerous keys from P2P JSON without mutating application data', async () => {
  const zip = createZip({
    'folders.json': '[{"name":"Work","conversationIds":[]}]',
    'conversations.json': '[{"id":"conv-1","title":"Shared","metadata":{"__proto__":{"polluted":true}}}]'
  });
  const { calls, conversations, folders, lifecycle } = createHarness(zip);

  await lifecycle.processReceivedData([], 'conversations');

  assert.deepEqual(conversations, []);
  assert.deepEqual(folders, []);
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(calls.map((call) => call[0]), ['loadAsync', 'error', 'notify']);
});

test('rejects P2P archives with excessive file counts', async () => {
  const files = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [
    `astra_${index}.json`,
    JSON.stringify({ id: `a-${index}`, name: `Astra ${index}` })
  ]));
  const { astras, calls, lifecycle } = createHarness(createZip(files));

  await lifecycle.processReceivedData([], 'astras');

  assert.deepEqual(astras, []);
  assert.deepEqual(calls.map((call) => call[0]), ['loadAsync', 'error', 'notify']);
});

test('rejects spoofed P2P avatar data before mutating Astras', async () => {
  const zip = createZip({
    'astra_unsafe.json': JSON.stringify({
      id: 'a-unsafe',
      name: 'Unsafe',
      avatarUrl: `data:image/png;base64,${btoa('<svg onload="alert(1)"></svg>')}`
    })
  });
  const { astras, calls, lifecycle } = createHarness(zip);

  await lifecycle.processReceivedData([], 'astras');

  assert.deepEqual(astras, []);
  assert.deepEqual(calls.map((call) => call[0]), ['loadAsync', 'error', 'notify']);
});

test('missing optional modal dependency keeps success import callbacks safe', async () => {
  const zip = createZip({
    'astra_new.json': JSON.stringify({ id: 'a-2', name: 'Orion' })
  });
  const { calls, lifecycle } = createHarness(zip, {
    uuids: ['unused'],
    getP2pShareModal: () => null
  });

  await lifecycle.processReceivedData([], 'astras');

  assert.deepEqual(calls.filter((call) => call[0] === 'toggleModal'), [['toggleModal', null, false]]);
});

test('received data lifecycle source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/received-data-lifecycle.js');

  for (const forbidden of [
    'streamApiCall',
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'DOMPurify',
    'marked',
    'katex',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
