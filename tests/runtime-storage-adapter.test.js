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
  const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const settingsAuthProviderSource = readSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const configPersistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');
  const runtimeAppSource = readSource('src/app/runtime-app.js');

  assert.match(fragment00Source, /createLegacyRuntimeStorageAdapter/);
  assert.match(fragment00Source, /const\s+\{\s*getItem,\s*setItem,\s*removeItem\s*\}\s*=\s*runtimeStorageAdapter/);
  assert.doesNotMatch(fragment00Source, /async\s+function\s+(?:openDB|getItem|setItem|removeItem)/);
  assert.match(fragment02Source, /runtimeStorageAdapter,/);
  assert.match(settingsAuthProviderSource, /await\s+runtimeStorageAdapter\.clear\(\)/);
  assert.doesNotMatch(fragment02Source, /\bSTORE_NAME\b|\bopenDB\(\)/);
  assert.doesNotMatch(settingsAuthProviderSource, /\bSTORE_NAME\b|\bopenDB\(\)/);

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
  assert.doesNotMatch(source, /currentUser|loadConfig|loadAppData|showNotification|renderAll/);
});
