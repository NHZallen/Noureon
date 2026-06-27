import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const legacyCoreUrl = new URL('../src/app/runtime/legacy-core/legacy-core.js', import.meta.url);
const legacyCoreSource = readFileSync(legacyCoreUrl, 'utf8');

function findMatchingBrace(source, openIndex) {
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
    } else if (state === 'line-comment' && char === '\n') {
      state = 'code';
    } else if (state === 'block-comment' && char === '*' && next === '/') {
      state = 'code';
      index += 1;
    } else if (state === 'double-quote' && char === '"' && previous !== '\\') {
      state = 'code';
    } else if (state === 'single-quote' && char === "'" && previous !== '\\') {
      state = 'code';
    } else if (state === 'template' && char === '`' && previous !== '\\') {
      state = 'code';
    }
  }
  return -1;
}

function getConstFunctionBody(source, name) {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`).exec(source);
  assert.ok(match, `Expected to find ${name}`);
  const openIndex = match.index + match[0].lastIndexOf('{');
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close ${name}`);
  return source.slice(match.index, closeIndex + 1);
}

function assertMarkersInOrder(source, markers, label) {
  let cursor = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, cursor + 1);
    assert.ok(index > cursor, `${label} should contain ${marker} in order`);
    cursor = index;
  }
}

test('togglePinChat reads the latest conversations pointer before mutating', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'togglePinChat');

  assertMarkersInOrder(body, [
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const conv = currentConversations.find(c => c.id === id)',
    'conv.pinned = !conv.pinned',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()'
  ], 'togglePinChat live lookup');
  assert.doesNotMatch(body, /\bconversations\.find\(/);
});

test('handleRename reads the latest conversations pointer and preserves cleanup ordering', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'handleRename');

  assertMarkersInOrder(body, [
    "if (itemToRename.type === 'conversation')",
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const conv = currentConversations.find(c => c.id === itemToRename.id)',
    'conv.title = newTitle',
    'conv.isRenamed = true',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()',
    'toggleModal(ALL_ELEMENTS.renameModal, false)',
    'itemToRename = { id: null, type: null }'
  ], 'handleRename live lookup and cleanup');
  assert.doesNotMatch(body, /\bconversations\.find\(/);
});

test('unarchiveChat reads the latest conversations pointer before mutating', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'unarchiveChat');

  assertMarkersInOrder(body, [
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const conv = currentConversations.find(c => c.id === id)',
    'if(conv) conv.archived = false',
    'await saveAppData()',
    'runtimeRenderCoordinator.renderAll()'
  ], 'unarchiveChat live lookup');
  assert.doesNotMatch(body, /\bconversations\.find\(/);
});

test('archive and delete remain deferred on the legacy mirror', () => {
  for (const name of ['deleteChat', 'archiveChat']) {
    const body = getConstFunctionBody(legacyCoreSource, name);
    assert.match(body, /\bconversations\.find\(/, `${name} should remain deferred`);
    assert.doesNotMatch(body, /liveConversationsBridge\.getConversations\(/);
  }

  assert.match(legacyCoreSource, /let\s+conversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/);
});
