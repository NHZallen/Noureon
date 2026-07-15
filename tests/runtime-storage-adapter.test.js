import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeStorageAdapter } from '../src/app/runtime/kernel/storage-adapter.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function createFakeIndexedDB({
  initialValues = {},
  openError = null,
  getError = null,
  transactionError = null,
  clearError = null,
  manualWrites = false,
  manualClear = false
} = {}) {
  const values = new Map(Object.entries(initialValues));
  const calls = {
    open: [],
    createObjectStore: [],
    transactions: [],
    get: [],
    getAllKeys: 0,
    put: [],
    delete: [],
    clear: 0,
    pendingTransactions: [],
    pendingClearRequests: []
  };

  const db = {
    createObjectStore(name, options) {
      calls.createObjectStore.push([name, options]);
    },
    transaction(name, mode) {
      calls.transactions.push([name, mode]);
      const transaction = {
        objectStore(storeName) {
          assert.equal(storeName, name);
          return {
            get(key) {
              calls.get.push(key);
              const request = {};
              queueMicrotask(() => {
                if (getError) {
                  request.onerror?.(getError);
                  return;
                }
                request.result = values.has(key) ? { key, value: values.get(key) } : undefined;
                request.onsuccess?.();
              });
              return request;
            },
            getAllKeys() {
              calls.getAllKeys += 1;
              const request = {};
              queueMicrotask(() => {
                request.result = Array.from(values.keys());
                request.onsuccess?.();
              });
              return request;
            },
            put(entry) {
              calls.put.push(entry);
              values.set(entry.key, entry.value);
              completeTransaction(transaction);
            },
            delete(key) {
              calls.delete.push(key);
              values.delete(key);
              completeTransaction(transaction);
            },
            clear() {
              calls.clear += 1;
              values.clear();
              const request = {};
              if (manualClear) {
                calls.pendingClearRequests.push(request);
              } else {
                queueMicrotask(() => {
                  if (clearError) request.onerror?.(clearError);
                  else request.onsuccess?.();
                });
              }
              return request;
            }
          };
        }
      };

      function completeTransaction(target) {
        if (manualWrites) {
          calls.pendingTransactions.push(target);
          return;
        }
        queueMicrotask(() => {
          if (transactionError) target.onerror?.(transactionError);
          else target.oncomplete?.();
        });
      }

      return transaction;
    }
  };

  const indexedDBFactory = {
    open(name, version) {
      calls.open.push([name, version]);
      const request = {};
      queueMicrotask(() => {
        if (openError) {
          request.onerror?.({ target: { error: openError } });
          return;
        }
        request.onupgradeneeded?.({ target: { result: db } });
        request.onsuccess?.({ target: { result: db } });
      });
      return request;
    }
  };

  return { indexedDBFactory, db, calls, values };
}

function createAtomicFakeIndexedDB(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  const calls = {
    open: 0,
    transactions: [],
    put: [],
    abort: 0
  };
  let activeTransaction = null;

  const db = {
    createObjectStore() {},
    transaction(name, mode) {
      calls.transactions.push([name, mode]);
      const pending = [];
      const transaction = {
        error: null,
        objectStore(storeName) {
          assert.equal(storeName, name);
          return {
            put(entry) {
              calls.put.push(entry);
              pending.push(entry);
            }
          };
        },
        abort() {
          calls.abort += 1;
          transaction.error ||= new Error('aborted');
          transaction.onabort?.({ target: transaction });
        }
      };
      activeTransaction = {
        complete() {
          for (const entry of pending) values.set(entry.key, entry.value);
          transaction.oncomplete?.();
        },
        fail(error) {
          transaction.error = error;
          transaction.onerror?.({ target: transaction });
        }
      };
      return transaction;
    }
  };
  const indexedDBFactory = {
    open() {
      calls.open += 1;
      const request = {};
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: { result: db } });
        request.onsuccess?.({ target: { result: db } });
      });
      return request;
    }
  };

  return {
    indexedDBFactory,
    calls,
    values,
    complete: () => activeTransaction.complete(),
    fail: error => activeTransaction.fail(error)
  };
}

test('storage adapter preserves schema defaults, upgrade creation, and lazy connection cache', async () => {
  const fake = createFakeIndexedDB();
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  const first = await adapter.openDB();
  const second = await adapter.openDB();

  assert.equal(first, fake.db);
  assert.equal(second, first);
  assert.deepEqual(fake.calls.open, [['ChatAppDB', 1]]);
  assert.deepEqual(fake.calls.createObjectStore, [['keyValue', { keyPath: 'key' }]]);
});

test('storage adapter getItem preserves readonly lookup and null fallback', async () => {
  const fake = createFakeIndexedDB({ initialValues: { saved: 'value' } });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  assert.equal(await adapter.getItem('saved'), 'value');
  assert.equal(await adapter.getItem('missing'), null);
  assert.deepEqual(fake.calls.transactions, [
    ['keyValue', 'readonly'],
    ['keyValue', 'readonly']
  ]);
  assert.deepEqual(fake.calls.get, ['saved', 'missing']);
});

test('storage adapter reads related values from one readonly transaction snapshot', async () => {
  const fake = createFakeIndexedDB({
    initialValues: { workspace: 'workspace-v1', journal: 'journal-v1' }
  });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  assert.deepEqual(
    await adapter.readItems(['workspace', 'journal', 'missing']),
    ['workspace-v1', 'journal-v1', null]
  );
  assert.deepEqual(fake.calls.transactions, [['keyValue', 'readonly']]);
  assert.deepEqual(fake.calls.get, ['workspace', 'journal', 'missing']);
  await assert.rejects(() => adapter.readItems(null), /array of strings/i);
});

test('storage adapter setItem and removeItem wait for transaction completion', async () => {
  const fake = createFakeIndexedDB({ manualWrites: true });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });
  await adapter.openDB();

  let setSettled = false;
  const setPromise = adapter.setItem('item', 'payload').then(() => {
    setSettled = true;
  });
  await Promise.resolve();
  assert.equal(setSettled, false);
  assert.deepEqual(fake.calls.put, [{ key: 'item', value: 'payload' }]);
  fake.calls.pendingTransactions.shift().oncomplete();
  await setPromise;
  assert.equal(setSettled, true);

  let removeSettled = false;
  const removePromise = adapter.removeItem('item').then(() => {
    removeSettled = true;
  });
  await Promise.resolve();
  assert.equal(removeSettled, false);
  assert.deepEqual(fake.calls.delete, ['item']);
  fake.calls.pendingTransactions.shift().oncomplete();
  await removePromise;
  assert.equal(removeSettled, true);
  assert.deepEqual(fake.calls.transactions.slice(-2), [
    ['keyValue', 'readwrite'],
    ['keyValue', 'readwrite']
  ]);
});

test('storage adapter writes multiple items in one atomic readwrite transaction', async () => {
  const fake = createAtomicFakeIndexedDB({ existing: 'kept' });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  let settled = false;
  const saving = adapter.setItemsAtomic([
    { key: 'workspace', value: '{"conversations":[]}' },
    { key: 'journal', value: '{"dirty":true}' }
  ]).then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(settled, false);
  assert.deepEqual(fake.calls.transactions, [['keyValue', 'readwrite']]);
  assert.deepEqual(fake.calls.put, [
    { key: 'workspace', value: '{"conversations":[]}' },
    { key: 'journal', value: '{"dirty":true}' }
  ]);
  assert.equal(fake.values.has('workspace'), false);
  assert.equal(fake.values.has('journal'), false);

  fake.complete();
  await saving;
  assert.equal(settled, true);
  assert.equal(fake.values.get('existing'), 'kept');
  assert.equal(fake.values.get('workspace'), '{"conversations":[]}');
  assert.equal(fake.values.get('journal'), '{"dirty":true}');
});

test('storage adapter atomic transaction failure leaves every item unchanged', async () => {
  const fake = createAtomicFakeIndexedDB({ workspace: 'old-workspace', journal: 'old-journal' });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });
  const transactionError = new Error('atomic transaction failed');

  const saving = adapter.setItemsAtomic([
    { key: 'workspace', value: 'new-workspace' },
    { key: 'journal', value: 'new-journal' }
  ]);
  await new Promise(resolve => setImmediate(resolve));
  fake.fail(transactionError);

  await assert.rejects(saving, transactionError);
  assert.equal(fake.values.get('workspace'), 'old-workspace');
  assert.equal(fake.values.get('journal'), 'old-journal');
  assert.deepEqual(fake.calls.transactions, [['keyValue', 'readwrite']]);
});

test('storage adapter validates atomic entries before opening IndexedDB', async () => {
  const fake = createAtomicFakeIndexedDB();
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  await adapter.setItemsAtomic([]);
  await assert.rejects(() => adapter.setItemsAtomic(null), /must be an array/i);
  await assert.rejects(() => adapter.setItemsAtomic([{ value: 'missing-key' }]), /include a key/i);
  assert.equal(fake.calls.open, 0);
  assert.deepEqual(fake.calls.transactions, []);
});

test('storage adapter clear preserves request success completion semantics', async () => {
  const fake = createFakeIndexedDB({
    initialValues: { first: 'one', second: 'two' },
    manualClear: true
  });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });
  await adapter.openDB();

  let settled = false;
  const clearPromise = adapter.clear().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(fake.calls.clear, 1);
  assert.equal(fake.values.size, 0);
  fake.calls.pendingClearRequests.shift().onsuccess();
  await clearPromise;
  assert.equal(settled, true);
  assert.deepEqual(fake.calls.transactions.slice(-1), [['keyValue', 'readwrite']]);
});

test('storage adapter removes records by key prefix', async () => {
  const fake = createFakeIndexedDB({
    initialValues: {
      'generatedImage:alice:1': 'one',
      'generatedImage:alice:2': 'two',
      'generatedImage:bob:1': 'three',
      saved: 'value'
    }
  });
  const adapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: fake.indexedDBFactory
  });

  await adapter.removeItemsByPrefix('generatedImage:alice:');

  assert.equal(fake.calls.getAllKeys, 1);
  assert.equal(fake.values.has('generatedImage:alice:1'), false);
  assert.equal(fake.values.has('generatedImage:alice:2'), false);
  assert.equal(fake.values.get('generatedImage:bob:1'), 'three');
  assert.equal(fake.values.get('saved'), 'value');
});

test('storage adapter propagates open, request, transaction, and clear failures', async () => {
  const openError = new Error('open failed');
  const getError = new Error('get failed');
  const transactionError = new Error('transaction failed');
  const clearError = new Error('clear failed');

  await assert.rejects(
    createLegacyRuntimeStorageAdapter({
      indexedDBFactory: createFakeIndexedDB({ openError }).indexedDBFactory
    }).openDB(),
    openError
  );
  await assert.rejects(
    createLegacyRuntimeStorageAdapter({
      indexedDBFactory: createFakeIndexedDB({ getError }).indexedDBFactory
    }).getItem('key'),
    getError
  );

  const transactionAdapter = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: createFakeIndexedDB({ transactionError }).indexedDBFactory
  });
  await assert.rejects(transactionAdapter.setItem('key', 'value'), transactionError);
  await assert.rejects(transactionAdapter.removeItem('key'), transactionError);

  await assert.rejects(
    createLegacyRuntimeStorageAdapter({
      indexedDBFactory: createFakeIndexedDB({ clearError }).indexedDBFactory
    }).clear(),
    clearError
  );
});

test('storage adapter instances keep independent cached connections', async () => {
  const firstFake = createFakeIndexedDB();
  const secondFake = createFakeIndexedDB();
  const first = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: firstFake.indexedDBFactory
  });
  const second = createLegacyRuntimeStorageAdapter({
    indexedDBFactory: secondFake.indexedDBFactory
  });

  assert.notEqual(await first.openDB(), await second.openDB());
  assert.equal(firstFake.calls.open.length, 1);
  assert.equal(secondFake.calls.open.length, 1);
});

test('production wiring uses the adapter while persistence modules remain injected-storage only', () => {
  const fragment00Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const fragment02Source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsAuthActionsHelperSource = readSource('src/app/runtime/legacy-core/settings-auth-actions-helper.js');
  const configPersistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');

  assert.match(fragment00Source, /createLegacyRuntimeStorageAdapter/);
  assert.match(fragment00Source, /const\s+\{\s*getItem,\s*setItem,\s*removeItem,\s*readItems,\s*setItemsAtomic\s*\}\s*=\s*runtimeStorageAdapter/);
  assert.doesNotMatch(fragment00Source, /async\s+function\s+(?:openDB|getItem|setItem|removeItem)/);
  assert.match(fragment02Source, /runtimeStorageAdapter,/);
  assert.match(settingsAuthProviderSource, /runtimeStorageAdapter,/);
  assert.match(settingsAuthActionsHelperSource, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.doesNotMatch(fragment02Source, /\bSTORE_NAME\b|\bopenDB\(\)/);
  assert.doesNotMatch(settingsAuthProviderSource, /\bSTORE_NAME\b|\bopenDB\(\)/);
  assert.doesNotMatch(settingsAuthActionsHelperSource, /\bSTORE_NAME\b|\bopenDB\(\)/);

  for (const source of [configPersistenceSource, appDataPersistenceSource]) {
    assert.match(source, /\bsetItem\b/);
    assert.doesNotMatch(source, /storage-adapter|indexedDB|openDB|getItem|removeItem/);
  }
  assert.doesNotMatch(runtimeAppSource, /storage-adapter|indexedDB|openDB|getItem|setItem|removeItem/);
});

test('storage adapter source preserves legacy IndexedDB semantics', () => {
  const source = readSource('src/app/runtime/kernel/storage-adapter.js');

  assert.doesNotMatch(source, /objectStoreNames\.contains/);
  assert.match(source, /createObjectStore\(storeName,\s*\{\s*keyPath:\s*['"]key['"]\s*\}\)/);
  assert.match(source, /transaction\.oncomplete\s*=\s*resolve/);
  assert.match(source, /transaction\.onerror\s*=\s*reject/);
  assert.match(source, /request\.onsuccess\s*=\s*resolve/);
  assert.match(source, /request\.onerror\s*=\s*reject/);
  assert.match(source, /getAllKeys\(\)/);
  assert.doesNotMatch(source, /currentUser|loadConfig|loadAppData|showNotification|renderAll/);
});
