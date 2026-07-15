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

test('runtime entry composes initChatApp while preserving late bootstrap event bindings', () => {
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const p2pLifecycleSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');

  const initStart = appBootstrapLifecycleSource.indexOf('async function initChatApp()');
  assert.notEqual(initStart, -1, 'app bootstrap lifecycle should define initChatApp');
  const initOpen = appBootstrapLifecycleSource.indexOf('{', initStart);
  const initClose = findMatchingBrace(appBootstrapLifecycleSource, initOpen);
  assert.notEqual(initClose, -1, 'initChatApp should close inside the real lifecycle');

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

  assert.match(runtimeEntrySource, /createLegacyAppBootstrapLifecycle\(/);
  assert.match(
    runtimeEntrySource,
    /registerBinding\(\s*'app\.initChatApp',\s*appBootstrapLifecycle\.initChatApp/
  );
  assert.match(runtimeEntrySource, /runtimeEntry\.submit\.adjustTextareaHeight/);
  assert.match(runtimeEntrySource, /startupLifecycle\.bindAuthStartupListeners\(\)/);
  assert.match(runtimeEntrySource, /startupLifecycle\.initializeApp\(\)/);
  assert.match(appBootstrapLifecycleSource, /createLegacyP2PLifecycle\(\{/);
  assert.doesNotMatch(appBootstrapLifecycleSource, /selectActiveConversationId/);
  assert.match(initBody, /const\s+settingsDesktopLogoutBtn[\s\S]*?await\s+startNewChat\(\);/);
  assert.doesNotMatch(
    initBody,
    /await\s+startNewChat\(\);\s*renderAll\(\);/,
    'initChatApp should rely on startNewChat rendering instead of rebuilding the whole UI again'
  );
  assert.doesNotMatch(initBody, /if\s*\(!conversations\.find\(c\s*=>\s*!c\.archived\s*&&\s*!c\.deletedAt\)\)\s*startNewChat\(\);/);
  assert.doesNotMatch(initBody, /updateFileInputUI\(\);\s*startNewChat\(\);/);
  assert.match(p2pLifecycleSource, /createP2PScannerLifecycle\(\{/);
  assert.match(initBody, /\bprocessReceivedData\b/);
  assert.match(initBody, /\bupdateP2PProgress\b/);
  assert.match(initBody, /\bstartQRScanner\b/);
  assert.match(startupLifecycleSource, /function\s+adjustTextareaHeight\(\)/);
  assert.doesNotMatch(startupLifecycleSource, /function\s+updateP2PProgress\b/);
  assert.doesNotMatch(startupLifecycleSource, /function\s+startQRScanner\b/);
  assert.doesNotMatch(initBody, /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/);
  assert.match(initBody, /startQRScanner:\s*\(\)\s*=>\s*startQRScanner\(\)/);
  assert.doesNotMatch(runtimeEntrySource, /\bhtml5QrcodeScanner\b/);
  assert.doesNotMatch(startupLifecycleSource, /\bhtml5QrcodeScanner\b/);
});
