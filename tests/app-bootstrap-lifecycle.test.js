import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
        continue;
      }
      if (char === '"') {
        state = 'double-quote';
        continue;
      }
      if (char === "'") {
        state = 'single-quote';
        continue;
      }
      if (char === '`') {
        state = 'template';
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
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

test('initChatApp closes inside 05 while preserving late bootstrap event bindings', () => {
  const fragment05Source = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');
  const fragment06Source = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should define initChatApp');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');

  const initBody = appBootstrapLifecycleSource.slice(initStart, initClose);
  const expectedOrder = [
    'const p2pLifecycle = createLegacyP2PLifecycle({',
    '} = p2pLifecycle;',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings();'
  ];
  let cursor = -1;
  for (const marker of expectedOrder) {
    const next = initBody.indexOf(marker);
    assert.ok(next > cursor, `${marker} should remain inside initChatApp in legacy order`);
    cursor = next;
  }

  assert.match(fragment05Source, /createLegacyAppBootstrapLifecycle\(\{/);
  assert.match(
    fragment05Source,
    /adjustTextareaHeight:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('submit\.adjustTextareaHeight'\)\(\.\.\.args\)/
  );
  assert.doesNotMatch(fragment05Source, /^\s*adjustTextareaHeight,\s*$/m);
  assert.match(fragment05Source, /legacyRuntimeContext\.registerLazyBinding\('app\.initChatApp',\s*\(\)\s*=>\s*initChatApp\)/);
  assert.match(appBootstrapLifecycleSource, /createLegacyP2PLifecycle\(\{/);
  assert.match(initBody, /\bprocessReceivedData\b/);
  assert.match(initBody, /\bupdateP2PProgress\b/);
  assert.match(initBody, /\bstartQRScanner\b/);
  assert.doesNotMatch(fragment06Source, /^\s*setupHistorySidebarInteractions\(\);/);
  assert.doesNotMatch(fragment06Source, /function\s+updateP2PProgress\b/);
  assert.doesNotMatch(fragment06Source, /function\s+startQRScanner\b/);
  assert.doesNotMatch(initBody, /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/);
  assert.match(initBody, /startQRScanner:\s*\(\)\s*=>\s*startQRScanner\(\)/);
  assert.doesNotMatch(fragment05Source, /\bhtml5QrcodeScanner\b/);
  assert.doesNotMatch(fragment06Source, /\bhtml5QrcodeScanner\b/);
});
