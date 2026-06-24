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

  const initStart = fragment05Source.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, '05 should define initChatApp');
  const initOpen = fragment05Source.indexOf('{', initStart);
  const initClose = findMatchingBrace(fragment05Source, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside 05');

  const initBody = fragment05Source.slice(initStart, initClose);
  const expectedOrder = [
    'const receivedDataLifecycle = createReceivedDataLifecycle({',
    'const processReceivedData = (...args) => receivedDataLifecycle.processReceivedData(...args);',
    'const appBootstrapComposition = createAppBootstrapComposition({',
    'appBootstrapComposition.runLateBootstrapBindings();'
  ];
  let cursor = -1;
  for (const marker of expectedOrder) {
    const next = initBody.indexOf(marker);
    assert.ok(next > cursor, `${marker} should remain inside initChatApp in legacy order`);
    cursor = next;
  }

  assert.match(fragment06Source, /^\s*function\s+updateP2PProgress\b/);
  assert.doesNotMatch(fragment06Source, /^\s*setupHistorySidebarInteractions\(\);/);
  assert.doesNotMatch(initBody, /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/);
});
