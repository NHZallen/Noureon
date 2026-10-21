import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const projectFile = (...segments) => path.join(projectRoot, ...segments);
const readSource = (...segments) => readFileSync(projectFile(...segments), 'utf8');

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

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

const legacyCoreSource = readSource('src', 'app', 'runtime', 'legacy-core', 'legacy-core.js');
const searchUploadSidebarSource = readSource(
  'src',
  'app',
  'runtime',
  'legacy-core',
  'search-upload-sidebar-lifecycle.js'
);

test('renderHistorySidebar reads and renders the latest bridge conversations', () => {
  const body = getConstFunctionBody(legacyCoreSource, 'renderHistorySidebar');

  assert.match(body, /const\s+currentConversations\s*=\s*liveConversationsBridge\.getConversations\(\)/);
  assert.match(body, /const\s+sortedConversations\s*=\s*currentConversations\s*\.filter/);
  assert.doesNotMatch(body, /\bconversations\b/);
});

test('conversation search no longer exposes a preview interaction', () => {
  assert.doesNotMatch(searchUploadSidebarSource, /showConversationInViewModal|search-view-btn|touchstart/);
});

test('direct app data store conversation replacements stay inside the bridge adapter allowlist', () => {
  const directReplacementPattern = /runtimeAppDataStore\.replaceConversations\(/;
  const runtimeFiles = [
    ...listJavaScriptFiles(projectFile('src', 'app', 'runtime')),
    ...listJavaScriptFiles(projectFile('src', 'app', 'legacy-runtime'))
  ];
  const filesWithDirectReplacement = runtimeFiles
    .filter((file) => directReplacementPattern.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .sort();

  assert.deepEqual(filesWithDirectReplacement, [
    'src/app/runtime/legacy-core/legacy-core.js'
  ]);

  // What startNewChat and loadChat do to the list of conversations is tested in tests/conversation-actions.test.js; they reach it only
  // through the live bridge.
  const conversationActionsSource = readSource('src', 'app', 'runtime', 'legacy-core', 'conversation-actions.js');
  assert.doesNotMatch(conversationActionsSource, directReplacementPattern);
  const pageFeaturesSource = readSource('src', 'app', 'runtime', 'legacy-core', 'page-features.js');
  assert.doesNotMatch(pageFeaturesSource, directReplacementPattern);
  assert.match(pageFeaturesSource, /state\.conversations\s*=\s*nextConversations/);

  assert.doesNotMatch(legacyCoreSource, /let\s+conversations\s*=/);
  assert.doesNotMatch(legacyCoreSource, /syncLegacyMirror/);
});
