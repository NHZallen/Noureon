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
    'runtimeRenderCoordinator.renderSidebar()'
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
    'runtimeRenderCoordinator.renderSidebar()',
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
    'runtimeRenderCoordinator.renderSidebar()'
  ], 'unarchiveChat live lookup');
  assert.doesNotMatch(body, /\bconversations\.find\(/);
});

test('archiveChat refreshes the conversations pointer after saving for fallback', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'archiveChat');

  assertMarkersInOrder(body, [
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const conv = currentConversations.find(c => c.id === id)',
    'if(conv) conv.archived = true',
    'await saveAppData()',
    'if (conversationStateAccess.getCurrentConversationId() === id)',
    'const latestConversations = liveConversationsBridge.getConversations()',
    'const nextConv = latestConversations.find(c => !c.archived && !c.deletedAt)',
    'conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null)',
    'if (!conversationStateAccess.getCurrentConversationId()) startNewChat()',
    'else loadChat(conversationStateAccess.getCurrentConversationId())'
  ], 'archiveChat live target and fallback lookups');
  assert.equal((body.match(/liveConversationsBridge\.getConversations\(\)/g) || []).length, 2);
  assert.doesNotMatch(body, /\bconversations\.find\(/);
  assert.doesNotMatch(body, /currentConversations\.find\(c\s*=>\s*!c\.archived/);
});

test('deleteChat preserves deletion and folder unlink mutations', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'deleteChat');

  assertMarkersInOrder(body, [
    'const currentConversations = liveConversationsBridge.getConversations()',
    'const conv = currentConversations.find(c => c.id === id)',
    'if (conv)',
    'const deletedAt = new Date().toISOString()',
    'conv.deletedAt = deletedAt',
    'conv.stateUpdatedAt = deletedAt',
    'if (conv.folderId)',
    'const folder = runtimeAppDataStore.getFolders().find(f => f.id === conv.folderId)',
    'if (folder)',
    'folder.conversationIds = folder.conversationIds.filter(cid => cid !== id)',
    'conv.folderId = null'
  ], 'deleteChat deletion and folder unlink');
});

test('deleteChat preserves persistence, active fallback, render, and notification ordering', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'deleteChat');

  assertMarkersInOrder(body, [
    'await saveAppData()',
    'if (conversationStateAccess.getCurrentConversationId() === id)',
    'await startNewChat({ keepSidebarOpen: true })',
    'else {',
    'runtimeRenderCoordinator.renderSidebar()',
    'runtimeDialogCoordinator.showNotification('
  ], 'deleteChat side effects');
  assert.match(body, /chatMovedToTrash\s*\|\|/);
  assert.match(body, /runtimeDialogCoordinator\.showNotification\([\s\S]*?'success'\)/);
});

test('deleteChat waits for the replacement blank conversation before continuing', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'deleteChat');

  assert.match(
    body,
    /if\s*\(conversationStateAccess\.getCurrentConversationId\(\)\s*===\s*id\)\s*\{\s*await\s+startNewChat\(\{\s*keepSidebarOpen:\s*true\s*\}\);\s*\}/
  );
});

test('deleteChat keeps the sidebar open while switching to its replacement blank conversation', () => {
  const startNewChatBody = getConstFunctionBody(legacyCoreSource, 'startNewChat');
  const deleteChatBody = getConstFunctionBody(legacyCoreSource, 'deleteChat');

  assert.match(startNewChatBody, /const\s+startNewChat\s*=\s*async\s*\(\{\s*keepSidebarOpen\s*=\s*false\s*\}\s*=\s*\{\}\s*\)\s*=>/);
  assert.match(startNewChatBody, /if\s*\(!keepSidebarOpen\)\s*\{\s*legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'\)\(false\);\s*\}/);
  assert.match(deleteChatBody, /await\s+startNewChat\(\{\s*keepSidebarOpen:\s*true\s*\}\)/);
});

test('deleteChat uses the live bridge without a legacy conversations mirror', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'deleteChat');

  assert.match(body, /liveConversationsBridge\.getConversations\(\)/);
  assert.doesNotMatch(body, /\bconversations\.find\(/);

  assert.doesNotMatch(legacyCoreSource, /let\s+conversations\s*=/);
  assert.doesNotMatch(legacyCoreSource, /syncLegacyMirror/);
});
