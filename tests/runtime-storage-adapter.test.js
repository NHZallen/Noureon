import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const findMatchingBrace = (source, openIndex) => {
  let state = 'code';
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];
    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line-comment';
        index += 1;
      } else if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
      } else if (char === '"') {
        state = 'double-quote';
      } else if (char === "'") {
        state = 'single-quote';
      } else if (char === '`') {
        state = 'template';
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    } else if (state === 'line-comment') {
      if (char === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
    } else if (state === 'double-quote') {
      if (char === '"' && previous !== '\\') state = 'code';
    } else if (state === 'single-quote') {
      if (char === "'" && previous !== '\\') state = 'code';
    } else if (state === 'template') {
      if (char === '`' && previous !== '\\') state = 'code';
    }
  }
  return -1;
};

const getFunctionBody = (source, name) => {
  const match = new RegExp(`async\\s+function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert.ok(match, `Expected to find ${name}`);
  const openIndex = match.index + match[0].lastIndexOf('{');
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close ${name}`);
  return source.slice(match.index, closeIndex + 1);
};

const getConstFunctionBody = (source, name) => {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`).exec(source);
  assert.ok(match, `Expected to find ${name}`);
  const openIndex = match.index + match[0].lastIndexOf('{');
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close ${name}`);
  return source.slice(match.index, closeIndex + 1);
};

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in ${context} legacy order`);
    cursor = next;
  }
};

const fragment00Source = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');

test('legacy IndexedDB schema and connection cache remain exact', () => {
  const openDBBody = getFunctionBody(fragment00Source, 'openDB');

  assert.match(fragment00Source, /const\s+DB_NAME\s*=\s*['"]ChatAppDB['"]/);
  assert.match(fragment00Source, /const\s+STORE_NAME\s*=\s*['"]keyValue['"]/);
  assert.match(fragment00Source, /let\s+db\s*;/);
  assertMarkersInOrder(openDBBody, [
    'if (db) return db',
    'indexedDB.open(DB_NAME, 1)',
    'request.onupgradeneeded',
    "idb.createObjectStore(STORE_NAME, { keyPath: 'key' })",
    'request.onsuccess',
    'db = e.target.result',
    'resolve(db)',
    'request.onerror',
    'reject(e.target.error)'
  ], 'openDB');

  // Legacy upgrade handling creates the v1 store directly; extraction must not
  // silently add a schema branch without an explicit behavior decision.
  assert.doesNotMatch(openDBBody, /objectStoreNames\.contains/);
});

test('legacy getItem keeps readonly lookup and null fallback behavior', () => {
  const body = getFunctionBody(fragment00Source, 'getItem');

  assertMarkersInOrder(body, [
    'const idb = await openDB()',
    "idb.transaction(STORE_NAME, 'readonly')",
    'tx.objectStore(STORE_NAME)',
    'store.get(key)',
    'req.onsuccess',
    'req.result ? req.result.value : null',
    'req.onerror = reject'
  ], 'getItem');
});

test('legacy setItem keeps transaction-complete persistence semantics', () => {
  const body = getFunctionBody(fragment00Source, 'setItem');

  assertMarkersInOrder(body, [
    'const idb = await openDB()',
    "idb.transaction(STORE_NAME, 'readwrite')",
    'tx.objectStore(STORE_NAME)',
    'store.put({ key, value })',
    'tx.oncomplete = resolve',
    'tx.onerror = reject'
  ], 'setItem');
  assert.doesNotMatch(body, /req\.(?:onsuccess|onerror)/);
});

test('legacy removeItem keeps transaction-complete deletion semantics', () => {
  const body = getFunctionBody(fragment00Source, 'removeItem');

  assertMarkersInOrder(body, [
    'const idb = await openDB()',
    "idb.transaction(STORE_NAME, 'readwrite')",
    'tx.objectStore(STORE_NAME)',
    'store.delete(key)',
    'tx.oncomplete = resolve',
    'tx.onerror = reject'
  ], 'removeItem');
  assert.doesNotMatch(body, /req\.(?:onsuccess|onerror)/);
});

test('delete-all flow keeps confirmation, IndexedDB clear, notification, and reload order', () => {
  const body = getConstFunctionBody(fragment02Source, 'handleDeleteAllData');

  assertMarkersInOrder(body, [
    'const confirmation = await showCustomDialog({',
    "if (confirmation === 'DELETE')",
    'const idb = await openDB()',
    "idb.transaction(STORE_NAME, 'readwrite')",
    'tx.objectStore(STORE_NAME)',
    'store.clear()',
    'req.onsuccess = resolve',
    'req.onerror = reject',
    "showNotification(i18n[config.uiLanguage].deleteAllDataSuccess",
    'setTimeout(() => {',
    'window.location.reload()'
  ], 'handleDeleteAllData');
  assert.match(body, /catch\s*\(error\)[\s\S]*showNotification\([^;]*deleteAllDataError/);
  assert.doesNotMatch(body, /localStorage|sessionStorage|runtimeAppDataStore|runtimeConfigStore/);
});

test('serialized persistence remains injected-storage only', () => {
  const configPersistenceSource = readSource('src/app/runtime/kernel/config-persistence.js');
  const appDataPersistenceSource = readSource('src/app/runtime/kernel/app-data-persistence.js');

  for (const source of [configPersistenceSource, appDataPersistenceSource]) {
    assert.match(source, /\bsetItem\b/);
    assert.doesNotMatch(
      source,
      /storage-adapter|indexedDB|openDB|getItem|removeItem|DB_NAME|STORE_NAME/
    );
  }
});

test('runtime app remains storage-free and no storage adapter module exists yet', () => {
  const runtimeAppSource = readSource('src/app/runtime-app.js');

  assert.equal(existsSync(projectFile('src/app/runtime/kernel/storage-adapter.js')), false);
  assert.match(runtimeAppSource, /return\s*\{\s*elements:\s*resolvedElements,\s*configStore,\s*appDataStore\s*\}/);
  assert.doesNotMatch(
    runtimeAppSource,
    /storage-adapter|indexedDB|openDB|getItem|setItem|removeItem|clear|Persistence/
  );
});
